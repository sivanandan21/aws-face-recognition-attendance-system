"""
Edge Kiosk Main Application.
Orchestrates Logitech Webcam stream, YOLOv8n-face detection, local blur & liveness gates,
centroid tracking with cooldown, and direct API submission with offline buffering.
"""

import argparse
import logging
import signal
import sys
import time
import cv2

from camera import LogitechWebcam, list_connected_cameras
from client import AttendanceApiClient
from config import config
from detector import YOLOFaceDetector
from geofence import is_inside_campus
from liveness import LivenessGate, is_sharp_frame, check_exposure, is_min_face_size
from offline_queue import BackgroundSyncWorker, OfflineQueue
from tracker import CentroidTracker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("edge_kiosk")


class EdgeKioskApp:
    def __init__(self, headless: bool = not config.show_preview):
        self.headless = headless
        self.running = False
        self.camera = LogitechWebcam()
        self.detector = YOLOFaceDetector()
        self.liveness = LivenessGate()
        self.tracker = CentroidTracker()
        self.queue = OfflineQueue()
        self.client = AttendanceApiClient(offline_queue=self.queue)
        self.sync_worker = BackgroundSyncWorker(
            queue=self.queue, sync_fn=self.client.sync_queued_record
        )

    def start(self) -> None:
        self.running = True
        self.sync_worker.start()
        logger.info("Starting Edge Kiosk application loop...")

        try:
            with self.camera:
                while self.running:
                    ret, frame = self.camera.read()
                    if not ret or frame is None:
                        time.sleep(0.01)
                        continue

                    self.process_frame(frame)

                    if not self.headless:
                        try:
                            cv2.imshow("Smart Attendance Kiosk", frame)
                            key = cv2.waitKey(1) & 0xFF
                            if key == ord("q"):
                                logger.info("Exit key pressed ('q'). Stopping...")
                                break
                        except cv2.error as gui_err:
                            logger.warning(f"GUI display not supported in this OpenCV build ({gui_err}). Switching to headless mode.")
                            self.headless = True
        finally:
            self.stop()

    def process_frame(self, frame) -> None:
        h, w = frame.shape[:2]

        # 1. Detect all faces in frame with YOLOv8n-face
        faces = self.detector.detect_faces(frame)
        rects = [face.padded_bbox for face in faces]

        # 2. Update centroid tracker
        tracked_faces = self.tracker.update(rects)

        # 3. Process each detected face
        for face in faces:
            fx, fy, fw, fh = face.bbox
            px, py, pw, ph = face.padded_bbox

            # Find matching track ID by centroid
            fcx = fx + (fw // 2)
            fcy = fy + (fh // 2)

            matching_track_id = None
            min_dist = float("inf")
            for tid, track in tracked_faces.items():
                tcx, tcy = track.centroid
                dist = ((fcx - tcx) ** 2 + (fcy - tcy) ** 2) ** 0.5
                if dist < min_dist and dist < config.max_tracking_distance:
                    min_dist = dist
                    matching_track_id = tid

            # Default status color: Yellow (Processing)
            color = (0, 255, 255)
            status_text = "Processing..."

            if matching_track_id is not None:
                track = tracked_faces[matching_track_id]

                # Check cooldown to prevent duplicate API hits
                if track.is_on_cooldown():
                    rem = int(track.seconds_remaining_in_cooldown())
                    color = (255, 165, 0)
                    status_text = f"Cooldown ({rem}s)"
                else:
                    # 4. Minimum Face Size Gate (reject distant/pixelated crops)
                    if not is_min_face_size(fw, fh):
                        color = (0, 0, 255)
                        status_text = "Move closer - face too small"
                    else:
                        # 5. Exposure Quality Gate (reject washed out or pitch dark frames)
                        valid_exp, brightness = check_exposure(face.crop)
                        if not valid_exp:
                            color = (0, 0, 255)
                            status_text = f"Exposure bad ({int(brightness)})"
                        else:
                            # 6. Sharpness Gate (Laplacian blur filter >= 100.0)
                            is_sharp, variance = is_sharp_frame(face.crop)
                            if not is_sharp:
                                color = (0, 0, 255)
                                status_text = "Hold still - image blurry"
                            else:
                                # 7. Live Presence Gate (MediaPipe blink detection)
                                is_live, ear, blinks = self.liveness.process_frame(face.crop)
                                if not is_live:
                                    color = (0, 200, 255)
                                    status_text = f"Blink check ({blinks}/{config.required_blinks})"
                                else:
                                    # 8. Geo-fencing validation
                                    inside, dist = is_inside_campus(
                                        config.vit_latitude, config.vit_longitude
                                    )
                                    if config.geofence_enabled and not inside:
                                        color = (0, 0, 255)
                                        status_text = "Outside Campus"
                                    else:
                                        # 9. Direct check-in to AWS API Gateway
                                        result = self.client.check_in_image(face.crop)
                                        track.mark_checked_in()
                                        self.liveness.reset()

                                        if result.get("status") in ("PRESENT", "LATE", "SUCCESS"):
                                            color = (0, 255, 0)
                                            status_text = f"Verified: {result.get('name', 'Student')}"
                                        elif result.get("status") == "OFFLINE_QUEUED":
                                            color = (255, 255, 0)
                                            status_text = "Offline Buffered"
                                        else:
                                            color = (0, 0, 255)
                                            status_text = "Unregistered face - rejected"

            # Draw HUD bounding box and status tag
            if not self.headless:
                cv2.rectangle(frame, (px, py), (px + pw, py + ph), color, 2)
                cv2.putText(
                    frame,
                    status_text,
                    (px, max(25, py - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    color,
                    2,
                )

        # Draw offline queue status on top-left of HUD
        if not self.headless:
            pending_count = self.queue.get_pending_count()
            queue_text = f"Offline Queue: {pending_count} pending"
            cv2.putText(
                frame,
                queue_text,
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0) if pending_count == 0 else (0, 165, 255),
                2,
            )

    def stop(self) -> None:
        self.running = False
        self.sync_worker.stop()
        if not self.headless:
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass
        logger.info("Edge Kiosk shutdown complete.")


def handle_signals(app: EdgeKioskApp):
    def _sig_handler(sig, frame):
        logger.info(f"Signal {sig} received, stopping application...")
        app.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _sig_handler)
    signal.signal(signal.SIGTERM, _sig_handler)


def main():
    parser = argparse.ArgumentParser(description="Smart Attendance Edge Kiosk")
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run without GUI preview window",
    )
    parser.add_argument(
        "--list-cameras",
        action="store_true",
        help="List all connected USB and internal camera devices",
    )
    args = parser.parse_args()

    if args.list_cameras:
        print("\n--- Scanning Connected Video Devices ---")
        cams = list_connected_cameras()
        if not cams:
            print("No video capture devices detected.")
        else:
            for c in cams:
                print(
                    f"  [Index {c['index']}] {c['name']} - "
                    f"Default: {c['default_width']}x{c['default_height']} @ {c['fps']:.1f} FPS "
                    f"(Backend: {c['backend']})"
                )
        print("----------------------------------------\n")
        return

    app = EdgeKioskApp(headless=args.headless)
    handle_signals(app)
    app.start()


if __name__ == "__main__":
    main()
