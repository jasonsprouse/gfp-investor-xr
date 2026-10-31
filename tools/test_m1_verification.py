#!/usr/bin/env python3
"""
Good Faith Paradigm WebXR - Milestone 1 Automated Unit & Integration Test Suite
Validates backend/http402.py, serve.py, and backend/api_handler.py
"""

import sys
import os
import mimetypes
import threading
import time

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)

import backend.http402 as h
import backend.api_handler as api
import serve

def test_http402_challenge_creation():
    c = h.create_challenge(
        resource="/api/protected/intelligence",
        amount=2500,
        currency="SATS",
        description="Access to VIP Investor Intelligence",
        amount_usd=2.50,
    )
    assert c["payment_id"].startswith("ch_"), f"Invalid payment_id: {c['payment_id']}"
    assert c["amount"] == 2500
    assert c["amount_usd"] == 2.50
    assert c["currency"] == "SATS"
    assert c["settled"] is False
    assert len(c["macaroon"]) > 20
    assert len(c["preimage"]) == 64
    assert len(c["payment_hash"]) == 64
    print("  [PASS] test_http402_challenge_creation")

def test_http402_demo_settlement():
    c = h.create_challenge(resource="/api/test/demo", amount=100)
    status, res = h.settle_challenge(c["payment_id"], method="demo")
    assert status == 200, f"Expected 200, got {status}"
    assert res["success"] is True
    assert res["token"].startswith("gfp_tok.")
    assert res["payment_id"] == c["payment_id"]

    # Verify token
    is_valid, payload, _ = h.verify_auth_token(res["token"], resource="/api/test/demo")
    assert is_valid is True
    assert payload["payment_id"] == c["payment_id"]
    print("  [PASS] test_http402_demo_settlement")

def test_http402_crypto_preimage_settlement():
    c = h.create_challenge(resource="/api/test/crypto", amount=500)

    # Test bad preimage rejection
    bad_status, bad_res = h.settle_challenge(
        c["payment_id"],
        preimage="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        method="crypto",
    )
    assert bad_status == 400
    assert bad_res["success"] is False
    assert bad_res["error"] == "invalid_preimage"

    # Test good preimage settlement
    good_status, good_res = h.settle_challenge(
        c["payment_id"],
        preimage=c["preimage"],
        method="crypto",
    )
    assert good_status == 200
    assert good_res["success"] is True
    assert good_res["token"].startswith("gfp_tok.")
    print("  [PASS] test_http402_crypto_preimage_settlement")

def test_http402_macaroon_verification():
    c = h.create_challenge(resource="/api/protected/doc", amount=750)
    is_valid, mac_data, reason = h.verify_macaroon(c["macaroon"], resource="/api/protected/doc")
    assert is_valid is True, f"Macaroon invalid: {reason}"
    assert mac_data["identifier"] == c["payment_id"]
    assert mac_data["payment_hash"] == c["payment_hash"]

    # Scope mismatch rejection
    mismatch_valid, _, mismatch_reason = h.verify_macaroon(c["macaroon"], resource="/api/different/path")
    assert mismatch_valid is False
    assert "scoped to" in mismatch_reason
    print("  [PASS] test_http402_macaroon_verification")

def test_http402_request_auth_schemes():
    c = h.create_challenge(resource="/api/vault", amount=1000)
    _, settle_res = h.settle_challenge(c["payment_id"], method="demo")
    token = settle_res["token"]

    # 1. L402 Header Scheme
    l402_headers = {"Authorization": f"L402 {c['macaroon']}:{c['preimage']}"}
    l402_ok, l402_data = h.verify_request_auth(l402_headers, resource="/api/vault")
    assert l402_ok is True
    assert l402_data["type"] == "l402"

    # 2. Bearer Header Scheme
    bearer_headers = {"Authorization": f"Bearer {token}"}
    bearer_ok, bearer_data = h.verify_request_auth(bearer_headers, resource="/api/vault")
    assert bearer_ok is True
    assert bearer_data["type"] == "bearer"

    # 3. X-Payment-Token Header Scheme
    x_headers = {"X-Payment-Token": token}
    x_ok, x_data = h.verify_request_auth(x_headers, resource="/api/vault")
    assert x_ok is True
    assert x_data["type"] == "x-payment-token"

    # 4. Missing / Invalid Auth
    no_auth_ok, _ = h.verify_request_auth({}, resource="/api/vault")
    assert no_auth_ok is False
    print("  [PASS] test_http402_request_auth_schemes")

def test_http402_headers_and_body_spec():
    c = h.create_challenge(resource="/api/resource", amount=1200, currency="SATS", amount_usd=1.20)
    headers, body = h.build_402_headers_and_body(c)

    assert "WWW-Authenticate" in headers
    assert headers["WWW-Authenticate"].startswith("L402 macaroon=")
    assert "invoice=" in headers["WWW-Authenticate"]
    assert "Payment-Required" in headers
    assert headers["Content-Type"] == "application/json; charset=utf-8"

    assert body["status"] == 402
    assert body["error"] == "Payment Required"
    assert body["payment_id"] == c["payment_id"]
    assert body["amount"] == 1200
    assert body["amount_usd"] == 1.20
    assert "instructions" in body
    print("  [PASS] test_http402_headers_and_body_spec")

def test_http402_thread_concurrency():
    """Verify thread safety and ensure no deadlock under concurrent challenge/settle requests."""
    errors = []

    def worker(worker_id):
        try:
            for i in range(10):
                ch = h.create_challenge(resource=f"/api/thread/{worker_id}", amount=100 + i)
                st, res = h.settle_challenge(ch["payment_id"], method="demo")
                if st != 200 or not res["success"]:
                    errors.append(f"Worker {worker_id} iteration {i} failed: status={st}")
        except Exception as exc:
            errors.append(f"Worker {worker_id} exception: {exc}")

    threads = [threading.Thread(target=worker, args=(t,)) for t in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5.0)

    assert len(errors) == 0, f"Concurrent worker errors: {errors}"
    print("  [PASS] test_http402_thread_concurrency (6 threads, 60 challenge/settle cycles)")

def test_serve_mimetypes_and_handler():
    assert mimetypes.guess_type("app.js")[0] == "application/javascript"
    assert mimetypes.guess_type("module.mjs")[0] == "application/javascript"
    assert mimetypes.guess_type("theme.css")[0] == "text/css"
    assert mimetypes.guess_type("index.html")[0] == "text/html"
    assert mimetypes.guess_type("vector.svg")[0] == "image/svg+xml"
    assert mimetypes.guess_type("clip.mp4")[0] == "video/mp4"
    assert mimetypes.guess_type("anim.webm")[0] == "video/webm"
    assert mimetypes.guess_type("favicon.ico")[0] == "image/x-icon"

    class MockHandler(serve.Handler):
        def __init__(self):
            pass

    h_instance = MockHandler()
    assert h_instance.guess_type("script.js?v=2") == "application/javascript"
    assert h_instance.guess_type("movie.mp4#t=10") == "video/mp4"
    assert h_instance.guess_type("movie.webm") == "video/webm"
    assert h_instance.guess_type("style.css") == "text/css"

    assert issubclass(serve.ThreadedHTTPServer, serve.socketserver.ThreadingMixIn)
    assert issubclass(serve.ThreadedHTTPServer, serve.http.server.HTTPServer)
    print("  [PASS] test_serve_mimetypes_and_handler")

def test_api_handler_routes():
    # Test route registration mechanism
    captured = []
    def custom_route(handler, path, method):
        captured.append((path, method))

    api.register_route("/api/custom_test", custom_route)
    assert "/api/custom_test" in api._route_handlers
    print("  [PASS] test_api_handler_routes")

def main():
    print("==================================================")
    print("GFP WebXR — Milestone 1 Backend Verification Suite")
    print("==================================================")
    test_http402_challenge_creation()
    test_http402_demo_settlement()
    test_http402_crypto_preimage_settlement()
    test_http402_macaroon_verification()
    test_http402_request_auth_schemes()
    test_http402_headers_and_body_spec()
    test_http402_thread_concurrency()
    test_serve_mimetypes_and_handler()
    test_api_handler_routes()
    print("==================================================")
    print("ALL 9 MILESTONE 1 VERIFICATION TESTS PASSED 100%!")
    print("==================================================")

if __name__ == "__main__":
    main()
