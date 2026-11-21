"""
AWS Lambda Handler: GET /attendance
Queries attendance logs partitioned by session_key (CLASS#YYYY-MM-DD),
with optional filtering by department or student ID.
Merges with the Users table so that students without an attendance record
appear as ABSENT in the response.
"""

import json
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict

import boto3
from boto3.dynamodb.conditions import Key, Attr

IST = timezone(timedelta(hours=5, minutes=30))
AWS_REGION = os.getenv("AWS_REGION_NAME", "ap-south-1")
ATTENDANCE_TABLE = os.getenv("ATTENDANCE_TABLE", "SmartAttendanceLogs")
USERS_TABLE = os.getenv("USERS_TABLE", "SmartAttendanceUsers")

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)


def json_response(status_code: int, body: Any) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization",
            "Access-Control-Allow-Methods": "GET,DELETE,OPTIONS",
        },
        "body": json.dumps(body),
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method", "GET")
    ).upper()

    params = event.get("queryStringParameters", {}) or {}
    date_str = params.get("date") or datetime.now(IST).strftime("%Y-%m-%d")
    department = params.get("department")

    session_key = f"CLASS#{date_str}"
    att_table = dynamodb.Table(ATTENDANCE_TABLE)
    users_table = dynamodb.Table(USERS_TABLE)

    # Handle DELETE attendance record (e.g., removing a student checked in by mistake)
    if method == "DELETE":
        user_id = params.get("user_id")
        if not user_id:
            try:
                body = json.loads(event.get("body", "{}"))
                user_id = body.get("user_id")
            except Exception:
                pass
        if not user_id:
            return json_response(400, {"error": "Missing user_id parameter"})

        try:
            att_table.delete_item(
                Key={"session_key": session_key, "user_id": user_id}
            )
            return json_response(
                200,
                {
                    "status": "DELETED",
                    "message": f"Attendance record for {user_id} removed from session {session_key}.",
                    "user_id": user_id,
                    "session_key": session_key,
                },
            )
        except Exception as e:
            return json_response(500, {"error": "Failed to remove attendance record", "details": str(e)})

    try:
        # 1. Query attendance records for the date with LastEvaluatedKey pagination
        query_kwargs = {
            "KeyConditionExpression": Key("session_key").eq(session_key)
        }
        if department:
            query_kwargs["FilterExpression"] = Attr("department").eq(department)

        records = []
        while True:
            att_response = att_table.query(**query_kwargs)
            records.extend(att_response.get("Items", []))
            if "LastEvaluatedKey" not in att_response:
                break
            query_kwargs["ExclusiveStartKey"] = att_response["LastEvaluatedKey"]

        present_user_ids = {r["user_id"] for r in records}

        # 2. Scan all enrolled users with pagination loop (include active != False so legacy records appear)
        scan_kwargs = {
            "FilterExpression": Attr("active").ne(False),
        }
        if department:
            scan_kwargs["FilterExpression"] = (
                Attr("active").ne(False) & Attr("department").eq(department)
            )

        all_users = []
        while True:
            user_resp = users_table.scan(**scan_kwargs)
            all_users.extend(user_resp.get("Items", []))
            if "LastEvaluatedKey" not in user_resp:
                break
            scan_kwargs["ExclusiveStartKey"] = user_resp["LastEvaluatedKey"]

        user_map = {u["user_id"]: u for u in all_users}

        # Sync updated user details into attendance records dynamically
        for r in records:
            u_info = user_map.get(r["user_id"])
            if u_info:
                if u_info.get("full_name"):
                    r["full_name"] = u_info["full_name"]
                if u_info.get("department"):
                    r["department"] = u_info["department"]
                r["roll_number"] = u_info.get("roll_number", r.get("roll_number", ""))

        # 3. Add ABSENT entries for users not in attendance records
        for user in all_users:
            if user["user_id"] not in present_user_ids:
                records.append({
                    "user_id": user["user_id"],
                    "full_name": user.get("full_name", user["user_id"]),
                    "roll_number": user.get("roll_number", ""),
                    "department": user.get("department", "General"),
                    "check_in_time": None,
                    "status": "ABSENT",
                    "confidence_score": None,
                    "device_id": None,
                })

        return json_response(
            200,
            {
                "session_key": session_key,
                "date": date_str,
                "count": len(records),
                "records": records,
            },
        )
    except Exception as e:
        return json_response(500, {"error": "QueryFailed", "message": str(e)})
