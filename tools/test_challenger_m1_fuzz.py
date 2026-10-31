#!/usr/bin/env python3
"""
Adversarial Challenge & Fuzzing Harness for Milestone 1 HTTP 402 Engine
Author: challenger_m1_1
Tests:
1. Tampered Macaroon Payment Hash Exploit (Forged payment hash without settling)
2. Tampered Macaroon Signature & Caveat Stripping/Modification
3. Bad Preimages & Hex Corruption
4. Scope Mismatches & Path Traversal
5. Replay Attacks & Preimage Cross-Settlement
6. Concurrent Settlement Races
7. Extreme Amounts & Boundary Inputs
8. Token Expiration Enforcement
"""

import sys
import os
import json
import base64
import hashlib
import hmac
import secrets
import time
import threading

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)

import backend.http402 as h
import backend.api_handler as api

results = []

def record(test_name, passed, details=""):
    results.append({"name": test_name, "passed": passed, "details": details})
    mark = "[PASS]" if passed else "[FAIL - VULNERABILITY FOUND]"
    print(f"  {mark} {test_name}: {details}")


def test_tampered_payment_hash_in_macaroon():
    """
    CRITICAL CHALLENGE:
    Does the macaroon HMAC signature commit to payment_hash?
    If not, an attacker can substitute their own payment_hash and preimage
    to unlock ANY protected resource WITHOUT paying!
    """
    print("\n--- Running Challenge: Tampered Payment Hash in Macaroon ---")
    
    # 1. Server issues a challenge for an expensive protected resource
    challenge = h.create_challenge(
        resource="/api/protected/ultra-secret",
        amount=500000,
        currency="SATS",
    )
    original_mac_b64 = challenge["macaroon"]
    
    # 2. Attacker decodes the macaroon
    padding = 4 - (len(original_mac_b64) % 4)
    padded = original_mac_b64 + ("=" * (padding % 4))
    mac_json = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))
    
    # 3. Attacker generates their own fake preimage and hash
    fake_preimage_bytes = secrets.token_bytes(32)
    fake_preimage_hex = fake_preimage_bytes.hex()
    fake_payment_hash = hashlib.sha256(fake_preimage_bytes).hexdigest()
    
    # 4. Attacker tampers ONLY the payment_hash field in the macaroon
    mac_json["payment_hash"] = fake_payment_hash
    tampered_bytes = json.dumps(mac_json, separators=(",", ":")).encode("utf-8")
    tampered_mac_b64 = base64.urlsafe_b64encode(tampered_bytes).decode("utf-8").rstrip("=")
    
    # 5. Attacker presents the tampered macaroon + fake preimage to verify_request_auth
    headers = {
        "Authorization": f"L402 {tampered_mac_b64}:{fake_preimage_hex}"
    }
    is_authed, auth_data = h.verify_request_auth(headers, resource="/api/protected/ultra-secret")
    
    if is_authed:
        # VULNERABILITY CONFIRMED: Unpaid request was authorized because payment_hash was not signed!
        record(
            "tampered_payment_hash_exploit",
            False,
            "CRITICAL SECURITY VULNERABILITY: Macaroon HMAC signature does NOT commit to payment_hash! "
            "Attacker unlocked resource without paying or settling by swapping payment_hash in macaroon."
        )
    else:
        record(
            "tampered_payment_hash_exploit",
            True,
            "Macaroon with tampered payment_hash was correctly rejected."
        )


def test_tampered_caveats():
    print("\n--- Running Challenge: Tampered Caveats ---")
    challenge = h.create_challenge(resource="/api/protected/data", amount=1000)
    orig_b64 = challenge["macaroon"]
    
    padding = 4 - (len(orig_b64) % 4)
    mac_json = json.loads(base64.urlsafe_b64decode((orig_b64 + "=" * (padding % 4)).encode("utf-8")).decode("utf-8"))
    
    # Try altering resource caveat to wildcard *
    mac_json["caveats"] = ["resource=*", "expires=9999999999", "target=gfp-investor-xr"]
    tampered_b64 = base64.urlsafe_b64encode(json.dumps(mac_json).encode("utf-8")).decode("utf-8").rstrip("=")
    
    is_valid, _, reason = h.verify_macaroon(tampered_b64, resource="/api/protected/other")
    record("tampered_caveats_rejected", not is_valid, f"Result: valid={is_valid}, reason={reason}")


def test_tampered_macaroon_signature():
    print("\n--- Running Challenge: Tampered Macaroon Signature ---")
    challenge = h.create_challenge(resource="/api/protected/data", amount=1000)
    orig_b64 = challenge["macaroon"]
    
    padding = 4 - (len(orig_b64) % 4)
    mac_json = json.loads(base64.urlsafe_b64decode((orig_b64 + "=" * (padding % 4)).encode("utf-8")).decode("utf-8"))
    
    # Corrupt last hex character of signature
    sig = mac_json["signature"]
    corrupted_char = "0" if sig[-1] != "0" else "1"
    mac_json["signature"] = sig[:-1] + corrupted_char
    
    tampered_b64 = base64.urlsafe_b64encode(json.dumps(mac_json).encode("utf-8")).decode("utf-8").rstrip("=")
    is_valid, _, reason = h.verify_macaroon(tampered_b64, resource="/api/protected/data")
    record("tampered_signature_rejected", not is_valid, f"Result: valid={is_valid}, reason={reason}")


def test_bad_preimages():
    print("\n--- Running Challenge: Bad Preimages ---")
    challenge = h.create_challenge(resource="/api/test/preimage", amount=1000)
    pid = challenge["payment_id"]
    
    # Test 1: Non-hex string
    status, res = h.settle_challenge(pid, preimage="not_a_hex_string_at_all!!", method="crypto")
    record("non_hex_preimage_rejected", status == 400 and res["error"] == "invalid_preimage_hex", f"status={status}")
    
    # Test 2: Odd length hex
    status, res = h.settle_challenge(pid, preimage="12345", method="crypto")
    record("odd_hex_preimage_rejected", status == 400 and res["error"] == "invalid_preimage_hex", f"status={status}")
    
    # Test 3: Valid 64-char hex but wrong preimage
    bad_pre = "a" * 64
    status, res = h.settle_challenge(pid, preimage=bad_pre, method="crypto")
    record("wrong_preimage_rejected", status == 400 and res["error"] == "invalid_preimage", f"status={status}")
    
    # Test 4: Correct preimage accepted
    good_status, good_res = h.settle_challenge(pid, preimage=challenge["preimage"], method="crypto")
    record("correct_preimage_accepted", good_status == 200 and good_res["success"] is True, f"status={good_status}")


def test_scope_mismatches_and_traversal():
    print("\n--- Running Challenge: Scope Mismatches & Path Traversal ---")
    challenge = h.create_challenge(resource="/api/protected/vault", amount=1000)
    mac = challenge["macaroon"]
    
    # 1. Unrelated resource
    v1, _, r1 = h.verify_macaroon(mac, resource="/api/protected/secret")
    record("unrelated_resource_rejected", not v1, f"reason={r1}")
    
    # 2. Partial prefix trick (without trailing slash)
    # If scoped to /api/protected/vault, does /api/protected/vault_unauthorized get allowed?
    v2, _, r2 = h.verify_macaroon(mac, resource="/api/protected/vault_unauthorized")
    record("prefix_boundary_rejected", not v2, f"reason={r2}")
    
    # 3. Proper subresource: /api/protected/vault/item1
    v3, _, r3 = h.verify_macaroon(mac, resource="/api/protected/vault/item1")
    record("subresource_allowed", v3, f"reason={r3}")


def test_token_expiration():
    print("\n--- Running Challenge: Token Expiration ---")
    # Create challenge with 1 second expiry
    challenge = h.create_challenge(resource="/api/expire", amount=100, expires_in=1)
    time.sleep(1.2)
    
    # Try settling expired challenge
    status, res = h.settle_challenge(challenge["payment_id"], method="demo")
    record("settling_expired_challenge_rejected", status == 400 and res["error"] == "challenge_expired", f"status={status}")
    
    # Try verifying expired macaroon
    is_valid, _, reason = h.verify_macaroon(challenge["macaroon"], resource="/api/expire")
    record("expired_macaroon_rejected", not is_valid and "expired" in reason, f"reason={reason}")


def test_replay_and_double_settle():
    print("\n--- Running Challenge: Replay & Double Settle ---")
    challenge = h.create_challenge(resource="/api/replay", amount=100)
    pid = challenge["payment_id"]
    
    # First settlement
    s1, r1 = h.settle_challenge(pid, preimage=challenge["preimage"], method="crypto")
    # Second settlement
    s2, r2 = h.settle_challenge(pid, preimage=challenge["preimage"], method="crypto")
    
    record("double_settle_behavior", s1 == 200 and s2 == 200, f"s1={s1}, s2={s2} (idempotent)")


def test_concurrent_settlement_race():
    print("\n--- Running Challenge: Concurrent Settlement Race ---")
    challenge = h.create_challenge(resource="/api/race", amount=100)
    pid = challenge["payment_id"]
    preimage = challenge["preimage"]
    
    statuses = []
    tokens = []
    
    def try_settle():
        st, res = h.settle_challenge(pid, preimage=preimage, method="crypto")
        statuses.append(st)
        if "token" in res:
            tokens.append(res["token"])
            
    threads = [threading.Thread(target=try_settle) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=3.0)
        
    all_200 = all(s == 200 for s in statuses)
    record("concurrent_settlement_thread_safety", len(statuses) == 10 and all_200, f"Settled {len(statuses)}/10 concurrently, all 200: {all_200}")


def test_extreme_amounts_and_fuzz():
    print("\n--- Running Challenge: Extreme Amounts & Fuzzing ---")
    
    # Zero amount
    c_zero = h.create_challenge(resource="/api/zero", amount=0)
    record("zero_amount_creation", c_zero["amount"] == 0)
    
    # Massive amount (1 Trillion Sats)
    c_huge = h.create_challenge(resource="/api/huge", amount=10**12)
    record("huge_amount_creation", c_huge["amount"] == 10**12)
    
    # Negative amount - should this be prevented?
    c_neg = h.create_challenge(resource="/api/neg", amount=-500)
    record("negative_amount_observation", True, f"Negative amount created as {c_neg['amount']}")


def test_malformed_auth_headers():
    print("\n--- Running Challenge: Malformed Authorization Headers ---")
    
    # Empty header
    ok, _ = h.verify_request_auth({"Authorization": ""}, "/api/protected")
    record("empty_auth_header", not ok)
    
    # Incomplete L402
    ok, _ = h.verify_request_auth({"Authorization": "L402"}, "/api/protected")
    record("incomplete_l402_header", not ok)
    
    # Missing preimage colon
    ok, _ = h.verify_request_auth({"Authorization": "L402 just_a_token_no_colon"}, "/api/protected")
    record("missing_colon_in_l402", not ok)
    
    # Corrupt base64 in macaroon
    ok, _ = h.verify_request_auth({"Authorization": "L402 not_base64!!!:001122"}, "/api/protected")
    record("corrupt_base64_macaroon", not ok)
    
    # Incomplete Bearer
    ok, _ = h.verify_request_auth({"Authorization": "Bearer"}, "/api/protected")
    record("incomplete_bearer", not ok)
    
    # Tampered Bearer token signature
    challenge = h.create_challenge(resource="/api/test", amount=100)
    _, s_res = h.settle_challenge(challenge["payment_id"], method="demo")
    token = s_res["token"]
    parts = token.split(".")
    tampered_token = f"{parts[0]}.{parts[1]}.badhexsignature12345"
    ok, _ = h.verify_request_auth({"Authorization": f"Bearer {tampered_token}"}, "/api/test")
    record("tampered_bearer_token_rejected", not ok)


def main():
    print("=" * 70)
    print("  EMPIRICAL CHALLENGER: Milestone 1 Adversarial Fuzzing & Stress Suite")
    print("=" * 70)
    
    test_tampered_payment_hash_in_macaroon()
    test_tampered_caveats()
    test_tampered_macaroon_signature()
    test_bad_preimages()
    test_scope_mismatches_and_traversal()
    test_token_expiration()
    test_replay_and_double_settle()
    test_concurrent_settlement_race()
    test_extreme_amounts_and_fuzz()
    test_malformed_auth_headers()
    
    print("\n" + "=" * 70)
    failed = [r for r in results if not r["passed"]]
    passed = [r for r in results if r["passed"]]
    print(f"RESULTS: {len(passed)} PASSED, {len(failed)} FAILED")
    print("=" * 70)
    
    if failed:
        print("\nCRITICAL FAILURES DETECTED:")
        for f in failed:
            print(f"  - {f['name']}: {f['details']}")
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
