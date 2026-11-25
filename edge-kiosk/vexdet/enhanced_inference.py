"""High-accuracy inference engine for VEXDET.

Provides VexdetEnhancedPredictor wrapping standard predictors with:
1. Low-light and glare CLAHE enhancement.
2. Sliced / Tiled inference for high-res imagery (far-field & tiny objects).
3. Test-Time Augmentation (horizontal flip).
4. Pure NumPy Weighted Boxes Fusion (WBF) with multi-pass spatial normalization.
"""

from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

from .config import PipelineConfig, load_config
from .preprocess import enhance_cctv_frame


def unpack_detections(detections_obj: Any) -> List[Dict[str, Any]]:
    """Uniformly unpack detections from rfdetr / supervision Detections object."""
    records: List[Dict[str, Any]] = []
    if detections_obj is None:
        return records

    if hasattr(detections_obj, "xyxy"):
        xyxy = detections_obj.xyxy
        conf = getattr(detections_obj, "confidence", None)
        class_id = getattr(detections_obj, "class_id", None)
        data = getattr(detections_obj, "data", {})
        class_names = data.get("class_name", None) if isinstance(data, dict) else None

        n = len(xyxy)
        for i in range(n):
            c_score = float(conf[i]) if conf is not None else 1.0
            cid = int(class_id[i]) if class_id is not None else 0
            cname = str(class_names[i]) if (class_names is not None and i < len(class_names)) else "person"
            box = xyxy[i].tolist() if hasattr(xyxy[i], "tolist") else list(xyxy[i])

            records.append({
                "box_xyxy": [float(x) for x in box],
                "confidence": c_score,
                "class_id": cid,
                "class_name": cname,
            })
    elif isinstance(detections_obj, (list, tuple)):
        for item in detections_obj:
            if isinstance(item, dict):
                records.append(item)
    return records


def compute_iou_matrix(boxes_a: np.ndarray, boxes_b: np.ndarray) -> np.ndarray:
    """Calculate pairwise IoU between two sets of [x1, y1, x2, y2] boxes."""
    if len(boxes_a) == 0 or len(boxes_b) == 0:
        return np.zeros((len(boxes_a), len(boxes_b)), dtype=np.float32)

    area_a = (boxes_a[:, 2] - boxes_a[:, 0]) * (boxes_a[:, 3] - boxes_a[:, 1])
    area_b = (boxes_b[:, 2] - boxes_b[:, 0]) * (boxes_b[:, 3] - boxes_b[:, 1])

    x1 = np.maximum(boxes_a[:, None, 0], boxes_b[None, :, 0])
    y1 = np.maximum(boxes_a[:, None, 1], boxes_b[None, :, 1])
    x2 = np.minimum(boxes_a[:, None, 2], boxes_b[None, :, 2])
    y2 = np.minimum(boxes_a[:, None, 3], boxes_b[None, :, 3])

    inter_w = np.maximum(0.0, x2 - x1)
    inter_h = np.maximum(0.0, y2 - y1)
    inter_area = inter_w * inter_h

    union = area_a[:, None] + area_b[None, :] - inter_area
    iou = np.where(union > 0, inter_area / union, 0.0)
    return iou.astype(np.float32)


def fuse_boxes_wbf(
    boxes: List[List[float]],
    scores: List[float],
    class_ids: List[int],
    class_names: Optional[List[str]] = None,
    iou_threshold: float = 0.55,
    total_passes: Optional[Union[int, float, Any]] = None,
) -> Dict[str, Any]:
    """Pure-NumPy implementation of Weighted Boxes Fusion (WBF)."""
    if not boxes:
        return {
            "boxes": np.empty((0, 4), dtype=np.float32),
            "scores": np.empty((0,), dtype=np.float32),
            "class_ids": np.empty((0,), dtype=np.int32),
            "class_names": np.empty((0,), dtype=object),
        }

    boxes_arr = np.asarray(boxes, dtype=np.float32)
    scores_arr = np.asarray(scores, dtype=np.float32)
    classes_arr = np.asarray(class_ids, dtype=np.int32)
    names_arr = np.asarray(
        class_names if class_names is not None else ["object"] * len(boxes),
        dtype=object,
    )

    fused_boxes: List[List[float]] = []
    fused_scores: List[float] = []
    fused_class_ids: List[int] = []
    fused_class_names: List[str] = []

    unique_classes = np.unique(classes_arr)

    for cls in unique_classes:
        mask = classes_arr == cls
        cls_boxes = boxes_arr[mask]
        cls_scores = scores_arr[mask]
        cls_names = names_arr[mask]

        order = np.argsort(-cls_scores)
        sorted_boxes = cls_boxes[order]
        sorted_scores = cls_scores[order]
        sorted_names = cls_names[order]

        clusters: List[Dict[str, Any]] = []

        for b, s, name in zip(sorted_boxes, sorted_scores, sorted_names):
            matched_cluster_idx = -1
            best_iou = 0.0

            for c_idx, cluster in enumerate(clusters):
                f_box = cluster["fused_box"]
                inter_x1 = max(b[0], f_box[0])
                inter_y1 = max(b[1], f_box[1])
                inter_x2 = min(b[2], f_box[2])
                inter_y2 = min(b[3], f_box[3])
                iw = max(0.0, inter_x2 - inter_x1)
                ih = max(0.0, inter_y2 - inter_y1)
                inter = iw * ih

                area_b = (b[2] - b[0]) * (b[3] - b[1])
                area_f = (f_box[2] - f_box[0]) * (f_box[3] - f_box[1])
                union = area_b + area_f - inter
                iou = (inter / union) if union > 0 else 0.0

                if iou >= iou_threshold and iou > best_iou:
                    best_iou = iou
                    matched_cluster_idx = c_idx

            if matched_cluster_idx >= 0:
                c = clusters[matched_cluster_idx]
                c["boxes"].append(b)
                c["scores"].append(s)
                c_boxes = np.array(c["boxes"], dtype=np.float32)
                c_scores = np.array(c["scores"], dtype=np.float32)
                sum_scores = np.sum(c_scores)
                c["fused_box"] = np.sum(c_boxes * c_scores[:, None], axis=0) / sum_scores
            else:
                clusters.append({
                    "boxes": [b],
                    "scores": [s],
                    "fused_box": b.copy(),
                    "name": name,
                })

        for cluster in clusters:
            c_scores = np.array(cluster["scores"], dtype=np.float32)
            sum_scores = float(np.sum(c_scores))
            cx = float((cluster["fused_box"][0] + cluster["fused_box"][2]) / 2.0)
            cy = float((cluster["fused_box"][1] + cluster["fused_box"][3]) / 2.0)

            if callable(total_passes):
                passes_for_box = max(1, int(total_passes(cx, cy)))
            elif isinstance(total_passes, (int, float)):
                passes_for_box = max(1, int(total_passes))
            else:
                passes_for_box = max(1, len(c_scores))

            raw_fused = sum_scores / passes_for_box
            consensus_boost = 1.0 + 0.05 * min(len(c_scores) - 1, 3)
            final_score = float(np.clip(raw_fused * consensus_boost, 0.0, 1.0))

            fused_boxes.append(cluster["fused_box"].tolist())
            fused_scores.append(final_score)
            fused_class_ids.append(int(cls))
            fused_class_names.append(str(cluster["name"]))

    return {
        "boxes": np.array(fused_boxes, dtype=np.float32) if fused_boxes else np.empty((0, 4), dtype=np.float32),
        "scores": np.array(fused_scores, dtype=np.float32) if fused_scores else np.empty((0,), dtype=np.float32),
        "class_ids": np.array(fused_class_ids, dtype=np.int32) if fused_class_ids else np.empty((0,), dtype=np.int32),
        "class_names": np.array(fused_class_names, dtype=object) if fused_class_names else np.empty((0,), dtype=object),
    }


def generate_image_slices(
    img_h: int,
    img_w: int,
    slice_size: int = 640,
    overlap_ratio: float = 0.25,
) -> List[Tuple[int, int, int, int]]:
    """Compute overlapping tile windows (x_min, y_min, x_max, y_max) covering the frame."""
    if img_w <= slice_size and img_h <= slice_size:
        return [(0, 0, img_w, img_h)]

    step_x = max(int(slice_size * (1.0 - overlap_ratio)), 32)
    step_y = max(int(slice_size * (1.0 - overlap_ratio)), 32)

    x_starts = list(range(0, max(1, img_w - slice_size + 1), step_x))
    if not x_starts or x_starts[-1] + slice_size < img_w:
        x_starts.append(max(0, img_w - slice_size))

    y_starts = list(range(0, max(1, img_h - slice_size + 1), step_y))
    if not y_starts or y_starts[-1] + slice_size < img_h:
        y_starts.append(max(0, img_h - slice_size))

    windows: List[Tuple[int, int, int, int]] = []
    for y in sorted(set(y_starts)):
        for x in sorted(set(x_starts)):
            x2 = min(img_w, x + slice_size)
            y2 = min(img_h, y + slice_size)
            windows.append((x, y, x2, y2))

    return windows


class VexdetEnhancedPredictor:
    """High-accuracy inference wrapper combining CLAHE, Tiling, TTA, and WBF."""

    def __init__(
        self,
        base_predictor: Any,
        enable_clahe: bool = True,
        enable_tiling: bool = False,
        enable_tta: bool = False,
        slice_size: int = 640,
        overlap_ratio: float = 0.25,
        wbf_iou_threshold: float = 0.55,
        clip_limit: float = 2.0,
        tile_grid: Tuple[int, int] = (8, 8),
    ):
        self.base_predictor = base_predictor
        self.enable_clahe = enable_clahe
        self.enable_tiling = enable_tiling
        self.enable_tta = enable_tta
        self.slice_size = slice_size
        self.overlap_ratio = overlap_ratio
        self.wbf_iou_threshold = wbf_iou_threshold
        self.clip_limit = clip_limit
        self.tile_grid = tile_grid

    @classmethod
    def from_config(
        cls,
        base_predictor: Any,
        config: Optional[PipelineConfig] = None,
        force_enhanced: bool = False,
    ) -> "VexdetEnhancedPredictor":
        """Factory constructor instantiating predictor from PipelineConfig."""
        if config is None:
            config = load_config()

        enable_clahe = True if force_enhanced else config.preprocess.enable_clahe
        enable_tiling = True if force_enhanced else config.tiling.enable_tiling
        enable_tta = True if force_enhanced else config.tta.enable_tta

        return cls(
            base_predictor=base_predictor,
            enable_clahe=enable_clahe,
            enable_tiling=enable_tiling,
            enable_tta=enable_tta,
            slice_size=config.tiling.slice_size,
            overlap_ratio=config.tiling.overlap_ratio,
            wbf_iou_threshold=config.tiling.iou_threshold,
            clip_limit=config.preprocess.clip_limit,
            tile_grid=(config.preprocess.tile_grid[0], config.preprocess.tile_grid[1]),
        )

    def predict(
        self,
        image_rgb: np.ndarray,
        threshold: Any = 0.35,
    ) -> Any:
        """Run high-accuracy enhanced inference pass on an RGB image."""
        img_h, img_w = image_rgb.shape[:2]

        if self.enable_clahe:
            proc_img = enhance_cctv_frame(
                image_rgb,
                clip_limit=self.clip_limit,
                tile_grid=self.tile_grid,
            )
        else:
            proc_img = image_rgb

        candidate_boxes: List[List[float]] = []
        candidate_scores: List[float] = []
        candidate_class_ids: List[int] = []
        candidate_class_names: List[str] = []

        raw_full = self.base_predictor.predict(proc_img, threshold=threshold)
        full_dets = unpack_detections(raw_full)

        for d in full_dets:
            candidate_boxes.append(d["box_xyxy"])
            candidate_scores.append(d["confidence"])
            candidate_class_ids.append(d.get("class_id", 0))
            candidate_class_names.append(d.get("class_name", "person"))

        if self.enable_tta:
            flipped_img = np.ascontiguousarray(np.fliplr(proc_img))
            raw_flipped = self.base_predictor.predict(flipped_img, threshold=threshold)
            flipped_dets = unpack_detections(raw_flipped)

            for d in flipped_dets:
                fx1, fy1, fx2, fy2 = d["box_xyxy"]
                unflipped_box = [
                    float(img_w - fx2),
                    float(fy1),
                    float(img_w - fx1),
                    float(fy2),
                ]
                candidate_boxes.append(unflipped_box)
                candidate_scores.append(d["confidence"])
                candidate_class_ids.append(d.get("class_id", 0))
                candidate_class_names.append(d.get("class_name", "person"))

        windows: List[Tuple[int, int, int, int]] = []
        if self.enable_tiling and (img_w > self.slice_size or img_h > self.slice_size):
            windows = generate_image_slices(
                img_h=img_h,
                img_w=img_w,
                slice_size=self.slice_size,
                overlap_ratio=self.overlap_ratio,
            )

            for x1, y1, x2, y2 in windows:
                tile = proc_img[y1:y2, x1:x2]
                raw_tile = self.base_predictor.predict(tile, threshold=threshold)
                tile_dets = unpack_detections(raw_tile)

                for td in tile_dets:
                    tx1, ty1, tx2, ty2 = td["box_xyxy"]
                    global_box = [
                        float(np.clip(tx1 + x1, 0, img_w)),
                        float(np.clip(ty1 + y1, 0, img_h)),
                        float(np.clip(tx2 + x1, 0, img_w)),
                        float(np.clip(ty2 + y1, 0, img_h)),
                    ]
                    candidate_boxes.append(global_box)
                    candidate_scores.append(td["confidence"])
                    candidate_class_ids.append(td.get("class_id", 0))
                    candidate_class_names.append(td.get("class_name", "person"))

        def get_spatial_passes(cx: float, cy: float) -> int:
            passes = 1
            if self.enable_tta:
                passes += 1
            if self.enable_tiling and windows:
                passes += sum(
                    1 for (wx1, wy1, wx2, wy2) in windows
                    if wx1 <= cx <= wx2 and wy1 <= cy <= wy2
                )
            return max(1, passes)

        fused = fuse_boxes_wbf(
            boxes=candidate_boxes,
            scores=candidate_scores,
            class_ids=candidate_class_ids,
            class_names=candidate_class_names,
            iou_threshold=self.wbf_iou_threshold,
            total_passes=get_spatial_passes,
        )

        try:
            import supervision as sv
            return sv.Detections(
                xyxy=fused["boxes"],
                confidence=fused["scores"],
                class_id=fused["class_ids"],
                data={"class_name": fused["class_names"]},
            )
        except ImportError:
            class _DetectionsResult:
                def __init__(self, xyxy, confidence, class_id, class_names):
                    self.xyxy = xyxy
                    self.confidence = confidence
                    self.class_id = class_id
                    self.data = {"class_name": class_names}

                def __len__(self):
                    return len(self.xyxy)

            return _DetectionsResult(
                xyxy=fused["boxes"],
                confidence=fused["scores"],
                class_id=fused["class_ids"],
                class_names=fused["class_names"],
            )
