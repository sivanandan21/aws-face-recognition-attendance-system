"""Configuration schema and validation for VEXDET (Vision Extraction Detector).

Supported Apache-2.0 RF-DETR model architectures:
RFDETRNano, RFDETRSmall, RFDETRMedium, RFDETRLarge.
"""

from pathlib import Path
from typing import Dict, List, Optional
import yaml
from pydantic import BaseModel, Field, field_validator, model_validator

ALLOWED_MODELS = {"RFDETRNano", "RFDETRSmall", "RFDETRMedium", "RFDETRLarge"}


class ModelConfig(BaseModel):
    """RF-DETR Model configuration."""

    name: str = Field(
        default="RFDETRSmall",
        description="Model architecture. Allowed: RFDETRNano, RFDETRSmall, RFDETRMedium, RFDETRLarge",
    )
    pretrain_weights: Optional[str] = Field(
        default=None,
        description="Path to local pretrained checkpoint, or null for default",
    )
    device: str = Field(
        default="auto",
        description="Target device: 'auto' (CUDA if available else CPU), 'cuda', or 'cpu'",
    )

    @field_validator("name")
    @classmethod
    def validate_model_name(cls, v: str) -> str:
        if v not in ALLOWED_MODELS:
            raise ValueError(
                f"Invalid model name '{v}'. Allowed Apache-2.0 architectures: {sorted(ALLOWED_MODELS)}. "
                "Supported models are RFDETRNano, RFDETRSmall, RFDETRMedium, and RFDETRLarge."
            )
        return v

    @field_validator("device")
    @classmethod
    def validate_device(cls, v: str) -> str:
        v_lower = v.lower()
        if v_lower not in {"auto", "cuda", "cpu"}:
            raise ValueError(f"Device must be 'auto', 'cuda', or 'cpu', got '{v}'")
        return v_lower


class PreprocessConfig(BaseModel):
    """Low-light and glare frame preprocessing configuration."""

    enable_clahe: bool = Field(default=True, description="Enable LAB-color space CLAHE enhancement")
    clip_limit: float = Field(default=2.0, ge=0.1, le=20.0, description="Contrast limit for CLAHE")
    tile_grid: List[int] = Field(default_factory=lambda: [8, 8], description="Grid size for histogram equalization")

    @field_validator("tile_grid")
    @classmethod
    def validate_tile_grid(cls, v: List[int]) -> List[int]:
        if len(v) != 2 or any(x < 1 for x in v):
            raise ValueError("tile_grid must contain exactly two positive integers [grid_x, grid_y]")
        return v


class TilingConfig(BaseModel):
    """Sliced / Tiled inference configuration for small/far-field targets."""

    enable_tiling: bool = Field(default=False, description="Enable sliced/tiled inference for far-field/small targets")
    slice_size: int = Field(default=640, ge=128, le=2048, description="Width and height of image tiles")
    overlap_ratio: float = Field(default=0.25, ge=0.0, lt=0.8, description="Fraction of tile overlap")
    iou_threshold: float = Field(default=0.55, ge=0.0, le=1.0, description="IoU threshold for box fusion")


class TTAConfig(BaseModel):
    """Test-Time Augmentation configuration."""

    enable_tta: bool = Field(default=False, description="Enable Test-Time Augmentation (horizontal flip)")
    flip_horizontal: bool = Field(default=True, description="Perform horizontal flip augmentation")


class DetectionConfig(BaseModel):
    """Detection inference configuration."""

    classes: List[str] = Field(
        default_factory=lambda: ["face", "head", "person"],
        description="Target classes for attendance detection",
    )
    confidence_threshold: float = Field(
        default=0.80,
        ge=0.0,
        le=1.0,
        description="Confidence threshold for detection",
    )
    default_threshold: float = Field(
        default=0.50,
        ge=0.0,
        le=1.0,
        description="Fallback threshold for non-specified classes",
    )
    class_thresholds: Dict[str, float] = Field(
        default_factory=lambda: {"face": 0.80, "head": 0.75, "person": 0.50},
        description="Per-class detection thresholds",
    )


class ExportConfig(BaseModel):
    """ONNX export and optimization configuration."""

    checkpoint_path: str = Field(default="models/checkpoints/vexdet_v1.pt")
    output_dir: str = Field(default="models/exported")
    artifact_name: str = Field(default="vexdet_v1")
    format: str = Field(default="onnx")
    opset: int = Field(default=17, ge=11)
    simplify: bool = Field(default=True)

    @field_validator("format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        if v.lower() != "onnx":
            raise ValueError(f"Export format must be 'onnx', got '{v}'")
        return v.lower()


class PipelineConfig(BaseModel):
    """Root configuration aggregating all sub-configs."""

    model: ModelConfig = Field(default_factory=ModelConfig)
    preprocess: PreprocessConfig = Field(default_factory=PreprocessConfig)
    tiling: TilingConfig = Field(default_factory=TilingConfig)
    tta: TTAConfig = Field(default_factory=TTAConfig)
    detection: DetectionConfig = Field(default_factory=DetectionConfig)
    export: ExportConfig = Field(default_factory=ExportConfig)

    @model_validator(mode="after")
    def validate_pipeline(self) -> "PipelineConfig":
        return self

    def resolve_device(self) -> str:
        """Resolve 'auto' to 'cuda' or 'cpu' using torch."""
        if self.model.device == "auto":
            try:
                import torch
                return "cuda" if torch.cuda.is_available() else "cpu"
            except ImportError:
                return "cpu"
        return self.model.device


def load_config(config_path: Optional[str] = None) -> PipelineConfig:
    """Load configuration from YAML file or return default."""
    if config_path is None:
        default_path = Path("configs/vexdet.yaml")
        if not default_path.exists():
            default_path = Path(__file__).resolve().parent.parent / "configs" / "vexdet.yaml"
        config_path = str(default_path)

    path = Path(config_path)
    if not path.is_file():
        return PipelineConfig()

    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    return PipelineConfig(**data)
