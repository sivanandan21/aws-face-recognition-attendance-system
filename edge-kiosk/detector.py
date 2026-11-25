"""
VEXDET (RF-DETR Transformer) Face & Subject Detector.
Replaces legacy ultralytics YOLOv8n-face detection with the Apache-2.0 VEXDET
engine (RF-DETR PyTorch / ONNX Runtime + VexdetEnhancedPredictor combining CLAHE
enhancement, optional tiled slicing, TTA, and Weighted Boxes Fusion).
"""

import logging
import os
from typing import Any, List, NamedTuple, Optional, Tuple
import cv2
import numpy as np

from config import config
from vexdet.config import ALLOWED_MODELS
from vexdet.enhanced_inference import VexdetEnhancedPredictor, unpack_detections
from vexdet.model_factory import (
    create_model,
    create_onnx_predictor,
    create_predictor,
    is_cuda_available,
)

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

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
    mean_brightness = float(np.mean(gray))

    if mean_brightness >= brightness_threshold:
        return crop

    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    cl = clahe.apply(l_chan)
    merged_lab = cv2.merge((cl, a_chan, b_chan))
    return cv2.cvtColor(merged_lab, cv2.COLOR_LAB2BGR)


def score_face_crop(sharpness: float, confidence: float) -> float:
    """
    Composite score combining Laplacian sharpness variance and detection confidence.
    Used to select the sharpest, highest-confidence frame from a burst window.
    """
    return float((sharpness / 100.0) * confidence)


class VexdetFaceDetector:
    """Apache-2.0 VEXDET (RF-DETR) detector for Edge Kiosk biometric verification."""

    DIRECT_FACE_CLASSES = {"face", "head"}

    def __init__(
        self,
        model_path: Optional[str] = None,
        conf_threshold: float = config.face_conf_threshold,
        padding_percent: float = config.face_padding_percent,
        model_name: str = config.vexdet_model_name,
        checkpoint_path: Optional[str] = config.vexdet_checkpoint_path,
        onnx_path: Optional[str] = config.vexdet_onnx_path,
        enhanced: bool = config.vexdet_enhanced,
        enable_tiling: bool = config.vexdet_enable_tiling,
        enable_tta: bool = config.vexdet_enable_tta,
        slice_size: int = config.vexdet_slice_size,
        overlap_ratio: float = config.vexdet_overlap_ratio,
        wbf_iou_threshold: float = config.vexdet_wbf_iou_threshold,
        predictor: Optional[Any] = None,
        auto_init: bool = False,
    ):
        if model_name not in ALLOWED_MODELS:
            raise ValueError(
                f"Disallowed detection model '{model_name}'. "
                f"Only Apache-2.0 VEXDET RF-DETR architectures {sorted(ALLOWED_MODELS)} are permitted."
            )

        self.model_name = model_name
        self.conf_threshold = conf_threshold
        self.padding_percent = padding_percent
        self.enhanced = enhanced
        self.enable_tiling = enable_tiling
        self.enable_tta = enable_tta
        self.slice_size = slice_size
        self.overlap_ratio = overlap_ratio
        self.wbf_iou_threshold = wbf_iou_threshold

        # Resolve optional legacy/explicit model_path into ONNX or checkpoint path
        self.onnx_path = onnx_path
        self.checkpoint_path = checkpoint_path
        if model_path:
            lower_mp = str(model_path).lower()
            if "yolo" in lower_mp or "ultralytics" in lower_mp:
                raise ValueError(
                    f"Legacy YOLO model path '{model_path}' is disallowed. "
                    "Use Apache-2.0 VEXDET RF-DETR (.onnx or .pt/.pth) instead."
                )
            if lower_mp.endswith(".onnx"):
                self.onnx_path = model_path
            else:
                self.checkpoint_path = model_path

        self.model: Optional[Any] = None
        self.base_predictor: Optional[Any] = None
        self.predictor: Optional[Any] = None
        self.runtime_mode: str = "Uninitialized"
        self.device: str = self._resolve_device(config.vexdet_device)
        self._load_attempted: bool = False

        # Initialize lightweight OpenCV cascade for person-ROI face refinement and fallback
        self._init_cascade()

        if predictor is not None:
            self.set_predictor(predictor, runtime_mode="Custom VEXDET Predictor")
        elif self._has_local_weights():
            self.ensure_loaded()
        elif auto_init:
            self.ensure_loaded()

    @staticmethod
    def _resolve_device(device_pref: str) -> str:
        pref = (device_pref or "auto").lower()
        if pref == "cpu":
            return "cpu"
        if is_cuda_available():
            return "cuda:0"
        return "cpu"

    def _init_cascade(self) -> None:
        try:
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            self._fallback_cascade = cv2.CascadeClassifier(cascade_path)
            if self._fallback_cascade.empty():
                self._fallback_cascade = None
        except Exception:
            self._fallback_cascade = None

    def _has_local_weights(self) -> bool:
        if self.onnx_path and os.path.isfile(self.onnx_path):
            return True
        if self.checkpoint_path and os.path.isfile(self.checkpoint_path):
            return True
        return False

    def _wrap_predictor(self, base_predictor: Any) -> Any:
        if not self.enhanced:
            return base_predictor
        return VexdetEnhancedPredictor(
            base_predictor=base_predictor,
            enable_clahe=True,
            enable_tiling=self.enable_tiling,
            enable_tta=self.enable_tta,
            slice_size=self.slice_size,
            overlap_ratio=self.overlap_ratio,
            wbf_iou_threshold=self.wbf_iou_threshold,
            clip_limit=config.clahe_clip_limit,
        )

    def set_predictor(self, base_predictor: Any, runtime_mode: str = "VEXDET Predictor") -> None:
        """Bind a base RF-DETR or ONNX predictor (optionally wrapped in VexdetEnhancedPredictor)."""
        self.base_predictor = base_predictor
        self.predictor = self._wrap_predictor(base_predictor)
        self.runtime_mode = runtime_mode
        self._load_attempted = True

    def ensure_loaded(self) -> None:
        """Lazily initialize the VEXDET ONNX or PyTorch RF-DETR predictor once."""
        if self._load_attempted:
            return
        self._load_attempted = True
        self._init_model()

    def _init_model(self) -> None:
        try:
            if self.onnx_path and os.path.isfile(self.onnx_path):
                logger.info(f"Loading VEXDET ONNX runtime model: {self.onnx_path}")
                base_pred = create_onnx_predictor(self.onnx_path)
                self.set_predictor(
                    base_pred,
                    runtime_mode=f"VEXDET ONNX ({os.path.basename(self.onnx_path)})",
                )
                return

            if self.checkpoint_path and os.path.isfile(self.checkpoint_path):
                logger.info(
                    f"Loading VEXDET {self.model_name} fine-tuned checkpoint: {self.checkpoint_path}"
                )
                self.model = create_model(
                    model_name=self.model_name,
                    pretrain_weights=self.checkpoint_path,
                )
                base_pred = create_predictor(self.model)
                self.set_predictor(
                    base_pred,
                    runtime_mode=f"VEXDET {self.model_name} ({os.path.basename(self.checkpoint_path)})",
                )
                return

            logger.info(f"Loading VEXDET Apache-2.0 {self.model_name} on {self.device}...")
            self.model = create_model(model_name=self.model_name, pretrain_weights=None)
            base_pred = create_predictor(self.model)
            self.set_predictor(
                base_pred,
                runtime_mode=f"VEXDET {self.model_name} ({self.device.upper()})",
            )
        except Exception as e:
            logger.warning(
                f"VEXDET RF-DETR initialization unavailable ({e}). "
                "Enabling OpenCV frontalface fallback detector."
            )
            self.model = None
            self.base_predictor = None
            self.predictor = None
            self.runtime_mode = "OpenCV Cascade Fallback"

    @property
    def engine_label(self) -> str:
        """Human-readable label for HUD banners and diagnostics."""
        if self.predictor is not None:
            mode = "Enhanced WBF" if self.enhanced else "Standard"
            return f"VEXDET ({self.model_name} | {mode})"
        return f"VEXDET ({self.model_name} | Fallback)"

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

        return x1, y1, max(0, x2 - x1), max(0, y2 - y1)

    def _refine_face_from_person_roi(
        self,
        frame: np.ndarray,
        bx1: int,
        by1: int,
        bx2: int,
        by2: int,
    ) -> List[Tuple[int, int, int, int]]:
        """Locate tight face box inside a COCO 'person' detection ROI when using base weights."""
        if self._fallback_cascade is None:
            return [(bx1, by1, bx2 - bx1, by2 - by1)]

        roi = frame[by1:by2, bx1:bx2]
        if roi.size == 0:
            return []

        gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        faces = self._fallback_cascade.detectMultiScale(
            gray_roi, scaleFactor=1.15, minNeighbors=5, minSize=(48, 48)
        )
        if len(faces) == 0:
            return [(bx1, by1, bx2 - bx1, by2 - by1)]

        return [(bx1 + int(fx), by1 + int(fy), int(fw), int(fh)) for (fx, fy, fw, fh) in faces]

    def detect_faces(self, frame: np.ndarray) -> List[DetectedFace]:
        """Detect faces in BGR frame using VEXDET RF-DETR engine and crop with padding."""
        if frame is None or frame.size == 0:
            return []

        self.ensure_loaded()

        frame_h, frame_w = frame.shape[:2]
        detected: List[DetectedFace] = []

        if self.predictor is not None:
            # Strict BGR-to-RGB conversion required by VEXDET / RF-DETR
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            infer_scale = 1.0
            infer_img = frame_rgb
            max_dim = max(frame_h, frame_w)
            if not self.enable_tiling and max_dim > 640:
                infer_scale = 640.0 / float(max_dim)
                infer_w = max(128, int(round(frame_w * infer_scale)))
                infer_h = max(128, int(round(frame_h * infer_scale)))
                infer_img = cv2.resize(frame_rgb, (infer_w, infer_h), interpolation=cv2.INTER_LINEAR)

            raw_dets = self.predictor.predict(infer_img, threshold=self.conf_threshold)
            records = unpack_detections(raw_dets)
            inv_scale = 1.0 / infer_scale

            for rec in records:
                conf = float(rec.get("confidence", 0.0))
                if conf < self.conf_threshold:
                    continue

                cname = str(rec.get("class_name", "face")).lower()
                if cname not in ("face", "head", "person"):
                    continue

                box = rec.get("box_xyxy", [0, 0, 0, 0])
                bx1 = int(max(0, min(frame_w, round(box[0] * inv_scale))))
                by1 = int(max(0, min(frame_h, round(box[1] * inv_scale))))
                bx2 = int(max(0, min(frame_w, round(box[2] * inv_scale))))
                by2 = int(max(0, min(frame_h, round(box[3] * inv_scale))))
                bw = bx2 - bx1
                bh = by2 - by1
                if bw <= 0 or bh <= 0:
                    continue

                if cname in self.DIRECT_FACE_CLASSES:
                    candidate_boxes = [(bx1, by1, bw, bh)]
                else:
                    candidate_boxes = self._refine_face_from_person_roi(frame, bx1, by1, bx2, by2)

                for (fx, fy, fw, fh) in candidate_boxes:
                    if fw <= 0 or fh <= 0:
                        continue
                    px, py, pw, ph = self.apply_padding(fx, fy, fw, fh, frame_w, frame_h)
                    crop = frame[py : py + ph, px : px + pw].copy()
                    detected.append(
                        DetectedFace(
                            bbox=(fx, fy, fw, fh),
                            confidence=conf,
                            crop=crop,
                            padded_bbox=(px, py, pw, ph),
                        )
                    )
        elif self._fallback_cascade is not None:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self._fallback_cascade.detectMultiScale(
                gray, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80)
            )
            for (x, y, w, h) in faces:
                ix, iy, iw, ih = int(x), int(y), int(w), int(h)
                px, py, pw, ph = self.apply_padding(ix, iy, iw, ih, frame_w, frame_h)
                crop = frame[py : py + ph, px : px + pw].copy()
                detected.append(
                    DetectedFace(
                        bbox=(ix, iy, iw, ih),
                        confidence=0.96,
                        crop=crop,
                        padded_bbox=(px, py, pw, ph),
                    )
                )

        return detected


# Backward-compatibility alias for legacy imports
YOLOFaceDetector = VexdetFaceDetector
