"""
Unit test suite for AWS Backend Lambda handlers.
Mocks boto3 Rekognition, DynamoDB, S3, and SNS to verify:
- POST /enroll (Rekognition User Vectors + DynamoDB Users)
- POST /check-in (SearchUsersByImage + DynamoDB conditional duplicate lock)
- Geo-fencing validation & SNS security alerts
- GET /attendance (Partition query by session_key)
- GET /users
"""

import base64
import json
import os
import sys
from unittest.mock import MagicMock, patch
from botocore.exceptions import ClientError
import pytest

# Add handlers directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "aws-backend", "handlers")))

import check_in
import enroll
import get_attendance
import get_users
import manage_user


# ==========================================
# 1. ENROLL HANDLER TESTS
# ==========================================

def test_enroll_missing_fields():
    event = {
        "headers": {"x-api-key": "dev-kiosk-secret-key-change-in-prod"},
        "body": json.dumps({"user_id": "U123"}),  # Missing full_name and images
    }
    resp = enroll.lambda_handler(event, None)
    assert resp["statusCode"] == 400
    body = json.loads(resp["body"])
    assert "user_id and full_name are required" in body["message"]


def test_enroll_success():
    fake_img_b64 = base64.b64encode(b"dummy-image-bytes").decode("utf-8")
    event = {
        "headers": {"x-api-key": "dev-kiosk-secret-key-change-in-prod"},
        "body": json.dumps({
            "user_id": "STU101",
            "full_name": "Rohan Sharma",
            "department": "Computer Science",
            "email": "rohan@example.com",
            "images": [fake_img_b64, fake_img_b64],
        }),
    }

    with patch.object(enroll.rekognition, "create_user") as mock_create_user, \
         patch.object(enroll.rekognition, "index_faces") as mock_index_faces, \
         patch.object(enroll.rekognition, "associate_faces") as mock_assoc_faces, \
         patch.object(enroll.dynamodb, "Table") as mock_table, \
         patch.object(enroll.s3, "put_object"):

        mock_index_faces.return_value = {
            "FaceRecords": [{"Face": {"FaceId": "face-uuid-1"}}]
        }

        resp = enroll.lambda_handler(event, None)
        assert resp["statusCode"] == 201
        body = json.loads(resp["body"])
        assert body["status"] == "ENROLLED"
        assert body["user_id"] == "STU101"

        mock_create_user.assert_called_once()
        mock_assoc_faces.assert_called_once()


# ==========================================
# 2. CHECK-IN HANDLER TESTS
# ==========================================

def test_checkin_unauthorized_key():
    event = {
        "headers": {"x-api-key": "invalid-wrong-key"},
        "body": json.dumps({"image_base64": "xyz"}),
    }
    resp = check_in.lambda_handler(event, None)
    assert resp["statusCode"] == 401


def test_checkin_geofence_violation():
    fake_img = base64.b64encode(b"dummy").decode("utf-8")
    event = {
        "headers": {"x-api-key": "dev-kiosk-secret-key-change-in-prod"},
        "body": json.dumps({
            "image_base64": fake_img,
            "device_id": "kiosk-01",
            "latitude": 13.5000,  # Far outside VIT Vellore (12.9710)
            "longitude": 79.5000,
        }),
    }

    with patch.object(check_in.sns, "publish") as mock_sns:
        resp = check_in.lambda_handler(event, None)
        assert resp["statusCode"] == 403
        body = json.loads(resp["body"])
        assert body["status"] == "GEO_VIOLATION"


def test_checkin_unknown_face_alert():
    fake_img = base64.b64encode(b"dummy").decode("utf-8")
    event = {
        "headers": {"x-api-key": "dev-kiosk-secret-key-change-in-prod"},
        "body": json.dumps({
            "image_base64": fake_img,
            "device_id": "kiosk-01",
            "latitude": 12.9710,
            "longitude": 79.1591,
        }),
    }

    with patch.object(check_in.rekognition, "search_users_by_image") as mock_search, \
         patch.object(check_in.sns, "publish") as mock_sns:

        # Rekognition returns no user match
        mock_search.return_value = {"UserMatches": []}

        resp = check_in.lambda_handler(event, None)
        assert resp["statusCode"] == 404
        body = json.loads(resp["body"])
        assert body["status"] == "UNKNOWN_FACE"


def test_checkin_success_and_duplicate_lock():
    fake_img = base64.b64encode(b"dummy").decode("utf-8")
    event = {
        "headers": {"x-api-key": "dev-kiosk-secret-key-change-in-prod"},
        "body": json.dumps({
            "image_base64": fake_img,
            "device_id": "kiosk-01",
            "latitude": 12.9710,
            "longitude": 79.1591,
            "timestamp": "2026-11-20T08:45:00+05:30",  # Before 09:15 -> PRESENT
        }),
    }

    mock_table = MagicMock()
    mock_users_table = MagicMock()
    mock_users_table.get_item.return_value = {
        "Item": {"user_id": "STU101", "full_name": "Rohan Sharma", "department": "CSE"}
    }

    with patch.object(check_in.rekognition, "search_users_by_image") as mock_search, \
         patch.object(check_in.dynamodb, "Table") as mock_table_factory, \
         patch.object(check_in.s3, "put_object"):

        def table_resolver(name):
            if "Users" in name:
                return mock_users_table
            return mock_table

        mock_table_factory.side_effect = table_resolver

        mock_search.return_value = {
            "UserMatches": [
                {"Similarity": 97.5, "User": {"UserId": "STU101"}}
            ]
        }

        # First scan: Attendance marked successfully
        resp = check_in.lambda_handler(event, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["status"] == "PRESENT"
        assert body["user_id"] == "STU101"
        assert body["name"] == "Rohan Sharma"

        # Verify ConditionExpression was passed
        mock_table.put_item.assert_called_with(
            Item=mock_table.put_item.call_args[1]["Item"],
            ConditionExpression="attribute_not_exists(user_id)",
        )

        # Second scan: Duplicate scan triggers ConditionalCheckFailedException
        error_response = {"Error": {"Code": "ConditionalCheckFailedException", "Message": "Exists"}}
        mock_table.put_item.side_effect = ClientError(error_response, "PutItem")

        resp2 = check_in.lambda_handler(event, None)
        assert resp2["statusCode"] == 200
        body2 = json.loads(resp2["body"])
        assert body2["status"] == "ALREADY_MARKED"
        assert "Already marked present" in body2["message"]


def test_checkin_ist_midnight_boundary_date():
    """Verify check-in at 00:15 AM IST logs under the IST date, not the previous UTC day."""
    fake_img = base64.b64encode(b"dummy").decode("utf-8")
    # 00:15 AM on 2026-11-21 IST corresponds to 2026-11-20T18:45:00Z in UTC
    event = {
        "headers": {"x-api-key": "dev-kiosk-secret-key-change-in-prod"},
        "body": json.dumps({
            "image_base64": fake_img,
            "device_id": "kiosk-01",
            "latitude": 12.9710,
            "longitude": 79.1591,
            "timestamp": "2026-11-21T00:15:30+05:30",
        }),
    }

    mock_table = MagicMock()
    mock_users_table = MagicMock()
    mock_users_table.get_item.return_value = {
        "Item": {"user_id": "STU101", "full_name": "Rohan Sharma", "department": "CSE"}
    }

    with patch.object(check_in.rekognition, "search_users_by_image") as mock_search, \
         patch.object(check_in.dynamodb, "Table") as mock_table_factory, \
         patch.object(check_in.s3, "put_object"):

        mock_table_factory.side_effect = lambda name: mock_users_table if "Users" in name else mock_table
        mock_search.return_value = {
            "UserMatches": [{"Similarity": 98.2, "User": {"UserId": "STU101"}}]
        }

        resp = check_in.lambda_handler(event, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["session"] == "CLASS#2026-11-21"
        assert body["check_in_date"] == "2026-11-21"
        assert body["check_in_time"] == "12:15 AM"


def test_checkin_exact_10_30_detection_time():
    """Verify check-in at 10:30 returns exact 10:30 AM in response."""
    fake_img = base64.b64encode(b"dummy").decode("utf-8")
    event = {
        "headers": {"x-api-key": "dev-kiosk-secret-key-change-in-prod"},
        "body": json.dumps({
            "image_base64": fake_img,
            "device_id": "kiosk-01",
            "latitude": 12.9710,
            "longitude": 79.1591,
            "timestamp": "2026-11-21T10:30:00+05:30",
        }),
    }

    mock_table = MagicMock()
    mock_users_table = MagicMock()
    mock_users_table.get_item.return_value = {
        "Item": {"user_id": "STU101", "full_name": "Rohan Sharma", "department": "CSE"}
    }

    with patch.object(check_in.rekognition, "search_users_by_image") as mock_search, \
         patch.object(check_in.dynamodb, "Table") as mock_table_factory, \
         patch.object(check_in.s3, "put_object"):

        mock_table_factory.side_effect = lambda name: mock_users_table if "Users" in name else mock_table
        mock_search.return_value = {
            "UserMatches": [{"Similarity": 97.0, "User": {"UserId": "STU101"}}]
        }

        resp = check_in.lambda_handler(event, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["check_in_time"] == "10:30 AM"


# ==========================================
# 3. ATTENDANCE & USERS QUERY TESTS
# ==========================================

def test_get_attendance_query():
    event = {
        "queryStringParameters": {"date": "2026-11-20", "department": "CSE"}
    }
    mock_table = MagicMock()
    mock_table.query.return_value = {
        "Items": [
            {"user_id": "STU101", "status": "PRESENT", "full_name": "Rohan Sharma"}
        ]
    }

    with patch.object(get_attendance.dynamodb, "Table", return_value=mock_table):
        resp = get_attendance.lambda_handler(event, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["count"] == 1
        assert body["session_key"] == "CLASS#2026-11-20"


def test_get_users():
    mock_table = MagicMock()
    mock_table.scan.return_value = {
        "Items": [
            {"user_id": "STU101", "full_name": "Rohan Sharma", "active": True}
        ]
    }
    with patch.object(get_users.dynamodb, "Table", return_value=mock_table):
        resp = get_users.lambda_handler({}, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert len(body) == 1
        assert body[0]["user_id"] == "STU101"


# ==========================================
# 4. USER MANAGEMENT & EDIT TESTS
# ==========================================

def test_update_user_handler():
    event = {
        "pathParameters": {"user_id": "STU101"},
        "body": json.dumps({
            "full_name": "Rohan S. Sharma",
            "roll_number": "21BCE1042",
            "department": "CSE",
            "email": "rohan.new@example.com",
            "phone": "+91 98765 43210",
        }),
    }
    mock_table = MagicMock()
    mock_table.update_item.return_value = {
        "Attributes": {
            "user_id": "STU101",
            "full_name": "Rohan S. Sharma",
            "roll_number": "21BCE1042",
            "department": "CSE",
            "email": "rohan.new@example.com",
            "phone": "+91 98765 43210",
            "updated_at": "2026-11-21T10:30:00+05:30",
        }
    }
    with patch.object(manage_user.dynamodb, "Table", return_value=mock_table):
        resp = manage_user.update_user_handler(event, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["full_name"] == "Rohan S. Sharma"
        assert body["roll_number"] == "21BCE1042"


def test_add_faces_handler():
    fake_img = base64.b64encode(b"new-face-crop").decode("utf-8")
    event = {
        "pathParameters": {"user_id": "STU101"},
        "body": json.dumps({"images": [fake_img]}),
    }
    mock_table = MagicMock()
    mock_table.update_item.return_value = {
        "Attributes": {
            "user_id": "STU101",
            "images": [fake_img, fake_img],
            "face_ids": ["fid-1", "fid-2"],
        }
    }
    with patch.object(manage_user.rekognition, "index_faces") as mock_index, \
         patch.object(manage_user.rekognition, "associate_faces") as mock_assoc, \
         patch.object(manage_user.dynamodb, "Table", return_value=mock_table):

        mock_index.return_value = {"FaceRecords": [{"Face": {"FaceId": "fid-2"}}]}

        resp = manage_user.add_faces_handler(event, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["total_faces"] == 2


def test_remove_face_safeguard_prevents_last_photo_deletion():
    event = {
        "pathParameters": {"user_id": "STU101", "face_id": "0"},
    }
    mock_table = MagicMock()
    mock_table.get_item.return_value = {
        "Item": {"user_id": "STU101", "images": ["only-image-b64"], "face_ids": ["fid-1"]}
    }
    with patch.object(manage_user.dynamodb, "Table", return_value=mock_table):
        resp = manage_user.remove_face_handler(event, None)
        assert resp["statusCode"] == 400
        body = json.loads(resp["body"])
        assert "Cannot delete the student's only remaining face photo" in body["message"]


def test_remove_face_success():
    event = {
        "pathParameters": {"user_id": "STU101", "face_id": "1"},
    }
    mock_table = MagicMock()
    mock_table.get_item.return_value = {
        "Item": {"user_id": "STU101", "images": ["img1", "img2"], "face_ids": ["fid-1", "fid-2"]}
    }
    mock_table.update_item.return_value = {
        "Attributes": {"user_id": "STU101", "images": ["img1"], "face_ids": ["fid-1"]}
    }
    with patch.object(manage_user.rekognition, "disassociate_faces") as mock_disassoc, \
         patch.object(manage_user.rekognition, "delete_faces") as mock_del, \
         patch.object(manage_user.dynamodb, "Table", return_value=mock_table):

        resp = manage_user.remove_face_handler(event, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["total_faces"] == 1
        mock_disassoc.assert_called_once()
        mock_del.assert_called_once()


def test_remove_attendance_record_success():
    event = {
        "httpMethod": "DELETE",
        "queryStringParameters": {"user_id": "STU101", "date": "2026-11-21"},
    }
    mock_table = MagicMock()
    with patch.object(get_attendance.dynamodb, "Table", return_value=mock_table):
        resp = get_attendance.lambda_handler(event, None)
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])
        assert body["status"] == "DELETED"
        assert body["user_id"] == "STU101"
        assert body["session_key"] == "CLASS#2026-11-21"
        mock_table.delete_item.assert_called_once_with(
            Key={"session_key": "CLASS#2026-11-21", "user_id": "STU101"}
        )


def test_remove_attendance_record_missing_user_id():
    event = {
        "httpMethod": "DELETE",
        "queryStringParameters": {"date": "2026-11-21"},
    }
    mock_table = MagicMock()
    with patch.object(get_attendance.dynamodb, "Table", return_value=mock_table):
        resp = get_attendance.lambda_handler(event, None)
        assert resp["statusCode"] == 400
        body = json.loads(resp["body"])
        assert "Missing user_id parameter" in body["error"]

