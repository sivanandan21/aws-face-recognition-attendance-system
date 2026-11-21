"""
AWS Lambda Handler: POST /check-in
Performs Rekognition User Vector Search (SearchUsersByImage),
validates campus geo-fencing (VIT coordinates), computes status (PRESENT/LATE),
enforces duplicate lock using DynamoDB condition expressions,
stores audit snapshot in S3, and sends SNS alert on unknown face / violation.
"""

import base64
import json
import math
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Tuple

import boto3
from botocore.exceptions import ClientError

IST = timezone(timedelta(hours=5, minutes=30))

AWS_REGION = os.getenv("AWS_REGION_NAME", "ap-south-1")
USERS_TABLE = os.getenv("USERS_TABLE", "SmartAttendanceUsers")
ATTENDANCE_TABLE = os.getenv("ATTENDANCE_TABLE", "SmartAttendanceLogs")
SNAPSHOT_BUCKET = os.getenv("SNAPSHOT_BUCKET", "")
COLLECTION_ID = os.getenv("REKOGNITION_COLLECTION", "smart-attendance-collection")
SNS_TOPIC_ARN = os.getenv("SNS_TOPIC_ARN", "")
API_SECRET_KEY = os.getenv("API_SECRET_KEY", "dev-kiosk-secret-key-change-in-prod")
CAMPUS_LAT = float(os.getenv("CAMPUS_LAT", "12.9710"))
CAMPUS_LON = float(os.getenv("CAMPUS_LON", "79.1591"))
GEOFENCE_RADIUS = float(os.getenv("GEOFENCE_RADIUS_METERS", "500.0"))
GEOFENCE_ENABLED = os.getenv("GEOFENCE_ENABLED", "true").lower() in ("1", "true", "yes")
LATE_CUTOFF_TIME = os.getenv("LATE_CUTOFF_TIME", "09:15")

rekognition = boto3.client("rekognition", region_name=AWS_REGION)
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
s3 = boto3.client("s3", region_name=AWS_REGION)
sns = boto3.client("sns", region_name=AWS_REGION)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    return R * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def json_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(body),
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    headers = event.get("headers", {}) or {}
    api_key = headers.get("x-api-key") or headers.get("X-Api-Key")
    if API_SECRET_KEY and api_key != API_SECRET_KEY:
        return json_response(401, {"error": "Unauthorized", "message": "Invalid API key"})

    try:
        body = json.loads(event.get("body", "{}"))
    except Exception:
        return json_response(400, {"error": "Bad Request", "message": "Invalid JSON body"})

    image_b64 = body.get("image_base64")
    if not image_b64:
        return json_response(400, {"error": "Bad Request", "message": "Missing image_base64"})

    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception:
        return json_response(400, {"error": "Bad Request", "message": "Invalid base64 encoding"})

    device_id = body.get("device_id", "unknown-kiosk")
    client_ts_str = body.get("captured_at") or body.get("timestamp")

    # Determine IST timestamp (Asia/Kolkata UTC+05:30)
    if client_ts_str:
        try:
            parsed_dt = datetime.fromisoformat(str(client_ts_str).replace("Z", "+00:00"))
            if parsed_dt.tzinfo is None:
                ts_dt = parsed_dt.replace(tzinfo=IST)
            else:
                ts_dt = parsed_dt.astimezone(IST)
        except Exception:
            ts_dt = datetime.now(IST)
    else:
        ts_dt = datetime.now(IST)

    ist_date = ts_dt.strftime("%Y-%m-%d")
    ist_time_str = ts_dt.strftime("%H:%M")
    ist_time_formatted = ts_dt.strftime("%I:%M %p")
    session_key = f"CLASS#{ist_date}"

    # 1. Geo-fencing Validation
    user_lat = body.get("latitude")
    user_lon = body.get("longitude")
    if GEOFENCE_ENABLED and user_lat is not None and user_lon is not None:
        dist = haversine_distance(float(user_lat), float(user_lon), CAMPUS_LAT, CAMPUS_LON)
        if dist > GEOFENCE_RADIUS:
            if SNS_TOPIC_ARN:
                try:
                    sns.publish(
                        TopicArn=SNS_TOPIC_ARN,
                        Subject="Security Alert: Attendance Outside Campus Boundary",
                        Message=f"Device {device_id} attempted check-in at ({user_lat}, {user_lon}), {int(dist)}m away from authorized perimeter.",
                    )
                except Exception:
                    pass
            return json_response(
                403,
                {
                    "status": "GEO_VIOLATION",
                    "message": "Check-in blocked: Location is outside authorized campus perimeter",
                    "distance_meters": round(dist, 1),
                },
            )

    # 2. Rekognition User Vector Search (SearchUsersByImage)
    match_threshold = float(os.getenv("REKOGNITION_MATCH_THRESHOLD", "90.0"))
    try:
        search_res = rekognition.search_users_by_image(
            CollectionId=COLLECTION_ID,
            Image={"Bytes": image_bytes},
            UserMatchThreshold=match_threshold,
            MaxUsers=1,
        )
    except ClientError as e:
        return json_response(500, {"error": "RekognitionError", "message": str(e)})

    user_matches = search_res.get("UserMatches", [])
    if not user_matches:
        # Unknown Face detected
        if SNS_TOPIC_ARN:
            try:
                sns.publish(
                    TopicArn=SNS_TOPIC_ARN,
                    Subject="Security Alert: Unknown Face Detected",
                    Message=f"An unregistered individual attempted check-in at {device_id} on {ts_dt.isoformat()}.",
                )
            except Exception:
                pass
        return json_response(
            404,
            {
                "status": "UNKNOWN_FACE",
                "message": "Face not recognized in authorized database.",
            },
        )

    matched_user = user_matches[0]["User"]
    user_id = matched_user["UserId"]
    confidence = float(user_matches[0]["Similarity"])

    # 3. Retrieve User Profile from UsersTable
    users_tbl = dynamodb.Table(USERS_TABLE)
    user_item = users_tbl.get_item(Key={"user_id": user_id}).get("Item", {})
    full_name = user_item.get("full_name", user_id)
    roll_number = user_item.get("roll_number", "")
    department = user_item.get("department", "General")

    # 4. Status determination (PRESENT vs LATE)
    status = "LATE" if ist_time_str > LATE_CUTOFF_TIME else "PRESENT"

    # 5. Store audit snapshot in S3
    snapshot_key = f"audit/{ist_date}/{user_id}_{int(ts_dt.timestamp())}.jpg"
    if SNAPSHOT_BUCKET:
        try:
            s3.put_object(
                Bucket=SNAPSHOT_BUCKET,
                Key=snapshot_key,
                Body=image_bytes,
                ContentType="image/jpeg",
            )
        except Exception:
            pass

    # 6. DynamoDB Duplicate Prevention Lock (ConditionExpression)
    attendance_tbl = dynamodb.Table(ATTENDANCE_TABLE)
    try:
        attendance_tbl.put_item(
            Item={
                "session_key": session_key,
                "user_id": user_id,
                "full_name": full_name,
                "roll_number": roll_number,
                "department": department,
                "check_in_time": ts_dt.isoformat(),
                "check_in_date": ist_date,
                "check_in_time_ist": ist_time_formatted,
                "status": status,
                "confidence_score": round(confidence, 2),
                "device_id": device_id,
                "snapshot_s3_key": snapshot_key,
            },
            ConditionExpression="attribute_not_exists(user_id)",
        )
        return json_response(
            200,
            {
                "status": status,
                "user_id": user_id,
                "name": full_name,
                "roll_number": roll_number,
                "department": department,
                "confidence": round(confidence, 2),
                "session": session_key,
                "timestamp": ts_dt.isoformat(),
                "check_in_time": ist_time_formatted,
                "check_in_date": ist_date,
                "message": f"Attendance recorded as {status}",
            },
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return json_response(
                200,
                {
                    "status": "ALREADY_MARKED",
                    "user_id": user_id,
                    "name": full_name,
                    "roll_number": roll_number,
                    "department": department,
                    "timestamp": ts_dt.isoformat(),
                    "check_in_time": ist_time_formatted,
                    "message": "Already marked present today",
                },
            )
        return json_response(500, {"error": "DynamoDBError", "message": str(e)})
