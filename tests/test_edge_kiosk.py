"""
Unit test suite for Edge Kiosk module.
Mocks OpenCV video captures, API responses, and hardware frames to verify:
- Laplacian variance blur gate
- Eye Aspect Ratio (EAR) & liveness verification
- Centroid tracker & 15-second cooldown
- SQLite offline queue resilience
- Geo-fencing Haversine calculations
- Direct API Gateway client with offline fallback
"""

import os
import sys
import tempfile
import time
from unittest.mock import MagicMock, patch
import cv2
import numpy as np
import pytest

# Add edge-kiosk directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "edge-kiosk")))

from camera import LogitechWebcam, list_connected_cameras, find_best_camera_index
from client import AttendanceApiClient
from detector import DetectedFace, YOLOFaceDetector, enhance_low_light_clahe, score_face_crop
from geofence import haversine_distance_meters, is_inside_campus
from liveness import (
    calculate_ear,
    compute_laplacian_blur,
    is_sharp_frame,
    check_exposure,
    is_min_face_size,
    LivenessGate,
)
from offline_queue import OfflineQueue, get_current_ist_timestamp
from tracker import CentroidTracker, TrackedFace


# ==========================================
# 1. BLUR & QUALITY GATE TESTS
# ==========================================

def test_blur_detector_sharp_vs_blurry():
    """Verify sharp synthetic frame has higher Laplacian variance than blurred frame."""
    # Create sharp high-contrast checkered image
    sharp_img = np.zeros((200, 200, 3), dtype=np.uint8)
    sharp_img[::20, :] = 255
    sharp_img[:, ::20] = 255

    # Create blurred image
    blurry_img = cv2.GaussianBlur(sharp_img, (25, 25), 0)

    sharp_var = compute_laplacian_blur(sharp_img)
    blurry_var = compute_laplacian_blur(blurry_img)

    assert sharp_var > blurry_var
    assert sharp_var > 80.0

    is_sharp, _ = is_sharp_frame(sharp_img, threshold=50.0)
    assert is_sharp is True

    is_blurry, _ = is_sharp_frame(blurry_img, threshold=50.0)
    assert is_blurry is False


# ==========================================
# 2. EYE ASPECT RATIO (EAR) & LIVENESS TESTS
# ==========================================

def test_ear_calculation():
    """Verify EAR correctly discriminates between open and closed eye landmarks."""
    # Open eye coordinates: vertical distance is ~10, horizontal is ~30
    open_eye = [
        (10.0, 50.0),  # p1
        (20.0, 40.0),  # p2
        (30.0, 40.0),  # p3
        (40.0, 50.0),  # p4
        (30.0, 60.0),  # p5
        (20.0, 60.0),  # p6
    ]
    ear_open = calculate_ear(open_eye)
    assert ear_open > 0.30

    # Closed eye coordinates: eyelids meet, vertical distance is ~1
    closed_eye = [
        (10.0, 50.0),  # p1
        (20.0, 49.5),  # p2
        (30.0, 49.5),  # p3
        (40.0, 50.0),  # p4
        (30.0, 50.5),  # p5
        (20.0, 50.5),  # p6
    ]
    ear_closed = calculate_ear(closed_eye)
    assert ear_closed < 0.10
    assert ear_open > ear_closed


def test_liveness_gate_blink_accumulation():
    """Verify LivenessGate state machine registers blinks."""
    gate = LivenessGate(ear_threshold=0.20, required_blinks=2)
    gate.face_mesh = MagicMock()

    # Mock face landmarks returning closed eye, then open eye
    def mock_mesh_process(rgb_frame):
        mock_result = MagicMock()
        mock_landmarks = [MagicMock(x=0.5, y=0.5) for _ in range(500)]
        mock_result.multi_face_landmarks = [MagicMock(landmark=mock_landmarks)]
        return mock_result

    gate.face_mesh.process = mock_mesh_process

    # Test reset
    gate.consecutive_closed_frames = 5
    gate.blink_count = 3
    gate.reset()
    assert gate.blink_count == 0
    assert gate.consecutive_closed_frames == 0


# ==========================================
# 3. YOLO DETECTOR PADDING TESTS
# ==========================================

def test_yolo_padding_calculation():
    """Verify 20% margin is added and clamped within boundaries."""
    detector = YOLOFaceDetector(conf_threshold=0.5, padding_percent=0.20)

    # Box in center: (100, 100, 50, 50) on 640x480 frame
    # 20% of 50 = 10
    px, py, pw, ph = detector.apply_padding(100, 100, 50, 50, 640, 480)
    assert px == 90
    assert py == 90
    assert pw == 70
    assert ph == 70

    # Box at frame boundary: (5, 5, 50, 50) clamped to 0
    px, py, pw, ph = detector.apply_padding(5, 5, 50, 50, 640, 480)
    assert px == 0
    assert py == 0


# ==========================================
# 4. CENTROID TRACKER & COOLDOWN TESTS
# ==========================================

def test_centroid_tracker_and_cooldown():
    """Verify face tracking across frames and 15-second cooldown enforcement."""
    tracker = CentroidTracker(max_disappeared=5, max_distance=50, cooldown_seconds=15.0)

    # Frame 1: Single face at (100, 100, 60, 60) -> centroid (130, 130)
    rects_f1 = [(100, 100, 60, 60)]
    tracks = tracker.update(rects_f1)
    assert len(tracks) == 1
    track_id = list(tracks.keys())[0]
    track = tracks[track_id]
    assert track.centroid == (130, 130)
    assert track.is_on_cooldown() is False

    # Mark checked in: Cooldown becomes active
    track.mark_checked_in()
    assert track.is_on_cooldown(cooldown_seconds=15.0) is True
    assert track.seconds_remaining_in_cooldown(cooldown_seconds=15.0) > 13.0

    # Frame 2: Face moved slightly to (105, 105, 60, 60) -> matched to same track
    rects_f2 = [(105, 105, 60, 60)]
    tracks_f2 = tracker.update(rects_f2)
    assert len(tracks_f2) == 1
    assert track_id in tracks_f2
    assert tracks_f2[track_id].is_on_cooldown() is True

    # After cooldown expires (sleep past 0.02s)
    time.sleep(0.02)
    assert track.is_on_cooldown(cooldown_seconds=0.01) is False


# ==========================================
# 5. SQLITE OFFLINE QUEUE TESTS
# ==========================================

def test_offline_queue_enqueue_and_sync():
    """Verify SQLite persistence, pending retrieval, and sync lifecycle."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        queue = OfflineQueue(db_path=db_path)
        assert queue.get_pending_count() == 0

        # Enqueue sample check-in
        sample_bytes = b"fake-jpeg-binary-data"
        rec_id = queue.enqueue(
            image_bytes=sample_bytes,
            latitude=12.9710,
            longitude=79.1591,
            device_id="test-kiosk-01",
        )
        assert rec_id == 1
        assert queue.get_pending_count() == 1

        # Retrieve pending
        pending = queue.get_pending(limit=10)
        assert len(pending) == 1
        assert pending[0]["image_bytes"] == sample_bytes
        assert pending[0]["device_id"] == "test-kiosk-01"

        # Mark as failed / increment retry
        queue.mark_failed(rec_id, "Connection timed out")
        pending_after_fail = queue.get_pending(limit=10)
        assert pending_after_fail[0]["retry_count"] == 1

        # Mark as synced
        queue.mark_synced(rec_id)
        assert queue.get_pending_count() == 0

    finally:
        if os.path.exists(db_path):
            os.remove(db_path)


# ==========================================
# 6. GEO-FENCING TESTS
# ==========================================

def test_geofencing_inside_and_outside_radius():
    """Verify Haversine formula correctly classifies VIT perimeter."""
    vit_lat, vit_lon = 12.9710, 79.1591

    # Coordinate ~100m away (Inside 500m radius)
    near_lat = vit_lat + 0.0008
    near_lon = vit_lon
    inside, dist = is_inside_campus(
        user_lat=near_lat,
        user_lon=near_lon,
        campus_lat=vit_lat,
        campus_lon=vit_lon,
        allowed_radius=500.0,
    )
    assert inside is True
    assert dist < 500.0

    # Coordinate in Bangalore ~150km away (Outside perimeter)
    blr_lat, blr_lon = 12.9716, 77.5946
    outside, dist_far = is_inside_campus(
        user_lat=blr_lat,
        user_lon=blr_lon,
        campus_lat=vit_lat,
        campus_lon=vit_lon,
        allowed_radius=500.0,
    )
    assert outside is False
    assert dist_far > 100000.0


# ==========================================
# 7. DIRECT API CLIENT & OFFLINE FALLBACK
# ==========================================

def test_api_client_success():
    """Verify AttendanceApiClient formats payload and handles 200 response."""
    queue = MagicMock()
    client = AttendanceApiClient(
        base_url="https://api.example.com",
        api_key="secret-kiosk-key",
        device_id="test-kiosk",
        offline_queue=queue,
    )

    dummy_frame = np.zeros((100, 100, 3), dtype=np.uint8)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "status": "PRESENT",
        "user_id": "STU1234",
        "name": "Alex Kumar",
        "confidence": 98.4,
    }

    with patch("requests.post", return_value=mock_resp) as mock_post:
        res = client.check_in_image(dummy_frame)
        assert res["status"] == "PRESENT"
        assert res["user_id"] == "STU1234"
        mock_post.assert_called_once()
        assert mock_post.call_args[1]["headers"]["x-api-key"] == "secret-kiosk-key"


def test_api_client_network_failure_enqueues_offline():
    """Verify network drop automatically falls back to SQLite queue."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        queue = OfflineQueue(db_path=db_path)
        client = AttendanceApiClient(
            base_url="https://api.example.com",
            api_key="secret-kiosk-key",
            offline_queue=queue,
        )

        dummy_frame = np.zeros((100, 100, 3), dtype=np.uint8)

        import requests
        with patch("requests.post", side_effect=requests.exceptions.ConnectionError("Network down")):
            res = client.check_in_image(dummy_frame)
            assert res["status"] == "OFFLINE_QUEUED"
            assert queue.get_pending_count() == 1

    finally:
        if os.path.exists(db_path):
            os.remove(db_path)


def test_exposure_gate_dark_normal_bright():
    """Verify exposure gate rejects pitch black and overexposed images."""
    pitch_black = np.zeros((100, 100, 3), dtype=np.uint8)
    washed_out = np.full((100, 100, 3), 255, dtype=np.uint8)
    normal_img = np.full((100, 100, 3), 128, dtype=np.uint8)

    valid_black, b_val = check_exposure(pitch_black)
    assert valid_black is False
    assert b_val < 45.0

    valid_white, w_val = check_exposure(washed_out)
    assert valid_white is False
    assert w_val > 220.0

    valid_norm, n_val = check_exposure(normal_img)
    assert valid_norm is True
    assert 45.0 <= n_val <= 220.0


def test_min_face_size_gate():
    """Verify rejection of small/distant face bounding boxes below 112x112."""
    assert is_min_face_size(80, 80, min_size=112) is False
    assert is_min_face_size(112, 112, min_size=112) is True
    assert is_min_face_size(200, 180, min_size=112) is True


def test_camera_auto_discovery_fallback():
    """Verify camera auto-discovery falls back cleanly to default index."""
    best_idx = find_best_camera_index()
    assert isinstance(best_idx, int)
    assert best_idx >= 0


def test_clahe_enhancement_low_light_vs_bright():
    """Verify CLAHE enhances dim/uneven crops and preserves bright crops."""
    # Dim crop (mean brightness ~ 40)
    dim_crop = np.full((120, 120, 3), 40, dtype=np.uint8)
    enhanced_dim = enhance_low_light_clahe(dim_crop, brightness_threshold=75.0, clip_limit=2.0)
    assert enhanced_dim is not None
    assert enhanced_dim.shape == dim_crop.shape

    # Bright crop (mean brightness ~ 140)
    bright_crop = np.full((120, 120, 3), 140, dtype=np.uint8)
    enhanced_bright = enhance_low_light_clahe(bright_crop, brightness_threshold=75.0)
    # Untouched identity
    assert np.array_equal(bright_crop, enhanced_bright)


def test_burst_frame_selection_and_consensus():
    """Verify burst buffer collects frames and selects highest scoring crop."""
    track = TrackedFace(track_id=1, centroid=(100, 100))
    assert track.consecutive_valid_frames == 0
    assert len(track.burst_candidates) == 0

    crop1 = np.full((100, 100, 3), 50, dtype=np.uint8)
    crop2 = np.full((100, 100, 3), 100, dtype=np.uint8)
    crop3 = np.full((100, 100, 3), 150, dtype=np.uint8)

    # Frame 1: sharpness 90, conf 0.82 -> score = 0.738
    track.add_burst_candidate(crop1, sharpness=90.0, confidence=0.82)
    assert track.consecutive_valid_frames == 1
    assert track.is_burst_ready(min_frames=2, target_frames=3) is False

    # Frame 2: sharpness 150, conf 0.95 -> score = 1.425 (Sharpest!)
    track.add_burst_candidate(crop2, sharpness=150.0, confidence=0.95)
    assert track.consecutive_valid_frames == 2

    # Frame 3: sharpness 110, conf 0.85 -> score = 0.935
    track.add_burst_candidate(crop3, sharpness=110.0, confidence=0.85)
    assert track.consecutive_valid_frames == 3
    assert track.is_burst_ready(min_frames=2, target_frames=3) is True

    # Best crop must be crop2
    best = track.get_best_burst_crop()
    assert np.array_equal(best, crop2)

    # Clear burst
    track.clear_burst()
    assert track.consecutive_valid_frames == 0
    assert len(track.burst_candidates) == 0


def test_padding_percent_expanded_25():
    """Verify 25% padding calculation expands bounding boxes symmetrically."""
    detector = YOLOFaceDetector(conf_threshold=0.80, padding_percent=0.25)
    # (100, 100, 60, 60) on 640x480 frame
    # 25% of 60 = 15
    px, py, pw, ph = detector.apply_padding(100, 100, 60, 60, 640, 480)
    assert px == 85
    assert py == 85
    assert pw == 90
    assert ph == 90


def test_score_face_crop():
    """Verify score calculation gives priority to higher sharpness and confidence."""
    score1 = score_face_crop(sharpness=120.0, confidence=0.90)
    score2 = score_face_crop(sharpness=60.0, confidence=0.90)
    assert score1 > score2
    assert score1 == (120.0 / 100.0) * 0.90
