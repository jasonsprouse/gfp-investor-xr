# Good Faith Paradigm — Investor XR Campus & Interactive Booths (`gfp-investor-xr`) 🥽🏛️⚡

[![Live Production Demo](https://img.shields.io/badge/LIVE_WEBXR_DEMO-jasonsprouse.github.io%2Fgfp--investor--xr-00f0ff?style=for-the-badge&logo=github)](https://jasonsprouse.github.io/gfp-investor-xr/)
[![Source Decks](https://img.shields.io/badge/PRESENTATION_ARCHIVE-digital--golden--plates-ffc400?style=for-the-badge&logo=github)](https://github.com/jasonsprouse/digital-golden-plates)
[![HTTP 402 L402](https://img.shields.io/badge/WEB3_PAYMENTS-HTTP_402_%2F_L402-00ff88?style=for-the-badge)](https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.3)

An interactive **WebXR Spatial Investor Pitch Campus** and multi-tier virtual venue for **Good Faith Paradigm** ([@GparadigmOrgLove](https://www.youtube.com/@GparadigmOrgLove)), integrating narrated slide booths and interactive 3D digital relics from [`jasonsprouse/digital-golden-plates`](https://github.com/jasonsprouse/digital-golden-plates), an autonomous **NPC Docent (Docent Lux)** with synchronized voice narration, the **Adventure Corridor (HOA 2.0)** living-lab exhibit, intermodal **eVTOL & Last-Mile Ground Pod** transit, the **Paradigm VR Nightclub**, and **RFC 9110 HTTP 402 (L402)** Web3 monetization.

---

## 🌐 Live Production Links

- **🚀 Primary Production Entry (Skyport Observation Deck):**  
  **https://jasonsprouse.github.io/gfp-investor-xr/**
- **Direct Zone & Exhibit Deep Links:**
  - **Skyport Pitch Booths:** https://jasonsprouse.github.io/gfp-investor-xr/?view=skyport
  - **Adventure Corridor (Dallas 2005 / HOA 2.0):** https://jasonsprouse.github.io/gfp-investor-xr/?view=adventure
  - **Relic Pavilion (Golden Plates & Harps of God):** https://jasonsprouse.github.io/gfp-investor-xr/?view=relics
  - **Docent Lux Kiosk:** https://jasonsprouse.github.io/gfp-investor-xr/?view=docent
  - **3D VR Command Menu Open:** https://jasonsprouse.github.io/gfp-investor-xr/?view=skyport&do=vr:toggle_menu
  - **Paradigm VR Nightclub Dance Floor:** https://jasonsprouse.github.io/gfp-investor-xr/?view=floor

---

## 🏛️ Skyport Observation Deck (`Y = 30m`) — Interactive Pitch Booths

The Skyport Observation Deck hosts **four interactive 3D presentation booths** powered by `js/boothManager.js` and `js/boothData.js`, integrating slide imagery, transcripts, and audio narration directly from [`digital-golden-plates`](https://github.com/jasonsprouse/digital-golden-plates):

| Booth | Title & Deck | Slides & Media | Interactive Controls |
| :--- | :--- | :--- | :--- |
| **Booth 01** (`booth:prismatic`) | **Prismatic Architecture: *The Light Over The Word*** | **20 slides** + full MP3 voice narration (`media/booths/prismatic/`) | `PREV`, `PLAY / PAUSE`, `NEXT`, `AUTO`, `VIEW` (`Slide` / `Slide + Notes` / `Full Notes`), `LINK` |
| **Booth 02** (`booth:harps`) | **NFT Harps of God Raffle Deck** | **16 dual-image slides** + MP3 narration (`media/booths/harps/`) | Switchable 3-mode `VIEW` (`1: VIDEO` original frame evidence, `2: GFP` synthesis research, `3: BOTH` side-by-side) |
| **Booth 03** (`booth:archive`) | **Sacred Blueprint & Visual Archive** | **4 high-res plates** (GFP Infographic, Sacred Blueprint, Economics of Salvation, Golden Plates Blueprint) | Automatic proximity slideshow + manual `PREV` / `NEXT` / `SHOW` / `VIEW` / `LINK` |
| **Booth 04** (`booth:collector`) | **Harps of God Collector & Medallion Raffle** | **3 collector slides** for Rarible tokens `#492856` & `#490643` and 2 oz medallions | Direct Rarible deep-linking + HTTP 402 NFT Shopping Basket integration |

---

## ✨ Relic Pavilion (`js/relicPavilion.js`)

Positioned on the central Skyport plaza (`Z = 27.5m`), the **Relic Pavilion** provides tactile 3D digital twins of the core artifacts demonstrated in the presentations:

1. **The Three Golden Plates (`relic:plates`):**
   - **Plate 1:** *The Multiverse Proof Equation* ($\Omega_{\text{Total}} = \int \Psi_{\text{Path}} \cdot \Phi_{\text{Grace}}\, d\mathcal{M}$) with animated emerald, sapphire, and diamond inlays.
   - **Plate 2:** *Sacred Blueprint & The Four Pillars* ($1,000,000,000,000 covenantal reserve architecture).
   - **Plate 3 (Interactive `$2000 → $2001` Demonstration):** Click Plate 3 or its console button to slide the **Harp of God** card across the `$100` bill's zero so `2000` becomes `2001` (echoing the two music festivals of 2000 and 2001).
2. **Harps of God Cards (`relic:cards`):**
   - **Yellow Y (`Token #492856`):** *Dove & Seven World Religions* — click to flip 180° or add to the Web3 NFT Basket.
   - **Green G (`Token #490643`):** *Cosmic Harp* — click to flip 180° or add to the Web3 NFT Basket.
3. **Unfinished Pyramid & Sphinx Capstone (`relic:sphinx`):**
   - Demonstrates the $2,000,000\text{ mph} \approx 555.6\text{ miles/sec}$ count ($1\text{s} \to 555.6\text{ mi}$, $2\text{s} \to 1,111.1\text{ mi}$, $3\text{s} \to 1,666.7\text{ mi}$) while lowering the glowing Sphinx capstone onto the pyramid.
4. **2 oz Gold, Silver & Copper Raffle Medallions & Theophany Wishing Well (`relic:medals`):**
   - Click any medallion to flip between obverse (*In God We Trust • 2013*) and reverse (*Four Pillars • One Trillion Dollar*), or acquire medallion credits via HTTP 402 to toss into the Wishing Well.

---

## 🌐 Adventure Corridor Living Lab Exhibit (`js/adventureKiosk.js`)

Located at `[9.0, 30.0, 14.5]` on the Skyport deck, the **Adventure Corridor** kiosk and 16:9 cyber-glass display present a 5-slide interactive briefing based on the [Adventure Zone HOA 2.0](https://goodfaith.miraheze.org/wiki/File:Adventure_Zone_HOA_2.0.jpg) agenda:

1. **Theophany Foundation (Dallas World Aquarium, Dec 2005):** Highlights that the foundational *Miracles of the Holy Spirit* 35mm optical photographs were captured at the Dallas World Aquarium in December 2005, and the Adventure Corridor promotes resilient civic infrastructure in close proximity to those images.
2. **Health Huts for Contactless Optical Visual Check-Ups:** Retinal/pupillary reflex diagnostics, rPPG stress telemetry, and 5-step neuroplasticity restoration protocols with zero-knowledge Soulbound Token (SBT) attestations.
3. **Multimodal Mobility & 35 mph Quadruped Fleets:** High-altitude tandem tilt-rotor eVTOL skyways, autonomous electric last-mile ground pods, and open-source 35 mph robotic mule dogs.
4. **Food-Security Designs & RaaS Permaculture:** Robots-as-a-Service precision agriculture, closed-loop IoT soil telemetry, net-negative industrial hempcrete superstructures, and the Universal Basic Income Feedback Loop (UBIFL).
5. **HOA 2.0 Algorithmic Governance (Autonomous Hybrid Sovereignty):** The constitutional triad of DAO legislative policy, AI executive dispatch (`<$50` optimistic automation), and blockchain judicial escrow.

---

## 🧭 NPC Docent Lux (`js/docentNPC.js` & `js/docentScript.js`)

**Docent Lux** is an autonomous procedural guide stationed at `[0, 30, 16.0]`:
- **Dual-Engine Voice Output:** Uses 46 pre-rendered WAV voice files (`media/docent/*.wav`, generated via `tools/generate_docent_audio.py`) played over HTML5 `<audio>` with automatic club-music ducking (`18%` volume), backed by a hardened Web Speech API fallback and overhead speech-bubble captions.
- **Physical Demonstrations:** Walks between stops, faces visitors, physically points at booth/relic buttons, and triggers real commands (`BoothManager.runCommand`, `RelicPavilion.runCommand`, `AdventureKiosk.handleAction`).
- **Kiosk & Hotkeys:** Use the 3D `ASK THE DOCENT` kiosk (`TOUR`, `EXPLAIN`, `RELICS`, `STOP`) or press <kbd>T</kbd> for a full guided tour and <kbd>H</kbd> to explain the nearest booth or relic.

---

## 🥽 VR Navigation, Wrist Command Deck & Floating 3D Menu (`js/xrController.js`)

Designed for **Meta Quest 2 / 3 / Pro**, **Apple Vision Pro**, **PC VR**, and **Desktop First-Person**:

### 1. 12-Button Left-Wrist Command Deck
Mounted directly on the left VR controller grip in 3 tactile rows:
- **Row 1 (Booth & Docent):** `◄ SLIDE`, `NARRATE`, `SLIDE ►`, `DOCENT`
- **Row 2 (Instant Teleport):** `BOOTHS` (cycles all 4 booths), `CORRIDOR`, `RELICS`, `CLUB`
- **Row 3 (Cinema & Menu):** `◄ TRK`, `PLAY`, `TRK ►`, `☰ MENU`

### 2. 20-Button Floating 3D VR Campus & Booth Menu
Summon or close the spatial 3D command board right in front of you via **`☰ MENU`** on your wrist, **Left Thumbstick Click** in VR, pressing <kbd>M</kbd> on desktop, or clicking **`☰ 3D Menu [M]`** in the HUD:
- Instant teleport to all **4 Pitch Booths**, **Adventure Corridor**, **Relic Pavilion**, **Docent Lux Kiosk**, **Skyport Overview**, **eVTOL Cockpit**, **Ground Rover**, and **Paradigm Club Dance Floor**.
- Remote control of the nearest booth (`◄ PREV SLIDE`, `PLAY / NARRATE`, `NEXT SLIDE ►`, `SWITCH BOOTH VIEW`) and Docent Lux (`FULL TOUR`, `EXPLAIN HERE`, `RELICS TOUR`, `STOP`).

---

## ⚡ Web3 HTTP 402 (L402) Monetization (`backend/` & `js/web3Payment.js`)

All commerce flows use the **RFC 9110 §15.5.3 `402 Payment Required`** standard with **L402 Macaroons (`WWW-Authenticate: L402`)** and structured **`Payment-Required`** headers:
- **Rarible NFT Shopping Basket (`js/nftBasket.js`):** Add Harps of God tokens `#492856` (Yellow Y) and `#490643` (Green G) under contract `0xd07dc4262bcdbf85190c01c996b4c06a461d2430`, settle via HTTP 402, and receive raffle tickets + VIP museum tour pass.
- **Theophany Wishing Well Credits (`js/wishingWell.js`):** Purchase 2 oz Gold (500 credits), Silver (100 credits), or Copper (25 credits) medallion bundles via HTTP 402 and spend 5 credits per Wishing Well reflection.
- **Subscription Tiers (`js/subscriptionUI.js`):** Free (*Pilgrim*), 24-hour Freemium trial (*Seeker*), and HTTP 402 Paid upgrade (*Pneumatic Investor*).
- **Hybrid Backend + Static Edge Fallback:** Runs against the multi-threaded Python server (`serve.py` + `backend/`) in container/local deployments and automatically falls back to an in-browser L402 edge engine on static CDNs (such as GitHub Pages).

---

## 🚀 Production Deployment & Local Development

### 1. GitHub Pages (Live Static + Edge L402)
Deployed directly from the `main` branch at:  
👉 **https://jasonsprouse.github.io/gfp-investor-xr/**

### 2. Docker / Fly.io (Full Python HTTP 402 Server)
This repository includes a production `Dockerfile` and `fly.toml`:
```bash
# Build & run with Docker locally
docker build -t gfp-investor-xr .
docker run -p 8080:8080 gfp-investor-xr

# Or deploy to Fly.io
fly launch --no-deploy
fly deploy
```

### 3. Local Development Server
```bash
python serve.py
```
Then open **http://localhost:8080** on desktop or `http://<YOUR-LAN-IP>:8080` in your VR headset browser.

### 4. Automated Verification Suite
```bash
python tools/test_e2e_monetization.py
```
Runs the 66-test progressive E2E suite verifying L402 macaroon challenges, cryptographic preimage verification, NFT cart checkout, Wishing Well credits, subscription tiers, and static WebXR asset delivery.
