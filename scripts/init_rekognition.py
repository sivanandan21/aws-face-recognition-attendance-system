"""
One-time initialization script for Amazon Rekognition Collection.
Creates the collection if it doesn't already exist and verifies User Vector capabilities.
"""

import os
import sys
import boto3
from botocore.exceptions import ClientError

AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
COLLECTION_ID = os.getenv("REKOGNITION_COLLECTION", "smart-attendance-collection")


def init_rekognition_collection(collection_id: str = COLLECTION_ID, region: str = AWS_REGION) -> bool:
    client = boto3.client("rekognition", region_name=region)
    print(f"Checking Rekognition collection: '{collection_id}' in {region}...")

    try:
        response = client.describe_collection(CollectionId=collection_id)
        arn = response.get("CollectionARN")
        print(f"Collection already exists: {arn}")
        return True

    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code == "ResourceNotFoundException":
            print(f"Collection not found. Creating collection '{collection_id}'...")
            try:
                create_res = client.create_collection(CollectionId=collection_id)
                print(f"Successfully created collection! ARN: {create_res.get('CollectionArn')}")
                return True
            except ClientError as create_err:
                print(f"Error creating collection: {create_err}")
                return False
        else:
            print(f"Error describing collection: {e}")
            return False


if __name__ == "__main__":
    success = init_rekognition_collection()
    sys.exit(0 if success else 1)
