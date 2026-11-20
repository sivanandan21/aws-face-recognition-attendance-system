"""
Webcam controller with hardware-tuned settings for Logitech USB webcams.
Configures 1080p at 30 FPS using MJPG FourCC codec, auto-selecting CAP_DSHOW
on Windows and CAP_V4L2 on Linux with optional manual focus lock.
Includes smart camera auto-discovery, zero frame buffer latency, and USB reconnect logic.
"""

import logging
import platform
import time
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np

from config import config

logger = logging.getLogger(__name__)


def list_connected_cameras(max_probe: int = 5) -> List[Dict]:
    """Scan and list all connected video devices with index, backend, and resolution."""
    cameras = []
    preferred_backend = LogitechWebcam.get_preferred_backend()

    for idx in range(max_probe):
        cap = cv2.VideoCapture(idx, preferred_backend)
        if not cap.isOpened():
            cap = cv2.VideoCapture(idx, cv2.CAP_ANY)

        if cap.isOpened():
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            cameras.append({
                "index": idx,
                "backend": preferred_backend,
                "default_width": w,
                "default_height": h,
                "fps": fps,
                "name": f"Camera Device {idx}"
            })
            cap.release()
    return cameras


def find_best_camera_index(preferred_name_filter: str = config.camera_name_filter) -> int:
    """Auto-detect camera index, defaulting to first opened device or config.camera_index."""
    if config.camera_source != "auto" and config.camera_source.isdigit():
        return int(config.camera_source)

    cameras = list_connected_cameras()
    if not cameras:
        return config.camera_index
    return cameras[0]["index"]


class LogitechWebcam:
    def __init__(
        self,
        camera_index: Optional[int] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        fps: Optional[int] = None,
        fourcc: Optional[str] = None,
    ):
        if camera_index is not None:
            self.camera_index = camera_index
        elif config.camera_source == "auto":
            self.camera_index = find_best_camera_index()
        else:
            self.camera_index = config.camera_index

        self.width = width or config.camera_width
        self.height = height or config.camera_height
        self.fps = fps or config.camera_fps
        self.fourcc_str = fourcc or config.camera_fourcc
        self.cap: Optional[cv2.VideoCapture] = None
        self._consecutive_read_failures = 0

    @staticmethod
    def get_preferred_backend() -> int:
        """Select platform-optimal OpenCV video capture backend."""
        system = platform.system()
        if system == "Windows":
            return cv2.CAP_DSHOW
        elif system == "Linux":
            return cv2.CAP_V4L2
        return cv2.CAP_ANY

    def start(self) -> "LogitechWebcam":
        """Initialize camera stream with Logitech hardware tuning."""
        backend = self.get_preferred_backend()
        logger.info(
            f"Initializing camera index {self.camera_index} with backend {backend} ({platform.system()})"
        )

        self.cap = cv2.VideoCapture(self.camera_index, backend)
        if not self.cap.isOpened():
            # Fallback to default backend if platform-specific backend fails
            logger.warning("Preferred backend failed, falling back to cv2.CAP_ANY")
            self.cap = cv2.VideoCapture(self.camera_index, cv2.CAP_ANY)

        if not self.cap.isOpened():
            raise RuntimeError(
                f"Unable to access camera at index {self.camera_index}. "
                "Ensure device is connected and not locked by another process."
            )

        # Buffer size 1 to ensure zero frame latency
        try:
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

        # Apply MJPG FourCC codec to enable high-throughput 1080p@30fps over USB
        if len(self.fourcc_str) == 4:
            fourcc_val = cv2.VideoWriter_fourcc(*self.fourcc_str)
            self.cap.set(cv2.CAP_PROP_FOURCC, fourcc_val)

        # Set resolution and target frame rate
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self.cap.set(cv2.CAP_PROP_FPS, self.fps)

        # Optional manual focus lock for stationary kiosk mounts
        if not config.camera_autofocus and config.camera_focus_value is not None:
            self.cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)
            self.cap.set(cv2.CAP_PROP_FOCUS, config.camera_focus_value)
            logger.info(f"Manual focus locked at {config.camera_focus_value}")
        else:
            self.cap.set(cv2.CAP_PROP_AUTOFOCUS, 1)

        actual_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = self.cap.get(cv2.CAP_PROP_FPS)
        logger.info(
            f"Camera active: {actual_w}x{actual_h} @ {actual_fps:.1f} FPS (Target: {self.width}x{self.height}@{self.fps})"
        )
        self._consecutive_read_failures = 0
        return self

    def reconnect(self, max_wait_sec: float = 30.0) -> bool:
        """Handle USB disconnect / replug with exponential backoff."""
        logger.warning(f"Attempting to reconnect camera at index {self.camera_index}...")
        self.stop()
        start_time = time.time()
        backoff = 1.0

        while (time.time() - start_time) < max_wait_sec:
            try:
                self.start()
                if self.is_opened():
                    logger.info("Camera reconnected successfully.")
                    return True
            except Exception as e:
                logger.debug(f"Reconnect attempt failed ({e}), waiting {backoff}s...")
                time.sleep(backoff)
                backoff = min(backoff * 1.5, 5.0)

        logger.error(f"Failed to reconnect camera after {max_wait_sec} seconds.")
        return False

    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        """Read a single frame from the video stream with auto-reconnect fallback."""
        if self.cap is None or not self.cap.isOpened():
            return False, None

        ret, frame = self.cap.read()
        if not ret or frame is None:
            self._consecutive_read_failures += 1
            if self._consecutive_read_failures > 30:
                logger.warning("Excessive frame read failures detected. Triggering camera reconnect...")
                if self.reconnect():
                    return self.cap.read()
            return False, None

        self._consecutive_read_failures = 0
        return True, frame

    def is_opened(self) -> bool:
        return self.cap is not None and self.cap.isOpened()

    def stop(self) -> None:
        """Release camera resource."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None
            logger.info("Camera stream released.")

    def __enter__(self) -> "LogitechWebcam":
        return self.start()

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.stop()
