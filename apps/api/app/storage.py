import os
import posixpath
import re
from datetime import timedelta
from uuid import uuid4

from minio import Minio

MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET", "bi-agent")
MINIO_SECURE = os.environ.get("MINIO_SECURE", "false").lower() == "true"

_client: Minio | None = None


def get_minio_client() -> Minio:
    global _client

    if _client is None:
        _client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )

    return _client


def ensure_upload_bucket() -> None:
    client = get_minio_client()
    exists = client.bucket_exists(MINIO_BUCKET)

    if not exists:
        client.make_bucket(MINIO_BUCKET)


def normalize_filename(filename: str) -> str:
    name = posixpath.basename(filename).strip()
    name = re.sub(r"\s+", "-", name)
    name = re.sub(r"[^A-Za-z0-9._-]", "", name)
    return name or "upload"


def build_upload_object_key(filename: str) -> str:
    safe_name = normalize_filename(filename)
    return f"uploads/{uuid4().hex}/{safe_name}"


def presigned_upload_url(
    object_key: str,
    expires_minutes: int = 15,
) -> str:
    client = get_minio_client()

    return client.presigned_put_object(
        MINIO_BUCKET,
        object_key,
        expires=timedelta(minutes=expires_minutes),
    )


def presigned_download_url(object_key: str, expires_minutes: int = 15) -> str:
    client = get_minio_client()

    return client.presigned_get_object(
        MINIO_BUCKET,
        object_key,
        expires=timedelta(minutes=expires_minutes),
    )
