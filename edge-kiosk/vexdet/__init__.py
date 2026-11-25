"""VEXDET (Vision Extraction Detector) engine package bundled for Edge Kiosk."""

from .config import (
    ALLOWED_MODELS,
    DetectionConfig,
    ModelConfig,
    PipelineConfig,
    PreprocessConfig,
    TilingConfig,
    TTAConfig,
    load_config,
)
from .enhanced_inference import (
    VexdetEnhancedPredictor,
    compute_iou_matrix,
    fuse_boxes_wbf,
    generate_image_slices,
    unpack_detections,
)
from .model_factory import (
    ALLOWED_MODEL_NAMES,
    create_class_thresholds,
    create_model,
    create_onnx_predictor,
    create_predictor,
    get_rfdetr_class,
    is_cuda_available,
)
from .preprocess import enhance_cctv_frame, enhance_frame, preprocess_image

__version__ = "0.1.0"

__all__ = [
    "ALLOWED_MODELS",
    "ALLOWED_MODEL_NAMES",
    "DetectionConfig",
    "ModelConfig",
    "PipelineConfig",
    "PreprocessConfig",
    "TilingConfig",
    "TTAConfig",
    "VexdetEnhancedPredictor",
    "compute_iou_matrix",
    "create_class_thresholds",
    "create_model",
    "create_onnx_predictor",
    "create_predictor",
    "enhance_cctv_frame",
    "enhance_frame",
    "fuse_boxes_wbf",
    "generate_image_slices",
    "get_rfdetr_class",
    "is_cuda_available",
    "load_config",
    "preprocess_image",
    "unpack_detections",
]
