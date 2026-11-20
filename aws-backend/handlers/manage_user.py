"""
AWS Lambda Handlers: User Management CRUD
  GET    /users/{user_id}              — get_user_handler
  PUT    /users/{user_id}              — update_user_handler
  DELETE /users/{user_id}              — delete_user_handler (soft-delete: active=false)
  POST   /users/{user_id}/faces        — add_faces_handler
  DELETE /users/{user_id}/faces/{face_id} — remove_face_handler
"""

import json
import os
from typing import Any, Dict

import boto3

AWS_REGION = os.getenv("AWS_REGION_NAME", "ap-south-1")
USERS_TABLE = os.getenv("USERS_TABLE", "SmartAttendanceUsers")

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)


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
    allowed = {"full_name", "department", "email"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        return json_response(400, {"error": "No valid fields to update"})

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
            UpdateExpression="SET active = :f",
            ExpressionAttributeValues={":f": False},
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

    table = dynamodb.Table(USERS_TABLE)
    try:
        resp = table.update_item(
            Key={"user_id": user_id},
            UpdateExpression="SET images = list_append(if_not_exists(images, :empty), :imgs)",
            ExpressionAttributeValues={":imgs": new_images, ":empty": []},
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
        # face_id is treated as a zero-based index into the images list
        idx = int(face_id)
        resp = table.update_item(
            Key={"user_id": user_id},
            UpdateExpression=f"REMOVE images[{idx}]",
            ReturnValues="ALL_NEW",
        )
        updated = resp["Attributes"]
        return json_response(200, {
            "message": f"Removed face at index {idx}",
            "total_faces": len(updated.get("images", [])),
        })
    except (ValueError, TypeError):
        return json_response(400, {"error": "face_id must be a numeric index"})
    except Exception as e:
        return json_response(500, {"error": str(e)})
