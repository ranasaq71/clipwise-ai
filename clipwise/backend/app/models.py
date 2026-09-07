"""Request/response schemas."""
from datetime import date
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------
class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str = "admin"
    plan: str = "starter"
    event_credits: int = 0
    created_at: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Events ----------
class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    event_type: str = "wedding"
    event_date: Optional[date] = None


class EventUpdate(BaseModel):
    title: Optional[str] = None
    event_type: Optional[str] = None
    event_date: Optional[date] = None
    step: Optional[int] = None
    highlight_preferences: Optional[List[str]] = None
    studio_name: Optional[str] = None
    brand_color: Optional[str] = None


class UploadInit(BaseModel):
    filename: str
    size: int
    content_type: str = "video/mp4"


# ---------- People / faces ----------
class PersonCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: Optional[str] = None
    photos: List[str] = []
    descriptors: List[List[float]] = []


class DescriptorAdd(BaseModel):
    descriptor: List[float]
    photo: Optional[str] = None


class AppearanceItem(BaseModel):
    person_id: Optional[str] = None
    name: Optional[str] = None
    timestamp: float
    confidence: int = 90


class AppearanceBatch(BaseModel):
    items: List[AppearanceItem]


# ---------- Reel / clips ----------
class ReelRequest(BaseModel):
    vertical: bool = False
    max_clips: int = Field(default=8, ge=1, le=30)


class ClipRequest(BaseModel):
    highlight_id: str
    format: str = "reels"  # reels | tiktok | shorts | wide


# ---------- Billing ----------
class CheckoutRequest(BaseModel):
    plan_id: str
    origin_url: str


class PortalRequest(BaseModel):
    origin_url: str


class ApproveRequest(BaseModel):
    approved: bool = True


class InviteRequest(BaseModel):
    email: EmailStr


class Integration(BaseModel):
    key: str
    name: str
    detail: str
    configured: bool


class ErrorDetail(BaseModel):
    detail: str
    context: Optional[Dict[str, Any]] = None
