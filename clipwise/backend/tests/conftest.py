import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("LOCAL_STORAGE_DIR", "./.pytest-storage")
os.environ.setdefault("WORK_DIR", "./.pytest-work")
os.environ.setdefault("RUN_JOBS_INLINE", "true")
os.environ.setdefault("SEED_DEMO", "true")
os.environ.setdefault("EMAIL_PROVIDER", "none")

import pytest
from mongomock_motor import AsyncMongoMockClient

import app.db as dbmod


@pytest.fixture(autouse=True)
def mock_mongo(monkeypatch):
    client = AsyncMongoMockClient()
    dbmod._async_client = client
    yield
    dbmod._async_client = None


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c
