"""ClipWise API entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import ensure_indexes
from .routers import admin, auth, billing, events, exports, faces, misc, portal, public, reports
from .seed import ensure_demo_video, seed_demo

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("clipwise")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    ensure_demo_video()
    try:
        await seed_demo()
    except Exception:
        log.exception("demo seeding failed (the API still starts)")
    log.info(
        "ClipWise API ready · storage=%s · jobs=%s",
        settings.storage_backend,
        "inline" if settings.run_jobs_inline else "celery",
    )
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length", "Content-Disposition"],
)

api = FastAPI(title="ClipWise API")
for router in (
    auth.router, events.router, faces.router, exports.router, reports.router,
    billing.router, portal.router, public.router, admin.router, misc.router,
):
    api.include_router(router)


@api.get("/health")
async def health():
    return {"status": "ok", "storage": settings.storage_backend}


@api.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


app.mount("/api", api)


@app.get("/")
async def root():
    return {"name": settings.app_name, "docs": "/api/docs", "health": "/api/health"}
