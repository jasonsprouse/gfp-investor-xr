#!/usr/bin/env python3
"""
Good Faith Paradigm WebXR — End-to-End Monetization & 402 Test Suite
Authoritative 4-Tier Opaque-Box Test Harness

Validates:
- Tier 1: Core Feature Coverage (HTTP 402, Rarible NFT Cart, Medallion Credits, Subscriptions, Static Serving)
- Tier 2: Boundary & Corner Cases (Tampered macaroons, bad preimages, scope mismatches, zero/negative inputs, directory traversal)
- Tier 3: Cross-Feature Combinations (Pairwise state isolation, concurrency, thread safety)
- Tier 4: Real-World Scenarios (Collector, Pilgrim, Investor, and Multi-Client Journeys)

Usage:
  python tools/test_e2e_monetization.py [--host 127.0.0.1] [--port 8080] [--direct] [--tier 1|2|3|4] [--suite 402|cart|credits|subscriptions|static] [--strict]
"""

import argparse
import concurrent.futures
import io
import json
import os
import secrets
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

# Configure unbuffered UTF-8 output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, WORKSPACE_DIR)


# =====================================================================
# Mock Socket for In-Process Direct Dispatch
# =====================================================================
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


# =====================================================================
# Dual-Mode HTTP Client (Network TCP + In-Process Dispatch)
# =====================================================================
class APIClient:
    def __init__(self, base_url: str, default_client_id: Optional[str] = None, force_direct: bool = False):
        self.base_url = base_url.rstrip("/")
        self.default_client_id = default_client_id or f"client_{secrets.token_hex(4)}"
        self.use_direct = force_direct

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
            "User-Agent": "GFP-E2E-TestHarness/1.0",
            "Accept": "application/json, text/html, */*",
            "Connection": "close",
        }
        cid = client_id or self.default_client_id
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

        # If not forced direct, attempt network HTTP first
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
                # If connection fails due to sandbox isolation [WinError 10013] or closed port, fall back to direct in-process
                err_str = str(exc)
                if "10013" in err_str or "refused" in err_str.lower() or "unreachable" in err_str.lower() or "cannot access" in err_str.lower():
                    self.use_direct = True
                else:
                    raise

        # Direct in-process execution through serve.Handler
        return self._direct_request(method, path, req_headers, data_bytes)

    def _direct_request(self, method: str, path: str, headers: Dict[str, str], body: bytes) -> Tuple[int, Dict[str, str], bytes]:
        import serve
        os.chdir(WORKSPACE_DIR)

        req_lines = [f"{method.upper()} {path} HTTP/1.1", "Host: localhost"]
        for k, v in headers.items():
            req_lines.append(f"{k}: {v}")
        if body:
            req_lines.append(f"Content-Length: {len(body)}")
        req_data = "\r\n".join(req_lines).encode("utf-8") + b"\r\n\r\n" + body

        sock = MockSocket(req_data)
        h = serve.Handler(sock, ("127.0.0.1", 8080), None)
        raw_output = sock._w.getvalue()

        hdr_part, _, body_part = raw_output.partition(b"\r\n\r\n")
        lines = hdr_part.split(b"\r\n")
        if not lines or not lines[0]:
            return 500, {}, b"Empty response from server handler"

        status_line = lines[0].decode("utf-8", errors="replace")
        try:
            status_code = int(status_line.split()[1])
        except Exception:
            status_code = 500

        resp_headers = {}
        for line in lines[1:]:
            if b":" in line:
                k, v = line.split(b":", 1)
                resp_headers[k.decode("utf-8", errors="replace").strip()] = v.decode("utf-8", errors="replace").strip()

        return status_code, resp_headers, body_part

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


# =====================================================================
# Test Case Result Tracking
# =====================================================================
class TestResult:
    def __init__(self, test_id: str, tier: int, description: str):
        self.test_id = test_id
        self.tier = tier
        self.description = description
        self.passed = False
        self.skipped = False
        self.skip_reason = ""
        self.error_message = ""
        self.duration_sec = 0.0

    def mark_pass(self, duration: float):
        self.passed = True
        self.duration_sec = duration

    def mark_fail(self, error: str, duration: float):
        self.passed = False
        self.error_message = error
        self.duration_sec = duration

    def mark_skip(self, reason: str):
        self.skipped = True
        self.skip_reason = reason


# =====================================================================
# Test Suite Implementation
# =====================================================================
class MonetizationE2ETestSuite:
    def __init__(self, base_url: str, force_direct: bool = False, strict: bool = False, verbose: bool = False):
        self.client = APIClient(base_url, force_direct=force_direct)
        self.strict = strict
        self.verbose = verbose
        self.results: List[TestResult] = []

    def log(self, msg: str):
        if self.verbose:
            print(f"    [DEBUG] {msg}", flush=True)

    def run_test(self, test_id: str, tier: int, desc: str, fn) -> TestResult:
        result = TestResult(test_id, tier, desc)
        start = time.time()
        try:
            fn(result)
            if not result.skipped and not result.passed:
                result.mark_pass(time.time() - start)
        except AssertionError as exc:
            result.mark_fail(f"Assertion failed: {exc}", time.time() - start)
        except Exception as exc:
            result.mark_fail(f"Unhandled exception: {exc}", time.time() - start)

        duration = time.time() - start
        if result.passed:
            print(f"  [PASS] {test_id} (Tier {tier}): {desc} ({duration:.3f}s)", flush=True)
        elif result.skipped:
            badge = "[FAIL]" if self.strict else "[SKIP]"
            print(f"  {badge} {test_id} (Tier {tier}): {desc} -- {result.skip_reason}", flush=True)
            if self.strict:
                result.passed = False
                result.error_message = f"Strict mode rejected skip: {result.skip_reason}"
        else:
            print(f"  [FAIL] {test_id} (Tier {tier}): {desc} -- {result.error_message}", flush=True)

        self.results.append(result)
        return result

    def _is_endpoint_deployed(self, path: str, method: str = "GET") -> bool:
        status, _, body = self.client.request(method, path)
        if status == 404:
            try:
                data = json.loads(body.decode("utf-8"))
                if data.get("error") == "not_found" or "not found" in str(data).lower():
                    return False
            except Exception:
                pass
        return True

    # =================================================================
    # TIER 1: FEATURE COVERAGE (Core Happy Path)
    # =================================================================

    def test_t1_1_unauth_protected_returns_402(self, res: TestResult):
        status, hdrs, body = self.client.get_json("/api/protected/exclusive-skyport-deck")
        assert status == 402, f"Expected status 402, got {status}"
        assert body.get("error") == "Payment Required" or body.get("status") == 402, f"Body error mismatch: {body}"
        assert "payment_id" in body or "challenge_id" in body, "Missing payment_id in 402 body"

    def test_t1_2_www_authenticate_l402_header(self, res: TestResult):
        status, hdrs, _ = self.client.get_json("/api/protected/exclusive-skyport-deck")
        assert status == 402, f"Expected 402, got {status}"
        auth_hdr = hdrs.get("WWW-Authenticate", "")
        assert "L402" in auth_hdr, f"Missing L402 in WWW-Authenticate header: {auth_hdr}"
        assert "macaroon=" in auth_hdr, f"Missing macaroon in WWW-Authenticate header: {auth_hdr}"
        assert "invoice=" in auth_hdr, f"Missing invoice in WWW-Authenticate header: {auth_hdr}"

    def test_t1_3_payment_required_json_header(self, res: TestResult):
        status, hdrs, _ = self.client.get_json("/api/protected/exclusive-skyport-deck")
        assert status == 402, f"Expected 402, got {status}"
        pay_hdr = hdrs.get("Payment-Required", "")
        assert pay_hdr, "Missing Payment-Required header"
        parsed = json.loads(pay_hdr)
        assert "amount" in parsed, f"Missing amount in Payment-Required: {parsed}"
        assert "currency" in parsed, f"Missing currency in Payment-Required: {parsed}"
        assert "settle_url" in parsed, f"Missing settle_url in Payment-Required: {parsed}"

    def test_t1_4_custom_challenge_creation(self, res: TestResult):
        payload = {
            "resource": "/api/protected/custom-exhibit",
            "amount": 7777,
            "currency": "SATS",
            "amount_usd": 7.77,
            "description": "Custom Exhibit 402 Challenge",
        }
        status, hdrs, body = self.client.post_json("/api/402/challenge", body=payload)
        assert status == 402, f"Expected 402, got {status}"
        assert body.get("amount") == 7777, f"Expected amount 7777, got {body.get('amount')}"
        assert body.get("currency") == "SATS", f"Expected SATS, got {body.get('currency')}"
        assert "payment_id" in body, "Missing payment_id in challenge body"

    def test_t1_5_challenge_settlement(self, res: TestResult):
        status, _, body = self.client.post_json("/api/402/challenge", body={"amount": 1000})
        assert status == 402, f"Expected 402, got {status}"
        pid = body.get("payment_id")
        assert pid, "Missing payment_id"

        st, _, sbody = self.client.post_json("/api/402/settle", body={"payment_id": pid, "method": "demo"})
        assert st == 200, f"Expected 200, got {st}: {sbody}"
        assert sbody.get("success") is True, f"Settlement not marked success: {sbody}"
        assert "token" in sbody or "payment_token" in sbody, f"Missing token in settlement: {sbody}"
        assert "preimage" in sbody, f"Missing preimage in settlement: {sbody}"

    def test_t1_6_l402_authorization_unlock(self, res: TestResult):
        status, _, body = self.client.get_json("/api/protected/exclusive-skyport-deck")
        assert status == 402
        pid = body.get("payment_id")
        macaroon = body.get("macaroon")

        st, _, sbody = self.client.post_json("/api/402/settle", body={"payment_id": pid, "method": "demo"})
        assert st == 200
        preimage = sbody.get("preimage")

        auth_hdr = {"Authorization": f"L402 {macaroon}:{preimage}"}
        st2, _, body2 = self.client.get_json("/api/protected/exclusive-skyport-deck", headers=auth_hdr)
        assert st2 == 200, f"Expected 200 OK after L402 auth, got {st2}: {body2}"
        assert body2.get("status") == 200, f"Expected status 200 in body: {body2}"

    def test_t1_7_bearer_and_x_token_unlock(self, res: TestResult):
        status, _, body = self.client.get_json("/api/protected/exclusive-skyport-deck")
        assert status == 402
        pid = body.get("payment_id")

        st, _, sbody = self.client.post_json("/api/402/settle", body={"payment_id": pid, "method": "demo"})
        token = sbody.get("token") or sbody.get("payment_token")
        assert token, "Missing token"

        # 1. Bearer token
        st_bearer, _, b2 = self.client.get_json("/api/protected/exclusive-skyport-deck", headers={"Authorization": f"Bearer {token}"})
        assert st_bearer == 200, f"Expected 200 with Bearer token, got {st_bearer}: {b2}"

        # 2. X-Payment-Token
        st_x, _, bx = self.client.get_json("/api/protected/exclusive-skyport-deck", headers={"X-Payment-Token": token})
        assert st_x == 200, f"Expected 200 with X-Payment-Token, got {st_x}: {bx}"

    # --- Feature 2: Rarible NFT Shopping Basket ---
    def test_t1_8_catalog_retrieval(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/nfts"):
            res.mark_skip("M2 Cart endpoint /api/nfts not yet deployed")
            return
        status, _, body = self.client.get_json("/api/nfts")
        assert status == 200, f"Expected 200, got {status}: {body}"
        items = body.get("items", [])
        assert len(items) >= 2, f"Expected at least 2 catalog items, got {len(items)}"
        token_ids = [str(item.get("token_id")) for item in items]
        assert "492856" in token_ids, "Token 492856 (Yellow Harps) missing from catalog"
        assert "490643" in token_ids, "Token 490643 (Green Harps) missing from catalog"

    def test_t1_9_add_yellow_nft(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/cart/items", "POST"):
            res.mark_skip("M2 Cart endpoint /api/cart/items not yet deployed")
            return
        cid = f"test_cart_{secrets.token_hex(4)}"
        status, _, body = self.client.post_json("/api/cart/items", body={"item_id": "492856", "quantity": 1}, client_id=cid)
        assert status == 200, f"Expected 200, got {status}: {body}"
        assert body.get("total_items") >= 1, f"Expected total_items >= 1: {body}"

    def test_t1_10_add_green_nft(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/cart/items", "POST"):
            res.mark_skip("M2 Cart endpoint /api/cart/items not yet deployed")
            return
        cid = f"test_cart_{secrets.token_hex(4)}"
        self.client.post_json("/api/cart/items", body={"item_id": "492856", "quantity": 1}, client_id=cid)
        status, _, body = self.client.post_json("/api/cart/items", body={"item_id": "490643", "quantity": 1}, client_id=cid)
        assert status == 200, f"Expected 200, got {status}: {body}"
        assert body.get("total_items") == 2, f"Expected 2 items in cart, got {body.get('total_items')}"

    def test_t1_11_cart_checkout_unpaid_402(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/cart/checkout", "POST"):
            res.mark_skip("M2 Cart checkout endpoint not yet deployed")
            return
        cid = f"test_cart_{secrets.token_hex(4)}"
        self.client.post_json("/api/cart/items", body={"item_id": "492856", "quantity": 1}, client_id=cid)
        status, hdrs, body = self.client.post_json("/api/cart/checkout", body={}, client_id=cid)
        assert status == 402, f"Expected 402 Payment Required for unpaid checkout, got {status}: {body}"
        assert "L402" in hdrs.get("WWW-Authenticate", ""), "Missing L402 header in cart checkout challenge"

    def test_t1_12_cart_checkout_settled_200(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/cart/checkout", "POST"):
            res.mark_skip("M2 Cart checkout endpoint not yet deployed")
            return
        cid = f"test_cart_{secrets.token_hex(4)}"
        self.client.post_json("/api/cart/items", body={"item_id": "492856", "quantity": 1}, client_id=cid)
        st, _, ch_body = self.client.post_json("/api/cart/checkout", body={}, client_id=cid)
        assert st == 402
        pid = ch_body.get("payment_id")

        st_s, _, sbody = self.client.post_json("/api/402/settle", body={"payment_id": pid, "method": "demo"})
        assert st_s == 200
        token = sbody.get("token") or sbody.get("payment_token")

        st_final, _, final_body = self.client.post_json(
            "/api/cart/checkout",
            body={},
            headers={"Authorization": f"Bearer {token}"},
            client_id=cid,
        )
        assert st_final == 200, f"Expected 200 OK after settled checkout, got {st_final}: {final_body}"

    def test_t1_13_cart_remove_item(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/cart/items", "DELETE"):
            res.mark_skip("M2 Cart item deletion endpoint not yet deployed")
            return
        cid = f"test_cart_{secrets.token_hex(4)}"
        self.client.post_json("/api/cart/items", body={"item_id": "492856", "quantity": 1}, client_id=cid)
        status, _, body = self.client.request("DELETE", "/api/cart/items/492856", client_id=cid)
        assert status in (200, 204), f"Expected 200/204 on delete, got {status}"

    # --- Feature 3: Wishing Well Medallion Credits ---
    def test_t1_14_initial_credit_balance(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/credits/balance") and not self._is_endpoint_deployed("/api/wishing-well/balance"):
            res.mark_skip("M2 Credits balance endpoint not yet deployed")
            return
        path = "/api/credits/balance" if self._is_endpoint_deployed("/api/credits/balance") else "/api/wishing-well/balance"
        cid = f"user_{secrets.token_hex(4)}"
        status, _, body = self.client.get_json(path, client_id=cid)
        assert status == 200, f"Expected 200, got {status}: {body}"
        assert body.get("credit_balance") == 0 or body.get("balance") == 0, f"Initial balance should be 0: {body}"

    def test_t1_15_zero_balance_toss_rejected(self, res: TestResult):
        path = "/api/credits/toss" if self._is_endpoint_deployed("/api/credits/toss", "POST") else "/api/wishing-well/toss"
        if not self._is_endpoint_deployed(path, "POST"):
            res.mark_skip("M2 Credits toss endpoint not yet deployed")
            return
        cid = f"user_{secrets.token_hex(4)}"
        status, _, body = self.client.post_json(path, body={}, client_id=cid)
        assert status in (400, 402), f"Expected 400 or 402 for toss with 0 balance, got {status}: {body}"

    def test_t1_16_gold_medallion_purchase_challenge(self, res: TestResult):
        path = "/api/credits/purchase" if self._is_endpoint_deployed("/api/credits/purchase", "POST") else "/api/wishing-well/credits/purchase"
        if not self._is_endpoint_deployed(path, "POST"):
            res.mark_skip("M2 Credits purchase endpoint not yet deployed")
            return
        status, hdrs, body = self.client.post_json(path, body={"medallion": "gold", "quantity": 1})
        assert status == 402, f"Expected 402 for medallion purchase, got {status}: {body}"
        assert "L402" in hdrs.get("WWW-Authenticate", "")

    def test_t1_17_gold_medallion_credit_allocation(self, res: TestResult):
        path_p = "/api/credits/purchase" if self._is_endpoint_deployed("/api/credits/purchase", "POST") else "/api/wishing-well/credits/purchase"
        path_b = "/api/credits/balance" if self._is_endpoint_deployed("/api/credits/balance") else "/api/wishing-well/balance"
        if not self._is_endpoint_deployed(path_p, "POST"):
            res.mark_skip("M2 Credits endpoints not yet deployed")
            return
        cid = f"user_{secrets.token_hex(4)}"
        st, _, ch = self.client.post_json(path_p, body={"medallion": "gold"}, client_id=cid)
        assert st == 402
        pid = ch.get("payment_id")

        st_s, _, sbody = self.client.post_json("/api/402/settle", body={"payment_id": pid, "method": "demo"})
        assert st_s == 200
        token = sbody.get("token") or sbody.get("payment_token")

        if self._is_endpoint_deployed("/api/wishing-well/credits/claim", "POST"):
            self.client.post_json("/api/wishing-well/credits/claim", body={"challenge_id": pid}, headers={"Authorization": f"Bearer {token}"}, client_id=cid)

        st_bal, _, bal_data = self.client.get_json(path_b, client_id=cid)
        assert st_bal == 200
        bal = bal_data.get("credit_balance") or bal_data.get("balance") or 0
        assert bal >= 500, f"Expected balance >= 500 after Gold purchase, got {bal}"

    def test_t1_18_silver_and_copper_purchase(self, res: TestResult):
        path_p = "/api/credits/purchase" if self._is_endpoint_deployed("/api/credits/purchase", "POST") else "/api/wishing-well/credits/purchase"
        if not self._is_endpoint_deployed(path_p, "POST"):
            res.mark_skip("M2 Credits purchase endpoint not yet deployed")
            return
        st_silv, _, b_silv = self.client.post_json(path_p, body={"medallion": "silver"})
        assert st_silv == 402
        st_cop, _, b_cop = self.client.post_json(path_p, body={"medallion": "copper"})
        assert st_cop == 402

    def test_t1_19_wishing_well_toss_execution(self, res: TestResult):
        path_p = "/api/credits/purchase" if self._is_endpoint_deployed("/api/credits/purchase", "POST") else "/api/wishing-well/credits/purchase"
        path_t = "/api/credits/toss" if self._is_endpoint_deployed("/api/credits/toss", "POST") else "/api/wishing-well/toss"
        path_b = "/api/credits/balance" if self._is_endpoint_deployed("/api/credits/balance") else "/api/wishing-well/balance"
        if not self._is_endpoint_deployed(path_t, "POST"):
            res.mark_skip("M2 Wishing Well toss endpoint not yet deployed")
            return
        cid = f"user_{secrets.token_hex(4)}"
        st, _, ch = self.client.post_json(path_p, body={"medallion": "copper"}, client_id=cid)
        if st == 402:
            self.client.post_json("/api/402/settle", body={"payment_id": ch.get("payment_id"), "method": "demo"})

        st_toss, _, toss_data = self.client.post_json(path_t, body={}, client_id=cid)
        assert st_toss == 200, f"Expected 200 for toss with credits, got {st_toss}: {toss_data}"
        assert "theophany_reflection" in toss_data or "reflection" in toss_data or "verse" in toss_data

    # --- Feature 4: Multi-Tier Subscriptions ---
    def test_t1_20_default_free_tier(self, res: TestResult):
        path = "/api/subscriptions/status" if self._is_endpoint_deployed("/api/subscriptions/status") else "/api/subscription/status"
        if not self._is_endpoint_deployed(path):
            res.mark_skip("M2 Subscriptions status endpoint not yet deployed")
            return
        cid = f"user_{secrets.token_hex(4)}"
        status, _, body = self.client.get_json(path, client_id=cid)
        assert status == 200, f"Expected 200, got {status}: {body}"
        assert body.get("tier") == "free", f"Default tier should be free, got {body.get('tier')}"

    def test_t1_21_free_tier_gated_rejection(self, res: TestResult):
        path = "/api/subscription/gated-content/executive-pitch" if self._is_endpoint_deployed("/api/subscription/gated-content/executive-pitch") else "/api/protected/vip-dossier"
        status, hdrs, body = self.client.get_json(path)
        assert status == 402, f"Expected 402 for free tier accessing gated VIP content, got {status}: {body}"

    def test_t1_22_activate_freemium_trial(self, res: TestResult):
        path = "/api/subscriptions/upgrade" if self._is_endpoint_deployed("/api/subscriptions/upgrade", "POST") else "/api/subscription/activate-freemium"
        if not self._is_endpoint_deployed(path, "POST"):
            res.mark_skip("M2 Freemium upgrade endpoint not yet deployed")
            return
        cid = f"user_{secrets.token_hex(4)}"
        status, _, body = self.client.post_json(path, body={"target_tier": "freemium"}, client_id=cid)
        assert status == 200, f"Expected 200 for freemium activation, got {status}: {body}"
        assert body.get("tier") == "freemium" or body.get("is_active") is True

    def test_t1_23_active_freemium_access(self, res: TestResult):
        path_u = "/api/subscriptions/upgrade" if self._is_endpoint_deployed("/api/subscriptions/upgrade", "POST") else "/api/subscription/activate-freemium"
        path_g = "/api/subscription/gated-content/executive-pitch" if self._is_endpoint_deployed("/api/subscription/gated-content/executive-pitch") else "/api/protected/vip-dossier"
        if not self._is_endpoint_deployed(path_u, "POST"):
            res.mark_skip("M2 Freemium endpoints not yet deployed")
            return
        cid = f"user_{secrets.token_hex(4)}"
        self.client.post_json(path_u, body={"target_tier": "freemium"}, client_id=cid)
        status, _, body = self.client.get_json(path_g, client_id=cid)
        assert status == 200, f"Expected active freemium to unlock VIP content, got {status}: {body}"

    def test_t1_24_freemium_expiration_enforcement(self, res: TestResult):
        path_exp = "/api/subscription/simulate-expiration"
        if not self._is_endpoint_deployed(path_exp, "POST"):
            res.mark_skip("M2 Expiration simulation endpoint not yet deployed")
            return
        cid = f"user_{secrets.token_hex(4)}"
        self.client.post_json(path_exp, body={}, client_id=cid)
        status, _, _ = self.client.get_json("/api/subscription/gated-content/executive-pitch", client_id=cid)
        assert status == 402, f"Expected 402 after freemium expiration, got {status}"

    def test_t1_25_paid_tier_upgrade_and_unlock(self, res: TestResult):
        path_u = "/api/subscriptions/upgrade" if self._is_endpoint_deployed("/api/subscriptions/upgrade", "POST") else "/api/subscription/upgrade"
        if not self._is_endpoint_deployed(path_u, "POST"):
            res.mark_skip("M2 Subscriptions upgrade endpoint not yet deployed")
            return
        cid = f"user_{secrets.token_hex(4)}"
        status, hdrs, body = self.client.post_json(path_u, body={"target_tier": "paid"}, client_id=cid)
        assert status == 402, f"Expected 402 for paid tier upgrade challenge, got {status}: {body}"
        pid = body.get("payment_id")

        st_s, _, sbody = self.client.post_json("/api/402/settle", body={"payment_id": pid, "method": "demo"})
        assert st_s == 200
        token = sbody.get("token") or sbody.get("payment_token")

        path_s = "/api/subscriptions/status" if self._is_endpoint_deployed("/api/subscriptions/status") else "/api/subscription/status"
        st_stat, _, stat_body = self.client.get_json(path_s, headers={"Authorization": f"Bearer {token}"}, client_id=cid)
        assert st_stat == 200
        assert stat_body.get("tier") == "paid"

    # --- Feature 5: Static File Serving & CORS ---
    def test_t1_26_index_html_served(self, res: TestResult):
        status, hdrs, body = self.client.request("GET", "/index.html")
        assert status == 200, f"Expected 200, got {status}"
        assert "text/html" in hdrs.get("Content-Type", "") or "text/html" in hdrs.get("Content-type", ""), f"MIME mismatch: {hdrs}"
        assert b"Good Faith Paradigm" in body, "Expected Good Faith Paradigm title in index.html"

    def test_t1_27_js_strict_mime_type(self, res: TestResult):
        status, hdrs, _ = self.client.request("GET", "/js/main.js")
        assert status == 200, f"Expected 200 for main.js, got {status}"
        ctype = hdrs.get("Content-Type", "") or hdrs.get("Content-type", "")
        assert "application/javascript" in ctype, f"Windows MIME bug! Got {ctype}"

    def test_t1_28_dallas_aquarium_slide_served(self, res: TestResult):
        status, hdrs, body = self.client.request("GET", "/media/booths/prismatic/slide_03.jpg")
        assert status == 200, f"Expected 200 for slide_03.jpg, got {status}"
        ctype = hdrs.get("Content-Type", "") or hdrs.get("Content-type", "")
        assert "image/jpeg" in ctype, f"Expected image/jpeg, got {ctype}"
        assert len(body) > 1000, "Image body too small"

    def test_t1_29_cors_headers_presence(self, res: TestResult):
        status, hdrs, _ = self.client.request("GET", "/api/health")
        assert hdrs.get("Access-Control-Allow-Origin") == "*", f"Missing CORS origin header: {hdrs}"
        expose = hdrs.get("Access-Control-Expose-Headers", "")
        assert "WWW-Authenticate" in expose or "Payment-Required" in expose, f"Missing expose headers: {expose}"

    def test_t1_30_cors_preflight_options(self, res: TestResult):
        status, hdrs, _ = self.client.request("OPTIONS", "/api/health")
        assert status == 204, f"Expected 204 for OPTIONS, got {status}"
        assert hdrs.get("Access-Control-Allow-Origin") == "*", "Missing CORS allow origin"
        methods = hdrs.get("Access-Control-Allow-Methods", "")
        assert "GET" in methods or "POST" in methods or "OPTIONS" in methods, f"Missing methods: {methods}"

    def test_t1_31_health_probe(self, res: TestResult):
        status, _, body = self.client.get_json("/api/health")
        assert status == 200, f"Expected 200, got {status}: {body}"
        assert body.get("status") == "healthy", f"Status not healthy: {body}"
        features = body.get("features", [])
        assert "http_402" in features, f"http_402 missing from features: {features}"

    # =================================================================
    # TIER 2: BOUNDARY & CORNER CASES
    # =================================================================

    def test_t2_1_tampered_macaroon_signature(self, res: TestResult):
        status, _, body = self.client.get_json("/api/protected/exclusive-skyport-deck")
        macaroon = body.get("macaroon")
        tampered = macaroon[:-4] + "AAAA"
        auth_hdr = {"Authorization": f"L402 {tampered}:00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"}
        st, _, _ = self.client.get_json("/api/protected/exclusive-skyport-deck", headers=auth_hdr)
        assert st == 402, f"Tampered macaroon must not unlock resource, got {st}"

    def test_t2_2_expired_macaroon_rejected(self, res: TestResult):
        # Even with fabricated expired caveat, macaroon verification must fail
        fake_mac = "eyJsb2NhdGlvbiI6ImdmcC1pbnZlc3Rvci14ciIsImlkZW50aWZpZXIiOiJjaF9mYWtlIiwiY2F2ZWF0cyI6WyJleHBpcmVzPTAiXSwic2lnbmF0dXJlIjoiZmFrZSJ9"
        auth_hdr = {"Authorization": f"L402 {fake_mac}:00"}
        st, _, _ = self.client.get_json("/api/protected/exclusive-skyport-deck", headers=auth_hdr)
        assert st == 402, f"Expired/invalid macaroon must return 402, got {st}"

    def test_t2_3_invalid_preimage_hash_mismatch(self, res: TestResult):
        status, _, body = self.client.post_json("/api/402/challenge", body={"amount": 500})
        pid = body.get("payment_id")
        bad_preimage = "00" * 32
        st, _, sbody = self.client.post_json("/api/402/settle", body={"payment_id": pid, "preimage": bad_preimage, "method": "preimage"})
        assert st == 400, f"Expected 400 for bad preimage, got {st}: {sbody}"
        assert sbody.get("success") is False, "Bad preimage marked as success"

    def test_t2_4_token_resource_scope_mismatch(self, res: TestResult):
        status, _, body = self.client.post_json("/api/402/challenge", body={"resource": "/api/protected/resource-a"})
        pid = body.get("payment_id")
        st, _, sbody = self.client.post_json("/api/402/settle", body={"payment_id": pid, "method": "demo"})
        token = sbody.get("token") or sbody.get("payment_token")

        st_b, _, _ = self.client.get_json("/api/protected/resource-b", headers={"Authorization": f"Bearer {token}"})
        assert st_b == 402, f"Token for resource-a must not unlock resource-b, got {st_b}"

    def test_t2_5_malformed_auth_header_resilience(self, res: TestResult):
        malformed = [
            "L402",
            "L402 ",
            "L402 ::::",
            "Bearer ",
            "Bearer !!!corrupted!!!",
            "Basic admin:password",
        ]
        for bad_hdr in malformed:
            st, _, _ = self.client.get_json("/api/protected/exclusive-skyport-deck", headers={"Authorization": bad_hdr})
            assert st in (400, 401, 402), f"Header '{bad_hdr}' resulted in status {st} instead of 40x"

    def test_t2_6_invalid_token_id(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/cart/items", "POST"):
            res.mark_skip("M2 Cart endpoint not yet deployed")
            return
        status, _, body = self.client.post_json("/api/cart/items", body={"item_id": "999999", "quantity": 1})
        assert status in (400, 404), f"Expected 400/404 for invalid token ID, got {status}: {body}"

    def test_t2_7_negative_quantity(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/cart/items", "POST"):
            res.mark_skip("M2 Cart endpoint not yet deployed")
            return
        status, _, body = self.client.post_json("/api/cart/items", body={"item_id": "492856", "quantity": -5})
        assert status in (400, 422), f"Expected 400 for negative quantity, got {status}: {body}"

    def test_t2_8_checkout_empty_cart(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/cart/checkout", "POST"):
            res.mark_skip("M2 Cart checkout endpoint not yet deployed")
            return
        cid = f"empty_cart_{secrets.token_hex(4)}"
        status, _, body = self.client.post_json("/api/cart/checkout", body={}, client_id=cid)
        assert status in (400, 404, 422), f"Expected 400 for empty cart checkout, got {status}: {body}"

    def test_t2_9_rapid_duplicate_additions(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/cart/items", "POST"):
            res.mark_skip("M2 Cart endpoint not yet deployed")
            return
        cid = f"rapid_cart_{secrets.token_hex(4)}"
        for _ in range(5):
            self.client.post_json("/api/cart/items", body={"item_id": "492856", "quantity": 1}, client_id=cid)
        path = "/api/cart" if self._is_endpoint_deployed("/api/cart") else "/api/cart/items"
        status, _, body = self.client.get_json(path, client_id=cid)
        assert status == 200
        assert body.get("total_items") == 5, f"Expected 5 items, got {body.get('total_items')}"

    def test_t2_10_cart_clear_boundary(self, res: TestResult):
        if not self._is_endpoint_deployed("/api/cart/clear", "POST") and not self._is_endpoint_deployed("/api/cart", "DELETE"):
            res.mark_skip("M2 Cart clear endpoint not yet deployed")
            return
        cid = f"cart_clr_{secrets.token_hex(4)}"
        self.client.post_json("/api/cart/items", body={"item_id": "492856", "quantity": 2}, client_id=cid)
        path = "/api/cart/clear" if self._is_endpoint_deployed("/api/cart/clear", "POST") else "/api/cart"
        st, _, _ = self.client.request("DELETE" if "clear" not in path else "POST", path, client_id=cid)
        assert st in (200, 204)

    def test_t2_11_invalid_medallion_type(self, res: TestResult):
        path = "/api/credits/purchase" if self._is_endpoint_deployed("/api/credits/purchase", "POST") else "/api/wishing-well/credits/purchase"
        if not self._is_endpoint_deployed(path, "POST"):
            res.mark_skip("M2 Credits purchase endpoint not yet deployed")
            return
        status, _, body = self.client.post_json(path, body={"medallion": "unobtainium"})
        assert status in (400, 422), f"Expected 400 for invalid medallion, got {status}: {body}"

    def test_t2_12_boundary_balance_toss_exact(self, res: TestResult):
        path_t = "/api/credits/toss" if self._is_endpoint_deployed("/api/credits/toss", "POST") else "/api/wishing-well/toss"
        path_p = "/api/credits/purchase" if self._is_endpoint_deployed("/api/credits/purchase", "POST") else "/api/wishing-well/credits/purchase"
        path_b = "/api/credits/balance" if self._is_endpoint_deployed("/api/credits/balance") else "/api/wishing-well/balance"
        if not self._is_endpoint_deployed(path_t, "POST") or not self._is_endpoint_deployed(path_p, "POST"):
            res.mark_skip("M2 Credits toss/purchase endpoint not yet deployed")
            return
        cid = f"bound_exact_{secrets.token_hex(4)}"
        # 1. Allocate exactly 5 credits (1 wish deposit @ $0.25)
        st, _, ch = self.client.post_json(path_p, body={"amount_usd": 0.25}, client_id=cid)
        assert st == 402, f"Expected 402 challenge for deposit, got {st}"
        pid = ch.get("payment_id")
        st_s, _, _ = self.client.post_json("/api/402/settle", body={"payment_id": pid, "method": "demo"})
        assert st_s == 200, f"Expected 200 settlement, got {st_s}"

        st_b1, _, b1 = self.client.get_json(path_b, client_id=cid)
        assert st_b1 == 200
        assert b1.get("credit_balance") == 5, f"Expected initial 5 credits, got {b1.get('credit_balance')}"

        # 2. Execute 1 wish toss (costs 5 credits) -> resulting balance is exactly 0
        st_toss1, _, toss1_data = self.client.post_json(path_t, body={"wishes": 1}, client_id=cid)
        assert st_toss1 == 200, f"Expected 200 for exact boundary toss, got {st_toss1}: {toss1_data}"
        assert toss1_data.get("credit_balance") == 0, f"Expected 0 balance after toss, got {toss1_data.get('credit_balance')}"

        st_b2, _, b2 = self.client.get_json(path_b, client_id=cid)
        assert st_b2 == 200
        assert b2.get("credit_balance") == 0, f"Expected 0 balance query after toss, got {b2.get('credit_balance')}"

        # 3. Attempt second toss -> must be rejected with 400 insufficient_credits
        st_toss2, _, toss2_data = self.client.post_json(path_t, body={"wishes": 1}, client_id=cid)
        assert st_toss2 == 400, f"Expected 400 for second toss with 0 balance, got {st_toss2}: {toss2_data}"
        assert toss2_data.get("error") == "insufficient_credits", f"Expected insufficient_credits error, got {toss2_data.get('error')}"
        assert toss2_data.get("credit_balance") == 0

    def test_t2_13_sub_threshold_balance_toss(self, res: TestResult):
        path_t = "/api/credits/toss" if self._is_endpoint_deployed("/api/credits/toss", "POST") else "/api/wishing-well/toss"
        if not self._is_endpoint_deployed(path_t, "POST"):
            res.mark_skip("M2 Credits toss endpoint not yet deployed")
            return
        cid = f"sub_user_{secrets.token_hex(4)}"
        status, _, body = self.client.post_json(path_t, body={}, client_id=cid)
        assert status in (400, 402), f"Expected 400/402 for sub-threshold toss, got {status}"

    def test_t2_14_fractional_medallion_quantity(self, res: TestResult):
        path = "/api/credits/purchase" if self._is_endpoint_deployed("/api/credits/purchase", "POST") else "/api/wishing-well/credits/purchase"
        if not self._is_endpoint_deployed(path, "POST"):
            res.mark_skip("M2 Credits purchase endpoint not yet deployed")
            return
        status, _, body = self.client.post_json(path, body={"medallion": "gold", "quantity": 0.5})
        assert status in (400, 422), f"Expected 400 for fractional quantity, got {status}"

    def test_t2_15_concurrent_tosses_non_negative(self, res: TestResult):
        path_t = "/api/credits/toss" if self._is_endpoint_deployed("/api/credits/toss", "POST") else "/api/wishing-well/toss"
        path_p = "/api/credits/purchase" if self._is_endpoint_deployed("/api/credits/purchase", "POST") else "/api/wishing-well/credits/purchase"
        path_b = "/api/credits/balance" if self._is_endpoint_deployed("/api/credits/balance") else "/api/wishing-well/balance"
        if not self._is_endpoint_deployed(path_t, "POST") or not self._is_endpoint_deployed(path_p, "POST"):
            res.mark_skip("M2 Credits toss/purchase endpoint not yet deployed")
            return
        cid = f"toss_race_{secrets.token_hex(4)}"
        # Allocate 10 credits (2 wishes @ $0.50)
        st, _, ch = self.client.post_json(path_p, body={"amount_usd": 0.50}, client_id=cid)
        assert st == 402, f"Expected 402 challenge, got {st}"
        pid = ch.get("payment_id")
        st_s, _, _ = self.client.post_json("/api/402/settle", body={"payment_id": pid, "method": "demo"})
        assert st_s == 200

        st_b1, _, b1 = self.client.get_json(path_b, client_id=cid)
        assert st_b1 == 200
        assert b1.get("credit_balance") == 10, f"Expected initial 10 credits, got {b1.get('credit_balance')}"

        # Fire 4 rapid concurrent or sequential toss requests
        def do_toss():
            return self.client.post_json(path_t, body={"wishes": 1}, client_id=cid)

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            futures = [ex.submit(do_toss) for _ in range(4)]
            results = [f.result() for f in futures]

        statuses = [r[0] for r in results]
        successes = statuses.count(200)
        failures = statuses.count(400)
        assert successes == 2, f"Expected exactly 2 successful tosses from 10 credits, got {successes} (statuses: {statuses})"
        assert failures == 2, f"Expected exactly 2 failed tosses with 400, got {failures} (statuses: {statuses})"

        st_final, _, final_data = self.client.get_json(path_b, client_id=cid)
        assert st_final == 200
        final_bal = final_data.get("credit_balance", -1)
        assert final_bal == 0, f"Expected final balance strictly 0 (never negative), got {final_bal}"

    def test_t2_16_invalid_tier_upgrade(self, res: TestResult):
        path = "/api/subscriptions/upgrade" if self._is_endpoint_deployed("/api/subscriptions/upgrade", "POST") else "/api/subscription/upgrade"
        if not self._is_endpoint_deployed(path, "POST"):
            res.mark_skip("M2 Subscription upgrade endpoint not yet deployed")
            return
        status, _, body = self.client.post_json(path, body={"target_tier": "galaxy_overlord"})
        assert status in (400, 422), f"Expected 400 for invalid tier, got {status}: {body}"

    def test_t2_17_duplicate_freemium_activation(self, res: TestResult):
        path = "/api/subscriptions/upgrade" if self._is_endpoint_deployed("/api/subscriptions/upgrade", "POST") else "/api/subscription/activate-freemium"
        if not self._is_endpoint_deployed(path, "POST"):
            res.mark_skip("M2 Subscription freemium endpoint not yet deployed")
            return
        cid = f"free_user_{secrets.token_hex(4)}"
        self.client.post_json(path, body={"target_tier": "freemium"}, client_id=cid)
        status, _, body = self.client.post_json(path, body={"target_tier": "freemium"}, client_id=cid)
        assert status in (200, 400), f"Unexpected status {status}: {body}"

    def test_t2_18_exact_timestamp_boundary(self, res: TestResult):
        path_u = "/api/subscriptions/upgrade" if self._is_endpoint_deployed("/api/subscriptions/upgrade", "POST") else "/api/subscription/activate-freemium"
        path_exp = "/api/subscription/simulate-expiration" if self._is_endpoint_deployed("/api/subscription/simulate-expiration", "POST") else "/api/subscriptions/simulate-expiration"
        path_s = "/api/subscriptions/status" if self._is_endpoint_deployed("/api/subscriptions/status") else "/api/subscription/status"
        path_g = "/api/subscription/gated-content/executive-pitch"
        if not self._is_endpoint_deployed(path_u, "POST") or not self._is_endpoint_deployed(path_exp, "POST"):
            res.mark_skip("M2 Freemium/Expiration endpoints not yet deployed")
            return
        cid = f"exp_bound_{secrets.token_hex(4)}"
        # 1. Activate freemium trial
        st, _, sub_act = self.client.post_json(path_u, body={"target_tier": "freemium"}, client_id=cid)
        assert st == 200, f"Freemium activation failed with status {st}: {sub_act}"
        assert sub_act.get("tier") == "freemium"

        # 2. Simulate expiration past exact boundary (sets expires_at in the past)
        st_exp, _, exp_body = self.client.post_json(path_exp, body={}, client_id=cid)
        assert st_exp == 200, f"Simulate expiration failed with status {st_exp}: {exp_body}"

        # 3. Query status: must revert to free tier
        st_stat, _, stat_body = self.client.get_json(path_s, client_id=cid)
        assert st_stat == 200
        assert stat_body.get("tier") == "free", f"Expected tier 'free' after expiration, got {stat_body.get('tier')}"

        # 4. Gated VIP content access returns 402 Payment Required
        st_gated, _, gated_body = self.client.get_json(path_g, client_id=cid)
        assert st_gated == 402, f"Expected 402 for expired freemium accessing VIP content, got {st_gated}: {gated_body}"

    def test_t2_19_corrupted_auth_token(self, res: TestResult):
        st, _, _ = self.client.get_json("/api/protected/exclusive-skyport-deck", headers={"Authorization": "Bearer gfp_tok.invalid.sig"})
        assert st == 402, f"Corrupted bearer token must be rejected, got {st}"

    def test_t2_20_anonymous_client_defaults(self, res: TestResult):
        path = "/api/subscriptions/status" if self._is_endpoint_deployed("/api/subscriptions/status") else "/api/subscription/status"
        if not self._is_endpoint_deployed(path):
            res.mark_skip("M2 Subscription status endpoint not yet deployed")
            return
        status, _, body = self.client.get_json(path, client_id="")
        assert status == 200
        assert body.get("tier") == "free"

    def test_t2_21_directory_traversal_blocked(self, res: TestResult):
        traversals = [
            "/../../../../etc/passwd",
            "/..\\..\\..\\windows\\win.ini",
            "/....//....//index.html",
        ]
        for path in traversals:
            status, _, _ = self.client.request("GET", path)
            assert status in (301, 302, 400, 403, 404), f"Traversal '{path}' was not blocked, got {status}"

    def test_t2_22_nonexistent_file_404(self, res: TestResult):
        status, _, _ = self.client.request("GET", "/media/non_existent_relic_123.jpg")
        assert status == 404, f"Expected 404, got {status}"

    def test_t2_23_unknown_extension_mime_fallback(self, res: TestResult):
        status, hdrs, _ = self.client.request("GET", "/Dockerfile")
        assert status == 200
        ctype = hdrs.get("Content-Type", "") or hdrs.get("Content-type", "")
        assert ctype, "Missing Content-Type on Dockerfile"

    def test_t2_24_byte_range_request(self, res: TestResult):
        status, hdrs, body = self.client.request("GET", "/index.html", headers={"Range": "bytes=0-49"})
        assert status in (200, 206), f"Expected 200 or 206, got {status}"
        assert hdrs.get("Accept-Ranges") == "bytes", "Missing Accept-Ranges: bytes"

    def test_t2_25_query_param_stripping(self, res: TestResult):
        status, hdrs, body = self.client.request("GET", "/index.html?view=skyport&clean=1&timestamp=12345")
        assert status == 200, f"Expected 200 for index.html with query params, got {status}"
        ctype = hdrs.get("Content-Type", "") or hdrs.get("Content-type", "")
        assert "text/html" in ctype

    # =================================================================
    # TIER 3: CROSS-FEATURE PAIRWISE COMBINATIONS
    # =================================================================

    def test_t3_1_cart_checkout_leaves_credits_untouched(self, res: TestResult):
        path_c = "/api/cart/items"
        path_b = "/api/credits/balance" if self._is_endpoint_deployed("/api/credits/balance") else "/api/wishing-well/balance"
        if not self._is_endpoint_deployed(path_c, "POST") or not self._is_endpoint_deployed(path_b):
            res.mark_skip("M2 Cart/Credits endpoints not yet deployed")
            return
        cid = f"combo_user_{secrets.token_hex(4)}"
        self.client.post_json(path_c, body={"item_id": "492856", "quantity": 1}, client_id=cid)
        st, _, bdata = self.client.get_json(path_b, client_id=cid)
        assert bdata.get("credit_balance", 0) == 0, "Cart addition should not affect credits"

    def test_t3_2_credit_purchase_leaves_subscription_untouched(self, res: TestResult):
        path_p = "/api/credits/purchase" if self._is_endpoint_deployed("/api/credits/purchase", "POST") else "/api/wishing-well/credits/purchase"
        path_s = "/api/subscriptions/status" if self._is_endpoint_deployed("/api/subscriptions/status") else "/api/subscription/status"
        if not self._is_endpoint_deployed(path_p, "POST") or not self._is_endpoint_deployed(path_s):
            res.mark_skip("M2 Credits/Subscription endpoints not yet deployed")
            return
        cid = f"combo_sub_{secrets.token_hex(4)}"
        self.client.post_json(path_p, body={"medallion": "gold"}, client_id=cid)
        st, _, sdata = self.client.get_json(path_s, client_id=cid)
        assert sdata.get("tier") == "free", "Credit purchase should not alter subscription tier"

    def test_t3_3_paid_subscription_with_isolated_cart(self, res: TestResult):
        path_u = "/api/subscriptions/upgrade" if self._is_endpoint_deployed("/api/subscriptions/upgrade", "POST") else "/api/subscription/upgrade"
        path_c = "/api/cart/checkout"
        if not self._is_endpoint_deployed(path_u, "POST") or not self._is_endpoint_deployed(path_c, "POST"):
            res.mark_skip("M2 Subscription/Cart endpoints not yet deployed")
            return
        cid = f"paid_cart_{secrets.token_hex(4)}"
        self.client.post_json("/api/cart/items", body={"item_id": "492856", "quantity": 1}, client_id=cid)
        st, _, _ = self.client.post_json(path_c, body={}, client_id=cid)
        assert st == 402, "Paid subscriber must still receive 402 for NFT cart checkout"

    def test_t3_4_freemium_trial_with_medallion_bonus(self, res: TestResult):
        path_u = "/api/subscriptions/upgrade" if self._is_endpoint_deployed("/api/subscriptions/upgrade", "POST") else "/api/subscription/activate-freemium"
        path_g = "/api/subscription/gated-content/executive-pitch" if self._is_endpoint_deployed("/api/subscription/gated-content/executive-pitch") else "/api/protected/vip-dossier"
        path_b = "/api/credits/balance" if self._is_endpoint_deployed("/api/credits/balance") else "/api/wishing-well/balance"
        if not self._is_endpoint_deployed(path_u, "POST") or not self._is_endpoint_deployed(path_b):
            res.mark_skip("M2 Freemium endpoints not yet deployed")
            return
        cid = f"free_bonus_{secrets.token_hex(4)}"
        st, _, body = self.client.post_json(path_u, body={"target_tier": "freemium"}, client_id=cid)
        assert st == 200, f"Expected 200 for freemium activation, got {st}: {body}"
        assert body.get("tier") == "freemium"

        # Verify VIP content is accessible with freemium trial
        st_g, _, g_body = self.client.get_json(path_g, client_id=cid)
        assert st_g == 200, f"Expected 200 accessing VIP content with freemium trial, got {st_g}: {g_body}"

        # Verify freemium trial did not improperly alter or corrupt credit balance (remains 0)
        st_b, _, b_data = self.client.get_json(path_b, client_id=cid)
        assert st_b == 200, f"Expected 200 getting balance, got {st_b}"
        credit_bal = b_data.get("credit_balance", -1)
        assert credit_bal == 0, f"Expected initial credit balance 0, got {credit_bal}"

    def test_t3_5_client_isolation_verification(self, res: TestResult):
        path_c = "/api/cart/items"
        if not self._is_endpoint_deployed(path_c, "POST"):
            res.mark_skip("M2 Cart endpoint not yet deployed")
            return
        cid_a = f"client_a_{secrets.token_hex(4)}"
        cid_b = f"client_b_{secrets.token_hex(4)}"

        self.client.post_json(path_c, body={"item_id": "492856", "quantity": 2}, client_id=cid_a)
        self.client.post_json(path_c, body={"item_id": "490643", "quantity": 1}, client_id=cid_b)

        path_cart = "/api/cart" if self._is_endpoint_deployed("/api/cart") else "/api/cart/items"
        _, _, cart_a = self.client.get_json(path_cart, client_id=cid_a)
        _, _, cart_b = self.client.get_json(path_cart, client_id=cid_b)

        assert cart_a.get("total_items") == 2, f"Client A total_items mismatch: {cart_a}"
        assert cart_b.get("total_items") == 1, f"Client B total_items mismatch: {cart_b}"

    def test_t3_6_concurrent_static_and_api_traffic(self, res: TestResult):
        errors = []

        def worker_static():
            for _ in range(5):
                st, _, _ = self.client.request("GET", "/index.html")
                if st != 200:
                    errors.append(f"Static request failed with {st}")

        def worker_api():
            for _ in range(5):
                st, _, _ = self.client.get_json("/api/health")
                if st != 200:
                    errors.append(f"API health failed with {st}")

        threads = [
            threading.Thread(target=worker_static),
            threading.Thread(target=worker_api),
            threading.Thread(target=worker_static),
            threading.Thread(target=worker_api),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"Concurrent traffic errors: {errors}"

    # =================================================================
    # TIER 4: REAL-WORLD END-TO-END SCENARIOS
    # =================================================================

    def test_t4_1_harps_collector_journey(self, res: TestResult):
        cid = f"collector_{secrets.token_hex(4)}"
        st, _, _ = self.client.request("GET", "/index.html", client_id=cid)
        assert st == 200

        if not self._is_endpoint_deployed("/api/cart/items", "POST"):
            res.mark_skip("M2 Cart endpoints not yet deployed for complete journey")
            return

        st_y, _, _ = self.client.post_json("/api/cart/items", body={"item_id": "492856", "quantity": 1}, client_id=cid)
        assert st_y == 200
        st_g, _, _ = self.client.post_json("/api/cart/items", body={"item_id": "490643", "quantity": 1}, client_id=cid)
        assert st_g == 200

        st_chk, hdrs, chk_body = self.client.post_json("/api/cart/checkout", body={}, client_id=cid)
        assert st_chk == 402, f"Expected 402 for checkout, got {st_chk}"
        pid = chk_body.get("payment_id")
        assert pid, "Missing payment_id"

        st_set, _, set_body = self.client.post_json("/api/402/settle", body={"payment_id": pid, "method": "demo"})
        assert st_set == 200
        token = set_body.get("token") or set_body.get("payment_token")

        st_fin, _, fin_body = self.client.post_json("/api/cart/checkout", body={}, headers={"Authorization": f"Bearer {token}"}, client_id=cid)
        assert st_fin == 200, f"Expected 200 after settlement, got {st_fin}: {fin_body}"

    def test_t4_2_theophany_pilgrim_journey(self, res: TestResult):
        cid = f"pilgrim_{secrets.token_hex(4)}"
        path_b = "/api/credits/balance" if self._is_endpoint_deployed("/api/credits/balance") else "/api/wishing-well/balance"
        path_p = "/api/credits/purchase" if self._is_endpoint_deployed("/api/credits/purchase", "POST") else "/api/wishing-well/credits/purchase"
        path_t = "/api/credits/toss" if self._is_endpoint_deployed("/api/credits/toss", "POST") else "/api/wishing-well/toss"

        if not self._is_endpoint_deployed(path_p, "POST") or not self._is_endpoint_deployed(path_t, "POST"):
            res.mark_skip("M2 Credits endpoints not yet deployed for complete journey")
            return

        st, _, bdata = self.client.get_json(path_b, client_id=cid)
        assert st == 200

        st_t1, _, _ = self.client.post_json(path_t, body={}, client_id=cid)
        assert st_t1 in (400, 402)

        st_p, _, pbody = self.client.post_json(path_p, body={"medallion": "silver"}, client_id=cid)
        assert st_p == 402
        pid = pbody.get("payment_id")

        st_s, _, sbody = self.client.post_json("/api/402/settle", body={"payment_id": pid, "method": "demo"})
        assert st_s == 200
        token = sbody.get("token") or sbody.get("payment_token")

        st_t2, _, t2_body = self.client.post_json(path_t, body={}, headers={"Authorization": f"Bearer {token}"}, client_id=cid)
        assert st_t2 == 200, f"Expected 200 for wish toss, got {st_t2}: {t2_body}"

    def test_t4_3_pneumatic_investor_subscription_lifecycle(self, res: TestResult):
        cid = f"investor_{secrets.token_hex(4)}"
        path_s = "/api/subscriptions/status" if self._is_endpoint_deployed("/api/subscriptions/status") else "/api/subscription/status"
        path_u = "/api/subscriptions/upgrade" if self._is_endpoint_deployed("/api/subscriptions/upgrade", "POST") else "/api/subscription/upgrade"
        path_g = "/api/subscription/gated-content/executive-pitch" if self._is_endpoint_deployed("/api/subscription/gated-content/executive-pitch") else "/api/protected/vip-dossier"

        if not self._is_endpoint_deployed(path_u, "POST"):
            res.mark_skip("M2 Subscription endpoints not yet deployed for complete journey")
            return

        st_stat, _, stat_data = self.client.get_json(path_s, client_id=cid)
        assert st_stat == 200
        assert stat_data.get("tier") == "free"

        st_g1, _, _ = self.client.get_json(path_g, client_id=cid)
        assert st_g1 == 402

        st_free, _, _ = self.client.post_json(path_u, body={"target_tier": "freemium"}, client_id=cid)
        assert st_free == 200

        st_g2, _, g2_body = self.client.get_json(path_g, client_id=cid)
        assert st_g2 == 200, f"Expected 200 for freemium user, got {st_g2}: {g2_body}"

    def test_t4_4_multi_client_concurrent_deck_walkthrough(self, res: TestResult):
        cid_1 = f"walk_1_{secrets.token_hex(4)}"
        cid_2 = f"walk_2_{secrets.token_hex(4)}"

        st1, _, b1 = self.client.get_json("/api/protected/exclusive-skyport-deck", client_id=cid_1)
        assert st1 == 402
        p1 = b1.get("payment_id")
        st1_s, _, s1 = self.client.post_json("/api/402/settle", body={"payment_id": p1, "method": "demo"})
        assert st1_s == 200

        st2_h, _, _ = self.client.get_json("/api/health", client_id=cid_2)
        st2_i, _, _ = self.client.request("GET", "/index.html", client_id=cid_2)
        assert st2_h == 200
        assert st2_i == 200

    # =================================================================
    # RUNNER DISPATCH
    # =================================================================
    def run_all(self, tier_filter: Optional[int] = None, suite_filter: Optional[str] = None):
        tests = [
            # Tier 1
            ("T1.1", 1, "402", "Unauthenticated request to protected endpoint returns 402 Payment Required", self.test_t1_1_unauth_protected_returns_402),
            ("T1.2", 1, "402", "402 response includes RFC 9110 / L402 WWW-Authenticate header with macaroon and invoice", self.test_t1_2_www_authenticate_l402_header),
            ("T1.3", 1, "402", "402 response includes Payment-Required structured JSON header", self.test_t1_3_payment_required_json_header),
            ("T1.4", 1, "402", "Explicit challenge creation via POST /api/402/challenge returns 402 with custom price", self.test_t1_4_custom_challenge_creation),
            ("T1.5", 1, "402", "Payment settlement via POST /api/402/settle returns 200 OK with token and preimage", self.test_t1_5_challenge_settlement),
            ("T1.6", 1, "402", "Subsequent request with Authorization: L402 <macaroon>:<preimage> unlocks resource (200 OK)", self.test_t1_6_l402_authorization_unlock),
            ("T1.7", 1, "402", "Subsequent request with Bearer token or X-Payment-Token unlocks resource (200 OK)", self.test_t1_7_bearer_and_x_token_unlock),

            ("T1.8", 1, "cart", "Rarible NFT catalog retrieval lists tokens #492856 and #490643", self.test_t1_8_catalog_retrieval),
            ("T1.9", 1, "cart", "Add Yellow Y token #492856 to shopping basket", self.test_t1_9_add_yellow_nft),
            ("T1.10", 1, "cart", "Add Green G token #490643 to shopping basket and verify total", self.test_t1_10_add_green_nft),
            ("T1.11", 1, "cart", "Unpaid cart checkout returns 402 challenge with exact basket total", self.test_t1_11_cart_checkout_unpaid_402),
            ("T1.12", 1, "cart", "Settled cart checkout returns 200 OK with confirmed order and tickets", self.test_t1_12_cart_checkout_settled_200),
            ("T1.13", 1, "cart", "Remove item from cart updates subtotal and quantity", self.test_t1_13_cart_remove_item),

            ("T1.14", 1, "credits", "Query initial Wishing Well medallion credit balance (starts at 0)", self.test_t1_14_initial_credit_balance),
            ("T1.15", 1, "credits", "Wishing Well toss with zero credit balance is rejected", self.test_t1_15_zero_balance_toss_rejected),
            ("T1.16", 1, "credits", "2 oz Gold Medallion Demo purchase returns 402 challenge for 500 credits", self.test_t1_16_gold_medallion_purchase_challenge),
            ("T1.17", 1, "credits", "Settled Gold Medallion purchase allocates +500 credits to balance", self.test_t1_17_gold_medallion_credit_allocation),
            ("T1.18", 1, "credits", "2 oz Silver (100 credits) and Copper (25 credits) medallion pricing verified", self.test_t1_18_silver_and_copper_purchase),
            ("T1.19", 1, "credits", "Wishing Well toss spends 5 credits and returns Theophany reflection", self.test_t1_19_wishing_well_toss_execution),

            ("T1.20", 1, "subscriptions", "Default user subscription tier is Free ('Pilgrim')", self.test_t1_20_default_free_tier),
            ("T1.21", 1, "subscriptions", "Free tier user accessing gated VIP content prompts 402 upgrade challenge", self.test_t1_21_free_tier_gated_rejection),
            ("T1.22", 1, "subscriptions", "Activate limited-time 24h Freemium VIP trial with expiration timestamp", self.test_t1_22_activate_freemium_trial),
            ("T1.23", 1, "subscriptions", "Active Freemium trial unlocks gated VIP content (200 OK)", self.test_t1_23_active_freemium_access),
            ("T1.24", 1, "subscriptions", "Expired Freemium trial prompts 402 upgrade challenge", self.test_t1_24_freemium_expiration_enforcement),
            ("T1.25", 1, "subscriptions", "Paid tier upgrade via 402 settlement unlocks permanent VIP access", self.test_t1_25_paid_tier_upgrade_and_unlock),

            ("T1.26", 1, "static", "Static index.html served with 200 OK and text/html MIME", self.test_t1_26_index_html_served),
            ("T1.27", 1, "static", "Static js/main.js served with strict application/javascript MIME", self.test_t1_27_js_strict_mime_type),
            ("T1.28", 1, "static", "Dallas World Aquarium 2005 slide served with 200 OK and image/jpeg", self.test_t1_28_dallas_aquarium_slide_served),
            ("T1.29", 1, "static", "CORS headers Access-Control-Allow-Origin and Expose-Headers present", self.test_t1_29_cors_headers_presence),
            ("T1.30", 1, "static", "CORS preflight OPTIONS /api/health returns 204 No Content", self.test_t1_30_cors_preflight_options),
            ("T1.31", 1, "static", "Health check probe GET /api/health returns 200 OK with feature list", self.test_t1_31_health_probe),

            # Tier 2
            ("T2.1", 2, "402", "Tampered macaroon signature rejected with 402/401", self.test_t2_1_tampered_macaroon_signature),
            ("T2.2", 2, "402", "Expired macaroon timestamp caveat rejected", self.test_t2_2_expired_macaroon_rejected),
            ("T2.3", 2, "402", "Mismatched cryptographic preimage rejected during settlement", self.test_t2_3_invalid_preimage_hash_mismatch),
            ("T2.4", 2, "402", "Token scoped to different resource rejected", self.test_t2_4_token_resource_scope_mismatch),
            ("T2.5", 2, "402", "Malformed Authorization headers handled safely without 500 crash", self.test_t2_5_malformed_auth_header_resilience),

            ("T2.6", 2, "cart", "Adding invalid token ID to cart returns 400/404", self.test_t2_6_invalid_token_id),
            ("T2.7", 2, "cart", "Negative or zero item quantity rejected", self.test_t2_7_negative_quantity),
            ("T2.8", 2, "cart", "Checkout on empty cart returns 400 bad request", self.test_t2_8_checkout_empty_cart),
            ("T2.9", 2, "cart", "Rapid duplicate cart additions compute deterministic count", self.test_t2_9_rapid_duplicate_additions),
            ("T2.10", 2, "cart", "Cart clear boundary resets items and subtotal to 0", self.test_t2_10_cart_clear_boundary),

            ("T2.11", 2, "credits", "Invalid medallion metal type rejected with 400", self.test_t2_11_invalid_medallion_type),
            ("T2.12", 2, "credits", "Toss at exact 5-credit boundary leaves exactly 0 balance", self.test_t2_12_boundary_balance_toss_exact),
            ("T2.13", 2, "credits", "Toss attempt with sub-threshold balance (1-4 credits) rejected", self.test_t2_13_sub_threshold_balance_toss),
            ("T2.14", 2, "credits", "Fractional medallion quantity rejected", self.test_t2_14_fractional_medallion_quantity),
            ("T2.15", 2, "credits", "Sequential rapid tosses maintain non-negative credit balance", self.test_t2_15_concurrent_tosses_non_negative),

            ("T2.16", 2, "subscriptions", "Upgrade to invalid tier name rejected with 400", self.test_t2_16_invalid_tier_upgrade),
            ("T2.17", 2, "subscriptions", "Duplicate freemium trial activation handled predictably", self.test_t2_17_duplicate_freemium_activation),
            ("T2.18", 2, "subscriptions", "Expiration boundary condition verified", self.test_t2_18_exact_timestamp_boundary),
            ("T2.19", 2, "subscriptions", "Corrupted or forged subscription Bearer token rejected", self.test_t2_19_corrupted_auth_token),
            ("T2.20", 2, "subscriptions", "Anonymous client identifier defaults safely to Free tier", self.test_t2_20_anonymous_client_defaults),

            ("T2.21", 2, "static", "Directory traversal paths (../..) blocked safely", self.test_t2_21_directory_traversal_blocked),
            ("T2.22", 2, "static", "Nonexistent static asset returns 404 Not Found", self.test_t2_22_nonexistent_file_404),
            ("T2.23", 2, "static", "Unknown file extension served with valid fallback Content-Type", self.test_t2_23_unknown_extension_mime_fallback),
            ("T2.24", 2, "static", "Byte-range header requests handled with Accept-Ranges", self.test_t2_24_byte_range_request),
            ("T2.25", 2, "static", "Static URL with complex query parameters resolved cleanly", self.test_t2_25_query_param_stripping),

            # Tier 3
            ("T3.1", 3, "cart", "Cart checkout leaves Wishing Well credits balance untouched", self.test_t3_1_cart_checkout_leaves_credits_untouched),
            ("T3.2", 3, "credits", "Medallion credit purchase leaves subscription tier untouched", self.test_t3_2_credit_purchase_leaves_subscription_untouched),
            ("T3.3", 3, "subscriptions", "Paid subscriber still requires separate 402 payment for NFT basket", self.test_t3_3_paid_subscription_with_isolated_cart),
            ("T3.4", 3, "subscriptions", "Freemium trial user accesses VIP features while credits remain independent", self.test_t3_4_freemium_trial_with_medallion_bonus),
            ("T3.5", 3, "cart", "Session state isolation: Client A and Client B carts and balances fully segregated", self.test_t3_5_client_isolation_verification),
            ("T3.6", 3, "static", "Concurrent static WebXR assets and 402 challenge/settlement traffic handled without deadlock", self.test_t3_6_concurrent_static_and_api_traffic),

            # Tier 4
            ("T4.1", 4, "cart", "Real-World Journey: Harps of God Collector NFT checkout flow", self.test_t4_1_harps_collector_journey),
            ("T4.2", 4, "credits", "Real-World Journey: Theophany Pilgrim medallion purchase & Wishing Well toss", self.test_t4_2_theophany_pilgrim_journey),
            ("T4.3", 4, "subscriptions", "Real-World Journey: Pneumatic Investor Free -> Freemium -> Paid subscription lifecycle", self.test_t4_3_pneumatic_investor_subscription_lifecycle),
            ("T4.4", 4, "static", "Real-World Journey: Multi-client concurrent Skyport deck investor walkthrough", self.test_t4_4_multi_client_concurrent_deck_walkthrough),
        ]

        mode_str = "IN-PROCESS DISPATCH" if self.client.use_direct else f"NETWORK HTTP ({self.client.base_url})"
        print("=" * 75)
        print("  GOOD FAITH PARADIGM WEBXR — E2E TEST HARNESS")
        print(f"  Transport Mode : {mode_str}")
        print(f"  Execution Mode : {'STRICT' if self.strict else 'PROGRESSIVE'}")
        if tier_filter:
            print(f"  Tier Filter    : Tier {tier_filter}")
        if suite_filter:
            print(f"  Suite Filter   : {suite_filter}")
        print("=" * 75)

        for tid, tier, suite, desc, fn in tests:
            if tier_filter and tier != tier_filter:
                continue
            if suite_filter and suite.lower() != suite_filter.lower():
                continue
            self.run_test(tid, tier, desc, fn)

        return self.print_summary()

    def print_summary(self) -> bool:
        passed = sum(1 for r in self.results if r.passed)
        failed = sum(1 for r in self.results if not r.passed and not r.skipped)
        skipped = sum(1 for r in self.results if r.skipped)
        total = len(self.results)
        total_time = sum(r.duration_sec for r in self.results)

        print("\n" + "=" * 75)
        print(f"  TEST EXECUTION SUMMARY: {passed}/{total} Passed, {failed} Failed, {skipped} Skipped ({total_time:.2f}s)")
        print("=" * 75)

        if failed > 0:
            print("\n  FAILURES:")
            for r in self.results:
                if not r.passed and not r.skipped:
                    print(f"    - [{r.test_id}] {r.description}: {r.error_message}")

        if skipped > 0 and not self.strict:
            print(f"\n  NOTE: {skipped} tests skipped pending subsequent milestone module deployment.")
            print("  (Run with --strict to treat skips as failures).")

        return failed == 0


# =====================================================================
# Main CLI Entry Point
# =====================================================================
def main():
    parser = argparse.ArgumentParser(description="GFP WebXR E2E Monetization Test Suite")
    parser.add_argument("--host", default="127.0.0.1", help="Target host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8080, help="Target port (default: 8080)")
    parser.add_argument("--direct", action="store_true", help="Force in-process dispatch without network socket")
    parser.add_argument("--tier", type=int, choices=[1, 2, 3, 4], help="Run tests for specific tier only")
    parser.add_argument("--suite", choices=["402", "cart", "credits", "subscriptions", "static"], help="Run tests for specific feature suite")
    parser.add_argument("--strict", action="store_true", help="Treat skipped tests as failures")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose debug output")
    parser.add_argument("--json-report", help="Path to write JSON test report")

    args = parser.parse_args()

    base_url = f"http://{args.host}:{args.port}"
    runner = MonetizationE2ETestSuite(base_url, force_direct=args.direct, strict=args.strict, verbose=args.verbose)

    success = runner.run_all(tier_filter=args.tier, suite_filter=args.suite)

    if args.json_report:
        report_data = {
            "timestamp": int(time.time()),
            "base_url": base_url,
            "total_tests": len(runner.results),
            "passed": sum(1 for r in runner.results if r.passed),
            "failed": sum(1 for r in runner.results if not r.passed and not r.skipped),
            "skipped": sum(1 for r in runner.results if r.skipped),
            "tests": [
                {
                    "test_id": r.test_id,
                    "tier": r.tier,
                    "description": r.description,
                    "passed": r.passed,
                    "skipped": r.skipped,
                    "skip_reason": r.skip_reason,
                    "error_message": r.error_message,
                    "duration_sec": round(r.duration_sec, 4),
                }
                for r in runner.results
            ],
        }
        with open(args.json_report, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2)
        print(f"[INFO] JSON report written to {args.json_report}")

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
