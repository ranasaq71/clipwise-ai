"""Stripe subscriptions, one-off event credits, webhooks, and the customer portal."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import settings
from ..db import get_db
from ..models import CheckoutRequest, PortalRequest
from ..security import current_user

log = logging.getLogger("clipwise.billing")
router = APIRouter(prefix="/billing", tags=["billing"])

PLANS = {
    "starter": {"label": "Starter", "amount": 7900, "events": 5, "people": 10, "mode": "subscription"},
    "pro": {"label": "Pro", "amount": 19900, "events": 20, "people": 50, "mode": "subscription"},
    "agency": {"label": "Agency", "amount": 49900, "events": None, "people": None, "mode": "subscription"},
    "pay_per_job": {"label": "Single event", "amount": 4900, "events": 1, "people": 10, "mode": "payment"},
}

PRICE_ENV = {
    "starter": "stripe_price_starter",
    "pro": "stripe_price_pro",
    "agency": "stripe_price_agency",
    "pay_per_job": "stripe_price_per_event",
}


def _stripe():
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=503,
            detail="Stripe is not configured on the server. Set STRIPE_SECRET_KEY to enable billing.",
        )
    import stripe

    stripe.api_key = settings.stripe_secret_key
    return stripe


def _now():
    return datetime.now(timezone.utc)


async def _customer_id(stripe, user) -> str:
    if user.get("stripe_customer_id"):
        return user["stripe_customer_id"]
    customer = stripe.Customer.create(email=user["email"], name=user.get("name"),
                                      metadata={"user_id": user["_id"]})
    await get_db().users.update_one({"_id": user["_id"]}, {"$set": {"stripe_customer_id": customer.id}})
    return customer.id


def _line_item(stripe, plan_id: str):
    """Use a configured Price when present, otherwise create the line inline."""
    price_id = getattr(settings, PRICE_ENV[plan_id], None)
    if price_id:
        return {"price": price_id, "quantity": 1}
    plan = PLANS[plan_id]
    recurring = {"recurring": {"interval": "month"}} if plan["mode"] == "subscription" else {}
    return {
        "quantity": 1,
        "price_data": {
            "currency": "usd",
            "unit_amount": plan["amount"],
            "product_data": {"name": f"ClipWise {plan['label']}"},
            **recurring,
        },
    }


@router.post("/checkout")
async def checkout(payload: CheckoutRequest, user=Depends(current_user)):
    if payload.plan_id not in PLANS:
        raise HTTPException(status_code=400, detail=f"Unknown plan '{payload.plan_id}'.")
    stripe = _stripe()
    plan = PLANS[payload.plan_id]
    origin = payload.origin_url.rstrip("/")
    customer_id = await _customer_id(stripe, user)

    try:
        session = stripe.checkout.Session.create(
            mode=plan["mode"],
            customer=customer_id,
            line_items=[_line_item(stripe, payload.plan_id)],
            success_url=f"{origin}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/app/billing",
            metadata={"user_id": user["_id"], "plan_id": payload.plan_id},
            allow_promotion_codes=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Stripe rejected the checkout request: {exc}")

    await get_db().payments.insert_one({
        "_id": str(uuid.uuid4()),
        "session_id": session.id,
        "user_id": user["_id"],
        "plan_id": payload.plan_id,
        "amount": plan["amount"],
        "status": "open",
        "created_at": _now(),
    })
    return {"url": session.url, "session_id": session.id}


@router.get("/status/{session_id}")
async def checkout_status(session_id: str, user=Depends(current_user)):
    stripe = _stripe()
    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Could not read that checkout session: {exc}")

    record = await get_db().payments.find_one({"session_id": session_id})
    plan_id = (record or {}).get("plan_id") or (session.metadata or {}).get("plan_id")
    if session.payment_status == "paid":
        await _apply_plan(user["_id"], plan_id, session)
    return {
        "status": session.status,
        "payment_status": session.payment_status,
        "plan_id": plan_id,
        "amount_total": session.amount_total,
    }


@router.post("/portal")
async def customer_portal(payload: PortalRequest, user=Depends(current_user)):
    stripe = _stripe()
    if not user.get("stripe_customer_id"):
        raise HTTPException(status_code=400, detail="No Stripe customer yet — subscribe to a plan first.")
    try:
        session = stripe.billing_portal.Session.create(
            customer=user["stripe_customer_id"],
            return_url=f"{payload.origin_url.rstrip('/')}/app/billing",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Stripe could not open the customer portal: {exc}")
    return {"url": session.url}


@router.get("/usage")
async def usage(user=Depends(current_user)):
    db = get_db()
    plan_id = user.get("plan", "starter")
    plan = PLANS.get(plan_id, PLANS["starter"])
    start = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    used = await db.events.count_documents({"owner_id": user["_id"], "created_at": {"$gte": start}})
    return {
        "plan": plan_id,
        "events_this_month": used,
        "event_limit": plan["events"],
        "people_limit": plan["people"],
        "event_credits": user.get("event_credits", 0),
        "current_period_end": user.get("current_period_end"),
    }


@router.post("/webhook")
async def webhook(request: Request):
    stripe = _stripe()
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET is not configured.")
    try:
        event = stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Stripe signature: {exc}")

    kind = event["type"]
    obj = event["data"]["object"]
    db = get_db()

    if kind == "checkout.session.completed":
        user_id = (obj.get("metadata") or {}).get("user_id")
        plan_id = (obj.get("metadata") or {}).get("plan_id")
        if user_id and plan_id:
            await _apply_plan(user_id, plan_id, obj)
        await db.payments.update_one({"session_id": obj.get("id")}, {"$set": {"status": "paid", "updated_at": _now()}})

    elif kind in ("customer.subscription.updated", "customer.subscription.created"):
        customer = obj.get("customer")
        period_end = obj.get("current_period_end")
        await db.users.update_one(
            {"stripe_customer_id": customer},
            {"$set": {
                "subscription_status": obj.get("status"),
                "current_period_end": datetime.fromtimestamp(period_end, tz=timezone.utc).isoformat()
                if period_end else None,
            }},
        )

    elif kind == "customer.subscription.deleted":
        await db.users.update_one(
            {"stripe_customer_id": obj.get("customer")},
            {"$set": {"plan": "starter", "subscription_status": "canceled"}},
        )

    return {"received": True}


async def _apply_plan(user_id: str, plan_id: str | None, session) -> None:
    if not plan_id:
        return
    db = get_db()
    if plan_id == "pay_per_job":
        await db.users.update_one({"_id": user_id}, {"$inc": {"event_credits": 1}})
        return
    await db.users.update_one(
        {"_id": user_id},
        {"$set": {"plan": plan_id, "subscription_status": "active", "updated_at": _now()}},
    )
