"""
Good Faith Paradigm - Rarible NFT Shopping Basket & HTTP 402 Checkout Engine
Supports:
- GET /api/nfts, GET /api/nft/rarible-prices
- GET /api/cart, GET /api/cart/items
- POST /api/cart/items, POST /api/cart/add
- DELETE /api/cart/items/<token_id>, DELETE /api/cart, POST /api/cart/clear
- POST /api/cart/checkout (HTTP 402 challenge -> settlement -> 200 OK order confirmation)
"""

import secrets
import threading
import time
from typing import Any, Dict, Optional

from . import api_handler, http402

_lock = threading.RLock()

CONTRACT_ADDRESS = "0xd07dc4262bcdbf85190c01c996b4c06a461d2430"

NFT_CATALOG: Dict[str, Dict[str, Any]] = {
    "492856": {
        "token_id": "492856",
        "item_id": "492856",
        "name": "Y Harps of God (Yellow NFT #492856)",
        "description": "Yellow Good Faith Dove & 7 World Religions Digital Twin NFT",
        "contract": CONTRACT_ADDRESS,
        "price_eth": 0.008,
        "price_usd": 20.00,
        "price_sats": 20000,
        "rarible_url": f"https://rarible.com/token/{CONTRACT_ADDRESS}:492856",
        "image": "/media/booths/relics/card_yellow_front.jpg",
        "raffle_entries": 1,
        "wishing_well_bonus_wishes": 4,
    },
    "490643": {
        "token_id": "490643",
        "item_id": "490643",
        "name": "G Harps-of-God (Green NFT #490643)",
        "description": "Green y8 Cosmic Harp, 2000->2001 Plate III Key & Sphinx Digital Twin NFT",
        "contract": CONTRACT_ADDRESS,
        "price_eth": 0.008,
        "price_usd": 20.00,
        "price_sats": 20000,
        "rarible_url": f"https://rarible.com/token/{CONTRACT_ADDRESS}:490643",
        "image": "/media/booths/relics/card_green_front.jpg",
        "raffle_entries": 1,
        "wishing_well_bonus_wishes": 4,
    },
}

_carts: Dict[str, Dict[str, int]] = {}
_orders: Dict[str, list] = {}


def _get_client_id(handler: Any, body: Optional[Dict[str, Any]] = None) -> str:
    cid = handler.headers.get("X-Client-ID", "").strip()
    if not cid and body and isinstance(body, dict):
        cid = str(body.get("client_id", "")).strip()
    return cid or "anonymous"


def _compute_cart(client_id: str) -> Dict[str, Any]:
    with _lock:
        cart_map = _carts.setdefault(client_id, {})
        items_list = []
        total_items = 0
        subtotal_usd = 0.0
        subtotal_eth = 0.0
        subtotal_sats = 0
        raffle_entries = 0

        for tid, qty in list(cart_map.items()):
            if qty <= 0 or tid not in NFT_CATALOG:
                continue
            meta = NFT_CATALOG[tid]
            line_usd = round(meta["price_usd"] * qty, 2)
            line_eth = round(meta["price_eth"] * qty, 6)
            line_sats = int(meta["price_sats"] * qty)
            items_list.append({
                **meta,
                "quantity": qty,
                "line_total_usd": line_usd,
                "line_total_eth": line_eth,
                "line_total_sats": line_sats,
            })
            total_items += qty
            subtotal_usd += line_usd
            subtotal_eth += line_eth
            subtotal_sats += line_sats
            raffle_entries += meta["raffle_entries"] * qty

        # Synergy bonus if both Yellow and Green are in cart
        has_both = "492856" in cart_map and "490643" in cart_map and cart_map["492856"] > 0 and cart_map["490643"] > 0
        if has_both:
            raffle_entries += 1

        return {
            "status": 200,
            "client_id": client_id,
            "items": items_list,
            "total_items": total_items,
            "subtotal_usd": round(subtotal_usd, 2),
            "subtotal_eth": round(subtotal_eth, 6),
            "subtotal_sats": subtotal_sats,
            "raffle_entries": raffle_entries,
            "dual_harp_synergy": has_both,
        }


def handle_request(handler: Any, path: str, method: str) -> None:
    body = api_handler.read_json_body(handler) if method in ("POST", "PUT") else {}
    client_id = _get_client_id(handler, body)

    # 1. Catalog / Rarible prices (/api/nfts, /api/nft/rarible-prices, /api/nfts/catalog)
    if path in ("/api/nfts", "/api/nfts/catalog", "/api/nft/rarible-prices") and method == "GET":
        api_handler.send_json(
            handler,
            200,
            {
                "status": 200,
                "contract": CONTRACT_ADDRESS,
                "items": list(NFT_CATALOG.values()),
            },
        )
        return

    # 2. Get Cart (/api/cart, /api/cart/items)
    if path in ("/api/cart", "/api/cart/items") and method == "GET":
        api_handler.send_json(handler, 200, _compute_cart(client_id))
        return

    # 3. Add to Cart (/api/cart/items, /api/cart/add)
    if path in ("/api/cart/items", "/api/cart/add") and method == "POST":
        item_id = str(body.get("item_id") or body.get("token_id") or "").strip()
        if item_id not in NFT_CATALOG:
            api_handler.send_json(
                handler,
                400,
                {
                    "status": 400,
                    "error": "invalid_token_id",
                    "message": f"Invalid Rarible NFT token_id '{item_id}'. Valid tokens: 492856, 490643.",
                },
            )
            return

        raw_qty = body.get("quantity", 1)
        try:
            qty = int(raw_qty)
        except (ValueError, TypeError):
            raise ValueError("Invalid quantity")

        if qty <= 0 or (isinstance(raw_qty, float) and not raw_qty.is_integer()):
            api_handler.send_json(
                handler,
                400,
                {
                    "status": 400,
                    "error": "invalid_quantity",
                    "message": "Quantity must be a positive integer >= 1",
                },
            )
            return

        with _lock:
            cart_map = _carts.setdefault(client_id, {})
            cart_map[item_id] = cart_map.get(item_id, 0) + qty

        api_handler.send_json(handler, 200, _compute_cart(client_id))
        return

    # 4. Remove Item or Clear Cart
    if path == "/api/cart/remove" and method == "POST":
        token_id = str(body.get("item_id") or body.get("token_id") or "").strip()
        qty = body.get("quantity")
        with _lock:
            cart_map = _carts.setdefault(client_id, {})
            if token_id in cart_map:
                if qty is not None:
                    try:
                        q = int(qty)
                        cart_map[token_id] -= q
                        if cart_map[token_id] <= 0:
                            cart_map.pop(token_id, None)
                    except (ValueError, TypeError):
                        cart_map.pop(token_id, None)
                else:
                    cart_map.pop(token_id, None)
        api_handler.send_json(handler, 200, _compute_cart(client_id))
        return

    if path.startswith("/api/cart/items/") and method == "DELETE":
        token_id = path.split("/api/cart/items/", 1)[1].strip("/")
        with _lock:
            cart_map = _carts.setdefault(client_id, {})
            cart_map.pop(token_id, None)
        api_handler.send_json(handler, 200, _compute_cart(client_id))
        return

    if (path == "/api/cart/clear" and method in ("POST", "DELETE")) or (path in ("/api/cart", "/api/cart/items") and method == "DELETE"):
        with _lock:
            _carts[client_id] = {}
        api_handler.send_json(handler, 200, _compute_cart(client_id))
        return

    # 5. Cart Checkout (/api/cart/checkout)
    if path == "/api/cart/checkout" and method == "POST":
        cart_summary = _compute_cart(client_id)
        if cart_summary["total_items"] <= 0:
            api_handler.send_json(
                handler,
                400,
                {
                    "status": 400,
                    "error": "empty_cart",
                    "message": "Cannot checkout an empty NFT shopping basket.",
                },
            )
            return

        is_authed, auth_info = http402.verify_request_auth(handler.headers, resource=path)
        if not is_authed:
            challenge = http402.create_challenge(
                resource=path,
                amount=cart_summary["subtotal_sats"],
                currency="SATS",
                amount_usd=cart_summary["subtotal_usd"],
                description=(
                    f"Good Faith Paradigm Rarible NFT Basket Checkout "
                    f"({cart_summary['total_items']} NFTs = ${cart_summary['subtotal_usd']:.2f} USD)"
                ),
                metadata={
                    "module": "cart",
                    "client_id": client_id,
                    "subtotal_usd": cart_summary["subtotal_usd"],
                },
            )
            http402.send_402_response(handler, challenge)
            return

        # Authenticated / Settled Checkout -> Record order & clear cart
        order_id = f"ORD-{secrets.token_hex(4).upper()}"
        order_record = {
            "status": 200,
            "success": True,
            "order_id": order_id,
            "client_id": client_id,
            "items": cart_summary["items"],
            "total_items": cart_summary["total_items"],
            "total_paid_usd": cart_summary["subtotal_usd"],
            "total_paid_eth": cart_summary["subtotal_eth"],
            "raffle_entries_awarded": cart_summary["raffle_entries"],
            "raffle_tickets_issued": cart_summary["raffle_entries"],
            "museum_tour_pass": True,
            "museum_tour_passes_awarded": 1,
            "payment_auth": auth_info,
            "created_at": int(time.time()),
        }
        with _lock:
            _orders.setdefault(client_id, []).append(order_record)
            _carts[client_id] = {}

        api_handler.send_json(handler, 200, order_record)
        return

    api_handler.send_json(
        handler,
        404,
        {
            "status": 404,
            "error": "not_found",
            "message": f"Cart endpoint '{path}' not found",
        },
    )
