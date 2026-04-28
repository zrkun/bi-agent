from fastapi import APIRouter, HTTPException
from minio.error import S3Error
from pydantic import BaseModel, Field

from app.storage import (
    MINIO_BUCKET,
    build_upload_object_key,
    ensure_upload_bucket,
    presigned_download_url,
    presigned_upload_url,
)

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


class CreateUploadUrlRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(default="application/octet-stream", max_length=120)


class CreateUploadUrlResponse(BaseModel):
    bucket: str
    object_key: str
    upload_url: str
    method: str = "PUT"
    expires_in: int = 900


class CreateDownloadUrlRequest(BaseModel):
    object_key: str = Field(min_length=1, max_length=1024)


class CreateDownloadUrlResponse(BaseModel):
    download_url: str
    expires_in: int = 900


@router.post("/presigned-url", response_model=CreateUploadUrlResponse)
def create_upload_url(payload: CreateUploadUrlRequest) -> CreateUploadUrlResponse:
    try:
        ensure_upload_bucket()
        object_key = build_upload_object_key(payload.filename)
        upload_url = presigned_upload_url(object_key)
    except S3Error as error:
        raise HTTPException(status_code=503, detail="文件存储服务不可用") from error

    return CreateUploadUrlResponse(
        bucket=MINIO_BUCKET,
        object_key=object_key,
        upload_url=upload_url,
    )


@router.post("/download-url", response_model=CreateDownloadUrlResponse)
def create_download_url(
    payload: CreateDownloadUrlRequest,
) -> CreateDownloadUrlResponse:
    try:
        download_url = presigned_download_url(payload.object_key)
    except S3Error as error:
        raise HTTPException(status_code=503, detail="文件存储服务不可用") from error

    return CreateDownloadUrlResponse(download_url=download_url)
