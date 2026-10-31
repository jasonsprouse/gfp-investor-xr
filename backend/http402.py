"""
HTTP 402 Payment Required Protocol Engine
Standards alignment:
- RFC 9110 §15.5.3 (402 Payment Required)
- L402 / LSAT Protocol (Macaroon capability tokens + Lightning invoice proofs)
- Zero external dependencies (pure Python standard library)
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from typing import Any, Dict, Optional, Tuple

# Secret root key for signing macaroons and capability tokens
_DEFAULT_SECRET = b"gfp-investor-xr-l402-server-secret-2026-key"
SERVER_SECRET = os.environ.get("GFP_SERVER_SECRET", "").encode("utf-8") or _DEFAULT_SECRET

# Thread-safe in-memory state stores
_challenges_lock = threading.RLock()
_challenges: Dict[str, Dict[str, Any]] = {}
_tokens: Dict[str, Dict[str, Any]] = {}
_settlement_callbacks = []


def register_settlement_callback(callback_fn) -> None:
    """Registers a callback function invoked as callback_fn(challenge) whenever a 402 challenge is settled."""
    if callback_fn not in _settlement_callbacks:
        _settlement_callbacks.append(callback_fn)


def _b64_url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64_url_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding < 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data.encode("utf-8"))


def generate_macaroon(
    payment_id: str,
    payment_hash: str,
    resource: str,
    expires_at: float,
) -> str:
    """
    Constructs an L402 HMAC-SHA256 macaroon committing to the payment hash and caveats.
    """
    caveats = [
        f"resource={resource}",
        f"expires={int(expires_at)}",
        f"target=gfp-investor-xr",
    ]

    # Compute HMAC chain over identifier, payment_hash, and caveats
    root_msg = f"{payment_id}:{payment_hash}".encode("utf-8")
    sig = hmac.new(SERVER_SECRET, root_msg, hashlib.sha256).digest()
    for caveat in caveats:
        sig = hmac.new(sig, caveat.encode("utf-8"), hashlib.sha256).digest()

    macaroon_data = {
        "location": "gfp-investor-xr",
        "identifier": payment_id,
        "payment_hash": payment_hash,
        "caveats": caveats,
        "signature": sig.hex(),
    }
    json_bytes = json.dumps(macaroon_data, separators=(",", ":")).encode("utf-8")
    return _b64_url_encode(json_bytes)


def verify_macaroon(
    macaroon_b64: str,
    resource: Optional[str] = None,
) -> Tuple[bool, Optional[Dict[str, Any]], str]:
    """
    Verifies an L402 macaroon cryptographic signature and caveat conditions.
    Returns: (is_valid, macaroon_data, reason)
    """
    try:
        raw_json = _b64_url_decode(macaroon_b64)
        data = json.loads(raw_json.decode("utf-8"))
    except Exception as exc:
        return False, None, f"Malformed macaroon base64/JSON: {exc}"

    payment_id = data.get("identifier")
    payment_hash = data.get("payment_hash")
    caveats = data.get("caveats", [])
    expected_sig = data.get("signature")

    if not payment_id or not expected_sig:
        return False, None, "Missing identifier or signature in macaroon"

    if not payment_hash:
        return False, None, "Missing payment_hash in macaroon"

    # Recompute HMAC chain over identifier, payment_hash, and caveats
    root_msg = f"{payment_id}:{payment_hash}".encode("utf-8")
    sig = hmac.new(SERVER_SECRET, root_msg, hashlib.sha256).digest()
    for caveat in caveats:
        sig = hmac.new(sig, caveat.encode("utf-8"), hashlib.sha256).digest()

    if not hmac.compare_digest(sig.hex(), expected_sig):
        return False, None, "Invalid macaroon signature"

    # Verify caveats
    now = time.time()
    for caveat in caveats:
        if caveat.startswith("expires="):
            try:
                exp = float(caveat.split("=")[1])
                if now > exp:
                    return False, None, f"Macaroon expired at {exp} (now: {now})"
            except ValueError:
                return False, None, "Invalid expires caveat format"
        elif caveat.startswith("resource=") and resource:
            req_resource = caveat.split("=")[1]
            if req_resource != "*" and req_resource != resource:
                # Allow prefix matching for sub-resources
                if not resource.startswith(req_resource.rstrip("/") + "/"):
                    return False, None, f"Macaroon scoped to {req_resource}, not {resource}"

    return True, data, "Valid"


def create_auth_token(
    payment_id: str,
    resource: str,
    expires_at: float,
    tier: str = "paid",
) -> str:
    """
    Generates an HMAC-signed Bearer / capability receipt token.
    Format: gfp_tok.<b64_payload>.<sig_hex>
    """
    payload = {
        "payment_id": payment_id,
        "challenge_id": payment_id,
        "resource": resource,
        "tier": tier,
        "issued_at": int(time.time()),
        "expires_at": int(expires_at),
        "nonce": secrets.token_hex(4),
    }
    payload_b64 = _b64_url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(SERVER_SECRET, payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
    token = f"gfp_tok.{payload_b64}.{sig}"

    with _challenges_lock:
        _tokens[token] = {
            **payload,
            "token": token,
            "created_at": time.time(),
        }

    return token


def verify_auth_token(
    token: str,
    resource: Optional[str] = None,
) -> Tuple[bool, Optional[Dict[str, Any]], str]:
    """
    Verifies a Bearer capability receipt token signature and expiration.
    """
    if not token or not token.startswith("gfp_tok."):
        # Check in-memory store for arbitrary simulation tokens
        with _challenges_lock:
            if token in _tokens:
                info = _tokens[token]
                if time.time() > info.get("expires_at", float("inf")):
                    return False, None, "Token expired"
                return True, info, "Valid"
        return False, None, "Invalid token format"

    parts = token.split(".")
    if len(parts) != 3:
        return False, None, "Malformed token parts"

    _, payload_b64, sig_hex = parts

    # Verify HMAC
    expected_sig = hmac.new(SERVER_SECRET, payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_sig, sig_hex):
        return False, None, "Invalid token signature"

    try:
        payload = json.loads(_b64_url_decode(payload_b64).decode("utf-8"))
    except Exception as exc:
        return False, None, f"Malformed token payload: {exc}"

    if time.time() > payload.get("expires_at", 0):
        return False, None, "Token expired"

    if resource and payload.get("resource") != "*" and payload.get("resource") != resource:
        scoped = payload.get("resource", "")
        if not resource.startswith(scoped.rstrip("/") + "/"):
            return False, None, f"Token scoped to {scoped}, not {resource}"

    return True, payload, "Valid"


def create_challenge(
    resource: str = "/api/protected/resource",
    amount: int = 1000,
    currency: str = "SATS",
    description: str = "Good Faith Paradigm HTTP 402 Payment Required",
    expires_in: int = 3600,
    amount_usd: Optional[float] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Creates and records a fresh L402 challenge.
    """
    now = time.time()
    expires_at = now + expires_in
    payment_id = f"ch_{uuid_safe_hex(12)}"

    # Generate 32-byte preimage and commit SHA256 payment hash
    preimage_bytes = secrets.token_bytes(32)
    preimage_hex = preimage_bytes.hex()
    payment_hash = hashlib.sha256(preimage_bytes).hexdigest()

    # Generate simulated Lightning BOLT11 invoice representation
    invoice = f"lnbc{amount}u1p{payment_hash[:16]}gfp{payment_id}"

    # Build signed macaroon
    macaroon = generate_macaroon(
        payment_id=payment_id,
        payment_hash=payment_hash,
        resource=resource,
        expires_at=expires_at,
    )

    challenge = {
        "payment_id": payment_id,
        "challenge_id": payment_id,
        "resource": resource,
        "amount": amount,
        "amount_usd": amount_usd if amount_usd is not None else round(amount / 50000.0 * 50.0, 2),
        "currency": currency,
        "description": description,
        "invoice": invoice,
        "payment_hash": payment_hash,
        "preimage": preimage_hex,
        "macaroon": macaroon,
        "created_at": now,
        "expires_at": expires_at,
        "settle_url": "/api/402/settle",
        "settled": False,
        "settled_at": None,
        "token": None,
        "metadata": metadata or {},
    }

    with _challenges_lock:
        _challenges[payment_id] = challenge

    return challenge


def uuid_safe_hex(length: int = 12) -> str:
    return secrets.token_hex((length + 1) // 2)[:length]


def settle_challenge(
    payment_id: Optional[str] = None,
    challenge_id: Optional[str] = None,
    preimage: Optional[str] = None,
    method: str = "demo",
) -> Tuple[int, Dict[str, Any]]:
    """
    Settles an existing challenge via preimage verification or demo faucet.
    Returns (http_status, response_dict).
    """
    target_id = payment_id or challenge_id
    if not target_id:
        return 400, {
            "status": 400,
            "success": False,
            "error": "missing_payment_id",
            "message": "Field 'payment_id' or 'challenge_id' is required for settlement",
        }

    with _challenges_lock:
        challenge = _challenges.get(target_id)
        if not challenge:
            return 404, {
                "status": 404,
                "success": False,
                "error": "challenge_not_found",
                "message": f"No active challenge found with ID '{target_id}'",
            }

        now = time.time()
        if now > challenge["expires_at"]:
            return 400, {
                "status": 400,
                "success": False,
                "error": "challenge_expired",
                "message": "Challenge has expired; request a new 402 challenge",
            }

        # Check demo mode vs non-demo cryptographic settlement
        is_demo_mode = method in ("demo", "simulation", "faucet") or preimage == "demo"
        if not is_demo_mode:
            if not preimage:
                return 400, {
                    "status": 400,
                    "success": False,
                    "error": "missing_preimage",
                    "message": "Preimage is required for non-demo settlement",
                }

            # Real / cryptographic preimage verification
            try:
                supplied_preimage_bytes = bytes.fromhex(preimage)
                supplied_hash = hashlib.sha256(supplied_preimage_bytes).hexdigest()
            except ValueError:
                return 400, {
                    "status": 400,
                    "success": False,
                    "error": "invalid_preimage_hex",
                    "message": "Preimage must be valid hexadecimal bytes",
                }

            if not hmac.compare_digest(supplied_hash, challenge["payment_hash"]):
                return 400, {
                    "status": 400,
                    "success": False,
                    "error": "invalid_preimage",
                    "message": "Supplied preimage does not match payment hash",
                }

        already_settled = challenge.get("settled", False)
        if already_settled and challenge.get("token"):
            token = challenge["token"]
        else:
            challenge["settled"] = True
            challenge["settled_at"] = now
            token = create_auth_token(
                payment_id=target_id,
                resource=challenge["resource"],
                expires_at=challenge["expires_at"],
            )
            challenge["token"] = token
            if not already_settled:
                for cb in list(_settlement_callbacks):
                    try:
                        cb(challenge)
                    except Exception:
                        pass

        if is_demo_mode:
            return 200, {
                "status": 200,
                "success": True,
                "payment_id": target_id,
                "challenge_id": target_id,
                "token": token,
                "payment_token": token,
                "preimage": challenge["preimage"],
                "expires_at": challenge["expires_at"],
                "settled_at": challenge["settled_at"],
                "method": "demo_simulation_faucet",
                "message": "Payment settled successfully via demo simulation faucet",
            }
        else:
            return 200, {
                "status": 200,
                "success": True,
                "payment_id": target_id,
                "challenge_id": target_id,
                "token": token,
                "payment_token": token,
                "preimage": preimage,
                "expires_at": challenge["expires_at"],
                "settled_at": challenge["settled_at"],
                "method": method,
                "message": "Payment settled successfully via cryptographic preimage verification",
            }


def verify_request_auth(
    headers: Any,
    resource: Optional[str] = None,
) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Extracts and verifies authorization credentials from request headers.
    Supports:
    1. Authorization: L402 <macaroon>:<preimage>
    2. Authorization: Bearer <token>
    3. X-Payment-Token: <token>
    """
    # 1. Check Authorization header
    auth_header = headers.get("Authorization", "")
    if auth_header:
        # L402 / LSAT check
        if auth_header.startswith("L402 ") or auth_header.startswith("LSAT "):
            token_part = auth_header.split(" ", 1)[1].strip()
            if ":" in token_part:
                macaroon_str, preimage_str = token_part.split(":", 1)
                is_valid_mac, mac_data, reason = verify_macaroon(macaroon_str, resource=resource)
                if is_valid_mac and mac_data:
                    # Verify preimage against macaroon payment hash
                    try:
                        p_hash = hashlib.sha256(bytes.fromhex(preimage_str)).hexdigest()
                        if hmac.compare_digest(p_hash, mac_data.get("payment_hash", "")):
                            return True, {
                                "type": "l402",
                                "payment_id": mac_data.get("identifier"),
                                "resource": resource,
                                "macaroon": mac_data,
                            }
                    except ValueError:
                        pass

        # Bearer token check
        elif auth_header.startswith("Bearer "):
            bearer_token = auth_header.split(" ", 1)[1].strip()
            is_valid_tok, tok_data, _ = verify_auth_token(bearer_token, resource=resource)
            if is_valid_tok:
                return True, {
                    "type": "bearer",
                    "payment_id": tok_data.get("payment_id"),
                    "resource": resource,
                    "payload": tok_data,
                }

    # 2. Check X-Payment-Token header
    x_token = headers.get("X-Payment-Token", "")
    if x_token:
        is_valid_tok, tok_data, _ = verify_auth_token(x_token, resource=resource)
        if is_valid_tok:
            return True, {
                "type": "x-payment-token",
                "payment_id": tok_data.get("payment_id"),
                "resource": resource,
                "payload": tok_data,
            }

    return False, None


def build_402_headers_and_body(challenge: Dict[str, Any]) -> Tuple[Dict[str, str], Dict[str, Any]]:
    """
    Prepares standard RFC 9110 / L402 headers and JSON response body.
    """
    payment_required_header_dict = {
        "payment_id": challenge["payment_id"],
        "challenge_id": challenge["payment_id"],
        "amount": challenge["amount"],
        "currency": challenge["currency"],
        "description": challenge["description"],
        "settle_url": challenge["settle_url"],
    }
    if challenge.get("amount_usd") is not None:
        payment_required_header_dict["amount_usd"] = challenge["amount_usd"]

    headers = {
        "WWW-Authenticate": f'L402 macaroon="{challenge["macaroon"]}", invoice="{challenge["invoice"]}"',
        "Payment-Required": json.dumps(payment_required_header_dict, separators=(",", ":")),
        "Access-Control-Expose-Headers": "WWW-Authenticate, Payment-Required, X-Payment-Token",
        "Content-Type": "application/json; charset=utf-8",
    }

    body = {
        "status": 402,
        "error": "Payment Required",
        "payment_id": challenge["payment_id"],
        "challenge_id": challenge["payment_id"],
        "resource": challenge["resource"],
        "amount": challenge["amount"],
        "currency": challenge["currency"],
        "amount_usd": challenge.get("amount_usd"),
        "pricing": {
            "amount": challenge["amount"],
            "currency": challenge["currency"],
            "amount_usd": challenge.get("amount_usd"),
        },
        "invoice": challenge["invoice"],
        "macaroon": challenge["macaroon"],
        "settle_url": challenge["settle_url"],
        "settlement": {
            "invoice": challenge["invoice"],
            "macaroon": challenge["macaroon"],
            "settle_url": challenge["settle_url"],
            "expires_at": challenge["expires_at"],
        },
        "message": challenge["description"],
        "expires_at": challenge["expires_at"],
        "instructions": (
            "Present valid payment proof via 'Authorization: L402 <macaroon>:<preimage>' "
            "or 'Authorization: Bearer <token>'."
        ),
    }

    return headers, body


def send_402_response(handler: Any, challenge: Dict[str, Any]) -> None:
    """
    Writes a standards-compliant HTTP 402 response to the HTTP handler.
    """
    headers, body = build_402_headers_and_body(challenge)
    payload_bytes = json.dumps(body, indent=2).encode("utf-8")

    handler.send_response(402, "Payment Required")
    for k, v in headers.items():
        handler.send_header(k, v)
    handler.send_header("Content-Length", str(len(payload_bytes)))
    handler.end_headers()
    handler.wfile.write(payload_bytes)
