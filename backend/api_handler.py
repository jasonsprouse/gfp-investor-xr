"""
Good Faith Paradigm - Web3 REST API Dispatcher & Routing Engine
Handles all /api/* requests with HTTP 402 challenge/response lifecycle,
health probes, and dynamic integration for Milestone 2 modules.
"""

import json
import logging
import os
import sys
import time
import urllib.parse
from typing import Any, Callable, Dict, Optional

from . import http402

logger = logging.getLogger("gfp.api")
SERVER_START_TIME = time.time()

# Registry for dynamic route extensions (used by M2 modules: cart, credits, subscriptions)
_route_handlers: Dict[str, Callable] = {}


def register_route(path_prefix: str, handler_fn: Callable) -> None:
    """
    Registers a custom route handler for path prefix.
    """
    _route_handlers[path_prefix] = handler_fn


def read_json_body(handler: Any) -> Dict[str, Any]:
    """
    Safely reads and decodes JSON request payload.
    """
    try:
        content_length = int(handler.headers.get("Content-Length", 0))
    except (ValueError, TypeError):
        content_length = 0

    if content_length <= 0:
        return {}

    try:
        raw_body = handler.rfile.read(content_length).decode("utf-8")
        if not raw_body.strip():
            return {}
        return json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON payload: {exc}")


def send_json(
    handler: Any,
    status_code: int,
    data: Dict[str, Any],
    extra_headers: Optional[Dict[str, str]] = None,
) -> None:
    """
    Sends a formatted JSON response with CORS and length headers.
    """
    response_bytes = json.dumps(data, indent=2).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(response_bytes)))
    if extra_headers:
        for k, v in extra_headers.items():
            handler.send_header(k, v)
    handler.end_headers()
    handler.wfile.write(response_bytes)


def handle_request(handler: Any) -> None:
    """
    Main entry point for dispatching all /api/* requests from serve.py.
    """
    try:
        parsed_url = urllib.parse.urlsplit(handler.path)
        path = parsed_url.path.rstrip("/")
        if not path:
            path = "/"
        method = handler.command.upper()

        # Handle CORS Preflight
        if method == "OPTIONS":
            handler.send_response(204)
            handler.send_header("Access-Control-Max-Age", "86400")
            handler.end_headers()
            return

        # 1. Health Probe (/api/health)
        if path == "/api/health":
            uptime = int(time.time() - SERVER_START_TIME)
            send_json(
                handler,
                200,
                {
                    "status": "healthy",
                    "version": "1.0.0",
                    "timestamp": int(time.time()),
                    "uptime_seconds": uptime,
                    "features": [
                        "http_402",
                        "l402_macaroon",
                        "rarible_cart",
                        "wishing_well",
                        "subscriptions",
                        "fly_io",
                    ],
                    "environment": "production" if os.environ.get("FLY_APP_NAME") else "development",
                },
            )
            return

        # 2. Explicit HTTP 402 Challenge Generation (/api/402/challenge)
        if path == "/api/402/challenge" and method == "POST":
            body = read_json_body(handler)
            resource = body.get("resource", "/api/protected/resource")
            amount = int(body.get("amount", 1000))
            currency = body.get("currency", "SATS")
            amount_usd = body.get("amount_usd")
            description = body.get(
                "description",
                f"HTTP 402 Payment Required for {resource}",
            )
            challenge = http402.create_challenge(
                resource=resource,
                amount=amount,
                currency=currency,
                description=description,
                amount_usd=amount_usd,
            )
            http402.send_402_response(handler, challenge)
            return

        # 3. HTTP 402 Settlement Endpoint (/api/402/settle)
        if path == "/api/402/settle" and method == "POST":
            body = read_json_body(handler)
            payment_id = body.get("payment_id") or body.get("challenge_id")
            preimage = body.get("preimage")
            method_type = body.get("method", "demo")

            status_code, response_data = http402.settle_challenge(
                payment_id=payment_id,
                preimage=preimage,
                method=method_type,
            )
            send_json(handler, status_code, response_data)
            return

        # 4. Protected Resource Gating (/api/protected/*)
        if path.startswith("/api/protected"):
            is_authed, auth_data = http402.verify_request_auth(
                handler.headers,
                resource=path,
            )
            if not is_authed:
                # Unpaid or invalid auth: return 402 challenge
                challenge = http402.create_challenge(
                    resource=path,
                    amount=1000,
                    currency="SATS",
                    description=f"Payment required to unlock protected resource: {path}",
                )
                http402.send_402_response(handler, challenge)
                return

            # Valid authentication: return unlocked 200 OK
            send_json(
                handler,
                200,
                {
                    "status": 200,
                    "message": "Resource unlocked successfully",
                    "resource": path,
                    "auth": auth_data,
                    "entitlement": {
                        "tier": "paid",
                        "features": [
                            "adventure_corridor_deep_dive",
                            "evtol_autonomous_flight",
                            "theophany_bonus_credits",
                        ],
                    },
                    "content": {
                        "title": "Good Faith Paradigm Protected Asset",
                        "description": (
                            "Exclusive access granted to gated Good Faith Paradigm "
                            "investor intelligence and Adventure Corridor models."
                        ),
                        "unlocked_at": int(time.time()),
                    },
                },
            )
            return

        # 5. Check dynamically registered route handlers (e.g. from M2 modules)
        for prefix, handler_fn in _route_handlers.items():
            if path.startswith(prefix):
                handler_fn(handler, path, method)
                return

        # 6. Try importing M2 submodules dynamically if present
        if _try_dispatch_submodules(handler, path, method):
            return

        # 7. Unmatched API route -> 404
        send_json(
            handler,
            404,
            {
                "status": 404,
                "error": "not_found",
                "message": f"Endpoint '{path}' not found on API server",
            },
        )

    except ValueError as val_err:
        send_json(
            handler,
            400,
            {
                "status": 400,
                "error": "bad_request",
                "message": str(val_err),
            },
        )
    except Exception as exc:
        send_json(
            handler,
            500,
            {
                "status": 500,
                "error": "internal_server_error",
                "message": f"Internal server error: {exc}",
            },
        )


def _try_dispatch_submodules(handler: Any, path: str, method: str) -> bool:
    """
    Dynamically checks for M2 modules (cart, credits, subscriptions) if they exist.
    """
    # Check cart / nft endpoints
    if path.startswith("/api/cart") or path.startswith("/api/nfts"):
        try:
            from . import cart
            if hasattr(cart, "handle_request"):
                cart.handle_request(handler, path, method)
                return True
        except ImportError:
            pass

    # Check credits / wishing well / kyc endpoints
    if path.startswith("/api/credits") or path.startswith("/api/wishing-well") or path.startswith("/api/kyc"):
        try:
            from . import credits
            if hasattr(credits, "handle_request"):
                credits.handle_request(handler, path, method)
                return True
        except ImportError:
            pass

    # Check subscription endpoints
    if path.startswith("/api/subscription"):
        try:
            from . import subscriptions
            if hasattr(subscriptions, "handle_request"):
                subscriptions.handle_request(handler, path, method)
                return True
        except ImportError:
            pass

    return False
