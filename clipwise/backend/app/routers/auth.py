import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response

from ..config import settings
from ..db import get_db
from ..mailer import EmailError, send_welcome
from ..models import AuthResponse, LoginRequest, RegisterRequest, UserOut
from ..security import (COOKIE_NAME, create_access_token, current_user, hash_password,
                        public_user, verify_password)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookie(response: Response, token: str):
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",
        path="/",
    )


@router.post("/register", response_model=AuthResponse)
async def register(payload: RegisterRequest, response: Response):
    db = get_db()
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="That email is already registered.")
    user = {
        "_id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": "admin",
        "plan": "starter",
        "event_credits": 0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user)
    token = create_access_token(user["_id"])
    _set_cookie(response, token)
    try:
        send_welcome(email, user["name"])
    except EmailError:
        pass  # never block signup on the mail provider
    return AuthResponse(access_token=token, user=UserOut(**public_user(user)))


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, response: Response):
    db = get_db()
    user = await db.users.find_one({"email": payload.email.lower().strip()})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    token = create_access_token(user["_id"])
    _set_cookie(response, token)
    return AuthResponse(access_token=token, user=UserOut(**public_user(user)))


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user=Depends(current_user)):
    return UserOut(**public_user(user))
