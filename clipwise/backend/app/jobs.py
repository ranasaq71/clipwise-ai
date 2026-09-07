"""Celery wiring.

All AI and ffmpeg work happens here, never in a request handler. Set
RUN_JOBS_INLINE=true to run the same task bodies in a background thread — handy
for local development without a Redis broker, and used by the test suite.
"""
from __future__ import annotations

import logging
import threading

from celery import Celery

from .config import settings

log = logging.getLogger("clipwise.jobs")

celery_app = Celery(
    "clipwise",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    task_time_limit=60 * 60 * 3,
    task_soft_time_limit=60 * 60 * 2,
)


def submit(task, *args, **kwargs) -> str:
    """Queue a Celery task, or run it in a thread when RUN_JOBS_INLINE is set."""
    if settings.run_jobs_inline:
        def _run():
            try:
                task.run(*args, **kwargs)
            except Exception:
                log.exception("inline job failed: %s", getattr(task, "name", task))
        t = threading.Thread(target=_run, daemon=True)
        t.start()
        return f"inline-{t.ident}"
    try:
        return task.delay(*args, **kwargs).id
    except Exception as exc:
        raise RuntimeError(
            f"Could not queue the background job — is Redis reachable at {settings.redis_url}? ({exc})"
        ) from exc
