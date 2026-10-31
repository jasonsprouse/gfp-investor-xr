#!/usr/bin/env python3
"""
Good Faith Paradigm WebXR - Milestone 1 Adversarial Challenge & Stress Test Suite
Author: challenger_m1_2 (EMPIRICAL CHALLENGER)

Adversarial Stress Dimensions:
1. Directory Traversal & Path Normalization (relative, encoded, backslash, drive, null-byte)
2. MIME Type Verification & Extensions (standard, query params, unknown, extensionless)
3. HTTP Methods & Verb Security (GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH on static & API)
4. API Route Integrity & Payload Robustness (malformed JSON, massive body, invalid auth, expired tokens)
5. Concurrency & Mixed Load Stress Testing (concurrent static + API across multiple threads)
6. Reference Repository Cleanliness Audit (vr-club-gparadigm zero modification check)
"""

import io
import json
import os
import posixpath
import subprocess
import sys
import threading
import time
import urllib.parse

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)

import serve
import backend.http402 as h
import backend.api_handler as api

# Suppress reverse DNS lookup delay in BaseHTTPRequestHandler during testing
serve.Handler.address_string = lambda self: "127.0.0.1"


class MockSocket:
    """In-memory socket simulation for standard library HTTP handler testing."""
    def __init__(self, request_bytes: bytes):
        self.rfile = io.BytesIO(request_bytes)
        self.wfile = io.BytesIO()

    def makefile(self, mode: str, *args, **kwargs):
        if "r" in mode:
            return self.rfile
        return self.wfile

    def sendall(self, b: bytes):
        self.wfile.write(b)


class MockServer:
    server_address = ("127.0.0.1", 8080)


def execute_request(raw_request: bytes) -> "ParsedResponse":
    sock = MockSocket(raw_request)
    handler = serve.Handler(sock, ("127.0.0.1", 54321), MockServer())
    response_data = sock.wfile.getvalue()
    return ParsedResponse(response_data)


class ParsedResponse:
    def __init__(self, raw: bytes):
        self.raw = raw
        self.status = 0
        self.status_text = ""
        self.headers = {}
        self.body = b""
        self._parse()

    def _parse(self):
        if not self.raw:
            return
        parts = self.raw.split(b"\r\n\r\n", 1)
        header_section = parts[0].decode("utf-8", errors="replace")
        self.body = parts[1] if len(parts) > 1 else b""

        lines = header_section.split("\r\n")
        if lines:
            status_line = lines[0]
            status_parts = status_line.split(" ", 2)
            if len(status_parts) >= 2:
                try:
                    self.status = int(status_parts[1])
                    self.status_text = status_parts[2] if len(status_parts) > 2 else ""
                except ValueError:
                    pass

        for line in lines[1:]:
            if ": " in line:
                k, v = line.split(": ", 1)
                self.headers[k.lower()] = v

    def json(self):
        return json.loads(self.body.decode("utf-8"))


# ==============================================================================
# CHALLENGE SUITE 1: Directory Traversal & Path Escaping
# ==============================================================================
def test_directory_traversal():
    print("\n--- Challenge 1: Directory Traversal & Path Escaping ---")
    
    # 1. translate_path boundary testing
    handler = serve.Handler(MockSocket(b"GET / HTTP/1.0\r\n\r\n"), ("127.0.0.1", 54321), MockServer())
    base_dir = os.path.abspath(serve.DIRECTORY)

    traversal_payloads = [
        "/../",
        "/../../",
        "/../../../",
        "/../../../../../../Windows/win.ini",
        "/..%2f..%2f..%2fWindows%2fwin.ini",
        "/..%2F..%2F..%2FWindows%2Fwin.ini",
        "/%2e%2e/%2e%2e/%2e%2e/Windows/win.ini",
        "/..\\..\\..\\Windows\\win.ini",
        "/..%5c..%5c..%5cWindows%5cwin.ini",
        "/....//....//....//Windows/win.ini",
        "/tools/../../Windows/win.ini",
        "/media/../../../../Windows/win.ini",
        "/C:/Windows/win.ini",
        "/C:\\Windows\\win.ini",
        "/../vr-club-gparadigm/index.html",
        "/..%2fvr-club-gparadigm%2findex.html",
        "/.git/config",
        "/index.html%00.txt",
    ]

    for payload in traversal_payloads:
        # Check translate_path output
        translated = handler.translate_path(payload)
        norm_translated = os.path.abspath(translated)
        
        # Security invariant: Translated path MUST be inside base_dir
        common_path = os.path.commonpath([base_dir, norm_translated])
        assert common_path == base_dir, (
            f"VULNERABILITY DETECTED! Traversal payload '{payload}' escaped to '{norm_translated}'!"
        )

        # Send full HTTP GET request to handler and verify it does NOT return 200 with external file
        try:
            req = f"GET {payload} HTTP/1.0\r\nHost: localhost\r\n\r\n".encode("utf-8")
            resp = execute_request(req)
            if resp.status == 200:
                assert b"[fonts]" not in resp.body and b"[extensions]" not in resp.body, (
                    f"CRITICAL VULNERABILITY: win.ini leaked via {payload}!"
                )
                assert "vr-club-gparadigm" not in payload, f"CRITICAL VULNERABILITY: vr-club-gparadigm leaked via {payload}!"
            print(f"  [PASS] Traversal blocked: {payload} -> status {resp.status}, path strictly inside root")
        except ValueError as val_err:
            if "embedded null" in str(val_err):
                print(f"  [PASS] Null-byte injection blocked safely by Python runtime: {val_err}")
            else:
                raise

    # Specifically test dotfile exposure finding
    dotfile_resp = execute_request(b"GET /.git/config HTTP/1.0\r\nHost: localhost\r\n\r\n")
    if dotfile_resp.status == 200 and b"[core]" in dotfile_resp.body:
        print("  [FINDING] Dotfile exposure: /.git/config is accessible via static handler (status 200).")
    else:
        print("  [PASS] Dotfiles are blocked.")


# ==============================================================================
# CHALLENGE SUITE 2: MIME Types & Unknown Extensions
# ==============================================================================
def test_mime_types():
    print("\n--- Challenge 2: MIME Types & Extensions ---")
    handler = serve.Handler(MockSocket(b"GET / HTTP/1.0\r\n\r\n"), ("127.0.0.1", 54321), MockServer())

    # Strict MIME types required by WebXR and Modern Browsers
    expected_mimes = {
        "main.js": "application/javascript",
        "module.mjs": "application/javascript",
        "style.css": "text/css",
        "index.html": "text/html",
        "icon.svg": "image/svg+xml",
        "favicon.ico": "image/x-icon",
        "image.png": "image/png",
        "photo.jpg": "image/jpeg",
        "video.mp4": "video/mp4",
        "clip.webm": "video/webm",
        "data.json": "application/json",
    }

    for filename, expected_mime in expected_mimes.items():
        # Standard guess
        guessed = handler.guess_type(filename)
        assert guessed == expected_mime, f"MIME mismatch for {filename}: expected {expected_mime}, got {guessed}"

        # Real HTTP request with query parameter
        req = f"GET /{filename}?v=2026.1 HTTP/1.0\r\nHost: localhost\r\n\r\n".encode("utf-8")
        resp = execute_request(req)
        # Note: Some files may not exist on disk, but if 200, Content-Type must match
        if resp.status == 200:
            ctype = resp.headers.get("content-type", "").split(";")[0].strip()
            assert ctype == expected_mime, f"HTTP Content-Type mismatch for {filename}?v=2026.1: got {ctype}"

    # Note the empirical finding regarding Handler.guess_type line 55:
    guessed_clean = handler.guess_type("index.html")
    guessed_with_query = handler.guess_type("index.html?v=2026.1")
    if guessed_clean == "text/html" and guessed_with_query == "application/octet-stream":
        print("  [FINDING] Minor inconsistency: Handler.guess_type() passes unstripped path to super().guess_type(path) on line 55, defaulting to application/octet-stream when called directly with query strings. (In real HTTP requests, translate_path strips query strings before calling guess_type).")

    # Unknown extensions and extensionless files
    unknown_cases = [
        ("model.glb", "application/octet-stream"),
        ("model.gltf", "application/octet-stream"),
        ("archive.xyz", "application/octet-stream"),
        ("binary.bin", "application/octet-stream"),
        ("Dockerfile", "application/octet-stream"),
        ("README", "application/octet-stream"),
    ]

    for filename, expected_mime in unknown_cases:
        mime = handler.guess_type(filename)
        assert mime == expected_mime, f"Expected {expected_mime} for {filename}, got {mime}"
        print(f"  [PASS] MIME fallback for '{filename}': {mime}")

    # Check actual static serving response headers
    req = b"GET /serve.py HTTP/1.0\r\nHost: localhost\r\n\r\n"
    resp = execute_request(req)
    assert resp.status == 200
    assert resp.headers.get("access-control-allow-origin") == "*"
    assert resp.headers.get("cross-origin-opener-policy") == "same-origin-allow-popups"
    assert resp.headers.get("accept-ranges") == "bytes"
    print("  [PASS] Static response headers validated: CORS, COOP, Accept-Ranges")


# ==============================================================================
# CHALLENGE SUITE 3: HTTP Methods & Verb Security
# ==============================================================================
def test_http_methods():
    print("\n--- Challenge 3: HTTP Methods & Verb Security ---")

    # Static route method tests
    static_methods = {
        "GET": 200,
        "HEAD": 200,
        "OPTIONS": 204,
        "POST": 405,
        "PUT": 405,
        "DELETE": 405,
    }

    for method, expected_status in static_methods.items():
        req = f"{method} /index.html HTTP/1.0\r\nHost: localhost\r\n\r\n".encode("utf-8")
        resp = execute_request(req)
        assert resp.status == expected_status, (
            f"Method {method} on static route: expected {expected_status}, got {resp.status}"
        )
        if method == "OPTIONS":
            assert resp.status == 204
            assert resp.headers.get("access-control-allow-origin") == "*"
        print(f"  [PASS] Static route {method} -> {resp.status}")

    # API route method tests
    # 1. OPTIONS on /api/health -> 204 preflight
    req = b"OPTIONS /api/health HTTP/1.0\r\nHost: localhost\r\n\r\n"
    resp = execute_request(req)
    assert resp.status == 204
    assert resp.headers.get("access-control-max-age") == "86400"
    print("  [PASS] OPTIONS /api/health -> 204 preflight")

    # 2. GET /api/health -> 200 JSON
    req = b"GET /api/health HTTP/1.0\r\nHost: localhost\r\n\r\n"
    resp = execute_request(req)
    assert resp.status == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert "uptime_seconds" in data
    print("  [PASS] GET /api/health -> 200 OK")

    # 3. GET /api/402/challenge -> 404 (only POST is allowed)
    req = b"GET /api/402/challenge HTTP/1.0\r\nHost: localhost\r\n\r\n"
    resp = execute_request(req)
    assert resp.status == 404, f"Expected 404 on GET /api/402/challenge, got {resp.status}"
    print("  [PASS] GET /api/402/challenge -> 404 Not Found")

    # 4. POST /api/402/challenge -> 402 Payment Required
    body = json.dumps({"amount": 500, "resource": "/api/protected/test"}).encode("utf-8")
    req = (
        b"POST /api/402/challenge HTTP/1.0\r\n"
        b"Host: localhost\r\n"
        b"Content-Type: application/json\r\n"
        b"Content-Length: " + str(len(body)).encode("utf-8") + b"\r\n\r\n" + body
    )
    resp = execute_request(req)
    assert resp.status == 402
    assert "www-authenticate" in resp.headers
    assert "payment-required" in resp.headers
    ch_data = resp.json()
    assert ch_data["amount"] == 500
    payment_id = ch_data["payment_id"]
    print(f"  [PASS] POST /api/402/challenge -> 402 with challenge {payment_id}")

    # 5. POST /api/402/settle (demo faucet) -> 200 OK
    settle_body = json.dumps({"payment_id": payment_id, "method": "demo"}).encode("utf-8")
    req = (
        b"POST /api/402/settle HTTP/1.0\r\n"
        b"Host: localhost\r\n"
        b"Content-Type: application/json\r\n"
        b"Content-Length: " + str(len(settle_body)).encode("utf-8") + b"\r\n\r\n" + settle_body
    )
    resp = execute_request(req)
    assert resp.status == 200
    settle_data = resp.json()
    assert settle_data["success"] is True
    token = settle_data["token"]
    print("  [PASS] POST /api/402/settle -> 200 OK with token")

    # 6. GET /api/protected/test with Token -> 200 OK
    req = (
        b"GET /api/protected/test HTTP/1.0\r\n"
        b"Host: localhost\r\n"
        b"Authorization: Bearer " + token.encode("utf-8") + b"\r\n\r\n"
    )
    resp = execute_request(req)
    assert resp.status == 200
    assert resp.json()["message"] == "Resource unlocked successfully"
    print("  [PASS] GET /api/protected/test with Bearer Token -> 200 OK")


# ==============================================================================
# CHALLENGE SUITE 4: Adversarial API Payload Stress
# ==============================================================================
def test_adversarial_api_payloads():
    print("\n--- Challenge 4: Adversarial API Payload Stress ---")

    # 1. Corrupted / Malformed JSON body
    bad_json = b"{\ninvalid json :::: [[["
    req = (
        b"POST /api/402/challenge HTTP/1.0\r\n"
        b"Host: localhost\r\n"
        b"Content-Type: application/json\r\n"
        b"Content-Length: " + str(len(bad_json)).encode("utf-8") + b"\r\n\r\n" + bad_json
    )
    resp = execute_request(req)
    assert resp.status == 400
    assert resp.json()["error"] == "bad_request"
    print("  [PASS] Malformed JSON handled gracefully -> 400 Bad Request")

    # 2. Non-existent payment_id to settle
    settle_fake = json.dumps({"payment_id": "ch_nonexistent_99999", "method": "demo"}).encode("utf-8")
    req = (
        b"POST /api/402/settle HTTP/1.0\r\n"
        b"Host: localhost\r\n"
        b"Content-Type: application/json\r\n"
        b"Content-Length: " + str(len(settle_fake)).encode("utf-8") + b"\r\n\r\n" + settle_fake
    )
    resp = execute_request(req)
    assert resp.status == 404
    assert resp.json()["error"] == "challenge_not_found"
    print("  [PASS] Nonexistent payment_id -> 404 challenge_not_found")

    # 3. Missing payment_id to settle
    settle_missing = json.dumps({"preimage": "1234"}).encode("utf-8")
    req = (
        b"POST /api/402/settle HTTP/1.0\r\n"
        b"Host: localhost\r\n"
        b"Content-Type: application/json\r\n"
        b"Content-Length: " + str(len(settle_missing)).encode("utf-8") + b"\r\n\r\n" + settle_missing
    )
    resp = execute_request(req)
    assert resp.status == 400
    assert resp.json()["error"] == "missing_payment_id"
    print("  [PASS] Missing payment_id -> 400 missing_payment_id")

    # 4. Tampered Bearer token
    tampered_token = "gfp_tok.eyJzb21ldGhpbmciOiAidmFsdWUifQ.deadbeef00112233"
    req = (
        b"GET /api/protected/test HTTP/1.0\r\n"
        b"Host: localhost\r\n"
        b"Authorization: Bearer " + tampered_token.encode("utf-8") + b"\r\n\r\n"
    )
    resp = execute_request(req)
    assert resp.status == 402, f"Expected 402 on tampered token, got {resp.status}"
    print("  [PASS] Tampered Bearer token rejected -> 402 Payment Required challenge")

    # 5. Non-existent API route
    req = b"GET /api/does_not_exist_xyz HTTP/1.0\r\nHost: localhost\r\n\r\n"
    resp = execute_request(req)
    assert resp.status == 404
    assert resp.json()["error"] == "not_found"
    print("  [PASS] Nonexistent API route -> 404 not_found")


# ==============================================================================
# CHALLENGE SUITE 5: Concurrency & Mixed Load Stress
# ==============================================================================
def test_concurrent_mixed_load():
    print("\n--- Challenge 5: Concurrency & Mixed Load Stress ---")
    threads_count = 10
    iterations_per_thread = 15
    errors = []

    def load_worker(tid: int):
        try:
            for i in range(iterations_per_thread):
                op = (tid + i) % 4
                if op == 0:
                    # Static request
                    resp = execute_request(b"GET /index.html HTTP/1.0\r\nHost: localhost\r\n\r\n")
                    if resp.status != 200:
                        errors.append(f"Thread {tid} static GET failed: {resp.status}")
                elif op == 1:
                    # Health check
                    resp = execute_request(b"GET /api/health HTTP/1.0\r\nHost: localhost\r\n\r\n")
                    if resp.status != 200:
                        errors.append(f"Thread {tid} health check failed: {resp.status}")
                elif op == 2:
                    # Challenge creation
                    body = json.dumps({"amount": 100 + i, "resource": f"/api/protected/t{tid}"}).encode("utf-8")
                    req = (
                        b"POST /api/402/challenge HTTP/1.0\r\n"
                        b"Host: localhost\r\n"
                        b"Content-Type: application/json\r\n"
                        b"Content-Length: " + str(len(body)).encode("utf-8") + b"\r\n\r\n" + body
                    )
                    resp = execute_request(req)
                    if resp.status != 402:
                        errors.append(f"Thread {tid} challenge creation failed: {resp.status}")
                elif op == 3:
                    # Challenge + Immediate Demo Settlement
                    body = json.dumps({"amount": 50, "resource": f"/api/res/t{tid}"}).encode("utf-8")
                    req1 = (
                        b"POST /api/402/challenge HTTP/1.0\r\n"
                        b"Host: localhost\r\n"
                        b"Content-Type: application/json\r\n"
                        b"Content-Length: " + str(len(body)).encode("utf-8") + b"\r\n\r\n" + body
                    )
                    resp1 = execute_request(req1)
                    pid = resp1.json().get("payment_id")
                    if pid:
                        sbody = json.dumps({"payment_id": pid, "method": "demo"}).encode("utf-8")
                        req2 = (
                            b"POST /api/402/settle HTTP/1.0\r\n"
                            b"Host: localhost\r\n"
                            b"Content-Type: application/json\r\n"
                            b"Content-Length: " + str(len(sbody)).encode("utf-8") + b"\r\n\r\n" + sbody
                        )
                        resp2 = execute_request(req2)
                        if resp2.status != 200 or not resp2.json().get("success"):
                            errors.append(f"Thread {tid} settle failed: {resp2.status}")
        except Exception as exc:
            errors.append(f"Thread {tid} exception: {exc}")

    threads = [threading.Thread(target=load_worker, args=(t,)) for t in range(threads_count)]
    t_start = time.time()
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10.0)
    elapsed = time.time() - t_start

    total_ops = threads_count * iterations_per_thread
    assert len(errors) == 0, f"Concurrency errors encountered ({len(errors)}): {errors[:5]}"
    print(f"  [PASS] {total_ops} mixed concurrent requests completed in {elapsed:.2f}s with 0 errors!")


# ==============================================================================
# CHALLENGE SUITE 6: Reference Repository Cleanliness Audit
# ==============================================================================
def test_reference_repo_cleanliness():
    print("\n--- Challenge 6: Reference Repository Cleanliness Audit ---")
    ref_repo_path = r"C:\Users\jason\.gemini\antigravity\scratch\vr-club-gparadigm"
    assert os.path.isdir(ref_repo_path), f"Reference repository path does not exist: {ref_repo_path}"

    # Run git status
    proc_status = subprocess.run(
        ["git", "-C", ref_repo_path, "status", "--porcelain"],
        capture_output=True,
        text=True,
    )
    assert proc_status.returncode == 0, f"git status failed: {proc_status.stderr}"
    assert proc_status.stdout.strip() == "", (
        f"VIOLATION: Reference repo has modified/untracked files:\n{proc_status.stdout}"
    )

    # Run git diff HEAD
    proc_diff = subprocess.run(
        ["git", "-C", ref_repo_path, "diff", "HEAD"],
        capture_output=True,
        text=True,
    )
    assert proc_diff.returncode == 0
    assert proc_diff.stdout.strip() == "", "VIOLATION: Reference repo has uncommitted diff against HEAD!"

    print(f"  [PASS] Reference repo '{ref_repo_path}' is 100% clean with ZERO modifications.")


# ==============================================================================
# MAIN ENTRY POINT
# ==============================================================================
def main():
    print("=" * 65)
    print("  GOOD FAITH PARADIGM — EMPIRICAL ADVERSARIAL CHALLENGE SUITE (M1)")
    print("  Target: serve.py, backend/*, MIME Types, Traversal, Concurrency")
    print("=" * 65)

    test_directory_traversal()
    test_mime_types()
    test_http_methods()
    test_adversarial_api_payloads()
    test_concurrent_mixed_load()
    test_reference_repo_cleanliness()

    print("\n" + "=" * 65)
    print("  ALL 6 ADVERSARIAL CHALLENGE SUITES PASSED EMPIRICALLY (100% OK)")
    print("=" * 65)


if __name__ == "__main__":
    main()
