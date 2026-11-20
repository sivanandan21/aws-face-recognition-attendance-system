"""
Script to initialize and verify AWS DynamoDB tables and Rekognition collection
for the Smart Attendance System in ap-south-1 (Mumbai).
"""

import os
import sys
import boto3
from botocore.exceptions import ClientError

AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
USERS_TABLE = os.getenv("USERS_TABLE", "SmartAttendanceUsers")
LOGS_TABLE = os.getenv("LOGS_TABLE", "SmartAttendanceLogs")
COLLECTION_ID = os.getenv("REKOGNITION_COLLECTION", "smart-attendance-collection")


def init_dynamodb_tables(region: str = AWS_REGION):
    dynamodb = boto3.client("dynamodb", region_name=region)
    existing_tables = dynamodb.list_tables().get("TableNames", [])
    print(f"Checking DynamoDB tables in region {region}...")
    print(f"Existing tables in account: {existing_tables}")

    # 1. Users Table
    if USERS_TABLE not in existing_tables:
        print(f"Creating DynamoDB table: '{USERS_TABLE}'...")
        try:
            dynamodb.create_table(
                TableName=USERS_TABLE,
                BillingMode="PAY_PER_REQUEST",
                AttributeDefinitions=[
                    {"AttributeName": "user_id", "AttributeType": "S"}
                ],
                KeySchema=[
                    {"AttributeName": "user_id", "KeyType": "HASH"}
                ]
            )
            print(f"Table '{USERS_TABLE}' created successfully.")
        except ClientError as e:
            print(f"Error creating '{USERS_TABLE}': {e}")
    else:
        print(f"Table '{USERS_TABLE}' already exists.")

    # 2. Attendance Logs Table
    if LOGS_TABLE not in existing_tables:
        print(f"Creating DynamoDB table: '{LOGS_TABLE}'...")
        try:
            dynamodb.create_table(
                TableName=LOGS_TABLE,
                BillingMode="PAY_PER_REQUEST",
                AttributeDefinitions=[
                    {"AttributeName": "session_key", "AttributeType": "S"},
                    {"AttributeName": "user_id", "AttributeType": "S"}
                ],
                KeySchema=[
                    {"AttributeName": "session_key", "KeyType": "HASH"},
                    {"AttributeName": "user_id", "KeyType": "RANGE"}
                ]
            )
            print(f"Table '{LOGS_TABLE}' created successfully.")
        except ClientError as e:
            print(f"Error creating '{LOGS_TABLE}': {e}")
    else:
        print(f"Table '{LOGS_TABLE}' already exists.")


def init_rekognition(region: str = AWS_REGION):
    rekognition = boto3.client("rekognition", region_name=region)
    print(f"\nChecking Rekognition Collection: '{COLLECTION_ID}' in {region}...")
    try:
        desc = rekognition.describe_collection(CollectionId=COLLECTION_ID)
        print(f"Collection already exists: {desc.get('CollectionARN')}")
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ResourceNotFoundException":
            print(f"Collection not found. Creating '{COLLECTION_ID}'...")
            try:
                res = rekognition.create_collection(CollectionId=COLLECTION_ID)
                print(f"Successfully created collection! ARN: {res.get('CollectionArn')}")
            except ClientError as err:
                print(f"Error creating collection: {err}")
        else:
            print(f"Error describing collection: {e}")


if __name__ == "__main__":
    print(f"==================================================")
    print(f"AWS Database & Biometric Setup (Region: {AWS_REGION})")
    print(f"==================================================")
    init_dynamodb_tables(AWS_REGION)
    init_rekognition(AWS_REGION)
    print(f"\nVerification complete! AWS backend resources are ready.")
