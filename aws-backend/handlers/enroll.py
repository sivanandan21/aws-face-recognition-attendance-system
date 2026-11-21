"""
AWS Lambda Handler: POST /enroll
Registers a new user using Amazon Rekognition User Vectors:
1. Creates user in Rekognition collection (CreateUser)
2. Indexes 3-5 multi-angle faces with QualityFilter="AUTO" (IndexFaces)
3. Associates detected faces to the User (AssociateFaces)
4. Saves user record to DynamoDB Users table
"""

import base64
import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger("enroll")

IST = timezone(timedelta(hours=5, minutes=30))

AWS_REGION = os.getenv("AWS_REGION_NAME", "ap-south-1")
USERS_TABLE = os.getenv("USERS_TABLE", "SmartAttendanceUsers")
SNAPSHOT_BUCKET = os.getenv("SNAPSHOT_BUCKET", "")
COLLECTION_ID = os.getenv("REKOGNITION_COLLECTION", "smart-attendance-collection")
API_SECRET_KEY = os.getenv("API_SECRET_KEY", "dev-kiosk-secret-key-change-in-prod")

rekognition = boto3.client("rekognition", region_name=AWS_REGION)
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
s3 = boto3.client("s3", region_name=AWS_REGION)


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

    user_id = body.get("user_id", "").strip()
    full_name = body.get("full_name", "").strip()
    department = body.get("department", "Engineering").strip()
    roll_number = body.get("roll_number", "").strip()
    class_id = body.get("class_id", "").strip()
    phone = body.get("phone", "").strip()
    email = body.get("email", "").strip()
    images = body.get("images", [])  # List of 3-5 base64 encoded images

    if not user_id or not full_name:
        return json_response(400, {"error": "Bad Request", "message": "user_id and full_name are required"})

    if not images or len(images) < 1:
        return json_response(400, {"error": "Bad Request", "message": "At least 1 image is required (3-5 recommended)"})

    # 1. Create User in Rekognition Collection
    try:
        rekognition.create_user(CollectionId=COLLECTION_ID, UserId=user_id)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code != "ConflictException":  # User already exists is acceptable
            return json_response(500, {"error": "CreateUserFailed", "message": str(e)})

    # 2. Strict Biometric Validation and Indexing for each provided photo
    indexed_face_ids: List[str] = []
    quality_filter = os.getenv("REKOGNITION_QUALITY_FILTER", "HIGH")

    for idx, img_b64 in enumerate(images):
        try:
            img_bytes = base64.b64decode(img_b64)
        except Exception as e:
            logger.warning(f"Failed to decode base64 for photo {idx + 1}: {e}")
            continue

        # Step A: Validate that EXACTLY ONE face is in frame
        try:
            detect_res = rekognition.detect_faces(Image={"Bytes": img_bytes}, Attributes=["DEFAULT"])
            face_details = detect_res.get("FaceDetails", [])
            if len(face_details) == 0:
                logger.warning(f"Enrollment photo {idx + 1} contains 0 faces.")
                return json_response(
                    400,
                    {
                        "error": "NoFaceDetected",
                        "message": f"Photo {idx + 1} does not contain a clear face. Please look directly into the camera.",
                    },
                )
            if len(face_details) > 1:
                logger.warning(f"Enrollment photo {idx + 1} contains {len(face_details)} faces (friend in frame).")
                return json_response(
                    400,
                    {
                        "error": "MultipleFacesDetected",
                        "message": f"Photo {idx + 1} contains {len(face_details)} faces. Please ensure only the student is in the frame to prevent identity contamination.",
                    },
                )
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code not in ("InvalidParameterException", "InvalidImageFormatException"):
                logger.warning(f"detect_faces error on photo {idx + 1}: {e}")

        # Step B: Cross-User Face Collision Check (Prevent registering same face under multiple IDs)
        try:
            collision_res = rekognition.search_users_by_image(
                CollectionId=COLLECTION_ID,
                Image={"Bytes": img_bytes},
                UserMatchThreshold=95.0,
                MaxUsers=1,
            )
            existing_matches = collision_res.get("UserMatches", [])
            if existing_matches:
                existing_user = existing_matches[0].get("User", {})
                existing_uid = existing_user.get("UserId")
                existing_sim = float(existing_matches[0].get("Similarity", 0.0))
                if existing_uid and existing_uid != user_id:
                    logger.warning(
                        f"Cross-user collision: Photo {idx + 1} matches existing user {existing_uid} "
                        f"with {existing_sim:.2f}% similarity."
                    )
                    return json_response(
                        409,
                        {
                            "error": "FaceCollisionDetected",
                            "message": f"This face is already registered under student '{existing_uid}' (similarity: {existing_sim:.1f}%).",
                            "colliding_user_id": existing_uid,
                        },
                    )
        except ClientError:
            pass  # Empty collection or newly created collection without indexed users yet

        # Step C: Index Face with MaxFaces=1 and HIGH quality filter
        try:
            resp = rekognition.index_faces(
                CollectionId=COLLECTION_ID,
                Image={"Bytes": img_bytes},
                ExternalImageId=user_id,
                DetectionAttributes=["DEFAULT"],
                MaxFaces=1,
                QualityFilter=quality_filter,
            )
            for rec in resp.get("FaceRecords", []):
                indexed_face_ids.append(rec["Face"]["FaceId"])

            # Save enrollment image to S3
            if SNAPSHOT_BUCKET:
                s3_key = f"enrolled/{user_id}/angle_{idx + 1}.jpg"
                s3.put_object(
                    Bucket=SNAPSHOT_BUCKET,
                    Key=s3_key,
                    Body=img_bytes,
                    ContentType="image/jpeg",
                )
        except Exception as e:
            logger.warning(f"Failed to index face for photo {idx + 1}: {e}")
            continue

    if not indexed_face_ids:
        return json_response(
            400,
            {
                "error": "NoFacesIndexed",
                "message": "No clear faces could be detected in the provided photos.",
            },
        )

    # 3. Associate indexed faces with the Rekognition User
    try:
        rekognition.associate_faces(
            CollectionId=COLLECTION_ID,
            UserId=user_id,
            FaceIds=indexed_face_ids,
        )
    except ClientError as e:
        return json_response(500, {"error": "AssociateFacesFailed", "message": str(e)})

    # 4. Save User Record in DynamoDB Users table
    table = dynamodb.Table(USERS_TABLE)
    now_ist_str = datetime.now(IST).isoformat()
    table.put_item(
        Item={
            "user_id": user_id,
            "full_name": full_name,
            "roll_number": roll_number,
            "department": department,
            "class_id": class_id,
            "email": email,
            "phone": phone,
            "face_ids": indexed_face_ids,
            "images": images,
            "active": True,
            "enrolled_at": now_ist_str,
            "updated_at": now_ist_str,
        }
    )

    return json_response(
        201,
        {
            "status": "ENROLLED",
            "user_id": user_id,
            "full_name": full_name,
            "roll_number": roll_number,
            "department": department,
            "faces_indexed": len(indexed_face_ids),
            "message": f"Successfully enrolled {full_name} with {len(indexed_face_ids)} face vectors.",
        },
    )
