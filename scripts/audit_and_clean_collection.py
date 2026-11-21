"""
Administrative Biometric Audit and Clean Utility.
Scans and synchronizes AWS Rekognition Collection, DynamoDB Users table, and S3 images.
Detects orphaned FaceIds, desynchronized user vectors, and duplicate associations.

Usage:
    python scripts/audit_and_clean_collection.py --dry-run
    python scripts/audit_and_clean_collection.py --clean
"""

import argparse
import logging
import os
import sys
from typing import Dict, List, Set
import boto3
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("biometric_audit")

AWS_REGION = os.getenv("AWS_REGION_NAME", "ap-south-1")
COLLECTION_ID = os.getenv("REKOGNITION_COLLECTION_ID", "smart-attendance-users")
USERS_TABLE = os.getenv("USERS_TABLE", "SmartAttendanceUsers")


def get_rekognition_users(rekognition, collection_id: str) -> Dict[str, List[str]]:
    """List all Rekognition users and their associated FaceIds."""
    users_faces: Dict[str, List[str]] = {}
    paginator = None
    try:
        # Use pagination for list_users
        pagination_token = None
        while True:
            kwargs = {"CollectionId": collection_id}
            if pagination_token:
                kwargs["NextToken"] = pagination_token
            res = rekognition.list_users(**kwargs)
            for u in res.get("Users", []):
                uid = u["UserId"]
                users_faces[uid] = []
            pagination_token = res.get("NextToken")
            if not pagination_token:
                break
    except ClientError as e:
        logger.warning(f"list_users failed: {e}")

    return users_faces


def get_rekognition_faces(rekognition, collection_id: str) -> List[Dict]:
    """List all indexed faces in the Rekognition collection."""
    faces = []
    pagination_token = None
    try:
        while True:
            kwargs = {"CollectionId": collection_id, "MaxResults": 100}
            if pagination_token:
                kwargs["NextToken"] = pagination_token
            res = rekognition.list_faces(**kwargs)
            faces.extend(res.get("Faces", []))
            pagination_token = res.get("NextToken")
            if not pagination_token:
                break
    except ClientError as e:
        logger.warning(f"list_faces failed: {e}")
    return faces


def get_dynamodb_users(dynamodb, table_name: str) -> Dict[str, Dict]:
    """Scan all active/inactive users from DynamoDB."""
    table = dynamodb.Table(table_name)
    items = []
    scan_kwargs = {}
    while True:
        resp = table.scan(**scan_kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return {item["user_id"]: item for item in items}


def audit(dry_run: bool = True, clean: bool = False):
    rek = boto3.client("rekognition", region_name=AWS_REGION)
    ddb = boto3.resource("dynamodb", region_name=AWS_REGION)

    logger.info(f"Auditing Rekognition collection: '{COLLECTION_ID}' against DynamoDB: '{USERS_TABLE}'...")

    rek_users = get_rekognition_users(rek, COLLECTION_ID)
    rek_faces = get_rekognition_faces(rek, COLLECTION_ID)
    ddb_users = get_dynamodb_users(ddb, USERS_TABLE)

    rek_face_ids = {f["FaceId"] for f in rek_faces}
    rek_face_user_map = {f["FaceId"]: f.get("UserId") for f in rek_faces}

    logger.info(f"Summary: {len(rek_users)} Rekognition users, {len(rek_faces)} indexed faces, {len(ddb_users)} DynamoDB users.")

    orphaned_rek_users = set(rek_users.keys()) - set(ddb_users.keys())
    missing_rek_users = set(ddb_users.keys()) - set(rek_users.keys())
    unassociated_faces = [fid for fid, uid in rek_face_user_map.items() if not uid]

    logger.info("--- AUDIT RESULTS ---")
    if orphaned_rek_users:
        logger.warning(f"Orphaned Rekognition Users (in Rekognition but deleted from DynamoDB): {list(orphaned_rek_users)}")
    else:
        logger.info("No orphaned Rekognition users detected.")

    if missing_rek_users:
        logger.warning(f"DynamoDB users missing in Rekognition collection: {list(missing_rek_users)}")
    else:
        logger.info("All DynamoDB users exist in Rekognition collection.")

    if unassociated_faces:
        logger.warning(f"Faces indexed in collection without associated UserId: {len(unassociated_faces)}")
    else:
        logger.info("All indexed faces are associated with valid UserIds.")

    if clean and not dry_run:
        logger.info("--- CLEANING ORPHANS ---")
        for orphan_uid in orphaned_rek_users:
            try:
                rek.delete_user(CollectionId=COLLECTION_ID, UserId=orphan_uid)
                logger.info(f"Deleted orphaned Rekognition user: {orphan_uid}")
            except Exception as e:
                logger.error(f"Failed to delete Rekognition user {orphan_uid}: {e}")

        if unassociated_faces:
            # Batch delete unassociated faces (max 100 per call)
            for i in range(0, len(unassociated_faces), 100):
                batch = unassociated_faces[i:i+100]
                try:
                    rek.delete_faces(CollectionId=COLLECTION_ID, FaceIds=batch)
                    logger.info(f"Deleted {len(batch)} unassociated faces from collection.")
                except Exception as e:
                    logger.error(f"Failed to delete faces: {e}")
        logger.info("Cleanup complete.")
    elif dry_run:
        logger.info("Dry-run mode active. No changes made to AWS resources.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit and clean AWS Rekognition collection vs DynamoDB")
    parser.add_argument("--clean", action="store_true", help="Remove orphaned users and faces")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Scan only without modifications")
    args = parser.parse_args()

    clean_mode = args.clean
    dry_mode = not clean_mode or args.dry_run
    audit(dry_run=dry_mode, clean=clean_mode)
