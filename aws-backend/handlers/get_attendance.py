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
            "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
        "body": json.dumps(body),
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    params = event.get("queryStringParameters", {}) or {}
    date_str = params.get("date") or datetime.now(IST).strftime("%Y-%m-%d")
    department = params.get("department")

    session_key = f"CLASS#{date_str}"
    att_table = dynamodb.Table(ATTENDANCE_TABLE)
    users_table = dynamodb.Table(USERS_TABLE)

    try:
        # 1. Query attendance records for the date
        if department:
            att_response = att_table.query(
                KeyConditionExpression=Key("session_key").eq(session_key),
                FilterExpression=Attr("department").eq(department),
            )
        else:
            att_response = att_table.query(
                KeyConditionExpression=Key("session_key").eq(session_key)
            )

        records = att_response.get("Items", [])
        present_user_ids = {r["user_id"] for r in records}

        # 2. Scan all active users
        scan_kwargs = {
            "FilterExpression": Attr("active").eq(True),
        }
        if department:
            scan_kwargs["FilterExpression"] = (
                Attr("active").eq(True) & Attr("department").eq(department)
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
                    "full_name": user.get("full_name", ""),
                    "roll_number": user.get("roll_number", ""),
                    "department": user.get("department", ""),
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
