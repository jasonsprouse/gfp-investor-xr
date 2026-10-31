"""
Good Faith Paradigm - Multi-Tier HTTP 402 Subscription Service
Tiers:
- free ("Pilgrim"): Baseline access
- freemium ("VIP Trial"): 24-hour limited-time trial with enforced timestamp expiration
- paid ("Pneumatic Investor"): Permanent full access unlocked via HTTP 402 settlement
"""

import threading
import time
from typing import Any, Dict, Optional

from . import api_handler, http402

_lock = threading.RLock()

VALID_TIERS = {
    "free": {
        "tier": "free",
        "name": "Pilgrim (Free Tier)",
        "price_usd": 0.0,
        "price_sats": 0,
        "features": ["skyport_walkthrough", "public_booths"],
    },
    "freemium": {
        "tier": "freemium",
        "name": "VIP Trial (24-Hour Limited Freemium)",
        "price_usd": 0.0,
        "price_sats": 0,
        "duration_sec": 86400,
        "features": [
            "skyport_walkthrough",
            "public_booths",
            "executive_pitch_dossier",
            "adventure_corridor_deep_dive",
        ],
    },
    "paid": {
        "tier": "paid",
        "name": "Pneumatic Investor (Paid Patron Tier)",
        "price_usd": 19.99,
        "price_sats": 20000,
        "features": [
            "skyport_walkthrough",
            "public_booths",
            "executive_pitch_dossier",
            "adventure_corridor_deep_dive",
            "wishing_well_yield_boost",
            "vip_museum_tour_pass",
        ],
    },
}

_subscriptions: Dict[str, Dict[str, Any]] = {}


def _get_client_id(handler: Any, body: Optional[Dict[str, Any]] = None) -> str:
    cid = handler.headers.get("X-Client-ID", "").strip()
    if not cid and body and isinstance(body, dict):
        cid = str(body.get("client_id", "")).strip()
    return cid or "anonymous"


def _get_sub(client_id: str) -> Dict[str, Any]:
    with _lock:
        now = time.time()
        if client_id not in _subscriptions:
            _subscriptions[client_id] = {
                "client_id": client_id,
                "tier": "free",
                "is_active": True,
                "expires_at": None,
                "activated_at": int(now),
            }
        sub = _subscriptions[client_id]

        # Enforce strict timestamp expiration on freemium trial
        if sub["tier"] == "freemium" and sub["expires_at"] is not None:
            if now >= float(sub["expires_at"]):
                sub["tier"] = "free"
                sub["is_active"] = False
                sub["expired"] = True

        tier_meta = VALID_TIERS.get(sub["tier"], VALID_TIERS["free"])
        return {
            "status": 200,
            "client_id": client_id,
            "tier": sub["tier"],
            "name": tier_meta["name"],
            "is_active": sub["tier"] in ("free", "freemium", "paid") and not sub.get("expired", False),
            "active": True,
            "expires_at": sub["expires_at"],
            "features": tier_meta["features"],
        }


def _on_402_settled(challenge: Dict[str, Any]) -> None:
    meta = challenge.get("metadata") or {}
    if meta.get("module") != "subscriptions":
        return
    if meta.get("allocated"):
        return
    meta["allocated"] = True
    client_id = meta.get("client_id", "anonymous")
    target_tier = meta.get("target_tier", "paid")
    with _lock:
        _subscriptions[client_id] = {
            "client_id": client_id,
            "tier": target_tier,
            "is_active": True,
            "expired": False,
            "expires_at": None,
            "activated_at": int(time.time()),
            "payment_id": challenge.get("payment_id"),
        }


http402.register_settlement_callback(_on_402_settled)


def handle_request(handler: Any, path: str, method: str) -> None:
    body = api_handler.read_json_body(handler) if method in ("POST", "PUT") else {}
    client_id = _get_client_id(handler, body)

    # 1. GET Subscription Status (/api/subscriptions/status, /api/subscription/status)
    if path in ("/api/subscriptions/status", "/api/subscription/status") and method == "GET":
        # Check if valid paid Bearer token is provided
        is_authed, auth_data = http402.verify_request_auth(handler.headers)
        if is_authed:
            with _lock:
                _subscriptions[client_id] = {
                    "client_id": client_id,
                    "tier": "paid",
                    "is_active": True,
                    "expired": False,
                    "expires_at": None,
                    "activated_at": int(time.time()),
                }
        api_handler.send_json(handler, 200, _get_sub(client_id))
        return

    # 2. POST Upgrade / Activate Freemium (/api/subscriptions/upgrade, /api/subscription/upgrade, /api/subscription/activate-freemium)
    if path in ("/api/subscriptions/upgrade", "/api/subscription/upgrade", "/api/subscription/activate-freemium") and method == "POST":
        target_tier = str(body.get("target_tier") or ("freemium" if "freemium" in path else "paid")).strip().lower()
        if target_tier not in VALID_TIERS:
            api_handler.send_json(
                handler,
                400,
                {
                    "status": 400,
                    "error": "invalid_tier",
                    "message": f"Invalid subscription tier '{target_tier}'. Valid tiers: free, freemium, paid.",
                },
            )
            return

        if target_tier == "free":
            with _lock:
                _subscriptions[client_id] = {
                    "client_id": client_id,
                    "tier": "free",
                    "is_active": True,
                    "expired": False,
                    "expires_at": None,
                    "activated_at": int(time.time()),
                }
            api_handler.send_json(handler, 200, _get_sub(client_id))
            return

        if target_tier == "freemium":
            now = time.time()
            expires_at = int(now + VALID_TIERS["freemium"]["duration_sec"])
            with _lock:
                _subscriptions[client_id] = {
                    "client_id": client_id,
                    "tier": "freemium",
                    "is_active": True,
                    "expired": False,
                    "expires_at": expires_at,
                    "activated_at": int(now),
                }
            api_handler.send_json(handler, 200, _get_sub(client_id))
            return

        # Paid Tier Upgrade -> Check auth or return HTTP 402 Challenge
        is_authed, _ = http402.verify_request_auth(handler.headers, resource=path)
        if is_authed:
            with _lock:
                _subscriptions[client_id] = {
                    "client_id": client_id,
                    "tier": "paid",
                    "is_active": True,
                    "expired": False,
                    "expires_at": None,
                    "activated_at": int(time.time()),
                }
            api_handler.send_json(handler, 200, _get_sub(client_id))
            return

        challenge = http402.create_challenge(
            resource=path,
            amount=VALID_TIERS["paid"]["price_sats"],
            currency="SATS",
            amount_usd=VALID_TIERS["paid"]["price_usd"],
            description="Good Faith Paradigm Pneumatic Investor (Paid Tier) Subscription Upgrade",
            metadata={
                "module": "subscriptions",
                "client_id": client_id,
                "target_tier": "paid",
                "allocated": False,
            },
        )
        http402.send_402_response(handler, challenge)
        return

    # 3. POST Simulate Expiration (/api/subscription/simulate-expiration, /api/subscriptions/simulate-expiration)
    if path in ("/api/subscription/simulate-expiration", "/api/subscriptions/simulate-expiration") and method == "POST":
        with _lock:
            _subscriptions[client_id] = {
                "client_id": client_id,
                "tier": "freemium",
                "is_active": False,
                "expired": True,
                "expires_at": int(time.time() - 10),
                "activated_at": int(time.time() - 86410),
            }
        api_handler.send_json(handler, 200, _get_sub(client_id))
        return

    # 4. GET Gated Content (/api/subscription/gated-content/*, /api/subscriptions/gated-content/*)
    if "/gated-content" in path and method == "GET":
        sub = _get_sub(client_id)
        is_authed, _ = http402.verify_request_auth(handler.headers)
        if sub["tier"] in ("freemium", "paid") or is_authed:
            api_handler.send_json(
                handler,
                200,
                {
                    "status": 200,
                    "unlocked": True,
                    "tier": sub["tier"] if not is_authed else "paid",
                    "resource": path,
                    "content": {
                        "title": "Good Faith Paradigm Executive Investor Dossier & Adventure Corridor Blueprint",
                        "summary": "Full access to the 2005 Dallas World Aquarium Miracles of the Holy Spirit exegesis, Health Huts, Mobility, Food Security, and HOA 2.0.",
                    },
                },
            )
            return

        challenge = http402.create_challenge(
            resource=path,
            amount=VALID_TIERS["paid"]["price_sats"],
            currency="SATS",
            amount_usd=VALID_TIERS["paid"]["price_usd"],
            description="Subscription Upgrade Required for Executive Investor Gated Content",
            metadata={
                "module": "subscriptions",
                "client_id": client_id,
                "target_tier": "paid",
                "allocated": False,
            },
        )
        http402.send_402_response(handler, challenge)
        return

    api_handler.send_json(
        handler,
        404,
        {
            "status": 404,
            "error": "not_found",
            "message": f"Subscription endpoint '{path}' not found",
        },
    )
