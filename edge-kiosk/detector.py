"""
YOLOv8n-face Detector.
Replaces brittle Haar Cascades with ultralytics YOLOv8n-face detection.
Detects all faces in frame, crops each with configurable ~20% padding,
and supports CUDA GPU acceleration with automatic CPU fallback.
"""

import logging
import os
from typing import List, NamedTuple, Optional, Tuple
import cv2
import numpy as np

from config import config

logger = logging.getLogger(__name__)


class DetectedFace(NamedTuple):
    bbox: Tuple[int, int, int, int]  # (x, y, w, h)
    confidence: float
    crop: np.ndarray
    padded_bbox: Tuple[int, int, int, int]


def enhance_low_light_clahe(
    crop: np.ndarray,
    brightness_threshold: float = config.clahe_brightness_threshold,
    clip_limit: float = config.clahe_clip_limit,
) -> np.ndarray:
    """
    Conditionally enhances dim or unevenly lit face crops using CLAHE on the L-channel
    in LAB color space. Leaves adequately lit images untouched.
    """
    if crop is None or crop.size == 0:
        return crop

    # Evaluate mean brightness on grayscale
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
    mean_brightness = float(np.mean(gray))

    if mean_brightness >= brightness_threshold:
        return crop

    # Apply CLAHE to L-channel
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    cl = clahe.apply(l_chan)
    merged_lab = cv2.merge((cl, a_chan, b_chan))
    enhanced = cv2.cvtColor(merged_lab, cv2.COLOR_LAB2BGR)
    return enhanced


def score_face_crop(sharpness: float, confidence: float) -> float:
    """
    Composite score combining Laplacian sharpness variance and detection confidence.
    Used to select the sharpest, highest-confidence frame from a burst window.
    """
    return float((sharpness / 100.0) * confidence)


class YOLOFaceDetector:
    def __init__(
        self,
        model_path: Optional[str] = None,
        conf_threshold: float = config.face_conf_threshold,
        padding_percent: float = config.face_padding_percent,
    ):
        self.model_path = model_path or config.yolo_model_path
        self.conf_threshold = conf_threshold
        self.padding_percent = padding_percent
        self.model = None
        self.device = "cpu"
        self._init_model()

    def _init_model(self) -> None:
        try:
            import torch
            from ultralytics import YOLO

            if torch.cuda.is_available():
                self.device = "cuda:0"
                logger.info(f"CUDA GPU detected: {torch.cuda.get_device_name(0)}")
            else:
                self.device = "cpu"
                logger.info("No CUDA GPU detected; running YOLO on CPU")

            candidate_models = [self.model_path, "yolov8s-face.pt", "yolov8n-face.pt", "yolov8n.pt"]
            loaded = False
            for cand in candidate_models:
                if not cand:
                    continue
                try:
                    logger.info(f"Attempting to load face detection model: {cand}...")
                    self.model = YOLO(cand)
                    logger.info(f"Successfully loaded YOLO model: {cand}")
                    loaded = True
                    break
                except Exception as load_err:
                    logger.warning(f"Could not load candidate model {cand}: {load_err}")

            if not loaded:
                self.model = None

        except Exception as e:
            logger.warning(
                f"Ultralytics YOLO initialization error ({e}). "
                "Enabling OpenCV frontalface fallback detector."
            )
            self.model = None

        try:
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self._fallback_cascade = cv2.CascadeClassifier(cascade_path)
        except Exception:
            self._fallback_cascade = None

    def apply_padding(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        frame_w: int,
        frame_h: int,
    ) -> Tuple[int, int, int, int]:
        """Expands bounding box by padding_percent, clamped within frame boundaries."""
        pad_w = int(w * self.padding_percent)
        pad_h = int(h * self.padding_percent)

        x1 = max(0, x - pad_w)
        y1 = max(0, y - pad_h)
        x2 = min(frame_w, x + w + pad_w)
        y2 = min(frame_h, y + h + pad_h)

        return x1, y1, x2 - x1, y2 - y1

    def detect_faces(self, frame: np.ndarray) -> List[DetectedFace]:
        """Detect all faces in frame and crop each with ~20% margin."""
        if frame is None or frame.size == 0:
            return []

        frame_h, frame_w = frame.shape[:2]
        detected: List[DetectedFace] = []

        if self.model is not None:
            results = self.model.predict(
                source=frame,
                device=self.device,
                conf=self.conf_threshold,
                verbose=False,
            )

            for result in results:
                boxes = result.boxes
                if boxes is None:
                    continue

                for box in boxes:
                    xyxy = box.xyxy[0].cpu().numpy()
                    conf = float(box.conf[0].cpu().numpy())

                    bx1, by1, bx2, by2 = map(int, xyxy)
                    bw = bx2 - bx1
                    bh = by2 - by1

                    px, py, pw, ph = self.apply_padding(bx1, by1, bw, bh, frame_w, frame_h)
                    crop = frame[py : py + ph, px : px + pw].copy()

                    detected.append(
                        DetectedFace(
                            bbox=(bx1, by1, bw, bh),
                            confidence=conf,
                            crop=crop,
                            padded_bbox=(px, py, pw, ph),
                        )
                    )
        elif getattr(self, "_fallback_cascade", None) is not None:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self._fallback_cascade.detectMultiScale(
                gray, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80)
            )
            for (x, y, w, h) in faces:
                px, py, pw, ph = self.apply_padding(x, y, w, h, frame_w, frame_h)
                crop = frame[py : py + ph, px : px + pw].copy()
                detected.append(
                    DetectedFace(
                        bbox=(x, y, w, h),
                        confidence=0.96,
                        crop=crop,
                        padded_bbox=(px, py, pw, ph),
                    )
                )
        return detected
