"""
AWS Lambda Handlers: User Management CRUD
  GET    /users/{user_id}              — get_user_handler
  PUT    /users/{user_id}              — update_user_handler
  DELETE /users/{user_id}              — delete_user_handler (soft-delete: active=false)
  POST   /users/{user_id}/faces        — add_faces_handler
  DELETE /users/{user_id}/faces/{face_id} — remove_face_handler
"""

import base64
from datetime import datetime, timezone, timedelta
import json
import logging
import os
from typing import Any, Dict, List
import uuid

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger("manage_user")

IST = timezone(timedelta(hours=5, minutes=30))

AWS_REGION = os.getenv("AWS_REGION_NAME", "ap-south-1")
USERS_TABLE = os.getenv("USERS_TABLE", "SmartAttendanceUsers")
COLLECTION_ID = os.getenv("REKOGNITION_COLLECTION", "smart-attendance-collection")
SNAPSHOT_BUCKET = os.getenv("SNAPSHOT_BUCKET", "")

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
rekognition = boto3.client("rekognition", region_name=AWS_REGION)
s3 = boto3.client("s3", region_name=AWS_REGION)


def json_response(status_code: int, body: Any) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization",
            "Access-Control-Allow-Methods": "GET,PUT,DELETE,POST,OPTIONS",
        },
        "body": json.dumps(body),
    }


def _get_user_id(event: Dict) -> str:
    return event.get("pathParameters", {}).get("user_id", "")


# ---------------------------------------------------------------------------
# GET /users/{user_id}
# ---------------------------------------------------------------------------
def get_user_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    user_id = _get_user_id(event)
    if not user_id:
        return json_response(400, {"error": "Missing user_id"})

    table = dynamodb.Table(USERS_TABLE)
    try:
        resp = table.get_item(Key={"user_id": user_id})
        item = resp.get("Item")
        if not item:
            return json_response(404, {"error": "User not found"})
        return json_response(200, item)
    except Exception as e:
        return json_response(500, {"error": str(e)})


# ---------------------------------------------------------------------------
# PUT /users/{user_id}
# ---------------------------------------------------------------------------
def update_user_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    user_id = _get_user_id(event)
    if not user_id:
        return json_response(400, {"error": "Missing user_id"})

    body = json.loads(event.get("body", "{}") or "{}")
    allowed = {"full_name", "department", "email", "roll_number", "class_id", "phone", "active"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        return json_response(400, {"error": "No valid fields to update"})

    updates["updated_at"] = datetime.now(IST).isoformat()

    table = dynamodb.Table(USERS_TABLE)
    expr_parts, expr_values, expr_names = [], {}, {}
    for i, (k, v) in enumerate(updates.items()):
        alias = f"#f{i}"
        placeholder = f":v{i}"
        expr_parts.append(f"{alias} = {placeholder}")
        expr_values[placeholder] = v
        expr_names[alias] = k

    try:
        resp = table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET " + ", ".join(expr_parts),
            ExpressionAttributeValues=expr_values,
            ExpressionAttributeNames=expr_names,
            ReturnValues="ALL_NEW",
        )
        return json_response(200, resp["Attributes"])
    except Exception as e:
        return json_response(500, {"error": str(e)})


# ---------------------------------------------------------------------------
# DELETE /users/{user_id}  — soft-delete (active = false)
# ---------------------------------------------------------------------------
def delete_user_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    user_id = _get_user_id(event)
    if not user_id:
        return json_response(400, {"error": "Missing user_id"})

    table = dynamodb.Table(USERS_TABLE)
    try:
        resp = table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET active = :f, updated_at = :ts",
            ExpressionAttributeValues={":f": False, ":ts": datetime.now(IST).isoformat()},
            ReturnValues="ALL_NEW",
        )
        return json_response(200, {"message": f"User {user_id} deactivated", "user": resp["Attributes"]})
    except Exception as e:
        return json_response(500, {"error": str(e)})


# ---------------------------------------------------------------------------
# POST /users/{user_id}/faces
# ---------------------------------------------------------------------------
def add_faces_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    user_id = _get_user_id(event)
    if not user_id:
        return json_response(400, {"error": "Missing user_id"})

    body = json.loads(event.get("body", "{}") or "{}")
    new_images = body.get("images", [])
    if not new_images:
        return json_response(400, {"error": "No images provided"})

    # Index new faces in Rekognition with single-face validation, collision guard, and HIGH quality filter
    new_face_ids = []
    quality_filter = os.getenv("REKOGNITION_QUALITY_FILTER", "HIGH")

    for idx, img_b64 in enumerate(new_images):
        try:
            img_bytes = base64.b64decode(img_b64)
        except Exception:
            continue

        # Single-face validation
        try:
            det_res = rekognition.detect_faces(Image={"Bytes": img_bytes}, Attributes=["DEFAULT"])
            faces = det_res.get("FaceDetails", [])
            if len(faces) == 0:
                return json_response(400, {"error": "NoFaceDetected", "message": f"Photo {idx + 1} contains no face."})
            if len(faces) > 1:
                return json_response(400, {"error": "MultipleFacesDetected", "message": f"Photo {idx + 1} contains multiple faces."})
        except ClientError:
            pass

        # Collision check
        try:
            col_res = rekognition.search_users_by_image(
                CollectionId=COLLECTION_ID,
                Image={"Bytes": img_bytes},
                UserMatchThreshold=95.0,
                MaxUsers=1,
            )
            matches = col_res.get("UserMatches", [])
            if matches:
                ex_uid = matches[0].get("User", {}).get("UserId")
                if ex_uid and ex_uid != user_id:
                    return json_response(
                        409,
                        {
                            "error": "FaceCollisionDetected",
                            "message": f"Photo matches another registered student '{ex_uid}'.",
                        },
                    )
        except ClientError:
            pass

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
                new_face_ids.append(rec["Face"]["FaceId"])

            if SNAPSHOT_BUCKET:
                s3_key = f"enrolled/{user_id}/add_{uuid.uuid4().hex[:8]}.jpg"
                s3.put_object(
                    Bucket=SNAPSHOT_BUCKET,
                    Key=s3_key,
                    Body=img_bytes,
                    ContentType="image/jpeg",
                )
        except Exception:
            continue

    if new_face_ids:
        try:
            rekognition.associate_faces(
                CollectionId=COLLECTION_ID,
                UserId=user_id,
                FaceIds=new_face_ids,
            )
        except Exception:
            pass

    table = dynamodb.Table(USERS_TABLE)
    now_ist_str = datetime.now(IST).isoformat()
    try:
        update_expr = "SET images = list_append(if_not_exists(images, :empty), :imgs), updated_at = :ts"
        expr_values = {":imgs": new_images, ":empty": [], ":ts": now_ist_str}
        if new_face_ids:
            update_expr += ", face_ids = list_append(if_not_exists(face_ids, :empty_fids), :fids)"
            expr_values[":empty_fids"] = []
            expr_values[":fids"] = new_face_ids

        resp = table.update_item(
            Key={"user_id": user_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values,
            ReturnValues="ALL_NEW",
        )
        updated = resp["Attributes"]
        return json_response(200, {
            "message": f"Added {len(new_images)} face(s)",
            "total_faces": len(updated.get("images", [])),
            "user": updated,
        })
    except Exception as e:
        return json_response(500, {"error": str(e)})


# ---------------------------------------------------------------------------
# DELETE /users/{user_id}/faces/{face_id}
# ---------------------------------------------------------------------------
def remove_face_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    user_id = _get_user_id(event)
    face_id = event.get("pathParameters", {}).get("face_id", "")
    if not user_id or not face_id:
        return json_response(400, {"error": "Missing user_id or face_id"})

    table = dynamodb.Table(USERS_TABLE)
    try:
        # Check current user photo count
        user_resp = table.get_item(Key={"user_id": user_id})
        user_item = user_resp.get("Item")
        if not user_item:
            return json_response(404, {"error": "User not found"})

        current_images = user_item.get("images", [])
        if len(current_images) <= 1:
            return json_response(400, {
                "error": "CannotDeleteLastFace",
                "message": "Cannot delete the student's only remaining face photo. Add a replacement angle first."
            })

        idx = int(face_id)
        if idx < 0 or idx >= len(current_images):
            return json_response(400, {"error": f"Invalid face index: {idx}"})

        # Disassociate from Rekognition if face_id corresponds
        face_ids = user_item.get("face_ids", [])
        if idx < len(face_ids):
            rekog_fid = face_ids[idx]
            try:
                rekognition.disassociate_faces(
                    CollectionId=COLLECTION_ID,
                    UserId=user_id,
                    FaceIds=[rekog_fid],
                )
                rekognition.delete_faces(
                    CollectionId=COLLECTION_ID,
                    FaceIds=[rekog_fid],
                )
            except Exception:
                pass

        # Update DynamoDB: remove images[idx]
        resp = table.update_item(
            Key={"user_id": user_id},
            UpdateExpression=f"REMOVE images[{idx}] SET updated_at = :ts",
            ExpressionAttributeValues={":ts": datetime.now(IST).isoformat()},
            ReturnValues="ALL_NEW",
        )
        updated = resp["Attributes"]
        return json_response(200, {
            "message": f"Removed face at index {idx}",
            "total_faces": len(updated.get("images", [])),
            "user": updated,
        })
    except (ValueError, TypeError):
        return json_response(400, {"error": "face_id must be a numeric index"})
    except Exception as e:
        return json_response(500, {"error": str(e)})
