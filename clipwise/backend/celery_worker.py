"""Celery entrypoint:  celery -A celery_worker.celery_app worker --loglevel=info"""
from app.jobs import celery_app
import app.tasks  # noqa: F401  — registers the task bodies

__all__ = ["celery_app"]
