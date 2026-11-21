"""
Direct API Client for AWS API Gateway.
Sends cropped JPEG bytes directly to POST /check-in over HTTPS with API key.
Buffers to SQLite offline queue if the network is unreachable.
"""

import base64
import logging
from typing import Any, Dict, Optional
import cv2
import numpy as np
import requests

from config import config
from offline_queue import OfflineQueue, get_current_ist_timestamp

logger = logging.getLogger(__name__)


class AttendanceApiClient:
    def __init__(
        self,
        base_url: str = config.api_base_url,
        api_key: str = config.api_key,
        device_id: str = config.device_id,
        offline_queue: Optional[OfflineQueue] = None,
        timeout: float = config.request_timeout_sec,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.device_id = device_id
        self.queue = offline_queue or OfflineQueue()
        self.timeout = timeout

    def check_in_image(
        self,
        image: np.ndarray,
        latitude: float = config.vit_latitude,
        longitude: float = config.vit_longitude,
        timestamp_ist: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Compress image crop to JPEG bytes and transmit to AWS API Gateway.
        Automatically enqueues offline if connection fails.
        """
        success, encoded_img = cv2.imencode(
            ".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), config.jpeg_quality]
        )
        if not success:
            return {"status": "ERROR", "message": "Failed to encode image to JPEG"}

        image_bytes = encoded_img.tobytes()
        ts = timestamp_ist or get_current_ist_timestamp()

        payload = {
            "device_id": self.device_id,
            "timestamp": ts,
            "captured_at": ts,
            "latitude": latitude,
            "longitude": longitude,
            "image_base64": base64.b64encode(image_bytes).decode("utf-8"),
        }

        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
        }

        url = f"{self.base_url}/check-in"

        try:
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
            logger.info(f"Check-in API success: {data.get('status')} - {data.get('user_id')}")
            return data

        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as net_err:
            logger.warning(
                f"Network failure reaching API ({net_err}). Enqueueing check-in offline."
            )
            rec_id = self.queue.enqueue(
                image_bytes=image_bytes,
                latitude=latitude,
                longitude=longitude,
                device_id=self.device_id,
                timestamp_ist=ts,
            )
            return {
                "status": "OFFLINE_QUEUED",
                "queue_id": rec_id,
                "message": "Buffered offline; will sync upon reconnect.",
            }

        except requests.exceptions.HTTPError as http_err:
            status_code = http_err.response.status_code if http_err.response else 500
            logger.error(f"HTTP Error {status_code} from API: {http_err}")
            return {
                "status": "HTTP_ERROR",
                "code": status_code,
                "message": str(http_err),
            }

        except Exception as e:
            logger.error(f"Unexpected error during check-in: {e}")
            return {"status": "ERROR", "message": str(e)}

    def sync_queued_record(self, record: Dict[str, Any]) -> bool:
        """Upload a queued record from SQLite to AWS API Gateway."""
        url = f"{self.base_url}/check-in"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
        }
        payload = {
            "device_id": record["device_id"],
            "timestamp": record["timestamp_ist"],
            "captured_at": record["timestamp_ist"],
            "latitude": record.get("latitude"),
            "longitude": record.get("longitude"),
            "image_base64": base64.b64encode(record["image_bytes"]).decode("utf-8"),
            "offline_sync": True,
        }

        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=self.timeout)
            return resp.status_code in (200, 201)
        except Exception as e:
            logger.debug(f"Sync attempt failed for record {record['id']}: {e}")
            return False
