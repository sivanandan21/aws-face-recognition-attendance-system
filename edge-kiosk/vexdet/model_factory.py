"""Model factory for VEXDET RF-DETR architectures.

Provides factory helpers for model instantiation, inference predictor creation,
and ONNX runtime initialization across CPU and CUDA backends.
Only Apache-2.0 licensed RF-DETR architectures are permitted.
"""

import logging
from typing import Any, Dict, Optional, Type

logger = logging.getLogger(__name__)

# Permitted Apache-2.0 model registry
ALLOWED_MODEL_NAMES = ("RFDETRNano", "RFDETRSmall", "RFDETRMedium", "RFDETRLarge")


def is_cuda_available() -> bool:
    """Check if CUDA is available via torch without throwing."""
    try:
        import torch
        return bool(torch.cuda.is_available())
    except ImportError:
        return False


def get_rfdetr_class(model_name: str) -> Type[Any]:
    """Dynamically import and return the requested Apache-2.0 RF-DETR model class."""
    if model_name not in ALLOWED_MODEL_NAMES:
        raise ValueError(
            f"Disallowed model architecture '{model_name}'. Allowed Apache-2.0 models: {ALLOWED_MODEL_NAMES}."
        )

    try:
        import rfdetr
    except ImportError as e:
        raise ImportError(
            "rfdetr is not installed. Install via: pip install 'rfdetr>=1.12.0'"
        ) from e

    if not hasattr(rfdetr, model_name):
        raise AttributeError(f"rfdetr package does not export '{model_name}'.")

    return getattr(rfdetr, model_name)


def create_model(
    model_name: str = "RFDETRSmall",
    pretrain_weights: Optional[str] = None,
) -> Any:
    """Instantiate an Apache-2.0 RF-DETR model."""
    model_cls = get_rfdetr_class(model_name)
    logger.info(
        f"Instantiating Apache-2.0 VEXDET model: {model_name} "
        f"(weights: {pretrain_weights or 'default pretrained'})"
    )

    if pretrain_weights is not None:
        return model_cls(pretrain_weights=str(pretrain_weights))
    return model_cls()


def create_predictor(model: Any) -> Any:
    """Create inference predictor from an instantiated RF-DETR model."""
    if hasattr(model, "inference") and callable(model.inference):
        return model.inference()
    return model


def create_onnx_predictor(onnx_path: str) -> Any:
    """Create inference predictor from exported ONNX model."""
    try:
        from rfdetr import RFDETRInference
    except ImportError as e:
        raise ImportError("rfdetr is not installed. Please install rfdetr>=1.12.0") from e

    logger.info(f"Loading VEXDET ONNX predictor from: {onnx_path}")
    return RFDETRInference(str(onnx_path))


def create_class_thresholds(
    thresholds: Optional[Dict[str, float]] = None,
    default_threshold: float = 0.50,
) -> Any:
    """Create ClassThresholds for fine-grained class-level filtering."""
    try:
        from rfdetr import ClassThresholds
        if thresholds:
            return ClassThresholds(thresholds, default=default_threshold)
        return ClassThresholds({"face": 0.80, "person": 0.35}, default=default_threshold)
    except (ImportError, AttributeError):
        class _FallbackClassThresholds:
            def __init__(self, mapping: Dict[str, float], default: float = 0.5):
                self.mapping = mapping
                self.default = default

            def get(self, class_name: str, default: Optional[float] = None) -> float:
                return self.mapping.get(class_name, self.default if default is None else default)

            def __repr__(self) -> str:
                return f"ClassThresholds({self.mapping}, default={self.default})"

        return _FallbackClassThresholds(
            thresholds or {"face": 0.80, "person": 0.35},
            default=default_threshold,
        )
