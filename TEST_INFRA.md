# Good Faith Paradigm WebXR — E2E Test Infrastructure Specification

**Document Version:** 1.0.0  
**Target Project:** `gfp-investor-xr`  
**Milestone:** E2E Testing Track  
**Standards Alignment:** RFC 9110 (HTTP 402), L402 / LSAT Capability Macaroons, W3C WebXR Device API, Headless Chromium/Edge Visual QA  

---

## 1. Test Architecture Overview

The Good Faith Paradigm WebXR Investor Experience utilizes a comprehensive **4-tier opaque-box automated test architecture** coupled with an automated **headless browser visual QA pipeline**.

```
+--------------------------------------------------------------------------------------------------+
|                                    E2E TEST HARNESS RUNNER                                       |
|                               (tools/test_e2e_monetization.py)                                   |
+--------------------------------------------------------------------------------------------------+
          │                                                                     │
          ▼                                                                     ▼
+───────────────────────────────────────────────+     +────────────────────────────────────────────+
|          HTTP 402 & REST API GATING           |     |        HEADLESS BROWSER VISUAL QA          |
|  - Standalone pure-Python HTTP client         |     |  - tools/qa_adventure_kiosk.py              |
|  - Live server or auto-spawned ThreadedServer |     |  - tools/qa-adventure-kiosk.ps1            |
|  - RFC 9110 / L402 challenge parsing          |     |  - SwiftShader WebGL software rendering    |
|  - Cryptographic & simulation settlement faucet|    |  - Adventure Corridor kiosk verification   |
|  - Isolated multi-session state tracking      |     |  - 16:9 multimedia panel at [9.0,30,14.5]  |
+───────────────────────────────────────────────+     +────────────────────────────────────────────+
          │                                                                     │
          ▼                                                                     ▼
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                                       4-TIER TEST MATRIX                                         |
|                                                                                                  |
|   Tier 1: Feature Coverage (>= 5 tests per core feature)                                         |
|   Tier 2: Boundary, Edge & Corner Cases (>= 5 edge cases per feature)                            |
|   Tier 3: Cross-Feature Pairwise Combinations (cart, credits, subscriptions, 402, static)        |
|   Tier 4: Complete Real-World User Journeys (Collector, Pilgrim, Investor, Multi-Client)         |
+──────────────────────────────────────────────────────────────────────────────────────────────────+
```

### 1.1 Design Principles
1. **Zero External Dependencies:** Built entirely with Python's standard library (`urllib.request`, `http.client`, `hashlib`, `hmac`, `json`, `threading`, `time`). Executes on any platform (Windows, macOS, Linux) without requiring external package installations.
2. **Opaque-Box Protocol Verification:** Tests interact strictly across HTTP/1.1 boundaries on `http://localhost:8080` (or configured port), validating actual observable network status codes, headers (`WWW-Authenticate`, `Payment-Required`, `Access-Control-*`), and JSON payload structures.
3. **Session & State Isolation:** Uses distinct `X-Client-ID` headers and isolated test contexts per scenario, ensuring zero state pollution between tests and deterministic runs.
4. **Self-Healing / Dual Runner Modes:** Supports running against an already-active server instance (`python serve.py`) or automatically spawning an ephemeral in-process `ThreadedHTTPServer` on a designated port.

---

## 2. The 4-Tier Test Matrix

Every feature is evaluated across all four tiers to guarantee both functional compliance and architectural robustness.

### Summary Coverage Thresholds

| Feature Area | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Journeys) | Total Target |
|---|---|---|---|---|---|
| **F1: HTTP 402 Core Protocol Engine** | 7 | 5 | Pairwise | Journey 1-4 | 12+ |
| **F2: Rarible NFT Shopping Basket** | 6 | 5 | Pairwise | Journey 1, 4 | 11+ |
| **F3: Wishing Well Medallion Credits** | 6 | 5 | Pairwise | Journey 2, 4 | 11+ |
| **F4: Multi-Tier Subscriptions** | 6 | 5 | Pairwise | Journey 3, 4 | 11+ |
| **F5: Static Serving & CORS** | 6 | 5 | Pairwise | Scene Load | 11+ |
| **Total Test Cases** | **31** | **25** | **6** | **4** | **66+** |

---

### Tier 1: Feature Coverage (Core Happy Path)

- **HTTP 402 Core Protocol:**
  - `T1.1_unauth_protected_returns_402`: Verifies unauthenticated GET on `/api/protected/resource` returns HTTP 402 Payment Required.
  - `T1.2_www_authenticate_l402_header`: Confirms presence and format of `WWW-Authenticate: L402 macaroon="...", invoice="..."`.
  - `T1.3_payment_required_json_header`: Confirms presence of valid JSON in `Payment-Required` header (`amount`, `currency`, `settle_url`, `payment_id`).
  - `T1.4_custom_challenge_creation`: Verifies `POST /api/402/challenge` creates a challenge with specified amount and description.
  - `T1.5_challenge_settlement`: Verifies `POST /api/402/settle` returns status 200 and issues capability token and preimage.
  - `T1.6_l402_authorization_unlock`: Verifies `Authorization: L402 <macaroon>:<preimage>` unlocks protected resource with 200 OK.
  - `T1.7_bearer_and_x_token_unlock`: Verifies `Authorization: Bearer <token>` and `X-Payment-Token: <token>` unlock resource.

- **Rarible NFT Shopping Basket:**
  - `T1.8_catalog_retrieval`: Verifies `GET /api/nfts` or `GET /api/cart/items` lists tokens `#492856` (Yellow Y) and `#490643` (Green G) under contract `0xd07dc4262bcdbf85190c01c996b4c06a461d2430`.
  - `T1.9_add_yellow_nft`: Adds Yellow Y NFT to cart and verifies quantity and subtotal.
  - `T1.10_add_green_nft`: Adds Green G NFT to cart and verifies composite total.
  - `T1.11_cart_checkout_unpaid_402`: Calls checkout without payment, verifying 402 challenge with exact total cart price.
  - `T1.12_cart_checkout_settled_200`: Completes payment settlement and submits authenticated checkout, verifying order confirmation and tickets.
  - `T1.13_cart_remove_item`: Removes item from cart and validates updated item count and subtotal.

- **Theophany Wishing Well Medallion Credits:**
  - `T1.14_initial_credit_balance`: Verifies fresh user starts with 0 credits.
  - `T1.15_zero_balance_toss_rejected`: Attempting toss with insufficient credits triggers 402 challenge or error prompt.
  - `T1.16_gold_medallion_purchase_challenge`: Purchasing 2 oz Gold Medallion returns 402 challenge for 500 credits ($50 / 0.02 ETH / 50k sats).
  - `T1.17_gold_medallion_credit_allocation`: Settling Gold purchase increments credit balance by +500 credits.
  - `T1.18_silver_and_copper_purchase`: Verifies Silver allocates 100 credits ($10) and Copper allocates 25 credits ($2.50).
  - `T1.19_wishing_well_toss_execution`: Spends 5 credits to make a wish, verifying deduction to 495 and receipt of Theophany reflection object.

- **Multi-Tier Subscription Service:**
  - `T1.20_default_free_tier`: Verifies initial tier is "free" ("Pilgrim").
  - `T1.21_free_tier_gated_rejection`: Free tier accessing VIP executive content returns 402 upgrade challenge.
  - `T1.22_activate_freemium_trial`: Activates 24-hour Freemium VIP trial, returning active timestamp.
  - `T1.23_active_freemium_access`: Active freemium trial unlocks gated VIP content (200 OK).
  - `T1.24_freemium_expiration_enforcement`: Expired freemium timestamp triggers 402 trial-expired challenge.
  - `T1.25_paid_tier_upgrade_and_unlock`: Upgrades to Paid tier via 402 settlement, restoring permanent access.

- **Static File Serving & CORS:**
  - `T1.26_index_html_served`: Verifies `GET /index.html` returns 200 OK with `text/html` and Good Faith Paradigm title.
  - `T1.27_js_strict_mime_type`: Verifies `GET /js/main.js` returns `application/javascript` (avoiding Windows registry text/plain bug).
  - `T1.28_dallas_aquarium_slide_served`: Verifies `GET /media/booths/prismatic/slide_03.jpg` returns 200 OK with `image/jpeg`.
  - `T1.29_cors_headers_presence`: Verifies `Access-Control-Allow-Origin: *` and `Access-Control-Expose-Headers`.
  - `T1.30_cors_preflight_options`: Verifies `OPTIONS /api/health` returns 204 No Content with allowed headers.
  - `T1.31_health_probe`: Verifies `GET /api/health` returns 200 OK with feature list and uptime.

---

### Tier 2: Boundary, Edge & Corner Cases

- **HTTP 402 Protocol Boundaries:**
  - `T2.1_tampered_macaroon_signature`: Submitting macaroon with modified payload/signature rejected.
  - `T2.2_expired_macaroon_rejected`: Submitting macaroon with expired caveat rejected.
  - `T2.3_invalid_preimage_hash_mismatch`: Submitting 32-byte preimage not matching payment hash returns 400.
  - `T2.4_token_resource_scope_mismatch`: Token scoped to `/api/other` rejected when accessing `/api/protected/vip`.
  - `T2.5_malformed_auth_header_resilience`: Malformed `Authorization: L402 garbage:::data` handled gracefully without 500 crash.

- **Cart Boundaries:**
  - `T2.6_invalid_token_id`: Adding non-existent token `#999999` returns 400/404.
  - `T2.7_negative_quantity`: Submitting `quantity: -1` or `0` rejected.
  - `T2.8_checkout_empty_cart`: Initiating checkout on empty cart returns 400 bad request.
  - `T2.9_rapid_duplicate_additions`: Adding identical items rapidly calculates deterministic count and subtotal.
  - `T2.10_cart_clear_boundary`: Clearing cart resets total items to 0 and total price to 0.00.

- **Medallion Credit Boundaries:**
  - `T2.11_invalid_medallion_type`: Requesting `"platinum"` or `"diamond"` returns 400 bad request.
  - `T2.12_boundary_balance_toss_exact`: User with exactly 5 credits tosses; balance becomes exactly 0.
  - `T2.13_sub_threshold_balance_toss`: User with 4 credits attempts toss; rejected with 402 / insufficient credits.
  - `T2.14_fractional_medallion_quantity`: Purchasing fractional medallion quantities rejected.
  - `T2.15_concurrent_tosses_non_negative`: Sequential rapid tosses cease exactly when credits deplete below 5.

- **Subscription Boundaries:**
  - `T2.16_invalid_tier_upgrade`: Upgrading to non-existent tier `"ultra_vip"` returns 400.
  - `T2.17_duplicate_freemium_activation`: Attempting to reactivate an already-consumed freemium trial rejected.
  - `T2.18_exact_timestamp_boundary`: Verifying access behavior at exact expiration boundary (`time == expires_at`).
  - `T2.19_corrupted_auth_token`: Malformed Bearer token rejected.
  - `T2.20_anonymous_client_defaults`: Requesting status without `X-Client-ID` defaults safely to Free tier.

- **Static Serving Boundaries:**
  - `T2.21_directory_traversal_blocked`: Requests targeting `/../../../etc/passwd` or `..\..\..\windows` rejected.
  - `T2.22_nonexistent_file_404`: Request for `/media/missing_relic.glb` returns 404 Not Found.
  - `T2.23_unknown_extension_mime_fallback`: File with unmapped extension served as `application/octet-stream`.
  - `T2.24_byte_range_request`: Request with `Range: bytes=0-255` returns partial content (206) or full content.
  - `T2.25_query_param_stripping`: Static file path with URL parameters (`/index.html?view=skyport&clean=1`) resolves cleanly.

---

### Tier 3: Cross-Feature Combinations (Pairwise Interactions)

- `T3.1_cart_checkout_leaves_credits_untouched`: Settling an NFT basket checkout does NOT deduct or mutate Wishing Well credits.
- `T3.2_credit_purchase_leaves_subscription_untouched`: Buying medallion credits does NOT inadvertently upgrade or alter the user's subscription tier.
- `T3.3_paid_subscription_with_isolated_cart`: Upgrading to Paid tier unlocks VIP content but still enforces independent 402 checkout for NFT assets.
- `T3.4_freemium_trial_with_medallion_bonus`: Freemium user spends credits on Wishing Well while enjoying active VIP content access.
- `T3.5_client_isolation_verification`: Simultaneous Client Alpha and Client Beta interactions maintain strictly isolated carts, credits, and subscription states.
- `T3.6_concurrent_static_and_api_traffic`: Server handles concurrent requests for WebXR static assets alongside active HTTP 402 challenge/settlement requests without deadlocking.

---

### Tier 4: Real-World Scenarios (End-to-End User Journeys)

- `T4.1_harps_collector_journey`:
  1. Investor lands on Skyport deck (`/index.html`).
  2. Queries NFT catalog for *Harps of God* tokens `#492856` and `#490643`.
  3. Adds both Yellow and Green Harps to basket (total 0.10 ETH / $300).
  4. Initiates checkout -> receives 402 challenge.
  5. Settles payment via demo/preimage faucet.
  6. Submits authorized checkout -> receives confirmed order, museum tour pass, and collector raffle ticket.
- `T4.2_theophany_pilgrim_journey`:
  1. Pilgrim approaches Theophany Wishing Well.
  2. Checks balance (0 credits).
  3. Attempts toss -> receives 402 prompt to purchase medallions.
  4. Purchases 2 oz Silver Medallion Demo (100 credits) via 402 challenge & settlement.
  5. Tosses 5 credits -> receives quantum wave-function collapse revelation from *The Physics of Theophany*.
  6. Balance updates to 95 credits; tosses again -> balance updates to 90 credits.
- `T4.3_pneumatic_investor_subscription_lifecycle`:
  1. Visitor starts at Free tier ("Pilgrim").
  2. Attempts to open Executive Pitch Dossier -> receives 402 upgrade challenge.
  3. Activates 24-hour Freemium VIP trial.
  4. Accesses Executive Pitch Dossier -> successfully unlocked (200 OK).
  5. Trial expiration simulation triggers -> subsequent access prompts 402 trial-expired challenge.
  6. Visitor upgrades to Paid tier via 402 settlement -> permanent 30-day VIP access granted.
- `T4.4_multi_client_concurrent_deck_walkthrough`:
  1. Two visitors browse the Skyport deck concurrently.
  2. Visitor 1 purchases 2 oz Gold Medallion (500 credits) and tosses wishes.
  3. Visitor 2 builds an NFT basket with token `#492856`.
  4. Both perform actions simultaneously; state integrity verified for each distinct session.

---

## 3. Headless Browser Visual QA Specification

Visual quality assurance is automated via `tools/qa_adventure_kiosk.py` and `tools/qa-adventure-kiosk.ps1`.

### 3.1 Spatial Coordinates & Frustum Alignment
The visual QA pipeline navigates the camera to verify the **Adventure Corridor Kiosk and Multimedia Panel** on the Skyport Observation Deck:
- **World Position:** `[9.0, 30.0, 14.5]`
- **Panel Elevation & Dimensions:** Center at `[9.0, 32.5, 13.8]`, 16:9 aspect ratio (`3.6m x 2.025m`).
- **Rotation:** `rotY = -Math.PI / 10` facing player spawn line of sight.
- **Docent Lux Standpoint:** `[7.2, 30.0, 15.5]`.

### 3.2 Headless Rendering Parameters
- **Browser Executables:** Microsoft Edge (`msedge.exe`) or Google Chrome (`chrome.exe`).
- **Software WebGL:** `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`
- **Resolution:** 1920x1080 high-DPI viewport.
- **Budget:** 15,000 to 22,000 ms virtual time budget to allow WebGL shader compilation, Three.js texture loading, and audio/visual initialization.
- **URL Hooks:**
  - Frontal View: `http://localhost:8080/?clean=1&view=adventure`
  - Skyport Deck Overview: `http://localhost:8080/?clean=1&view=skyport`

### 3.3 Acceptance Criteria for Visual Verification
1. Screenshot output file exists and size exceeds 10,000 bytes.
2. 16:9 multimedia canvas is visible with glowing cyan/neon border.
3. Dallas World Aquarium 2005 context and historical foundation copy are verified in scene data.
4. Kiosk interactive control plinth is positioned in front of display panel.

---

## 4. Test Runner Invocation Guide

### 4.1 Running the Automated E2E Test Suite
The test runner is located at `tools/test_e2e_monetization.py`.

```powershell
# Run all tiers against running server on default port 8080
python tools/test_e2e_monetization.py

# Run with automatic server startup (starts serve.py on free port and terminates cleanly)
python tools/test_e2e_monetization.py --auto-server

# Target custom host/port
python tools/test_e2e_monetization.py --host 127.0.0.1 --port 8089

# Run specific tier only (1, 2, 3, or 4)
python tools/test_e2e_monetization.py --tier 1
python tools/test_e2e_monetization.py --tier 2
python tools/test_e2e_monetization.py --tier 3
python tools/test_e2e_monetization.py --tier 4

# Run specific functional suite (402, cart, credits, subscriptions, static)
python tools/test_e2e_monetization.py --suite 402
python tools/test_e2e_monetization.py --suite cart
python tools/test_e2e_monetization.py --suite credits
python tools/test_e2e_monetization.py --suite subscriptions
python tools/test_e2e_monetization.py --suite static

# Generate JSON report artifact for CI/CD audit
python tools/test_e2e_monetization.py --json-report test_report.json --verbose
```

### 4.2 Running the Headless Visual QA Pipeline
Visual QA scripts are provided in both pure Python and PowerShell.

```powershell
# Python Headless Visual QA runner:
python tools/qa_adventure_kiosk.py --server http://localhost:8080 --outdir qa/adventure-kiosk

# PowerShell Headless Visual QA runner:
powershell -File tools/qa-adventure-kiosk.ps1 -ServerUrl http://localhost:8080 -OutDir qa/adventure-kiosk
```

### 4.3 Exit Codes & Status Interpretation
- `0`: All executed tests passed with 100% compliance.
- `1`: One or more test assertions failed (implementation defect).
- `2`: Network or infrastructure error (target server unreachable and auto-server disabled).

---

## 5. Quality Gates & Continuous Verification Criteria

1. **Gate 1 (M1 Baseline):** 100% pass on Tier 1 & Tier 2 HTTP 402 protocol and static serving tests.
2. **Gate 2 (M2 Monetization):** 100% pass on Rarible NFT cart, medallion credits, and multi-tier subscription tests.
3. **Gate 3 (M3 Adventure Corridor):** Headless visual capture successfully generates screenshot of kiosk at `[9.0, 30.0, 14.5]`.
4. **Gate 4 (M4 Final Integration):** 100% pass across all 4 tiers (60+ tests) in a single unified run with zero failures.
