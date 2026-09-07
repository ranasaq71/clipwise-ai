"""Object storage for raw uploads, transcoded masters, reels, and clips.

Three backends:
  s3          — production default; range requests are served by S3 via a
                presigned URL redirect, so the API never proxies video bytes.
  cloudinary  — same idea, using Cloudinary's delivery URL.
  local       — development only. Loudly warns at startup because container
                disks are ephemeral.

Everything is addressed by an opaque `key` (e.g. "events/<id>/master.mp4").
"""
from __future__ import annotations

import logging
import os
import shutil
from dataclasses import dataclass
from typing import Optional

from .config import settings

log = logging.getLogger("clipwise.storage")


class StorageError(RuntimeError):
    pass


@dataclass
class StoredObject:
    key: str
    size: int
    content_type: str


class BaseStorage:
    backend = "base"

    def put(self, key: str, local_path: str, content_type: str = "application/octet-stream") -> StoredObject:
        raise NotImplementedError

    def download(self, key: str, dest_path: str) -> str:
        raise NotImplementedError

    def url(self, key: str, download_name: Optional[str] = None) -> Optional[str]:
        """Return a URL the browser can range-request, or None if not supported."""
        return None

    def local_path(self, key: str) -> Optional[str]:
        return None

    def delete(self, key: str) -> None:
        raise NotImplementedError

    def exists(self, key: str) -> bool:
        raise NotImplementedError

    def size(self, key: str) -> int:
        raise NotImplementedError


class LocalStorage(BaseStorage):
    backend = "local"

    def __init__(self, root: str):
        self.root = os.path.abspath(root)
        os.makedirs(self.root, exist_ok=True)

    def _p(self, key: str) -> str:
        path = os.path.abspath(os.path.join(self.root, key))
        if not path.startswith(self.root):
            raise StorageError("Invalid storage key")
        return path

    def put(self, key, local_path, content_type="application/octet-stream"):
        dest = self._p(key)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if os.path.abspath(local_path) != dest:
            shutil.copyfile(local_path, dest)
        return StoredObject(key=key, size=os.path.getsize(dest), content_type=content_type)

    def download(self, key, dest_path):
        src = self._p(key)
        if not os.path.exists(src):
            raise StorageError(f"Object not found: {key}")
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        shutil.copyfile(src, dest_path)
        return dest_path

    def local_path(self, key):
        p = self._p(key)
        return p if os.path.exists(p) else None

    def delete(self, key):
        p = self._p(key)
        if os.path.exists(p):
            os.remove(p)

    def exists(self, key):
        return os.path.exists(self._p(key))

    def size(self, key):
        return os.path.getsize(self._p(key)) if self.exists(key) else 0


class S3Storage(BaseStorage):
    backend = "s3"

    def __init__(self):
        import boto3

        if not settings.s3_bucket:
            raise StorageError("STORAGE_BACKEND=s3 but S3_BUCKET is not set")
        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            endpoint_url=settings.s3_endpoint_url,
        )

    def put(self, key, local_path, content_type="application/octet-stream"):
        self.client.upload_file(
            local_path,
            self.bucket,
            key,
            ExtraArgs={"ContentType": content_type},
        )
        return StoredObject(key=key, size=os.path.getsize(local_path), content_type=content_type)

    def download(self, key, dest_path):
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        self.client.download_file(self.bucket, key, dest_path)
        return dest_path

    def url(self, key, download_name=None):
        params = {"Bucket": self.bucket, "Key": key}
        if download_name:
            params["ResponseContentDisposition"] = f'attachment; filename="{download_name}"'
        return self.client.generate_presigned_url(
            "get_object", Params=params, ExpiresIn=settings.s3_presign_expiry
        )

    def delete(self, key):
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key):
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def size(self, key):
        try:
            return int(self.client.head_object(Bucket=self.bucket, Key=key)["ContentLength"])
        except Exception:
            return 0


class CloudinaryStorage(BaseStorage):
    backend = "cloudinary"

    def __init__(self):
        import cloudinary
        import cloudinary.api  # noqa: F401
        import cloudinary.uploader  # noqa: F401

        if not (settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret):
            raise StorageError("STORAGE_BACKEND=cloudinary but CLOUDINARY_* keys are not set")
        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,
        )
        self.cloudinary = cloudinary

    @staticmethod
    def _public_id(key: str) -> str:
        return os.path.splitext(key)[0]

    def put(self, key, local_path, content_type="application/octet-stream"):
        res = self.cloudinary.uploader.upload_large(
            local_path,
            resource_type="video" if content_type.startswith("video") else "raw",
            public_id=self._public_id(key),
            overwrite=True,
            chunk_size=20_000_000,
        )
        return StoredObject(key=key, size=int(res.get("bytes") or os.path.getsize(local_path)), content_type=content_type)

    def download(self, key, dest_path):
        import httpx

        url = self.url(key)
        if not url:
            raise StorageError(f"Cannot resolve Cloudinary URL for {key}")
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        with httpx.stream("GET", url, timeout=600.0, follow_redirects=True) as r:
            r.raise_for_status()
            with open(dest_path, "wb") as fh:
                for chunk in r.iter_bytes(1024 * 1024):
                    fh.write(chunk)
        return dest_path

    def url(self, key, download_name=None):
        resource_type = "video" if key.endswith((".mp4", ".mov", ".webm", ".mkv")) else "raw"
        opts = {"resource_type": resource_type, "secure": True}
        if download_name:
            opts["flags"] = f"attachment:{os.path.splitext(download_name)[0]}"
        url, _ = self.cloudinary.utils.cloudinary_url(self._public_id(key) + ".mp4", **opts)
        return url

    def delete(self, key):
        self.cloudinary.uploader.destroy(self._public_id(key), resource_type="video")

    def exists(self, key):
        try:
            self.cloudinary.api.resource(self._public_id(key), resource_type="video")
            return True
        except Exception:
            return False

    def size(self, key):
        try:
            return int(self.cloudinary.api.resource(self._public_id(key), resource_type="video").get("bytes", 0))
        except Exception:
            return 0


_storage: Optional[BaseStorage] = None


def get_storage() -> BaseStorage:
    global _storage
    if _storage is not None:
        return _storage
    backend = (settings.storage_backend or "local").lower()
    if backend == "s3":
        _storage = S3Storage()
    elif backend == "cloudinary":
        _storage = CloudinaryStorage()
    else:
        log.warning(
            "STORAGE_BACKEND=local — files live on the container disk and will be lost on redeploy. "
            "Set STORAGE_BACKEND=s3 or cloudinary for production."
        )
        _storage = LocalStorage(settings.local_storage_dir)
    return _storage
