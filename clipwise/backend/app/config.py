"""Environment-driven configuration.

Every third-party credential is read from the environment. Nothing is hard-coded
and nothing silently falls back to fake data: if a key is missing, the feature
that needs it raises a clear error the UI can show.
"""
from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Core ---
    app_name: str = "ClipWise API"
    environment: str = "development"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 24 * 7
    public_base_url: str = "http://localhost:8000"
    frontend_base_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"

    # --- Database ---
    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "clipwise"

    # --- Background jobs ---
    redis_url: str = "redis://localhost:6379/0"
    run_jobs_inline: bool = False  # dev convenience: run jobs in a thread instead of Celery

    # --- Storage: "s3" | "cloudinary" | "local" ---
    storage_backend: str = "local"
    local_storage_dir: str = "./data/storage"

    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_region: str = "us-east-1"
    s3_bucket: Optional[str] = None
    s3_endpoint_url: Optional[str] = None
    s3_presign_expiry: int = 3600

    cloudinary_cloud_name: Optional[str] = None
    cloudinary_api_key: Optional[str] = None
    cloudinary_api_secret: Optional[str] = None

    # --- TwelveLabs ---
    twelvelabs_api_key: Optional[str] = None
    twelvelabs_index_name: str = "clipwise"
    twelvelabs_marengo_model: str = "marengo2.7"
    twelvelabs_pegasus_model: str = "pegasus1.5"
    twelvelabs_timeout: float = 900.0

    # --- Stripe ---
    stripe_secret_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None
    stripe_price_starter: Optional[str] = None
    stripe_price_pro: Optional[str] = None
    stripe_price_agency: Optional[str] = None
    stripe_price_per_event: Optional[str] = None

    # --- Email: "resend" | "sendgrid" | "none" ---
    email_provider: str = "none"
    resend_api_key: Optional[str] = None
    sendgrid_api_key: Optional[str] = None
    email_from: str = "ClipWise <no-reply@clipwise.ai>"

    # --- Media ---
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"
    max_upload_bytes: int = 500 * 1024 * 1024
    work_dir: str = "./data/work"

    # --- Demo seed ---
    seed_demo: bool = True
    demo_email: str = "demo@clipwise.ai"
    demo_password: str = "ClipWise2026!"

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
