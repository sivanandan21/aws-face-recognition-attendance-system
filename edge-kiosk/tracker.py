"""
Lightweight Centroid Face Tracker with 15-second check-in cooldown.
Tracks detected faces between frames using Euclidean distance centroid matching,
preventing redundant API requests when a user stays in camera view.
"""

import time
from typing import Dict, List, Tuple
import numpy as np
from config import config


class TrackedFace:
    def __init__(self, track_id: int, centroid: Tuple[int, int]):
        self.track_id = track_id
        self.centroid = centroid
        self.disappeared_count = 0
        self.first_seen = time.time()
        self.last_seen = time.time()
        self.last_checkin_timestamp: float = 0.0

    def mark_checked_in(self) -> None:
        self.last_checkin_timestamp = time.time()

    def is_on_cooldown(self, cooldown_seconds: float = config.cooldown_seconds) -> bool:
        if self.last_checkin_timestamp == 0.0:
            return False
        return (time.time() - self.last_checkin_timestamp) < cooldown_seconds

    def seconds_remaining_in_cooldown(
        self, cooldown_seconds: float = config.cooldown_seconds
    ) -> float:
        if self.last_checkin_timestamp == 0.0:
            return 0.0
        elapsed = time.time() - self.last_checkin_timestamp
        return max(0.0, cooldown_seconds - elapsed)


class CentroidTracker:
    def __init__(
        self,
        max_disappeared: int = config.max_disappeared_frames,
        max_distance: float = config.max_tracking_distance,
        cooldown_seconds: float = config.cooldown_seconds,
    ):
        self.next_track_id = 1
        self.tracks: Dict[int, TrackedFace] = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance
        self.cooldown_seconds = cooldown_seconds

    def register(self, centroid: Tuple[int, int]) -> int:
        track_id = self.next_track_id
        self.tracks[track_id] = TrackedFace(track_id, centroid)
        self.next_track_id += 1
        return track_id

    def deregister(self, track_id: int) -> None:
        if track_id in self.tracks:
            del self.tracks[track_id]

    def update(self, rects: List[Tuple[int, int, int, int]]) -> Dict[int, TrackedFace]:
        """
        Takes list of bounding boxes (x, y, w, h) and updates tracks.
        Returns dictionary of active {track_id: TrackedFace}.
        """
        if len(rects) == 0:
            for track_id in list(self.tracks.keys()):
                self.tracks[track_id].disappeared_count += 1
                if self.tracks[track_id].disappeared_count > self.max_disappeared:
                    self.deregister(track_id)
            return self.tracks

        input_centroids = np.zeros((len(rects), 2), dtype="int")
        for i, (x, y, w, h) in enumerate(rects):
            cx = int(x + (w / 2.0))
            cy = int(y + (h / 2.0))
            input_centroids[i] = (cx, cy)

        if len(self.tracks) == 0:
            for i in range(len(input_centroids)):
                self.register(tuple(input_centroids[i]))
            return self.tracks

        track_ids = list(self.tracks.keys())
        track_centroids = [self.tracks[tid].centroid for tid in track_ids]

        # Compute distance matrix between tracked centroids and input centroids
        D = np.linalg.norm(
            np.array(track_centroids)[:, np.newaxis] - input_centroids, axis=2
        )

        rows = D.min(axis=1).argsort()
        cols = D.argmin(axis=1)[rows]

        used_rows = set()
        used_cols = set()

        for row, col in zip(rows, cols):
            if row in used_rows or col in used_cols:
                continue

            # Skip matching if distance exceeds spatial threshold
            if D[row, col] > self.max_distance:
                continue

            track_id = track_ids[row]
            self.tracks[track_id].centroid = tuple(input_centroids[col])
            self.tracks[track_id].disappeared_count = 0
            self.tracks[track_id].last_seen = time.time()

            used_rows.add(row)
            used_cols.add(col)

        unused_rows = set(range(len(track_centroids))) - used_rows
        for row in unused_rows:
            track_id = track_ids[row]
            self.tracks[track_id].disappeared_count += 1
            if self.tracks[track_id].disappeared_count > self.max_disappeared:
                self.deregister(track_id)

        unused_cols = set(range(len(input_centroids))) - used_cols
        for col in unused_cols:
            self.register(tuple(input_centroids[col]))

        return self.tracks
