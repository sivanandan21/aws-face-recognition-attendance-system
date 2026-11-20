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
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

import boto3
from botocore.exceptions import ClientError

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

    # 2. Index Faces from each provided image
    indexed_face_ids: List[str] = []

    for idx, img_b64 in enumerate(images):
        try:
            img_bytes = base64.b64decode(img_b64)
            resp = rekognition.index_faces(
                CollectionId=COLLECTION_ID,
                Image={"Bytes": img_bytes},
                ExternalImageId=user_id,
                DetectionAttributes=["DEFAULT"],
                QualityFilter="AUTO",
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
    table.put_item(
        Item={
            "user_id": user_id,
            "full_name": full_name,
            "department": department,
            "email": email,
            "face_ids": indexed_face_ids,
            "active": True,
            "enrolled_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    return json_response(
        201,
        {
            "status": "ENROLLED",
            "user_id": user_id,
            "full_name": full_name,
            "faces_indexed": len(indexed_face_ids),
            "message": f"Successfully enrolled {full_name} with {len(indexed_face_ids)} face vectors.",
        },
    )
