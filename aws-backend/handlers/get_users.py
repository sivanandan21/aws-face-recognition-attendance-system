"""
AWS Lambda Handler: GET /users
Returns list of registered users for the Admin Dashboard.
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
            "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
        "body": json.dumps(body),
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    table = dynamodb.Table(USERS_TABLE)

    try:
        # Scan all user fields (including images and biometric metadata)
        # with pagination loop over LastEvaluatedKey to ensure 100% of enrolled students are returned
        items = []
        scan_kwargs = {}
        while True:
            response = table.scan(**scan_kwargs)
            items.extend(response.get("Items", []))
            if "LastEvaluatedKey" not in response:
                break
            scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

        return json_response(200, items)
    except Exception as e:
        return json_response(500, {"error": "ScanFailed", "message": str(e)})
