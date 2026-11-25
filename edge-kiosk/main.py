"""
Edge Kiosk Main Application.
Orchestrates Logitech Webcam stream, VEXDET (RF-DETR) detection, local blur & liveness gates,
centroid tracking with cooldown, and direct API submission with offline buffering.
"""

import argparse
from datetime import datetime, timezone, timedelta
import logging
import signal
import sys
import time
import cv2

from camera import LogitechWebcam, list_connected_cameras
from client import AttendanceApiClient
from config import config
from detector import VexdetFaceDetector, enhance_low_light_clahe, score_face_crop
from geofence import is_inside_campus
from liveness import LivenessGate, is_sharp_frame, check_exposure, is_min_face_size
from offline_queue import BackgroundSyncWorker, OfflineQueue, get_current_ist_timestamp
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
        self.detector = VexdetFaceDetector()
        self.liveness = LivenessGate()
        self.tracker = CentroidTracker()
        self.queue = OfflineQueue()
        self.client = AttendanceApiClient(offline_queue=self.queue)
        self.sync_worker = BackgroundSyncWorker(
            queue=self.queue, sync_fn=self.client.sync_queued_record
        )
        self.last_verified_banner = ""
        self.last_verified_time = 0.0
        self.last_verified_color = (0, 255, 0)

    def start(self) -> None:
        self.running = True
        self.detector.ensure_loaded()
        self.sync_worker.start()
        logger.info(f"Starting Edge Kiosk application loop ({self.detector.runtime_mode})...")

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

        # 1. Detect all faces in frame with VEXDET (RF-DETR) engine (with 25%-30% margin)
        faces = self.detector.detect_faces(frame)
        rects = [face.padded_bbox for face in faces]

        # 2. Update centroid tracker
        tracked_faces = self.tracker.update(rects)

        # 3. Process each detected face
        for face in faces:
            # Reject low-confidence or corrupt crops immediately
            if face.confidence < 0.80:
                continue
            if (
                face.crop is None
                or face.crop.size == 0
                or face.crop.shape[0] < config.min_face_size
                or face.crop.shape[1] < config.min_face_size
            ):
                continue

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
                    if not is_min_face_size(fw, fh, min_size=config.min_face_size):
                        color = (0, 0, 255)
                        status_text = "Move closer - face too small"
                        track.clear_burst()
                    else:
                        # 5. Exposure Quality Gate (reject washed out or pitch dark frames)
                        valid_exp, brightness = check_exposure(
                            face.crop, min_val=config.min_exposure, max_val=config.max_exposure
                        )
                        if not valid_exp:
                            color = (0, 0, 255)
                            status_text = f"Exposure bad ({int(brightness)})"
                            track.clear_burst()
                        else:
                            # 6. Sharpness Gate (Laplacian blur filter >= 110.0)
                            is_sharp, variance = is_sharp_frame(
                                face.crop, threshold=config.blur_threshold
                            )
                            if not is_sharp:
                                color = (0, 0, 255)
                                status_text = "Hold still - image blurry"
                                track.clear_burst()
                            else:
                                # 7. Head Pose / Symmetry Gate
                                pose_ok, pose_msg = self.liveness.check_head_pose(face.crop)
                                if not pose_ok:
                                    color = (0, 165, 255)
                                    status_text = pose_msg
                                    track.clear_burst()
                                else:
                                    # 8. Live Presence Gate (MediaPipe blink detection)
                                    is_live, ear, blinks = self.liveness.process_frame(face.crop)
                                    if not is_live:
                                        color = (0, 200, 255)
                                        status_text = f"Blink check ({blinks}/{config.required_blinks})"
                                    else:
                                        # 9. Adaptive Low-Light Enhancement & Burst Candidate Buffering
                                        enhanced_crop = enhance_low_light_clahe(
                                            face.crop,
                                            brightness_threshold=config.clahe_brightness_threshold,
                                            clip_limit=config.clahe_clip_limit,
                                        )
                                        track.add_burst_candidate(
                                            crop=enhanced_crop,
                                            sharpness=variance,
                                            confidence=face.confidence,
                                        )

                                        # Multi-frame consensus: require >= 2 consecutive valid frames
                                        if track.consecutive_valid_frames < config.min_consecutive_valid_frames:
                                            color = (0, 255, 255)
                                            status_text = f"Stabilizing ({track.consecutive_valid_frames}/{config.min_consecutive_valid_frames})"
                                        elif not track.is_burst_ready(
                                            min_frames=config.min_consecutive_valid_frames,
                                            target_frames=config.burst_frame_count,
                                            max_window_sec=config.burst_window_seconds,
                                        ):
                                            color = (0, 255, 255)
                                            status_text = f"Analyzing Burst ({len(track.burst_candidates)}/{config.burst_frame_count})"
                                        else:
                                            # 10. Best-Frame Selection from Burst Window
                                            best_crop = track.get_best_burst_crop()
                                            if best_crop is None:
                                                best_crop = enhanced_crop

                                            # 11. Geo-fencing validation
                                            inside, dist = is_inside_campus(
                                                config.vit_latitude, config.vit_longitude
                                            )
                                            if config.geofence_enabled and not inside:
                                                color = (0, 0, 255)
                                                status_text = "Outside Campus"
                                                track.clear_burst()
                                            else:
                                                # 12. Direct check-in of best crop to AWS API Gateway
                                                result = self.client.check_in_image(best_crop)
                                                track.mark_checked_in()
                                                self.liveness.reset()

                                                res_status = result.get("status")
                                                name = result.get("name", "Student")
                                                conf = result.get("confidence", 95.0)
                                                now_ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))
                                                time_str = now_ist.strftime("%I:%M %p")

                                                if res_status in ("PRESENT", "LATE", "SUCCESS", "ALREADY_MARKED"):
                                                    color = (0, 255, 0)
                                                    status_text = f"{res_status}: {name} ({conf}%)"
                                                    self.last_verified_banner = f"{res_status}: {name} • {time_str} ({conf}%)"
                                                    self.last_verified_time = time.time()
                                                    self.last_verified_color = (0, 255, 0)
                                                elif res_status == "AMBIGUOUS_MATCH":
                                                    color = (0, 165, 255)
                                                    status_text = "Ambiguous - Look directly at camera"
                                                    self.last_verified_banner = "Biometric ambiguity: Please look directly into the camera"
                                                    self.last_verified_time = time.time()
                                                    self.last_verified_color = (0, 165, 255)
                                                elif res_status == "NO_FACE_DETECTED":
                                                    color = (0, 165, 255)
                                                    status_text = "Align face in frame"
                                                    self.last_verified_banner = "No clear face: Please align within camera frame"
                                                    self.last_verified_time = time.time()
                                                    self.last_verified_color = (0, 165, 255)
                                                elif res_status == "OFFLINE_QUEUED":
                                                    color = (255, 255, 0)
                                                    status_text = "Offline Buffered"
                                                    self.last_verified_banner = f"Offline Buffered: {name} • {time_str}"
                                                    self.last_verified_time = time.time()
                                                    self.last_verified_color = (255, 255, 0)
                                                else:
                                                    color = (0, 0, 255)
                                                    status_text = "Unregistered face - rejected"
                                                    self.last_verified_banner = f"Rejected: Unregistered face ({time_str})"
                                                    self.last_verified_time = time.time()
                                                    self.last_verified_color = (0, 0, 255)

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

        if not self.headless:
            # Draw live ticking clock (IST) on top-right of HUD
            now_ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))
            clock_text = now_ist.strftime("%d %b %Y | %I:%M:%S %p IST")
            cv2.putText(
                frame,
                clock_text,
                (max(20, w - 360), 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (240, 240, 240),
                2,
            )

            # Draw offline queue status and active detection engine on top-left of HUD
            pending_count = self.queue.get_pending_count()
            queue_text = f"Offline Queue: {pending_count} pending"
            cv2.putText(
                frame,
                queue_text,
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (0, 255, 0) if pending_count == 0 else (0, 165, 255),
                2,
            )
            cv2.putText(
                frame,
                f"Engine: {self.detector.engine_label}",
                (20, 70),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (240, 240, 240),
                1,
            )

            # Draw bottom confirmation banner if recent
            if self.last_verified_banner and (time.time() - self.last_verified_time) < 4.5:
                cv2.rectangle(frame, (20, h - 60), (w - 20, h - 18), (20, 20, 20), -1)
                cv2.rectangle(frame, (20, h - 60), (w - 20, h - 18), self.last_verified_color, 2)
                cv2.putText(
                    frame,
                    self.last_verified_banner,
                    (35, h - 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.68,
                    (255, 255, 255),
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
