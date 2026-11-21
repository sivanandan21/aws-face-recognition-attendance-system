"""
Configuration module for Edge Kiosk.
Reads from environment variables with sensible production defaults.
Zero hardcoded secrets.
"""

import os
from dataclasses import dataclass
from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass


@dataclass
class EdgeConfig:
    # Camera Settings (Logitech C920 / USB Webcam)
    camera_source: str = os.getenv("CAMERA_SOURCE", "auto")  # "auto" or integer index as str
    camera_name_filter: str = os.getenv("CAMERA_NAME_FILTER", "Logitech")
    camera_index: int = int(os.getenv("CAMERA_INDEX", "0"))
    camera_width: int = int(os.getenv("CAMERA_WIDTH", "1920"))
    camera_height: int = int(os.getenv("CAMERA_HEIGHT", "1080"))
    camera_fps: int = int(os.getenv("CAMERA_FPS", "30"))
    camera_fourcc: str = os.getenv("CAMERA_FOURCC", "MJPG")
    camera_autofocus: bool = os.getenv("CAMERA_AUTOFOCUS", "1").lower() in ("1", "true", "yes")
    camera_focus_value: Optional[int] = (
        int(os.getenv("CAMERA_FOCUS_VALUE")) if os.getenv("CAMERA_FOCUS_VALUE") else None
    )

    # Face Detection & Padding
    yolo_model_path: str = os.getenv("YOLO_MODEL_PATH", "yolov8s-face.pt")
    face_padding_percent: float = float(os.getenv("FACE_PADDING_PERCENT", "0.30"))
    face_conf_threshold: float = float(os.getenv("FACE_CONF_THRESHOLD", "0.80"))
    min_face_size: int = int(os.getenv("MIN_FACE_SIZE", "120"))

    # Quality & Liveness Gates
    blur_threshold: float = float(os.getenv("BLUR_THRESHOLD", "110.0"))
    min_exposure: float = float(os.getenv("MIN_EXPOSURE", "45.0"))
    max_exposure: float = float(os.getenv("MAX_EXPOSURE", "220.0"))
    ear_threshold: float = float(os.getenv("EAR_THRESHOLD", "0.22"))
    required_blinks: int = int(os.getenv("REQUIRED_BLINKS", "1"))
    liveness_timeout_sec: float = float(os.getenv("LIVENESS_TIMEOUT_SEC", "5.0"))
    clahe_brightness_threshold: float = float(os.getenv("CLAHE_BRIGHTNESS_THRESHOLD", "75.0"))
    clahe_clip_limit: float = float(os.getenv("CLAHE_CLIP_LIMIT", "2.0"))

    # Tracking, Burst Consensus & Cooldown
    cooldown_seconds: float = float(os.getenv("COOLDOWN_SECONDS", "15.0"))
    max_tracking_distance: float = float(os.getenv("MAX_TRACKING_DISTANCE", "75.0"))
    max_disappeared_frames: int = int(os.getenv("MAX_DISAPPEARED_FRAMES", "20"))
    burst_frame_count: int = int(os.getenv("BURST_FRAME_COUNT", "4"))
    burst_window_seconds: float = float(os.getenv("BURST_WINDOW_SECONDS", "0.6"))
    min_consecutive_valid_frames: int = int(os.getenv("MIN_CONSECUTIVE_VALID_FRAMES", "2"))

    # Backend API Settings
    api_base_url: str = os.getenv("API_BASE_URL", "https://api.example.com").rstrip("/")
    api_key: str = os.getenv("API_KEY", "")
    device_id: str = os.getenv("DEVICE_ID", "kiosk-logitech-01")
    request_timeout_sec: float = float(os.getenv("REQUEST_TIMEOUT_SEC", "10.0"))
    jpeg_quality: int = int(os.getenv("JPEG_QUALITY", "95"))
    rekognition_match_threshold: float = float(os.getenv("REKOGNITION_MATCH_THRESHOLD", "95.0"))

    # Offline Queue
    db_path: str = os.getenv("DB_PATH", "offline_queue.db")
    sync_interval_sec: float = float(os.getenv("SYNC_INTERVAL_SEC", "10.0"))

    # Geo-fencing (Preserving VIT Vellore defaults from original repo)
    geofence_enabled: bool = os.getenv("GEOFENCE_ENABLED", "true").lower() in ("1", "true", "yes")
    vit_latitude: float = float(os.getenv("VIT_LATITUDE", "12.9710"))
    vit_longitude: float = float(os.getenv("VIT_LONGITUDE", "79.1591"))
    allowed_radius_meters: float = float(os.getenv("ALLOWED_RADIUS_METERS", "500.0"))

    # UI / HUD
    show_preview: bool = os.getenv("SHOW_PREVIEW", "true").lower() in ("1", "true", "yes")


# Global config singleton
config = EdgeConfig()
