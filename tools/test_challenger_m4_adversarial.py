#!/usr/bin/env python3
"""
Good Faith Paradigm WebXR — Milestone 4 Adversarial Stress & Vulnerability Probing Harness
Author: challenger_m4_1 (EMPIRICAL CHALLENGER)

Adversarial Stress Dimensions:
1. Replay attacks on settlement invoices (/api/402/settle) - single replay, cross-method, and concurrent race
2. Macaroon cryptographic tampering (signature forgery, identifier, payment_hash, expiration, resource escalation)
3. Rarible NFT cart boundary probes (negative qty, zero qty, fractional qty, type confusion, unknown token, checkout empty)
4. Wishing Well credit race conditions & 0-balance stress (high concurrency 0-balance, 1-wish race, negative deposit)
5. Multi-tier subscription expiration & privilege escalation (invalid tier injection, simulated expiry, clock skew resilience)
6. State isolation across clients and reference repo immutability
"""

import concurrent.futures
import hashlib
import hmac
import io
import json
import os
import secrets
import sys
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)

import serve
import backend.http402 as http402

BASE_URL = "http://127.0.0.1:8080"


class MockSocket:
    def __init__(self, req_bytes: bytes):
        self._r = io.BytesIO(req_bytes)
        self._w = io.BytesIO()

    def makefile(self, mode: str, *args, **kwargs):
        if "r" in mode:
            return self._r
        return self._w

    def sendall(self, data: bytes):
        self._w.write(data)


class AdversarialClient:
    def __init__(self, base_url: str = BASE_URL, client_id: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id or f"adv_{secrets.token_hex(4)}"
        self.use_direct = False

    def request(
        self,
        method: str,
        path: str,
        body: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        client_id: Optional[str] = None,
        timeout: float = 6.0,
    ) -> Tuple[int, Dict[str, str], bytes]:
        req_headers = {
            "User-Agent": "GFP-Adversarial-Challenger/1.0",
            "Accept": "application/json, */*",
            "Connection": "close",
        }
        cid = client_id or self.client_id
        if cid:
            req_headers["X-Client-ID"] = cid
        if headers:
            req_headers.update(headers)

        data_bytes = b""
        if body is not None:
            if isinstance(body, (dict, list)):
                data_bytes = json.dumps(body).encode("utf-8")
                if "Content-Type" not in req_headers:
                    req_headers["Content-Type"] = "application/json; charset=utf-8"
            elif isinstance(body, str):
                data_bytes = body.encode("utf-8")
            elif isinstance(body, bytes):
                data_bytes = body

        if not self.use_direct:
            url = f"{self.base_url}{path}"
            req = urllib.request.Request(url, data=data_bytes if data_bytes else None, headers=req_headers, method=method.upper())
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    resp_headers = {k: v for k, v in resp.headers.items()}
                    return resp.status, resp_headers, resp.read()
            except urllib.error.HTTPError as err:
                err_headers = {k: v for k, v in err.headers.items()}
                return err.code, err_headers, err.read()
            except Exception as exc:
                err_str = str(exc)
                if "10013" in err_str or "refused" in err_str.lower() or "unreachable" in err_str.lower():
                    self.use_direct = True
                else:
                    raise

        # Direct in-process fallback
        import serve
        cwd = os.getcwd()
        try:
            os.chdir(WORKSPACE_DIR)
            req_lines = [f"{method.upper()} {path} HTTP/1.1", "Host: localhost"]
            for k, v in req_headers.items():
                req_lines.append(f"{k}: {v}")
            if data_bytes:
                req_lines.append(f"Content-Length: {len(data_bytes)}")
            req_data = "\r\n".join(req_lines).encode("utf-8") + b"\r\n\r\n" + data_bytes

            sock = MockSocket(req_data)
            h = serve.Handler(sock, ("127.0.0.1", 8080), None)
            raw_output = sock._w.getvalue()
            hdr_part, _, body_part = raw_output.partition(b"\r\n\r\n")
            lines = hdr_part.split(b"\r\n")
            if not lines or not lines[0]:
                return 500, {}, b""
            status_line = lines[0].decode("utf-8", errors="replace")
            status_code = int(status_line.split()[1])
            resp_headers = {}
            for line in lines[1:]:
                if b":" in line:
                    k, v = line.split(b":", 1)
                    resp_headers[k.decode("utf-8", errors="replace").strip()] = v.decode("utf-8", errors="replace").strip()
            return status_code, resp_headers, body_part
        finally:
            os.chdir(cwd)

    def get_json(self, path: str, headers: Optional[Dict[str, str]] = None, client_id: Optional[str] = None) -> Tuple[int, Dict[str, str], Any]:
        status, hdrs, raw = self.request("GET", path, headers=headers, client_id=client_id)
        try:
            parsed = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            parsed = {"raw": raw.decode("utf-8", errors="replace")}
        return status, hdrs, parsed

    def post_json(self, path: str, body: Optional[Any] = None, headers: Optional[Dict[str, str]] = None, client_id: Optional[str] = None) -> Tuple[int, Dict[str, str], Any]:
        status, hdrs, raw = self.request("POST", path, body=body, headers=headers, client_id=client_id)
        try:
            parsed = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            parsed = {"raw": raw.decode("utf-8", errors="replace")}
        return status, hdrs, parsed


passed_probes = 0
failed_probes = 0
probe_results: List[Dict[str, Any]] = []


def record_probe(name: str, passed: bool, detail: str = ""):
    global passed_probes, failed_probes
    status_str = "[PASS]" if passed else "[FAIL]"
    if passed:
        passed_probes += 1
    else:
        failed_probes += 1
    print(f"  {status_str} {name}: {detail}")
    probe_results.append({"name": name, "passed": passed, "detail": detail})


# ==============================================================================
# PROBE SUITE 1: Settlement Invoices & Replay Attacks
# ==============================================================================
def run_probe_suite_1():
    print("\n--- SUITE 1: Replay Attacks on Settlement Invoices (/api/402/settle) ---")
    client = AdversarialClient(client_id=f"replay_{secrets.token_hex(4)}")

    # 1.1 Non-existent challenge settlement
    st, hdrs, data = client.post_json("/api/402/settle", {"payment_id": "ch_nonexistent_999999", "method": "demo"})
    record_probe(
        "P1.1 Non-existent challenge settlement",
        st == 404 and data.get("error") == "challenge_not_found",
        f"Status {st}, error={data.get('error')}",
    )

    # 1.2 Missing payment_id in settlement
    st, hdrs, data = client.post_json("/api/402/settle", {"preimage": "00" * 32, "method": "demo"})
    record_probe(
        "P1.2 Missing payment_id in settlement",
        st == 400 and data.get("error") == "missing_payment_id",
        f"Status {st}, error={data.get('error')}",
    )

    # 1.3 Cryptographic preimage mismatch
    # Create challenge
    st_ch, _, ch_data = client.post_json("/api/402/challenge", {"resource": "/api/protected/test-replay", "amount": 1000})
    pay_id = ch_data["payment_id"]
    wrong_preimage = "aa" * 32
    st, _, data = client.post_json("/api/402/settle", {"payment_id": pay_id, "preimage": wrong_preimage, "method": "lightning"})
    record_probe(
        "P1.3 Cryptographic preimage mismatch rejection",
        st == 400 and data.get("error") == "invalid_preimage",
        f"Status {st}, error={data.get('error')}",
    )

    # 1.4 Valid settlement initial execution
    # Settle with demo faucet
    st_s1, _, data_s1 = client.post_json("/api/402/settle", {"payment_id": pay_id, "method": "demo"})
    tok1 = data_s1.get("token")
    record_probe(
        "P1.4 Initial valid challenge settlement",
        st_s1 == 200 and bool(tok1),
        f"Status {st_s1}, token prefix={tok1[:20] if tok1 else None}",
    )

    # 1.5 Replay settlement with exact same payment_id (idempotency check)
    st_s2, _, data_s2 = client.post_json("/api/402/settle", {"payment_id": pay_id, "method": "demo"})
    tok2 = data_s2.get("token")
    record_probe(
        "P1.5 Replay settlement idempotency (same token, no crash)",
        st_s2 == 200 and tok1 == tok2,
        f"Status {st_s2}, tokens match={tok1 == tok2}",
    )

    # 1.6 Replay attack on Medallion Credits allocation
    # User creates medallion purchase challenge (500 credits)
    user_cid = f"credit_replay_{secrets.token_hex(4)}"
    u_client = AdversarialClient(client_id=user_cid)
    st_p, _, p_data = u_client.post_json("/api/credits/purchase", {"medallion": "gold", "quantity": 1})
    gold_pid = p_data["payment_id"]

    # Initial balance should be 0
    _, _, bal0 = u_client.get_json("/api/credits/balance")
    initial_credits = bal0.get("credit_balance", 0)

    # Settle once -> balance should increase by 500
    st_g1, _, _ = u_client.post_json("/api/402/settle", {"payment_id": gold_pid, "method": "demo"})
    _, _, bal1 = u_client.get_json("/api/credits/balance")
    credits_after_s1 = bal1.get("credit_balance", 0)

    # Replay settle 5 times sequentially
    for _ in range(5):
        u_client.post_json("/api/402/settle", {"payment_id": gold_pid, "method": "demo"})

    _, _, bal2 = u_client.get_json("/api/credits/balance")
    credits_after_replays = bal2.get("credit_balance", 0)

    record_probe(
        "P1.6 Replay settle on credit purchase does NOT double-allocate",
        initial_credits == 0 and credits_after_s1 == 500 and credits_after_replays == 500,
        f"Initial={initial_credits}, S1={credits_after_s1}, Replays={credits_after_replays}",
    )

    # 1.7 Concurrent settlement replay race (15 concurrent threads settling same fresh challenge)
    race_cid = f"race_replay_{secrets.token_hex(4)}"
    r_client = AdversarialClient(client_id=race_cid)
    st_race_ch, _, race_ch_data = r_client.post_json("/api/credits/purchase", {"medallion": "silver", "quantity": 1})
    silver_pid = race_ch_data["payment_id"]

    def _settle_worker():
        c = AdversarialClient(client_id=race_cid)
        return c.post_json("/api/402/settle", {"payment_id": silver_pid, "method": "demo"})

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_settle_worker) for _ in range(15)]
        results = [f.result() for f in futures]

    all_200 = all(r[0] == 200 for r in results)
    _, _, bal_race = r_client.get_json("/api/credits/balance")
    race_balance = bal_race.get("credit_balance", 0)

    record_probe(
        "P1.7 Concurrent settlement race condition safety (silver = 100 credits)",
        all_200 and race_balance == 100,
        f"All 200={all_200}, balance={race_balance} (expected 100, no double spend)",
    )


# ==============================================================================
# PROBE SUITE 2: Macaroon Tampering & Cryptographic Caveats
# ==============================================================================
def run_probe_suite_2():
    print("\n--- SUITE 2: Macaroon Tampering, Caveats & Cryptographic Signature Forgery ---")
    client = AdversarialClient(client_id=f"mac_tamper_{secrets.token_hex(4)}")

    # Create fresh challenge to obtain authentic signed macaroon
    target_res = "/api/protected/exclusive-skyport-deck"
    st_ch, _, ch_data = client.post_json("/api/402/challenge", {"resource": target_res, "amount": 1000})
    valid_mac_b64 = ch_data["macaroon"]
    pay_id = ch_data["payment_id"]
    st_settle, _, settle_d = client.post_json("/api/402/settle", {"payment_id": pay_id, "method": "demo"})
    valid_preimage = settle_d["preimage"]

    # 2.1 Bit-flip tamper on macaroon signature hex
    raw_json = http402._b64_url_decode(valid_mac_b64).decode("utf-8")
    mac_dict = json.loads(raw_json)
    orig_sig = mac_dict["signature"]
    # Invert last hex char
    tampered_sig = orig_sig[:-1] + ("0" if orig_sig[-1] != "0" else "1")
    tampered_dict = {**mac_dict, "signature": tampered_sig}
    tampered_b64 = http402._b64_url_encode(json.dumps(tampered_dict).encode("utf-8"))

    auth_header = {"Authorization": f"L402 {tampered_b64}:{valid_preimage}"}
    st, _, _ = client.get_json(target_res, headers=auth_header)
    record_probe(
        "P2.1 Forged macaroon signature rejected",
        st == 402,
        f"Status {st} (expected 402 rejection)",
    )

    # 2.2 Identifier tampering
    tampered_id_dict = {**mac_dict, "identifier": "ch_attacker_takeover"}
    tampered_id_b64 = http402._b64_url_encode(json.dumps(tampered_id_dict).encode("utf-8"))
    st, _, _ = client.get_json(target_res, headers={"Authorization": f"L402 {tampered_id_b64}:{valid_preimage}"})
    record_probe(
        "P2.2 Altered macaroon identifier rejected",
        st == 402,
        f"Status {st} (expected 402 rejection)",
    )

    # 2.3 Payment hash tampering
    fake_preimage = "bb" * 32
    fake_hash = hashlib.sha256(bytes.fromhex(fake_preimage)).hexdigest()
    tampered_hash_dict = {**mac_dict, "payment_hash": fake_hash}
    tampered_hash_b64 = http402._b64_url_encode(json.dumps(tampered_hash_dict).encode("utf-8"))
    st, _, _ = client.get_json(target_res, headers={"Authorization": f"L402 {tampered_hash_b64}:{fake_preimage}"})
    record_probe(
        "P2.3 Tampered payment_hash rejected",
        st == 402,
        f"Status {st} (expected 402 rejection)",
    )

    # 2.4 Expiration caveat extension attempt
    tampered_caveats = [c for c in mac_dict.get("caveats", []) if not c.startswith("expires=")]
    tampered_caveats.append("expires=9999999999")
    tampered_exp_dict = {**mac_dict, "caveats": tampered_caveats}
    tampered_exp_b64 = http402._b64_url_encode(json.dumps(tampered_exp_dict).encode("utf-8"))
    st, _, _ = client.get_json(target_res, headers={"Authorization": f"L402 {tampered_exp_b64}:{valid_preimage}"})
    record_probe(
        "P2.4 Unsigned caveat modification (expiration extension) rejected",
        st == 402,
        f"Status {st} (expected 402 rejection)",
    )

    # 2.5 Resource scope escalation (scoping to wildcard * without resigning)
    tampered_res_caveats = [c for c in mac_dict.get("caveats", []) if not c.startswith("resource=")]
    tampered_res_caveats.append("resource=*")
    tampered_res_dict = {**mac_dict, "caveats": tampered_res_caveats}
    tampered_res_b64 = http402._b64_url_encode(json.dumps(tampered_res_dict).encode("utf-8"))
    st, _, _ = client.get_json(target_res, headers={"Authorization": f"L402 {tampered_res_b64}:{valid_preimage}"})
    record_probe(
        "P2.5 Unsigned resource escalation rejected",
        st == 402,
        f"Status {st} (expected 402 rejection)",
    )

    # 2.6 Valid macaroon presented with wrong preimage
    wrong_preimage = "33" * 32
    st, _, _ = client.get_json(target_res, headers={"Authorization": f"L402 {valid_mac_b64}:{wrong_preimage}"})
    record_probe(
        "P2.6 Valid macaroon with mismatched preimage rejected",
        st == 402,
        f"Status {st} (expected 402 rejection)",
    )

    # 2.7 Malformed / garbage macaroon string handling
    garbage_cases = [
        "L402 not_even_base64:preimage",
        "L402 e30=:preimage",  # base64 of "{}" missing fields
        "L402 :",
        "L402 null",
    ]
    all_graceful = True
    for g in garbage_cases:
        st, _, _ = client.get_json(target_res, headers={"Authorization": g})
        if st == 500:
            all_graceful = False
    record_probe(
        "P2.7 Garbage L402 Authorization strings handled without 500 crash",
        all_graceful,
        f"All 402/safe responses={all_graceful}",
    )


# ==============================================================================
# PROBE SUITE 3: Rarible NFT Cart Boundary & Injection Attacks
# ==============================================================================
def run_probe_suite_3():
    print("\n--- SUITE 3: Rarible NFT Cart Boundary, Fractional & Injection Attacks ---")
    client = AdversarialClient(client_id=f"cart_adv_{secrets.token_hex(4)}")

    # 3.1 Negative quantity
    st, _, d = client.post_json("/api/cart/items", {"item_id": "492856", "quantity": -5})
    record_probe(
        "P3.1 Negative quantity rejected in cart add",
        st == 400 and d.get("error") == "invalid_quantity",
        f"Status {st}, error={d.get('error')}",
    )

    # 3.2 Zero quantity
    st, _, d = client.post_json("/api/cart/items", {"item_id": "492856", "quantity": 0})
    record_probe(
        "P3.2 Zero quantity rejected in cart add",
        st == 400 and d.get("error") == "invalid_quantity",
        f"Status {st}, error={d.get('error')}",
    )

    # 3.3 Fractional quantity
    st, _, d = client.post_json("/api/cart/items", {"item_id": "492856", "quantity": 1.5})
    record_probe(
        "P3.3 Fractional quantity rejected in cart add",
        st == 400 and d.get("error") == "invalid_quantity",
        f"Status {st}, error={d.get('error')}",
    )

    # 3.4 Non-numeric / string injection quantity
    st, _, d = client.post_json("/api/cart/items", {"item_id": "492856", "quantity": "two"})
    record_probe(
        "P3.4 Non-numeric string quantity rejected",
        st == 400,
        f"Status {st}, message={d.get('message')}",
    )

    # 3.5 Unknown token ID
    st, _, d = client.post_json("/api/cart/items", {"item_id": "999999", "quantity": 1})
    record_probe(
        "P3.5 Unknown token ID rejected",
        st == 400 and d.get("error") == "invalid_token_id",
        f"Status {st}, error={d.get('error')}",
    )

    # 3.6 Empty string token ID
    st, _, d = client.post_json("/api/cart/items", {"item_id": "", "quantity": 1})
    record_probe(
        "P3.6 Empty token ID rejected",
        st == 400 and d.get("error") == "invalid_token_id",
        f"Status {st}, error={d.get('error')}",
    )

    # 3.7 Empty cart checkout
    st, _, d = client.post_json("/api/cart/checkout", {})
    record_probe(
        "P3.7 Empty cart checkout rejected with 400",
        st == 400 and d.get("error") == "empty_cart",
        f"Status {st}, error={d.get('error')}",
    )

    # 3.8 Dual-harp synergy calculation & exact pricing fidelity
    # Add 1 Yellow (#492856) and 1 Green (#490643)
    client.post_json("/api/cart/items", {"item_id": "492856", "quantity": 1})
    st_c, _, cart_d = client.post_json("/api/cart/items", {"item_id": "490643", "quantity": 1})
    is_synergy = cart_d.get("dual_harp_synergy") is True
    # Yellow = 1 entry, Green = 1 entry, Synergy = +1 entry -> Total raffle entries = 3
    entries = cart_d.get("raffle_entries")
    subtotal_usd = cart_d.get("subtotal_usd")
    subtotal_sats = cart_d.get("subtotal_sats")
    record_probe(
        "P3.8 Dual Harp synergy bonus and subtotal calculation",
        is_synergy and entries == 3 and subtotal_usd == 40.00 and subtotal_sats == 40000,
        f"Synergy={is_synergy}, entries={entries} (expected 3), total=${subtotal_usd} (expected $40.00)",
    )

    # 3.9 Checkout generates exact 402 challenge matching basket total
    st_chk, hdrs, chk_d = client.post_json("/api/cart/checkout", {})
    challenge_amount = chk_d.get("amount")
    challenge_usd = chk_d.get("amount_usd")
    record_probe(
        "P3.9 Cart checkout 402 challenge matches exact cart total",
        st_chk == 402 and challenge_amount == 40000 and challenge_usd == 40.00,
        f"Status {st_chk}, amount={challenge_amount} SATS, amount_usd={challenge_usd}",
    )

    # 3.10 Settle and verify cart is cleared upon confirmed order
    chk_pid = chk_d["payment_id"]
    st_settle, _, settle_d = client.post_json("/api/402/settle", {"payment_id": chk_pid, "method": "demo"})
    pay_tok = settle_d["token"]
    st_ord, _, ord_d = client.post_json("/api/cart/checkout", {}, headers={"Authorization": f"Bearer {pay_tok}"})
    order_success = ord_d.get("success") is True and bool(ord_d.get("order_id"))

    # Verify cart is now empty
    st_emp, _, emp_cart = client.get_json("/api/cart")
    cart_cleared = emp_cart.get("total_items") == 0

    record_probe(
        "P3.10 Settled cart checkout returns confirmed order and clears cart",
        st_ord == 200 and order_success and cart_cleared,
        f"Order status {st_ord}, order_id={ord_d.get('order_id')}, cart items after={emp_cart.get('total_items')}",
    )


# ==============================================================================
# PROBE SUITE 4: Wishing Well Concurrency & Zero-Balance Toss Stress
# ==============================================================================
def run_probe_suite_4():
    print("\n--- SUITE 4: Wishing Well Concurrency, 0-Balance Toss & Negative Balance Probes ---")
    zero_cid = f"zero_well_{secrets.token_hex(4)}"
    client = AdversarialClient(client_id=zero_cid)

    # 4.1 Single toss with zero balance
    st, _, d = client.post_json("/api/credits/toss", {"wishes": 1})
    record_probe(
        "P4.1 Single wish toss with 0 balance rejected",
        st == 400 and d.get("error") == "insufficient_credits",
        f"Status {st}, error={d.get('error')}",
    )

    # 4.2 Massive concurrent toss attack on 0-balance account (30 concurrent requests)
    def _toss_zero_worker():
        c = AdversarialClient(client_id=zero_cid)
        return c.post_json("/api/credits/toss", {"wishes": 1})

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_toss_zero_worker) for _ in range(30)]
        results = [f.result() for f in futures]

    all_rejected = all(r[0] == 400 and r[2].get("error") == "insufficient_credits" for r in results)
    _, _, bal = client.get_json("/api/credits/balance")
    final_balance = bal.get("credit_balance", 0)
    wishes_tossed = bal.get("wishes_tossed", 0)

    record_probe(
        "P4.2 30 concurrent toss requests on 0-balance rejected with 0 underflow",
        all_rejected and final_balance == 0 and wishes_tossed == 0,
        f"All rejected={all_rejected}, final_balance={final_balance}, tossed={wishes_tossed}",
    )

    # 4.3 Race condition on exactly 1 wish (5 credits) with 20 concurrent threads
    one_cid = f"one_wish_{secrets.token_hex(4)}"
    one_client = AdversarialClient(client_id=one_cid)

    # Purchase exactly 1 Copper medallion = 25 credits = 5 wishes
    # Let's test with 25 credits: exactly 5 wishes. We fire 20 concurrent requests for 1 wish each.
    st_pur, _, pur_d = one_client.post_json("/api/credits/purchase", {"medallion": "copper", "quantity": 1})
    one_client.post_json("/api/402/settle", {"payment_id": pur_d["payment_id"], "method": "demo"})

    # Verify balance is 25
    _, _, b_init = one_client.get_json("/api/credits/balance")
    assert b_init.get("credit_balance") == 25, f"Unexpected balance {b_init}"

    def _toss_one_worker():
        c = AdversarialClient(client_id=one_cid)
        return c.post_json("/api/credits/toss", {"wishes": 1})

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_toss_one_worker) for _ in range(20)]
        toss_results = [f.result() for f in futures]

    succeeded = sum(1 for r in toss_results if r[0] == 200)
    failed = sum(1 for r in toss_results if r[0] == 400)
    _, _, b_final = one_client.get_json("/api/credits/balance")
    final_bal_one = b_final.get("credit_balance", -1)

    record_probe(
        "P4.3 Concurrency race on 25 credits: exactly 5 succeed, 15 fail, balance=0",
        succeeded == 5 and failed == 15 and final_bal_one == 0,
        f"Succeeded={succeeded} (expected 5), Failed={failed} (expected 15), Final balance={final_bal_one}",
    )

    # 4.4 Boundary inputs to /api/credits/toss
    bad_wishes = [0, -1, -100]
    all_bad_rejected = True
    for w in bad_wishes:
        st_bad, _, _ = one_client.post_json("/api/credits/toss", {"wishes": w})
        if st_bad != 400:
            all_bad_rejected = False
    record_probe(
        "P4.4 Negative and zero wish counts rejected with 400",
        all_bad_rejected,
        f"All rejected={all_bad_rejected}",
    )

    # 4.5 Boundary inputs to /api/credits/purchase
    st_neg, _, _ = one_client.post_json("/api/credits/purchase", {"medallion": "gold", "quantity": -1})
    st_frac, _, _ = one_client.post_json("/api/credits/purchase", {"medallion": "gold", "quantity": 1.5})
    st_unk, _, _ = one_client.post_json("/api/credits/purchase", {"medallion": "unobtainium", "quantity": 1})
    record_probe(
        "P4.5 Negative, fractional and unknown medallion purchases rejected",
        st_neg == 400 and st_frac == 400 and st_unk == 400,
        f"Negative status={st_neg}, Fractional={st_frac}, Unknown={st_unk}",
    )


# ==============================================================================
# PROBE SUITE 5: Subscription Expiration, Timestamp Skew & Privilege Escalation
# ==============================================================================
def run_probe_suite_5():
    print("\n--- SUITE 5: Subscription Expiration Edge Cases & Privilege Escalation ---")
    sub_cid = f"sub_probe_{secrets.token_hex(4)}"
    client = AdversarialClient(client_id=sub_cid)

    # 5.1 Baseline state is Free
    st, _, sub_d = client.get_json("/api/subscriptions/status")
    record_probe(
        "P5.1 Initial subscription is Free ('Pilgrim')",
        st == 200 and sub_d.get("tier") == "free",
        f"Tier={sub_d.get('tier')}, Name={sub_d.get('name')}",
    )

    # 5.2 Gated VIP content returns 402 for Free tier
    gated_res = "/api/subscription/gated-content/executive-pitch"
    st_gated_free, _, _ = client.get_json(gated_res)
    record_probe(
        "P5.2 Free tier user blocked from VIP content with 402",
        st_gated_free == 402,
        f"Status {st_gated_free}",
    )

    bad_tiers = ["admin", "root", "paid_bypass", "freemium_forever"]
    all_invalid_rejected = True
    tier_details = []
    for bt in bad_tiers:
        st_inv, _, inv_d = client.post_json("/api/subscriptions/upgrade", {"target_tier": bt})
        tier_details.append(f"{bt!r}:{st_inv}")
        if st_inv != 400:
            all_invalid_rejected = False

    # Also test empty tier behavior: defaults to paid upgrade challenge (402)
    st_empty, _, empty_d = client.post_json("/api/subscriptions/upgrade", {"target_tier": ""})
    tier_details.append(f"'':{st_empty}")
    empty_handled_safely = st_empty in (400, 402)

    record_probe(
        "P5.3 Injection of invalid tier names rejected with 400 & empty tier defaults to 402",
        all_invalid_rejected and empty_handled_safely,
        f"Details={', '.join(tier_details)}",
    )

    # 5.4 Activate Freemium VIP trial
    st_free, _, free_d = client.post_json("/api/subscriptions/upgrade", {"target_tier": "freemium"})
    exp_ts = free_d.get("expires_at")
    now_ts = int(time.time())
    exp_diff = exp_ts - now_ts if exp_ts else 0
    # Trial duration is 86400 seconds (24h)
    record_probe(
        "P5.4 Freemium VIP trial activation with 24h expiration timestamp",
        st_free == 200 and free_d.get("tier") == "freemium" and 86350 <= exp_diff <= 86450,
        f"Tier={free_d.get('tier')}, expires in {exp_diff}s (expected ~86400s)",
    )

    # 5.5 Gated content accessible during active trial
    st_gated_trial, _, gated_trial_d = client.get_json(gated_res)
    record_probe(
        "P5.5 VIP content unlocked during active Freemium trial (200 OK)",
        st_gated_trial == 200 and gated_trial_d.get("unlocked") is True,
        f"Status {st_gated_trial}, unlocked={gated_trial_d.get('unlocked')}",
    )

    # 5.6 Simulate trial expiration (past timestamp)
    st_sim, _, sim_d = client.post_json("/api/subscription/simulate-expiration", {})
    record_probe(
        "P5.6 Subscription trial expiration simulated",
        st_sim == 200 and sim_d.get("expired") is True or sim_d.get("tier") == "free",
        f"Status {st_sim}, tier={sim_d.get('tier')}, active={sim_d.get('active')}",
    )

    # 5.7 Gated content immediately re-locks with 402 once expired
    st_gated_exp, _, _ = client.get_json(gated_res)
    record_probe(
        "P5.7 Gated VIP content re-locks with 402 upon trial expiration",
        st_gated_exp == 402,
        f"Status {st_gated_exp} (expected 402)",
    )

    # 5.8 Unauthenticated Paid upgrade returns 402 challenge
    st_paid_up, _, paid_up_d = client.post_json("/api/subscriptions/upgrade", {"target_tier": "paid"})
    record_probe(
        "P5.8 Paid tier upgrade prompts HTTP 402 challenge ($19.99 / 20000 SATS)",
        st_paid_up == 402 and paid_up_d.get("amount") == 20000 and paid_up_d.get("amount_usd") == 19.99,
        f"Status {st_paid_up}, amount={paid_up_d.get('amount')}, amount_usd={paid_up_d.get('amount_usd')}",
    )

    # 5.9 Settle paid upgrade via 402 settlement
    paid_pid = paid_up_d["payment_id"]
    st_paid_settle, _, paid_settle_d = client.post_json("/api/402/settle", {"payment_id": paid_pid, "method": "demo"})
    paid_tok = paid_settle_d["token"]

    # Verify status is now paid and permanent
    st_st_paid, _, st_paid_d = client.get_json("/api/subscriptions/status", headers={"Authorization": f"Bearer {paid_tok}"})
    is_paid_tier = st_paid_d.get("tier") == "paid" and st_paid_d.get("expires_at") is None
    record_probe(
        "P5.9 Settled Paid tier upgrade unlocks permanent VIP access",
        st_st_paid == 200 and is_paid_tier,
        f"Status {st_st_paid}, tier={st_paid_d.get('tier')}, expires_at={st_paid_d.get('expires_at')}",
    )

    # 5.10 Gated content now accessible without payment challenge
    st_gated_paid, _, _ = client.get_json(gated_res, headers={"Authorization": f"Bearer {paid_tok}"})
    record_probe(
        "P5.10 Gated VIP content accessible with settled Paid authorization",
        st_gated_paid == 200,
        f"Status {st_gated_paid} (expected 200)",
    )


# ==============================================================================
# PROBE SUITE 6: Cross-Client State Isolation & Security Fuzzing
# ==============================================================================
def run_probe_suite_6():
    print("\n--- SUITE 6: Cross-Client Isolation, Path Traversal & Protocol Fuzzing ---")
    c_alice = AdversarialClient(client_id=f"alice_{secrets.token_hex(4)}")
    c_bob = AdversarialClient(client_id=f"bob_{secrets.token_hex(4)}")

    # 6.1 Cart isolation
    c_alice.post_json("/api/cart/items", {"item_id": "492856", "quantity": 3})
    _, _, bob_cart = c_bob.get_json("/api/cart")
    record_probe(
        "P6.1 Shopping cart isolated across distinct client sessions",
        bob_cart.get("total_items") == 0,
        f"Bob cart items={bob_cart.get('total_items')} (expected 0)",
    )

    # 6.2 Credit balance isolation
    st_p, _, p_d = c_alice.post_json("/api/credits/purchase", {"medallion": "gold", "quantity": 1})
    c_alice.post_json("/api/402/settle", {"payment_id": p_d["payment_id"], "method": "demo"})
    _, _, alice_bal = c_alice.get_json("/api/credits/balance")
    _, _, bob_bal = c_bob.get_json("/api/credits/balance")
    record_probe(
        "P6.2 Credit balances strictly isolated between Alice and Bob",
        alice_bal.get("credit_balance") == 500 and bob_bal.get("credit_balance") == 0,
        f"Alice={alice_bal.get('credit_balance')}, Bob={bob_bal.get('credit_balance')}",
    )

    # 6.3 Directory traversal attempt on static endpoint
    traversal_paths = [
        "/../../../../../../Windows/win.ini",
        "/..%2f..%2f..%2fWindows%2fwin.ini",
        "/../vr-club-gparadigm/index.html",
        "/..%2fvr-club-gparadigm%2findex.html",
    ]
    all_traversals_blocked = True
    tp_details = []
    for tp in traversal_paths:
        st, _, body = c_alice.request("GET", tp)
        tp_details.append(f"{tp}:{st}")
        # External escape is blocked if it doesn't return 200 or doesn't leak file contents
        if st == 200 and (b"[fonts]" in body or b"vr-club" in body):
            all_traversals_blocked = False
    record_probe(
        "P6.3 External directory traversal attacks safely confined",
        all_traversals_blocked,
        f"Details={', '.join(tp_details)}",
    )

    # 6.4 HTTP Method restrictions on API endpoints
    # Sending PUT or DELETE to /api/402/settle
    st_put, _, _ = c_alice.request("PUT", "/api/402/settle", body=b"{}")
    st_del, _, _ = c_alice.request("DELETE", "/api/402/settle")
    record_probe(
        "P6.4 Invalid HTTP methods on /api/402/settle safely rejected (404/405/400)",
        st_put in (400, 404, 405) and st_del in (400, 404, 405),
        f"PUT={st_put}, DELETE={st_del}",
    )


def main():
    start_time = time.time()
    print("===========================================================================")
    print("  GOOD FAITH PARADIGM WEBXR — ADVERSARIAL STRESS PROBING HARNESS (M4)")
    print("  Target URL : http://127.0.0.1:8080")
    print("===========================================================================")

    run_probe_suite_1()
    run_probe_suite_2()
    run_probe_suite_3()
    run_probe_suite_4()
    run_probe_suite_5()
    run_probe_suite_6()

    duration = time.time() - start_time
    total = passed_probes + failed_probes
    print("\n===========================================================================")
    print(f"  ADVERSARIAL PROBING SUMMARY: {passed_probes}/{total} Passed, {failed_probes} Failed ({duration:.2f}s)")
    print("===========================================================================")

    if failed_probes > 0:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
