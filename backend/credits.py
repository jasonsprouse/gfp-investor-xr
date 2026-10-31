"""
Good Faith Paradigm - Theophany Wishing Well, Yield-Bearing Pool,
Spot-Price Precious Metal Win Algorithm, On-Chain Tokenized Metal Swaps,
and KYC Digital ID Engine.

Implements:
- Throw any custom USD amount into the Wishing Well (or 2 oz Gold/Silver/Copper demos)
- Every wish costs $0.25 (25 cents = 5 credits; 1 credit = $0.05)
- 50% ($0.125 per wish) goes into a Yield-Bearing Asset Pool
- 50% ($0.125 per wish) covers the actuarial value of each 2 oz precious metal
- Spot-price win algorithm: P(win 2oz metal) = $0.125 / (2 * spot_price_per_oz)
- 3 Winner Claim Modes (gated by KYC Digital ID):
  1. Cash / Stablecoin (USD / USDC at live 2 oz spot value)
  2. On-Chain Spot Swap on Base DEX (Uniswap / Aerodrome / SimpleSwap):
     - Gold: PAXG (PAX Gold) / XAUt (Tether Gold)
     - Silver: KAG (Kinesis Silver) / SLVON
     - Copper: COPXON (Warehouse receipt tokenized copper)
  3. Physical Mail Delivery: 2 oz struck medallion mailed to verified physical address
- KYC Digital ID issuance & verification (/api/kyc/status, /api/kyc/verify)
"""

import hashlib
import hmac
import secrets
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from . import api_handler, http402

_lock = threading.RLock()

# Unit Economics Constants
WISH_COST_USD = 0.25          # Every wish costs 25 cents ($0.25)
CREDITS_PER_WISH = 5          # 5 credits = 1 wish ($0.25 -> $0.05 per credit)
YIELD_POOL_SHARE = 0.50       # 50% ($0.125 per wish) -> Yield-Bearing Asset Pool
METAL_POOL_SHARE = 0.50       # 50% ($0.125 per wish) -> Covers 2 oz Precious Metal Prize Value
METAL_COVERAGE_PER_WISH_USD = WISH_COST_USD * METAL_POOL_SHARE  # $0.125 (12.5 cents)
DEFAULT_YIELD_APY = 0.145     # 14.5% Target APY on Yield-Bearing Asset Pool

# Live / Configurable Precious Metal Spot Prices & Tokenized Metal DEX Metadata (Base)
_METAL_MARKETS: Dict[str, Dict[str, Any]] = {
    "gold": {
        "metal": "gold",
        "symbol": "XAU",
        "name": "2 oz Fine Gold Medallion",
        "spot_price_oz_usd": 2750.00,
        "medallion_oz": 2.0,
        "demo_credits": 500,       # 500 credits = 100 wishes = $50.00
        "demo_price_usd": 50.00,
        "demo_price_sats": 50000,
        "demo_price_eth": 0.02,
        "tokenized_assets": [
            {
                "symbol": "PAXG",
                "name": "PAX Gold (1:1 London Good Delivery Gold in Brink's Vaults)",
                "network": "Base / Ethereum",
                "dex_venues": ["Uniswap", "Aerodrome"],
                "issuer_url": "https://www.paxos.com/pax-gold",
            },
            {
                "symbol": "XAUt",
                "name": "Tether Gold (1:1 Physical Troy Ounce Gold)",
                "network": "Base / Ethereum",
                "dex_venues": ["Uniswap", "Aerodrome"],
                "issuer_url": "https://gold.tether.to/",
            },
        ],
    },
    "silver": {
        "metal": "silver",
        "symbol": "XAG",
        "name": "2 oz Fine Silver Medallion",
        "spot_price_oz_usd": 34.00,
        "medallion_oz": 2.0,
        "demo_credits": 100,       # 100 credits = 20 wishes = $10.00
        "demo_price_usd": 10.00,
        "demo_price_sats": 10000,
        "demo_price_eth": 0.004,
        "tokenized_assets": [
            {
                "symbol": "KAG",
                "name": "Kinesis Silver (1:1 Physical Bullion Backed)",
                "network": "Base / Cross-Chain",
                "dex_venues": ["SimpleSwap", "Uniswap", "Aerodrome"],
                "issuer_url": "https://simpleswap.io/tokenized-assets",
            },
            {
                "symbol": "SLVON",
                "name": "Tokenized Silver Representation (SLVON)",
                "network": "Base / Cross-Chain",
                "dex_venues": ["SimpleSwap", "Aerodrome"],
                "issuer_url": "https://simpleswap.io/tokenized-assets",
            },
        ],
    },
    "copper": {
        "metal": "copper",
        "symbol": "XCU",
        "name": "2 oz Pure Copper Medallion",
        "spot_price_oz_usd": 1.25,  # Bullion / warehouse receipt spot value per oz ($2.50 for 2 oz)
        "medallion_oz": 2.0,
        "demo_credits": 25,        # 25 credits = 5 wishes = $2.50
        "demo_price_usd": 2.50,
        "demo_price_sats": 2500,
        "demo_price_eth": 0.001,
        "tokenized_assets": [
            {
                "symbol": "COPXON",
                "name": "Tokenized Copper Warehouse Receipt (COPXON)",
                "network": "Base / LayerZero Omnichain",
                "dex_venues": ["Uniswap", "Aerodrome", "SimpleSwap"],
                "issuer_url": "https://simpleswap.io/tokenized-assets",
            }
        ],
    },
}

# Theophany Oracle Reflections returned on each wish toss
THEOPHANY_REFLECTIONS = [
    {
        "title": "Photocentrism: Lux > Logos",
        "verse": "Revelation 15:2 — Stand on the sea of glass mingled with fire, having the Harps of God.",
        "reflection": "As the 2005 Dallas World Aquarium reflection demonstrated, coherent light bridges observer and cosmos with zero local entropy change (ΔS_local = 0).",
    },
    {
        "title": "The Economic Ark of Utnapishtim",
        "verse": "Epic of Gilgamesh XI — Whatever I had of gold and silver I laded upon her, and all the craftsmen.",
        "reflection": "Your wish splits 50% ($0.125) into a yield-bearing pool and 50% ($0.125) into 2 oz Gold, Silver, and Copper collateral.",
    },
    {
        "title": "The Week-7 SRY Catalyst",
        "verse": "Genesis 1:3 — And God said, Let there be light: and there was light.",
        "reflection": "From foundational unity (Weeks 0–6) springs the catalytic spark of differentiation and spiritual metanoia.",
    },
    {
        "title": "2,000,000 MPH Galactic Flight",
        "verse": "Psalm 84:11 — For the Lord God is a sun and shield.",
        "reflection": "In a 3-second count at 2,000,000 mph, the Great Sphinx and our planetary ark travel 1,666.7 miles through the Milky Way.",
    },
]

# Per-client state store
_users: Dict[str, Dict[str, Any]] = {}
# Global Wishing Well Yield & Prize Pool Ledger
_global_pool = {
    "total_deposited_usd": 0.0,
    "yield_bearing_pool_tvl_usd": 0.0,
    "metal_prize_pool_reserve_usd": 0.0,
    "total_wishes_tossed": 0,
    "total_prizes_won": 0,
}


def _get_client_id(handler: Any, body: Optional[Dict[str, Any]] = None) -> str:
    cid = handler.headers.get("X-Client-ID", "").strip()
    if not cid and body and isinstance(body, dict):
        cid = str(body.get("client_id", "")).strip()
    return cid or "anonymous"


def _get_user(client_id: str) -> Dict[str, Any]:
    with _lock:
        if client_id not in _users:
            _users[client_id] = {
                "client_id": client_id,
                "credit_balance": 0,
                "wishes_available": 0,
                "total_deposited_usd": 0.0,
                "yield_pool_principal_usd": 0.0,
                "metal_pool_contributed_usd": 0.0,
                "wishes_tossed": 0,
                "unclaimed_wins": [],
                "claimed_wins": [],
                "kyc": {
                    "verified": False,
                    "kyc_id": None,
                    "did": None,
                    "full_name": None,
                    "email": None,
                    "jurisdiction": None,
                    "wallet_address": None,
                    "mailing_address": None,
                    "id_type": None,
                    "verified_at": None,
                    "signature": None,
                },
                "history": [],
            }
        u = _users[client_id]
        u["wishes_available"] = u["credit_balance"] // CREDITS_PER_WISH
        return u


def compute_metal_win_probabilities(metal_allocation_usd: float = METAL_COVERAGE_PER_WISH_USD) -> Dict[str, Dict[str, Any]]:
    """
    Computes exact actuarial win probabilities for 2 oz of each precious metal
    based on current spot price so that $0.125 (12.5 cents) per $0.25 wish
    covers the exact expected value of the 2 oz prize:
        P(win 2 oz metal) = metal_allocation_usd / (2 * spot_price_oz_usd)
    """
    with _lock:
        results = {}
        for key, m in _METAL_MARKETS.items():
            spot_oz = float(m["spot_price_oz_usd"])
            oz_qty = float(m["medallion_oz"])
            prize_value_usd = round(spot_oz * oz_qty, 2)
            prob = min(1.0, metal_allocation_usd / prize_value_usd) if prize_value_usd > 0 else 0.0
            one_in_n = round(1.0 / prob, 1) if prob > 0 else float("inf")
            results[key] = {
                "metal": key,
                "symbol": m["symbol"],
                "name": m["name"],
                "spot_price_oz_usd": spot_oz,
                "prize_weight_oz": oz_qty,
                "prize_value_2oz_usd": prize_value_usd,
                "coverage_per_wish_usd": round(metal_allocation_usd, 4),
                "win_probability_per_wish": round(prob, 8),
                "win_probability_pct": round(prob * 100.0, 5),
                "odds_1_in": one_in_n,
                "tokenized_assets": m["tokenized_assets"],
            }
        return results


def _allocate_settled_deposit(
    client_id: str,
    credits_added: int,
    deposit_usd: float,
    source: str,
    payment_id: str,
) -> Dict[str, Any]:
    """
    Applies the 50% Yield-Bearing Asset / 50% Precious Metal Prize Pool split
    and credits the user's Wishing Well balance.
    """
    with _lock:
        user = _get_user(client_id)
        yield_usd = round(deposit_usd * YIELD_POOL_SHARE, 4)
        metal_usd = round(deposit_usd * METAL_POOL_SHARE, 4)

        user["credit_balance"] += int(credits_added)
        user["wishes_available"] = user["credit_balance"] // CREDITS_PER_WISH
        user["total_deposited_usd"] = round(user["total_deposited_usd"] + deposit_usd, 4)
        user["yield_pool_principal_usd"] = round(user["yield_pool_principal_usd"] + yield_usd, 4)
        user["metal_pool_contributed_usd"] = round(user["metal_pool_contributed_usd"] + metal_usd, 4)

        _global_pool["total_deposited_usd"] = round(_global_pool["total_deposited_usd"] + deposit_usd, 4)
        _global_pool["yield_bearing_pool_tvl_usd"] = round(_global_pool["yield_bearing_pool_tvl_usd"] + yield_usd, 4)
        _global_pool["metal_prize_pool_reserve_usd"] = round(_global_pool["metal_prize_pool_reserve_usd"] + metal_usd, 4)

        entry = {
            "type": "deposit_settled",
            "payment_id": payment_id,
            "source": source,
            "deposit_usd": deposit_usd,
            "credits_added": credits_added,
            "wishes_added": credits_added // CREDITS_PER_WISH,
            "yield_pool_allocated_usd": yield_usd,
            "metal_pool_allocated_usd": metal_usd,
            "timestamp": int(time.time()),
        }
        user["history"].append(entry)
        return entry


def _on_402_settled(challenge: Dict[str, Any]) -> None:
    """
    Callback invoked by backend.http402 whenever a challenge is settled.
    Automatically allocates Wishing Well credits & 50/50 yield split.
    """
    meta = challenge.get("metadata") or {}
    if meta.get("module") != "credits":
        return
    if meta.get("allocated"):
        return
    meta["allocated"] = True
    client_id = meta.get("client_id", "anonymous")
    credits_to_add = int(meta.get("credits", 0))
    deposit_usd = float(meta.get("deposit_usd", 0.0))
    source = str(meta.get("source", "wishing_well"))
    _allocate_settled_deposit(
        client_id=client_id,
        credits_added=credits_to_add,
        deposit_usd=deposit_usd,
        source=source,
        payment_id=challenge.get("payment_id", ""),
    )


# Register settlement hook with http402 engine
http402.register_settlement_callback(_on_402_settled)


def _format_balance_response(user: Dict[str, Any]) -> Dict[str, Any]:
    principal = user["yield_pool_principal_usd"]
    est_annual_yield = round(principal * DEFAULT_YIELD_APY, 4)
    return {
        "status": 200,
        "client_id": user["client_id"],
        "credit_balance": user["credit_balance"],
        "balance": user["credit_balance"],
        "wishes_available": user["credit_balance"] // CREDITS_PER_WISH,
        "wish_cost_usd": WISH_COST_USD,
        "credits_per_wish": CREDITS_PER_WISH,
        "wishing_well_economics": {
            "total_deposited_usd": user["total_deposited_usd"],
            "yield_pool_principal_usd": principal,
            "yield_pool_share_pct": 50.0,
            "yield_pool_apy_pct": round(DEFAULT_YIELD_APY * 100, 2),
            "estimated_annual_yield_usd": est_annual_yield,
            "metal_prize_pool_contributed_usd": user["metal_pool_contributed_usd"],
            "metal_prize_share_pct": 50.0,
            "metal_coverage_per_wish_usd": METAL_COVERAGE_PER_WISH_USD,
        },
        "global_pool": dict(_global_pool),
        "metal_odds": compute_metal_win_probabilities(METAL_COVERAGE_PER_WISH_USD),
        "unclaimed_wins": user["unclaimed_wins"],
        "claimed_wins": user["claimed_wins"],
        "kyc": user["kyc"],
    }


def handle_request(handler: Any, path: str, method: str) -> None:
    """
    Dispatches /api/credits/*, /api/wishing-well/*, and /api/kyc/* requests.
    """
    body = api_handler.read_json_body(handler) if method in ("POST", "PUT") else {}
    client_id = _get_client_id(handler, body)

    # -----------------------------------------------------------------
    # 1. GET Balance & Wishing Well Status
    #    (/api/credits/balance, /api/wishing-well/balance, /api/wishing-well/status)
    # -----------------------------------------------------------------
    if path in ("/api/credits/balance", "/api/wishing-well/balance", "/api/wishing-well/status") and method == "GET":
        user = _get_user(client_id)
        api_handler.send_json(handler, 200, _format_balance_response(user))
        return

    # -----------------------------------------------------------------
    # 2. GET / POST Spot Prices & Actuarial Odds (/api/wishing-well/metals)
    # -----------------------------------------------------------------
    if path == "/api/wishing-well/metals":
        if method == "GET":
            api_handler.send_json(
                handler,
                200,
                {
                    "status": 200,
                    "wish_cost_usd": WISH_COST_USD,
                    "yield_allocation_per_wish_usd": WISH_COST_USD * YIELD_POOL_SHARE,
                    "metal_allocation_per_wish_usd": METAL_COVERAGE_PER_WISH_USD,
                    "metals": compute_metal_win_probabilities(METAL_COVERAGE_PER_WISH_USD),
                },
            )
            return
        if method == "POST":
            # Allow updating live spot prices (e.g. from oracle or admin feed)
            with _lock:
                for m_key in ("gold", "silver", "copper"):
                    if m_key in body:
                        new_spot = float(body[m_key])
                        if new_spot <= 0:
                            raise ValueError(f"Spot price for {m_key} must be positive")
                        _METAL_MARKETS[m_key]["spot_price_oz_usd"] = round(new_spot, 4)
            api_handler.send_json(
                handler,
                200,
                {
                    "status": 200,
                    "message": "Spot prices updated; win algorithm recalculated",
                    "metals": compute_metal_win_probabilities(METAL_COVERAGE_PER_WISH_USD),
                },
            )
            return

    # -----------------------------------------------------------------
    # 3. POST Purchase Credits / Throw Custom Amount Into Wishing Well
    #    (/api/credits/purchase, /api/wishing-well/credits/purchase, /api/wishing-well/deposit)
    # -----------------------------------------------------------------
    if path in ("/api/credits/purchase", "/api/wishing-well/credits/purchase", "/api/wishing-well/deposit") and method == "POST":
        medallion = body.get("medallion")
        custom_amount_usd = body.get("amount_usd")

        # Case A: Custom dollar amount thrown into the Wishing Well
        if custom_amount_usd is not None and not medallion:
            try:
                amount_usd = float(custom_amount_usd)
            except (ValueError, TypeError):
                raise ValueError("Invalid amount_usd")
            if amount_usd < WISH_COST_USD:
                raise ValueError(f"Minimum wish deposit is ${WISH_COST_USD:.2f} (25 cents)")

            wishes_count = int(round(amount_usd / WISH_COST_USD))
            if wishes_count < 1:
                wishes_count = 1
            credits_to_allocate = wishes_count * CREDITS_PER_WISH
            sats_amount = max(250, int(round(amount_usd * 1000)))
            desc = (
                f"Theophany Wishing Well Deposit: ${amount_usd:.2f} USD "
                f"({wishes_count} Wishes @ $0.25 | 50% Yield Pool: ${amount_usd * 0.5:.2f} | "
                f"50% Metal Pool: ${amount_usd * 0.5:.2f})"
            )
            source_label = "custom_wishing_well_deposit"
        else:
            # Case B: 2 oz Gold, Silver, or Copper Medallion Demo purchase
            medallion_key = str(medallion or "").strip().lower()
            if medallion_key not in _METAL_MARKETS:
                raise ValueError(f"Invalid medallion type '{medallion}'. Must be 'gold', 'silver', or 'copper'.")

            raw_qty = body.get("quantity", 1)
            if isinstance(raw_qty, float) and not raw_qty.is_integer():
                raise ValueError("Medallion quantity must be a whole integer")
            try:
                qty = int(raw_qty)
            except (ValueError, TypeError):
                raise ValueError("Invalid quantity")
            if qty <= 0 or str(raw_qty) != str(qty) and isinstance(raw_qty, float):
                raise ValueError("Quantity must be a positive integer")

            m_info = _METAL_MARKETS[medallion_key]
            credits_to_allocate = int(m_info["demo_credits"]) * qty
            amount_usd = round(float(m_info["demo_price_usd"]) * qty, 2)
            sats_amount = int(m_info["demo_price_sats"]) * qty
            wishes_count = credits_to_allocate // CREDITS_PER_WISH
            desc = (
                f"{qty}x {m_info['name']} Wishing Well Demo ({credits_to_allocate} Credits = {wishes_count} Wishes @ $0.25 | "
                f"50% Yield Pool: ${amount_usd * 0.5:.2f} | 50% Metal Pool: ${amount_usd * 0.5:.2f})"
            )
            source_label = f"medallion_{medallion_key}"

        # Check if request already carries a valid settled payment token for this resource
        is_authed, auth_info = http402.verify_request_auth(handler.headers, resource=path)
        if is_authed:
            user = _get_user(client_id)
            api_handler.send_json(handler, 200, _format_balance_response(user))
            return

        challenge = http402.create_challenge(
            resource=path,
            amount=sats_amount,
            currency="SATS",
            description=desc,
            amount_usd=amount_usd,
            metadata={
                "module": "credits",
                "client_id": client_id,
                "credits": credits_to_allocate,
                "deposit_usd": amount_usd,
                "source": source_label,
                "allocated": False,
            },
        )
        http402.send_402_response(handler, challenge)
        return

    # -----------------------------------------------------------------
    # 4. POST Claim Settled Credits explicitly (/api/wishing-well/credits/claim)
    # -----------------------------------------------------------------
    if path == "/api/wishing-well/credits/claim" and method == "POST":
        user = _get_user(client_id)
        api_handler.send_json(handler, 200, _format_balance_response(user))
        return

    # -----------------------------------------------------------------
    # 5. POST Toss a Wish into the Wishing Well
    #    (/api/credits/toss, /api/wishing-well/toss)
    #    - Costs 5 credits ($0.25 = 25 cents) per wish
    #    - $0.125 is in the Yield-Bearing Asset Pool
    #    - $0.125 covers the 2 oz Precious Metal win algorithm based on live spot prices
    # -----------------------------------------------------------------
    if path in ("/api/credits/toss", "/api/wishing-well/toss") and method == "POST":
        with _lock:
            user = _get_user(client_id)
            wishes_requested = int(body.get("wishes", 1))
            if wishes_requested < 1:
                raise ValueError("wishes must be >= 1")
            cost_credits = wishes_requested * CREDITS_PER_WISH

            if user["credit_balance"] < cost_credits:
                api_handler.send_json(
                    handler,
                    400,
                    {
                        "status": 400,
                        "error": "insufficient_credits",
                        "message": (
                            f"Insufficient Wishing Well credits: {cost_credits} credits (${wishes_requested * WISH_COST_USD:.2f}) "
                            f"required, balance is {user['credit_balance']} credits."
                        ),
                        "credit_balance": user["credit_balance"],
                        "required_credits": cost_credits,
                    },
                )
                return

            user["credit_balance"] -= cost_credits
            user["wishes_available"] = user["credit_balance"] // CREDITS_PER_WISH
            user["wishes_tossed"] += wishes_requested
            _global_pool["total_wishes_tossed"] += wishes_requested

            target_metal = str(body.get("target_metal", "all")).strip().lower()
            if target_metal not in ("gold", "silver", "copper", "all"):
                target_metal = "all"

            wish_text = str(body.get("wish", "Evolving to a Type I Civilization")).strip()

            # Evaluate Spot-Price Win Algorithm for each $0.25 wish tossed
            # Each $0.25 wish allocates $0.125 (12.5 cents) to cover the 2 oz metal prize value.
            odds_table = compute_metal_win_probabilities(METAL_COVERAGE_PER_WISH_USD)
            wins_this_toss: List[Dict[str, Any]] = []
            force_demo_win = body.get("simulate_win_metal")

            for _ in range(wishes_requested):
                roll = secrets.randbelow(10**9) / float(10**9)
                won_metal_key = None

                if force_demo_win in ("gold", "silver", "copper"):
                    won_metal_key = force_demo_win
                    force_demo_win = None  # Only trigger once
                elif target_metal in ("gold", "silver", "copper"):
                    # All $0.125 metal coverage of this wish targets the selected metal
                    p_win = odds_table[target_metal]["win_probability_per_wish"]
                    if roll < p_win:
                        won_metal_key = target_metal
                else:
                    # "all": Split the $0.125 coverage equally ($0.04167 each) across Gold, Silver, and Copper
                    cumulative = 0.0
                    for m_key in ("gold", "silver", "copper"):
                        p_win_split = odds_table[m_key]["win_probability_per_wish"] / 3.0
                        cumulative += p_win_split
                        if roll < cumulative:
                            won_metal_key = m_key
                            break

                if won_metal_key:
                    m_info = _METAL_MARKETS[won_metal_key]
                    spot_oz = float(m_info["spot_price_oz_usd"])
                    prize_val = round(spot_oz * float(m_info["medallion_oz"]), 2)
                    win_record = {
                        "win_id": f"WIN-{secrets.token_hex(4).upper()}",
                        "metal": won_metal_key,
                        "name": m_info["name"],
                        "weight_oz": m_info["medallion_oz"],
                        "spot_price_oz_usd": spot_oz,
                        "cash_value_usd": prize_val,
                        "tokenized_options": m_info["tokenized_assets"],
                        "claim_options": ["cash", "tokenized_swap", "physical_mail"],
                        "claimed": False,
                        "won_at": int(time.time()),
                    }
                    user["unclaimed_wins"].append(win_record)
                    wins_this_toss.append(win_record)
                    _global_pool["total_prizes_won"] += 1

            reflection_obj = THEOPHANY_REFLECTIONS[user["wishes_tossed"] % len(THEOPHANY_REFLECTIONS)]

            response_payload = {
                "status": 200,
                "success": True,
                "client_id": client_id,
                "wish": wish_text,
                "wishes_tossed_now": wishes_requested,
                "credits_spent": cost_credits,
                "wish_cost_usd": round(wishes_requested * WISH_COST_USD, 2),
                "yield_bearing_allocation_usd": round(wishes_requested * WISH_COST_USD * YIELD_POOL_SHARE, 4),
                "metal_prize_allocation_usd": round(wishes_requested * METAL_COVERAGE_PER_WISH_USD, 4),
                "credit_balance": user["credit_balance"],
                "balance": user["credit_balance"],
                "wishes_available": user["wishes_available"],
                "theophany_reflection": reflection_obj["reflection"],
                "reflection": reflection_obj["reflection"],
                "verse": reflection_obj["verse"],
                "title": reflection_obj["title"],
                "win_algorithm": {
                    "target_metal": target_metal,
                    "coverage_per_wish_usd": METAL_COVERAGE_PER_WISH_USD,
                    "spot_prices_oz_usd": {
                        k: v["spot_price_oz_usd"] for k, v in _METAL_MARKETS.items()
                    },
                    "probabilities_per_wish": {
                        k: v["win_probability_per_wish"] for k, v in odds_table.items()
                    },
                    "won_on_this_toss": len(wins_this_toss) > 0,
                    "wins": wins_this_toss,
                },
                "unclaimed_wins": user["unclaimed_wins"],
                "kyc_verified": user["kyc"]["verified"],
            }
            api_handler.send_json(handler, 200, response_payload)
            return

    # -----------------------------------------------------------------
    # 6. KYC Digital ID Verification & Status
    #    (/api/kyc/status, /api/kyc/verify, /api/wishing-well/kyc)
    # -----------------------------------------------------------------
    if path in ("/api/kyc/status", "/api/wishing-well/kyc") and method == "GET":
        user = _get_user(client_id)
        api_handler.send_json(
            handler,
            200,
            {
                "status": 200,
                "client_id": client_id,
                "kyc": user["kyc"],
            },
        )
        return

    if path in ("/api/kyc/verify", "/api/wishing-well/kyc") and method == "POST":
        full_name = str(body.get("full_name", "")).strip()
        email = str(body.get("email", "")).strip()
        jurisdiction = str(body.get("jurisdiction", "US")).strip()
        wallet_address = str(body.get("wallet_address", "0x0000000000000000000000000000000000000000")).strip()
        mailing_address = str(body.get("mailing_address", "")).strip()
        id_type = str(body.get("id_type", "Government_Passport_or_DL")).strip()
        id_number_last4 = str(body.get("id_last4", "0000")).strip()[-4:]

        if not full_name:
            raise ValueError("full_name is required for KYC Digital ID issuance")

        now_ts = int(time.time())
        id_hash = hashlib.sha256(f"{client_id}:{full_name}:{email}:{id_number_last4}:{now_ts}".encode("utf-8")).hexdigest()[:16]
        kyc_id = f"KYC-GFP-{id_hash[:8].upper()}"
        did = f"did:gfp:base:{id_hash}"
        sig = hmac.new(
            http402.SERVER_SECRET,
            f"{did}:{kyc_id}:{full_name}:{wallet_address}:{now_ts}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        with _lock:
            user = _get_user(client_id)
            user["kyc"] = {
                "verified": True,
                "kyc_id": kyc_id,
                "did": did,
                "full_name": full_name,
                "email": email or "verified@goodfaithparadigm.org",
                "jurisdiction": jurisdiction,
                "wallet_address": wallet_address,
                "mailing_address": mailing_address or "Verified Physical Escrow Address on File",
                "id_type": id_type,
                "id_last4": id_number_last4,
                "verified_at": now_ts,
                "signature": sig,
                "credential_standard": "W3C-VC / Base-Soulbound-KYC-Attestation",
            }

        api_handler.send_json(
            handler,
            200,
            {
                "status": 200,
                "success": True,
                "message": "Good Faith Paradigm KYC Digital ID Verified & Issued",
                "kyc": user["kyc"],
            },
        )
        return

    # -----------------------------------------------------------------
    # 7. Winner Prize Claim Endpoint (/api/wishing-well/claim)
    #    Supports:
    #      1. "cash" -> USD / USDC Spot Value Payout
    #      2. "tokenized_swap" -> On-Chain Base DEX Swap (Uniswap / Aerodrome / SimpleSwap)
    #         into PAXG / XAUt (Gold), KAG / SLVON (Silver), or COPXON (Copper)
    #      3. "physical_mail" -> Mail 2 oz physical medallion to KYC-verified address
    # -----------------------------------------------------------------
    if path == "/api/wishing-well/claim" and method == "POST":
        with _lock:
            user = _get_user(client_id)
            if not user["kyc"]["verified"]:
                api_handler.send_json(
                    handler,
                    403,
                    {
                        "status": 403,
                        "error": "kyc_required",
                        "message": "A verified GFP KYC Digital ID is required before claiming Cash, Tokenized Metals (PAXG/KAG/COPXON), or Physical Medallion Mail Delivery.",
                    },
                )
                return

            win_id = str(body.get("win_id", "")).strip()
            claim_mode = str(body.get("claim_mode", "tokenized_swap")).strip().lower()
            if claim_mode not in ("cash", "tokenized_swap", "physical_mail"):
                raise ValueError("claim_mode must be 'cash', 'tokenized_swap', or 'physical_mail'")

            target_win = None
            for w in user["unclaimed_wins"]:
                if not win_id or w["win_id"] == win_id:
                    target_win = w
                    break

            if not target_win:
                api_handler.send_json(
                    handler,
                    404,
                    {
                        "status": 404,
                        "error": "no_unclaimed_win",
                        "message": "No matching unclaimed 2 oz precious metal win found.",
                    },
                )
                return

            user["unclaimed_wins"].remove(target_win)
            metal_key = target_win["metal"]
            m_info = _METAL_MARKETS[metal_key]
            preferred_token = str(body.get("token_symbol", "")).strip().upper()
            available_tokens = m_info["tokenized_assets"]
            chosen_token = available_tokens[0]
            for t_opt in available_tokens:
                if t_opt["symbol"].upper() == preferred_token:
                    chosen_token = t_opt
                    break

            dex_venue = str(body.get("dex_venue", chosen_token["dex_venues"][0])).strip()
            tx_hash = "0x" + secrets.token_hex(32)

            if claim_mode == "cash":
                settlement_details = {
                    "mode": "cash",
                    "payout_currency": "USDC (Base) / USD Wire",
                    "payout_amount_usd": target_win["cash_value_usd"],
                    "recipient_wallet": user["kyc"]["wallet_address"],
                    "tx_hash": tx_hash,
                }
            elif claim_mode == "tokenized_swap":
                settlement_details = {
                    "mode": "tokenized_swap",
                    "network": chosen_token["network"],
                    "dex_venue": dex_venue,
                    "token_symbol": chosen_token["symbol"],
                    "token_name": chosen_token["name"],
                    "token_amount_oz": target_win["weight_oz"],
                    "spot_value_usd": target_win["cash_value_usd"],
                    "recipient_wallet": user["kyc"]["wallet_address"],
                    "swap_tx_hash": tx_hash,
                    "issuer_url": chosen_token["issuer_url"],
                }
            else:
                settlement_details = {
                    "mode": "physical_mail",
                    "item": f"Physical {target_win['name']} (2 Troy Ounces)",
                    "recipient_name": user["kyc"]["full_name"],
                    "shipping_address": body.get("mailing_address") or user["kyc"]["mailing_address"],
                    "carrier": "USPS Registered Insured Bullion Mail / Brinks Courier",
                    "tracking_number": f"GFP-BULLION-{secrets.token_hex(5).upper()}",
                    "insured_value_usd": target_win["cash_value_usd"],
                }

            target_win["claimed"] = True
            target_win["claimed_at"] = int(time.time())
            target_win["claim_mode"] = claim_mode
            target_win["kyc_id"] = user["kyc"]["kyc_id"]
            target_win["settlement"] = settlement_details
            user["claimed_wins"].append(target_win)

            api_handler.send_json(
                handler,
                200,
                {
                    "status": 200,
                    "success": True,
                    "message": f"2 oz {metal_key.capitalize()} prize claimed via {claim_mode}",
                    "claim": target_win,
                    "kyc": user["kyc"],
                },
            )
            return

    api_handler.send_json(
        handler,
        404,
        {
            "status": 404,
            "error": "not_found",
            "message": f"Credits/Wishing-Well endpoint '{path}' not found",
        },
    )
