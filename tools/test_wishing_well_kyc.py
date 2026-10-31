#!/usr/bin/env python3
"""
Focused E2E Test Suite for Theophany Wishing Well, Spot-Price Win Algorithm,
On-Chain Tokenized Metal Swaps (PAXG/XAUt, KAG/SLVON, COPXON), and KYC Digital ID.
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
if TOOLS_DIR not in sys.path:
    sys.path.insert(0, TOOLS_DIR)

from test_e2e_monetization import APIClient


def run_tests():
    print("===========================================================================")
    print("  THEOPHANY WISHING WELL, TOKENIZED METAL SWAPS & KYC DIGITAL ID TESTS")
    print("===========================================================================")

    client = APIClient("http://127.0.0.1:8080", default_client_id="theophany_user_001", force_direct=True)

    def req(method, path, body=None, headers=None):
        status, resp_headers, raw = client.request(method, path, body=body, headers=headers)
        return status, resp_headers, json.loads(raw.decode("utf-8"))

    # 1. Spot-Price Win Algorithm Verification ($0.125 / 2 oz value)
    status, _, body = req("GET", "/api/wishing-well/metals")
    assert status == 200, f"Expected 200, got {status}"
    assert body["wish_cost_usd"] == 0.25
    assert body["yield_allocation_per_wish_usd"] == 0.125
    assert body["metal_allocation_per_wish_usd"] == 0.125
    metals = body["metals"]

    for m_key, expected_spot, expected_tokens in [
        ("gold", 2750.00, ["PAXG", "XAUt"]),
        ("silver", 34.00, ["KAG", "SLVON"]),
        ("copper", 1.25, ["COPXON"]),
    ]:
        m = metals[m_key]
        assert m["spot_price_oz_usd"] == expected_spot
        assert abs(m["prize_value_2oz_usd"] - (2.0 * expected_spot)) < 1e-6
        expected_prob = round(0.125 / (2.0 * expected_spot), 8)
        assert abs(m["win_probability_per_wish"] - expected_prob) < 1e-8
        symbols = [t["symbol"] for t in m["tokenized_assets"]]
        for tok in expected_tokens:
            assert tok in symbols, f"Missing {tok} in {m_key}: {symbols}"
    print("  [PASS] 1. Spot-price win algorithm P(win) = $0.125 / (2 * spot_oz) verified for Gold (PAXG/XAUt), Silver (KAG/SLVON), Copper (COPXON)")

    # 2. Custom Spot Price Update dynamically recalculates Win Probability
    status, _, body = req(
        "POST",
        "/api/wishing-well/metals",
        {"gold": 2500.0, "silver": 50.0, "copper": 2.50},
    )
    assert status == 200
    assert abs(body["metals"]["gold"]["win_probability_per_wish"] - round(0.125 / 5000.0, 8)) < 1e-8
    assert abs(body["metals"]["silver"]["win_probability_per_wish"] - round(0.125 / 100.0, 8)) < 1e-8
    assert abs(body["metals"]["copper"]["win_probability_per_wish"] - round(0.125 / 5.0, 8)) < 1e-8
    # Restore defaults
    req(
        "POST",
        "/api/wishing-well/metals",
        {"gold": 2750.0, "silver": 34.0, "copper": 1.25},
    )
    print("  [PASS] 2. Dynamic spot-price update recalculates 2 oz win odds in real time")

    # 3. Throw Any Custom Amount Into Wishing Well ($2.50 = 10 Wishes = 50 Credits)
    status, headers, body = req(
        "POST",
        "/api/wishing-well/deposit",
        {"amount_usd": 2.50},
    )
    assert status == 402, f"Expected 402 challenge, got {status}"
    ch = body.get("challenge", body)
    assert ch["amount_usd"] == 2.50

    # Settle the HTTP 402 challenge via /api/402/settle
    s_status, _, s_body = req(
        "POST",
        "/api/402/settle",
        {"payment_id": ch["payment_id"], "method": "demo"},
    )
    assert s_status == 200

    # Verify balance & 50/50 split allocation
    b_status, _, b_body = req("GET", "/api/credits/balance")
    assert b_status == 200
    assert b_body["balance"] == 50
    assert b_body["wishes_available"] == 10
    econ = b_body["wishing_well_economics"]
    assert abs(econ["total_deposited_usd"] - 2.50) < 1e-6
    assert abs(econ["yield_pool_principal_usd"] - 1.25) < 1e-6
    assert abs(econ["metal_prize_pool_contributed_usd"] - 1.25) < 1e-6
    print("  [PASS] 3. Custom Wishing Well deposit ($2.50 -> 10 wishes) splits 50% ($1.25) to Yield Pool & 50% ($1.25) to Metal Prize Pool")

    # 4. Toss Wishes & Trigger Spot-Price Win Roll for Copper, Gold, and Silver
    won_wins = []
    for target_m in ("copper", "gold", "silver"):
        t_status, _, t_body = req(
            "POST",
            "/api/credits/toss",
            {
                "wish": f"Theophany Wish for 2 oz {target_m}",
                "target_metal": target_m,
                "simulate_win_metal": target_m,
            },
        )
        assert t_status == 200
        assert t_body["win_algorithm"]["won_on_this_toss"] is True
        win_rec = t_body["win_algorithm"]["wins"][0]
        assert win_rec["metal"] == target_m
        won_wins.append(win_rec)

    print(
        f"  [PASS] 4. Wishing Well $0.25 tosses executed spot-price rolls and awarded 2 oz Copper ({won_wins[0]['win_id']}), "
        f"2 oz Gold ({won_wins[1]['win_id']}), and 2 oz Silver ({won_wins[2]['win_id']})"
    )

    # 5. Claiming without KYC Digital ID is blocked with 403
    c_status, _, c_body = req(
        "POST",
        "/api/wishing-well/claim",
        {
            "win_id": won_wins[0]["win_id"],
            "claim_mode": "tokenized_swap",
            "token_symbol": "COPXON",
        },
    )
    assert c_status == 403 and c_body.get("error") == "kyc_required"
    print("  [PASS] 5. Prize claim enforces KYC Digital ID verification before settlement (403 kyc_required)")

    # 6. Verify KYC Digital ID
    k_status, _, k_body = req(
        "POST",
        "/api/kyc/verify",
        {
            "full_name": "Jason Sprouse",
            "email": "jason@goodfaithparadigm.org",
            "jurisdiction": "US",
            "id_type": "passport",
            "id_last4": "2013",
            "wallet_address": "0x71C95911E9a5D330f4D621842EC243EE1343292e",
            "mailing_address": "777 Golden Plates Way, Dallas, TX 75201",
        },
    )
    assert k_status == 200
    kyc_rec = k_body["kyc"]
    assert kyc_rec["verified"] is True
    assert kyc_rec["kyc_id"].startswith("KYC-GFP-")
    assert kyc_rec["did"].startswith("did:gfp:base:")
    print(f"  [PASS] 6. KYC Digital ID issued: {kyc_rec['kyc_id']} ({kyc_rec['did']})")

    # 7. Test All 3 Claim Modes:
    #    Mode A: On-Chain Spot Swap on Base (COPXON, PAXG, KAG)
    c1_status, _, c1_body = req(
        "POST",
        "/api/wishing-well/claim",
        {
            "win_id": won_wins[0]["win_id"],
            "claim_mode": "tokenized_swap",
            "token_symbol": "COPXON",
            "dex_venue": "Aerodrome (Base)",
        },
    )
    assert c1_status == 200
    s1 = c1_body["claim"]["settlement"]
    assert s1["mode"] == "tokenized_swap"
    assert s1["token_symbol"] == "COPXON"
    assert s1["token_amount_oz"] == 2
    print(f"  [PASS] 7a. Claim Mode 1 (On-Chain Spot Swap on Base): Settled {s1['token_amount_oz']} oz {s1['token_symbol']} via {s1['dex_venue']} (tx: {s1['swap_tx_hash'][:18]}...)")

    #    Mode B: Instant Cash (USDC / USD) for 2 oz Gold
    c2_status, _, c2_body = req(
        "POST",
        "/api/wishing-well/claim",
        {
            "win_id": won_wins[1]["win_id"],
            "claim_mode": "cash",
        },
    )
    assert c2_status == 200
    s2 = c2_body["claim"]["settlement"]
    assert s2["mode"] == "cash"
    assert s2["payout_amount_usd"] == 5500.0
    print(f"  [PASS] 7b. Claim Mode 2 (Instant Cash): Paid ${s2['payout_amount_usd']:.2f} {s2['payout_currency']} for 2 oz Gold")

    #    Mode C: Insured Physical Mail Delivery for 2 oz Silver
    c3_status, _, c3_body = req(
        "POST",
        "/api/wishing-well/claim",
        {
            "win_id": won_wins[2]["win_id"],
            "claim_mode": "physical_mail",
        },
    )
    assert c3_status == 200
    s3 = c3_body["claim"]["settlement"]
    assert s3["mode"] == "physical_mail"
    assert s3["tracking_number"].startswith("GFP-BULLION-")
    print(f"  [PASS] 7c. Claim Mode 3 (Physical Mail): Dispatched {s3['item']} to {s3['shipping_address']} ({s3['tracking_number']})")

    print("===========================================================================")
    print("  ALL 7 THEOPHANY WISHING WELL & KYC DIGITAL ID TESTS PASSED (100%)")
    print("===========================================================================")


if __name__ == "__main__":
    run_tests()
