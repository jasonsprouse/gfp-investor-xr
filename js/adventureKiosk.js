import * as THREE from 'three';

const WIKI_URL = 'https://goodfaith.miraheze.org/wiki/File:Adventure_Zone_HOA_2.0.jpg';

const hashSpeechText = (str) => {
  const s = String(str).trim().toLowerCase();
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

// Verbatim and enriched specifications mined from Adventure Zone HOA 2.0, Dallas World Aquarium 2005 archive,
// and Good Faith Paradigm living lab blueprints.
export const ADVENTURE_SLIDES = [
  {
    id: 'theophany',
    category: 'GOOD FAITH PARADIGM // ADVENTURE CORRIDOR LIVING LAB',
    title: 'THE ADVENTURE CORRIDOR: PROXIMATE TO THEOPHANY',
    subtitle: 'Infrastructure Deployed in Proximity to Dallas World Aquarium (Dec 2005) Miracles of the Holy Spirit',
    accent: '#00f0ff',
    metricLabel: 'LIVING LAB STATUS',
    metricVal: 'PPP ACTIVATION ACTIVE • DALLAS 2005 THEOPHANY CORRIDOR',
    imageSrc: 'media/booths/prismatic/slide_03.jpg',
    speech: 'Welcome to the Adventure Corridor. This living laboratory promotes resilient civic infrastructure deployed in close proximity to where the foundational Miracles of the Holy Spirit 35-millimeter photographs were taken at the Dallas World Aquarium in December 2005. It bridges quantum-optical biophysics to physical urban resilience.',
    pillars: [
      {
        head: 'THEOPHANY FOUNDATION (DALLAS 2005)',
        desc: 'Ground zero of the 35mm optical theophany photographs capturing the physical manifestation of divine light at the Dallas World Aquarium.'
      },
      {
        head: 'HEALTH HUTS FOR OPTICAL CHECK-UPS',
        desc: 'Contactless ocular and retinal check-up clinics providing biophotonic stress diagnostics and neuroplasticity restoration.'
      },
      {
        head: 'MULTIMODAL MOBILITY ARTERY',
        desc: 'Intermodal transit corridor bridging high-altitude eVTOL skyways, autonomous electric last-mile pods, and 35 mph robotic mule dogs.'
      },
      {
        head: 'HOA 2.0 POST-BUREAUCRATIC COMMUNITY',
        desc: 'Autonomous Hybrid Sovereignty (AHS) combining DAO legislative policy, AI executive dispatch, and public ledger judicial escrow.'
      }
    ]
  },
  {
    id: 'health_huts',
    category: 'ADVENTURE CORRIDOR // PREVENTATIVE WELLNESS INFRASTRUCTURE',
    title: 'HEALTH HUTS: CONTACTLESS OPTICAL CHECK-UPS',
    subtitle: 'Contactless Biometric Micro-Clinics & Neuroplasticity Restoration',
    accent: '#ff007f',
    metricLabel: 'CLINICAL PROTOCOL',
    metricVal: '5-STEP NEUROPLASTIC SPIRAL RESTORATION • ZERO-KNOWLEDGE SBT',
    imageSrc: 'media/booths/prismatic/slide_03.jpg',
    speech: 'Health Huts provide contactless optical visual check-ups. Optical and retinal sensors monitor pupillary reflex dynamics, ocular micro-saccades, and phototransduction health. Diagnostic biofeedback protocols restore neuroplasticity for insomnia and PTSD relief, with zero-knowledge sovereign records.',
    pillars: [
      {
        head: 'CONTACTLESS OCULAR CHECK-UPS',
        desc: 'Automated high-precision optical sensors track macular optical density, pupillary reflex velocity, and ocular micro-saccadic jitter.'
      },
      {
        head: 'PHOTOTRANSDUCTION & STRESS DIAGNOSTICS',
        desc: 'Non-invasive facial camera photoplethysmography (rPPG) measuring autonomic stress, HRV, and circadian alignment oscillations.'
      },
      {
        head: 'NEUROPLASTICITY RESTORATION',
        desc: 'Guided 5-step visual exegesis sessions and tuned photic frequencies providing therapeutic restoration for insomnia, chronic fatigue, and PTSD.'
      },
      {
        head: 'SOVEREIGN HEALTH TELEMETRY',
        desc: 'Diagnostic attestations are cryptographically signed to resident Soulbound Tokens (SBT) with zero third-party data surveillance.'
      }
    ]
  },
  {
    id: 'mobility',
    category: 'ADVENTURE CORRIDOR // TRANSIT INFRASTRUCTURE',
    title: 'MULTIMODAL MOBILITY & ROBOTIC FLEETS',
    subtitle: 'Zero-Emission High-Speed Transit from Vertiports to Nature Corridors',
    accent: '#ffaa00',
    metricLabel: 'TRANSIT FLEET EFFICIENCY',
    metricVal: '85% CONGESTION REDUCTION • 100% ELECTRIC • 35 MPH QUADRUPEDS',
    speech: 'Multimodal mobility links high-altitude tandem tilt-rotor eVTOL skyways from Skyport Helipad Alpha down to Vertiport Bravo. Autonomous electric last-mile pods navigate greenways, while 35 mile per hour open-source robotic mule dogs maintain rugged trails and transport cargo.',
    pillars: [
      {
        head: 'TANDEM TILT-ROTOR eVTOL SKYWAYS',
        desc: 'Quiet electric aerial transit linking Helipad Alpha (Y=30) to Vertiport Bravo (Y=5.2) along autonomous, point-to-point flight corridors.'
      },
      {
        head: 'AUTONOMOUS LAST-MILE GROUND PODS',
        desc: 'Four-passenger electric shuttles with panoramic glass canopies and inductive charging loops providing seamless boulevard transit.'
      },
      {
        head: '35 MPH ROBOTIC MULE DOG FLEET',
        desc: 'Open-source high-speed quadruped robots providing off-road trail maintenance, rugged cargo transport, and emergency medical response.'
      },
      {
        head: 'ACTIVE ECO-STEWARDSHIP TRAILS',
        desc: 'Permeable non-asphalt walking and cycling pathways designed for human recreation coexisting safely with autonomous robotic fleets.'
      }
    ]
  },
  {
    id: 'food_security',
    category: 'ADVENTURE CORRIDOR // SUSTENANCE INFRASTRUCTURE',
    title: 'FOOD-SECURITY DESIGNS & PERMACULTURE',
    subtitle: 'Decentralized Agriculture Powered by RaaS and Public-Private Land Trusts',
    accent: '#00ff66',
    metricLabel: 'LOCAL SUSTENANCE TARGET',
    metricVal: '100% REGIONAL FOOD SECURITY • NET-NEGATIVE HEMP SUPERSTRUCTURES',
    speech: 'Food security in the Adventure Corridor living lab combines public-private land stewardship with Robots-as-a-Service permaculture. IoT soil sensors guide micro-irrigation, climate-resilient hemp superstructures protect yields, and the Universal Basic Income Feedback Loop funds citizen dividends.',
    pillars: [
      {
        head: 'ROBOTS-AS-A-SERVICE (RaaS) PERMACULTURE',
        desc: 'Autonomous field robotics performing precision seed drilling, laser micro-weeding, soil aeration, and automated crop harvesting.'
      },
      {
        head: 'CLOSED-LOOP SOIL SENSOR TELEMETRY',
        desc: 'Continuous IoT capacitance, nitrogen, and pH sensors feeding real-time telemetry into the civic operations dashboard.'
      },
      {
        head: 'CLIMATE-RESILIENT HEMP SUPERSTRUCTURES',
        desc: 'Net-carbon-negative architectural facilities engineered from industrial hempcrete housing vertical aeroponic towers and seed vaults.'
      },
      {
        head: 'UNIVERSAL BASIC INCOME LOOP (UBIFL)',
        desc: 'Agricultural surplus sold to regional markets; revenues flow through smart contracts to fund resident dividends and robotic maintenance.'
      }
    ]
  },
  {
    id: 'hoa_dao',
    category: 'ADVENTURE CORRIDOR // AUTONOMOUS HYBRID SOVEREIGNTY',
    title: 'HOA 2.0 ALGORITHMIC GOVERNANCE & DAO',
    subtitle: 'The Check-and-Balance Triad: DAO Legislative, AI Executive, Blockchain Judicial',
    accent: '#b26bff',
    metricLabel: 'GOVERNANCE AXIOMS',
    metricVal: 'ASSUMED COMPETENCE • PRINCIPLE OF CHARITY • MANDATORY STEELMANNING',
    speech: 'HOA 2.0 algorithmic governance implements Autonomous Hybrid Sovereignty. The DAO legislates, the AI executive automates operations under fifty dollars, and the blockchain adjudicates escrow. Dual tokens separate property rights from labor-earned stewardship voting.',
    pillars: [
      {
        head: 'THE AHS CONSTITUTIONAL TRIAD',
        desc: 'DAO legislative policy, AI executive logic loops (y8-app) for operations, and public ledger smart contracts for judicial escrow.'
      },
      {
        head: 'DUAL-TOKEN GATING ARCHITECTURE',
        desc: 'Resident NFTs confer baseline property/amenity access; non-transferable Steward Soulbound Tokens reward verified physical labor.'
      },
      {
        head: 'OPTIMISTIC AUTO-EXECUTION LOOP',
        desc: 'Automated execution for operational tasks below the $50 threshold (e.g., dispatching water-bots) without manual vote friction.'
      },
      {
        head: 'MANDATORY STEELMANNING & MEDIATION',
        desc: 'Opponents of capital proposals must publish verified steelman arguments to achieve 70% consensus; 3-tier ethical mediation escalation.'
      }
    ]
  }
];

export class AdventureKiosk {
  constructor(scene, {
    position = [9.0, 30.0, 14.5],
    rotY = -Math.PI / 10,
    onOpenLink,
    onNotify,
    onNarrationChange
  } = {}) {
    this.scene = scene;
    this.onOpenLink = onOpenLink || (() => {});
    this.onNotify = onNotify || (() => {});
    this.onNarrationChange = onNarrationChange || (() => {});

    this.currentSlide = 0;
    this.autoplay = false;
    this.autoplayTimer = 0;
    this.autoplayInterval = 8.0; // 8 seconds per slide
    this.narrating = false;

    this.interactableObjects = [];
    this.buttonMeshes = [];
    this.buttonLabels = [];
    this.imageCache = new Map();

    // Browser speech synthesis setup
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

    // Root Group
    this.group = new THREE.Group();
    this.group.name = 'adventureKioskGroup';
    this.group.position.set(position[0], position[1], position[2]);
    this.group.rotation.y = rotY;
    this.scene.add(this.group);

    // Build subcomponents
    this.initCanvas();
    this.buildMultimediaPanel();
    this.buildTactileConsole();

    // Render initial slide
    this.renderSlide(this.currentSlide);

    // Preload Dallas World Aquarium photographic reference image
    this.preloadImage('media/booths/prismatic/slide_03.jpg');
    this.preloadImage('media/booths/harps/slide_04_a.jpg');
  }

  preloadImage(src) {
    if (this.imageCache.has(src)) return;
    const img = new Image();
    if (/^https?:\/\//i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.imageCache.set(src, img);
      this.renderSlide(this.currentSlide);
    };
    img.src = src;
  }

  initCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.ctx = this.canvas.getContext('2d');

    this.canvasTexture = new THREE.CanvasTexture(this.canvas);
    this.canvasTexture.colorSpace = THREE.SRGBColorSpace;
    this.canvasTexture.minFilter = THREE.LinearFilter;
    this.canvasTexture.magFilter = THREE.LinearFilter;
  }

  buildMultimediaPanel() {
    // 16:9 Display dimensions: 3.6m width x 2.025m height
    const screenW = 3.6;
    const screenH = 2.025;
    const panelY = 2.5; // Relative to group y=30.0 -> world y = 32.5
    const panelZ = -0.7; // Mounted behind pedestal console

    this.panelGroup = new THREE.Group();
    this.panelGroup.position.set(0, panelY, panelZ);
    this.group.add(this.panelGroup);

    // Screen Mesh with High-Resolution Canvas Texture
    const screenGeo = new THREE.PlaneGeometry(screenW, screenH);
    this.screenMat = new THREE.MeshBasicMaterial({
      map: this.canvasTexture,
      side: THREE.DoubleSide
    });
    this.screenMesh = new THREE.Mesh(screenGeo, this.screenMat);
    this.screenMesh.name = 'adventureMultimediaScreen';
    this.screenMesh.userData = { action: 'adventure:slide:next', tooltip: 'Adventure Corridor: Next Slide' };
    this.panelGroup.add(this.screenMesh);
    this.interactableObjects.push(this.screenMesh);

    // Bezel Frame (Dark Obsidian Titanium)
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x0c1220,
      metalness: 0.88,
      roughness: 0.25
    });
    const frameMesh = new THREE.Mesh(
      new THREE.BoxGeometry(screenW + 0.12, screenH + 0.12, 0.08),
      bezelMat
    );
    frameMesh.position.z = -0.045;
    this.panelGroup.add(frameMesh);

    // Outer Neon Glow Border
    this.glowBorderMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85
    });
    const borderMesh = new THREE.Mesh(
      new THREE.BoxGeometry(screenW + 0.18, screenH + 0.18, 0.02),
      this.glowBorderMat
    );
    borderMesh.position.z = -0.055;
    this.panelGroup.add(borderMesh);

    // Structural Brushed-Titanium Support Pylons (Anchoring to deck)
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x1f2738,
      metalness: 0.9,
      roughness: 0.3
    });
    [-screenW / 2 + 0.3, screenW / 2 - 0.3].forEach((px) => {
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.085, 2.5, 16),
        pylonMat
      );
      pylon.position.set(px, -1.25, -0.05);
      this.panelGroup.add(pylon);
    });

    // Overhead Illumination Flood Light (directed onto console and screen)
    const topBar = new THREE.Mesh(
      new THREE.BoxGeometry(screenW + 0.2, 0.08, 0.16),
      bezelMat
    );
    topBar.position.set(0, screenH / 2 + 0.08, 0.06);
    this.panelGroup.add(topBar);

    const lightStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(screenW - 0.2, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    lightStrip.position.set(0, screenH / 2 + 0.04, 0.12);
    lightStrip.rotation.x = Math.PI / 4;
    this.panelGroup.add(lightStrip);
  }

  buildTactileConsole() {
    this.consoleGroup = new THREE.Group();
    this.consoleGroup.position.set(0, 0, 0); // At kiosk center [9.0, 30.0, 14.5]
    this.group.add(this.consoleGroup);

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x0b101c,
      metalness: 0.85,
      roughness: 0.28
    });

    // 1. Hexagonal Cyber-Pedestal Base
    const pedestalMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.52, 0.95, 6),
      metalMat
    );
    pedestalMesh.position.y = 0.475;
    this.consoleGroup.add(pedestalMesh);

    // Glowing Neon Ring around Pedestal Waist
    const trimRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.022, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    trimRing.rotation.x = Math.PI / 2;
    trimRing.position.y = 0.94;
    this.consoleGroup.add(trimRing);

    // 2. Angled Console Desktop Tablet (tilted 30 degrees toward player)
    const deskGroup = new THREE.Group();
    deskGroup.position.set(0, 0.98, 0.08);
    deskGroup.rotation.x = -Math.PI / 6; // 30-degree ergonomic tilt
    this.consoleGroup.add(deskGroup);

    const deskSlab = new THREE.Mesh(
      new THREE.BoxGeometry(1.22, 0.05, 0.68),
      metalMat
    );
    deskGroup.add(deskSlab);

    // Glowing Cyan Trim around Console Desk
    const deskTrim = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.015, 0.71),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    deskTrim.position.y = -0.01;
    deskGroup.add(deskTrim);

    // 3. Tactile 3D Buttons:
    // Top Row: 5 Slide Selectors
    const slideTabs = [
      { idx: 0, label: '1: THEOPHANY', color: 0x00f0ff, action: 'adventure:slide:0' },
      { idx: 1, label: '2: HEALTH', color: 0xff007f, action: 'adventure:slide:1' },
      { idx: 2, label: '3: MOBILITY', color: 0xffaa00, action: 'adventure:slide:2' },
      { idx: 3, label: '4: FOOD', color: 0x00ff66, action: 'adventure:slide:3' },
      { idx: 4, label: '5: HOA 2.0', color: 0xb26bff, action: 'adventure:slide:4' }
    ];

    const tabW = 0.21;
    const tabH = 0.11;
    const startX = -((slideTabs.length - 1) * 0.235) / 2;

    slideTabs.forEach((tab, i) => {
      const bx = startX + i * 0.235;
      const bz = -0.16;
      const btn = this.createConsoleButton(tab.label, tab.action, tab.color, bx, bz, tabW, tabH, deskGroup);
      btn.tabIndex = tab.idx;
      this.buttonMeshes.push(btn);
    });

    // Bottom Row: Navigation & Utility Controls
    const controlButtons = [
      { label: '◄ PREV', color: 0x00f0ff, action: 'adventure:slide:prev', x: -0.46, w: 0.19 },
      { label: 'NEXT ►', color: 0x00f0ff, action: 'adventure:slide:next', x: -0.23, w: 0.19 },
      { label: 'AUTO', color: 0x00ff66, action: 'adventure:auto', x: 0.0, w: 0.19 },
      { label: 'AUDIO BRIEF', color: 0xffaa00, action: 'adventure:audio:toggle', x: 0.23, w: 0.19 },
      { label: 'WIKI ↗', color: 0xb26bff, action: 'adventure:link', x: 0.46, w: 0.19 }
    ];

    controlButtons.forEach((ctrl) => {
      const btn = this.createConsoleButton(ctrl.label, ctrl.action, ctrl.color, ctrl.x, 0.14, ctrl.w, 0.12, deskGroup);
      this.buttonMeshes.push(btn);
    });
  }

  createConsoleButton(label, action, colorHex, x, z, w, d, parent) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x121828,
      emissive: colorHex,
      emissiveIntensity: 0.35,
      metalness: 0.8,
      roughness: 0.25
    });

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.045, d), mat);
    mesh.position.set(x, 0.038, z);
    mesh.userData = { action, tooltip: label, baseColor: colorHex };
    parent.add(mesh);

    // Canvas label texture on top of button
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const cx = c.getContext('2d');
    cx.fillStyle = '#0b1120';
    cx.fillRect(0, 0, 256, 128);
    cx.strokeStyle = '#' + colorHex.toString(16).padStart(6, '0');
    cx.lineWidth = 6;
    cx.strokeRect(4, 4, 248, 120);
    cx.fillStyle = '#ffffff';
    cx.font = 'bold 30px monospace';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(label, 128, 64);

    const labelTex = new THREE.CanvasTexture(c);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.92, d * 0.88),
      new THREE.MeshBasicMaterial({ map: labelTex })
    );
    labelMesh.rotation.x = -Math.PI / 2;
    labelMesh.position.set(0, 0.024, 0);
    mesh.add(labelMesh);

    this.interactableObjects.push(mesh);
    return mesh;
  }

  // ---------- Slide Rendering (1920x1080 High-Res Canvas) ----------
  renderSlide(index) {
    const slide = ADVENTURE_SLIDES[index];
    if (!slide) return;
    this.currentSlide = index;

    const ctx = this.ctx;
    const W = 1920;
    const H = 1080;

    // Background Gradient: Deep cyber-obsidian
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#060a14');
    bgGrad.addColorStop(0.5, '#0a1020');
    bgGrad.addColorStop(1, '#05070f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Glowing Cyber Grid overlay
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 60; x < W; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 60; y < H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Outer Frame Glow Border
    ctx.strokeStyle = slide.accent;
    ctx.lineWidth = 10;
    ctx.strokeRect(15, 15, W - 30, H - 30);

    // Corner Accents
    ctx.fillStyle = slide.accent;
    const cSize = 40;
    ctx.fillRect(10, 10, cSize, 8);
    ctx.fillRect(10, 10, 8, cSize);
    ctx.fillRect(W - 10 - cSize, 10, cSize, 8);
    ctx.fillRect(W - 18, 10, 8, cSize);
    ctx.fillRect(10, H - 18, cSize, 8);
    ctx.fillRect(10, H - 10 - cSize, 8, cSize);
    ctx.fillRect(W - 10 - cSize, H - 18, cSize, 8);
    ctx.fillRect(W - 18, H - 10 - cSize, 8, cSize);

    // Top Header Banner
    ctx.fillStyle = 'rgba(10, 18, 36, 0.95)';
    ctx.fillRect(25, 25, W - 50, 120);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(25, 25, W - 50, 120);

    // Breadcrumb Category & Slide Counter
    ctx.fillStyle = slide.accent;
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(slide.category, 60, 68);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`SLIDE ${index + 1} OF ${ADVENTURE_SLIDES.length}  |  AUTOPLAY: ${this.autoplay ? 'ACTIVE (8s)' : 'OFF'}`, W - 60, 68);

    // Main Title
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 46px "Segoe UI", sans-serif';
    ctx.fillText(slide.title, 60, 118);

    // Subtitle Bar
    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.fillRect(25, 150, W - 50, 48);
    ctx.fillStyle = '#c5d3eb';
    ctx.font = 'italic 23px "Segoe UI", sans-serif';
    ctx.fillText(slide.subtitle, 60, 182);

    // 4 Content Pillars (2x2 Grid or Left-Text / Right-Photo Layout for Slide 0)
    const isOverview = (index === 0);
    const gridLeft = 60;
    const gridTop = 220;

    if (isOverview && this.imageCache.has('media/booths/prismatic/slide_03.jpg')) {
      // Slide 0: Left Column = Narrative & Dallas 2005 Theophany Details; Right Column = Photographic Evidence & Pillars
      const img = this.imageCache.get('media/booths/prismatic/slide_03.jpg');

      // Left Column (Text & Pillars 1 & 2)
      const colW = 900;
      slide.pillars.slice(0, 2).forEach((p, i) => {
        const py = gridTop + i * 235;
        this.renderPillarBox(ctx, gridLeft, py, colW, 215, p, slide.accent);
      });

      // Right Column (Dallas World Aquarium 2005 35mm photo frame + Pillars 3 & 4)
      const photoX = 1010;
      const photoY = gridTop;
      const photoW = 850;
      const photoH = 215;

      // Photo Frame
      ctx.fillStyle = '#0c1324';
      ctx.fillRect(photoX, photoY, photoW, photoH);
      ctx.strokeStyle = slide.accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(photoX, photoY, photoW, photoH);

      // Draw photo
      try {
        ctx.drawImage(img, photoX + 8, photoY + 8, 340, photoH - 16);
      } catch (err) {
        // Fallback placeholder if canvas security blocks cross-origin draw
        ctx.fillStyle = '#1c2640';
        ctx.fillRect(photoX + 8, photoY + 8, 340, photoH - 16);
      }

      // Photographic caption
      ctx.fillStyle = slide.accent;
      ctx.font = 'bold 20px monospace';
      ctx.fillText('DECEMBER 2005 HISTORICAL ARCHIVE', photoX + 370, photoY + 45);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px "Segoe UI", sans-serif';
      ctx.fillText('Dallas World Aquarium Theophany', photoX + 370, 80 + photoY);

      ctx.fillStyle = '#a8b6d4';
      ctx.font = '18px "Segoe UI", sans-serif';
      this.wrapCanvasText(ctx, 'Foundational 35mm photographic evidence of optical miracles. The Adventure Corridor promotes living-lab infrastructure proximate to this occurrence.', photoX + 370, 115 + photoY, 460, 24);

      // Pillars 3 & 4
      slide.pillars.slice(2, 4).forEach((p, i) => {
        const py = gridTop + 245 + i * 235;
        this.renderPillarBox(ctx, photoX, py, photoW, 215, p, slide.accent);
      });
    } else {
      // Standard 2x2 Clean Grid of 4 Structured Pillars
      const cardW = 875;
      const cardH = 270;
      const col2X = 985;

      slide.pillars.forEach((p, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const px = col === 0 ? gridLeft : col2X;
        const py = gridTop + row * (cardH + 25);
        this.renderPillarBox(ctx, px, py, cardW, cardH, p, slide.accent);
      });
    }

    // Bottom Metric & Telemetry Ribbon
    const ribbonY = H - 150;
    ctx.fillStyle = 'rgba(8, 14, 28, 0.96)';
    ctx.fillRect(25, ribbonY, W - 50, 95);
    ctx.strokeStyle = slide.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(25, ribbonY, W - 50, 95);

    ctx.fillStyle = slide.accent;
    ctx.font = 'bold 20px monospace';
    ctx.fillText(slide.metricLabel, 60, ribbonY + 38);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(slide.metricVal, 60, ribbonY + 74);

    // Interactive Hint on bottom right
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8999ba';
    ctx.font = '19px monospace';
    ctx.fillText('[USE PEDESTAL BUTTONS OR CROSSHAIR CLICK TO NAVIGATE]', W - 60, ribbonY + 58);

    // Update THREE.js Texture
    this.canvasTexture.needsUpdate = true;
    if (this.glowBorderMat) {
      this.glowBorderMat.color.set(slide.accent);
    }

    // Update Console Button Glows
    this.updateConsoleHighlights(index);
  }

  renderPillarBox(ctx, x, y, w, h, pillar, accent) {
    // Card background
    ctx.fillStyle = 'rgba(12, 20, 40, 0.88)';
    ctx.fillRect(x, y, w, h);

    // Glowing left edge
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, 6, h);

    // Card border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);

    // Title / Header
    ctx.fillStyle = accent;
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`▸ ${pillar.head}`, x + 25, y + 42);

    // Body Description with clean multi-line word wrapping
    ctx.fillStyle = '#d5e1f7';
    ctx.font = '20px "Segoe UI", sans-serif';
    this.wrapCanvasText(ctx, pillar.desc, x + 25, y + 80, w - 50, 28);
  }

  wrapCanvasText(ctx, text, x, y, maxW, lineH) {
    const words = String(text).split(/\s+/);
    let line = '';
    let curY = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, curY);
        line = w;
        curY += lineH;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, curY);
    }
  }

  updateConsoleHighlights(activeIndex) {
    this.buttonMeshes.forEach((mesh) => {
      if (typeof mesh.tabIndex === 'number') {
        const isActive = (mesh.tabIndex === activeIndex);
        mesh.material.emissiveIntensity = isActive ? 0.95 : 0.25;
        mesh.position.y = isActive ? 0.028 : 0.038; // Tactile depression
      }
    });
  }

  // ---------- Action Handlers ----------
  handleAction(action) {
    if (typeof action !== 'string') return false;

    if (action === 'adventure:slide:next' || action === 'adventure:next') {
      this.next();
      return true;
    }
    if (action === 'adventure:slide:prev' || action === 'adventure:prev') {
      this.prev();
      return true;
    }
    if (action.startsWith('adventure:slide:')) {
      const idx = parseInt(action.split(':')[2], 10);
      if (!isNaN(idx) && idx >= 0 && idx < ADVENTURE_SLIDES.length) {
        this.selectSlide(idx);
      }
      return true;
    }
    if (action.startsWith('adventure:tab:')) {
      const idx = parseInt(action.split(':')[2], 10);
      if (!isNaN(idx) && idx >= 0 && idx < ADVENTURE_SLIDES.length) {
        this.selectSlide(idx);
      }
      return true;
    }
    if (action === 'adventure:auto') {
      this.toggleAutoplay();
      return true;
    }
    if (action === 'adventure:audio:toggle' || action === 'adventure:audio') {
      this.toggleAudio();
      return true;
    }
    if (action === 'adventure:link') {
      this.openLink();
      return true;
    }

    return false;
  }

  selectSlide(index) {
    this.currentSlide = ((index % ADVENTURE_SLIDES.length) + ADVENTURE_SLIDES.length) % ADVENTURE_SLIDES.length;
    this.autoplayTimer = 0; // Reset timer on manual selection
    this.renderSlide(this.currentSlide);
    const slide = ADVENTURE_SLIDES[this.currentSlide];
    this.onNotify(`Adventure Corridor: ${slide.title}`);
    if (this.narrating) {
      this.playSlideNarration(this.currentSlide);
    }
  }

  next() {
    this.selectSlide(this.currentSlide + 1);
  }

  prev() {
    this.selectSlide(this.currentSlide - 1);
  }

  toggleAutoplay() {
    this.autoplay = !this.autoplay;
    this.autoplayTimer = 0;
    this.renderSlide(this.currentSlide);
    this.onNotify(`Adventure Corridor Autoplay: ${this.autoplay ? 'ON (8s)' : 'OFF'}`);
  }

  toggleAudio() {
    if (this.narrating) {
      this.stopNarration();
      this.onNotify('Adventure Corridor Narration: PAUSED');
    } else {
      this.narrating = true;
      this.onNarrationChange(true);
      this.playSlideNarration(this.currentSlide);
      this.onNotify('Adventure Corridor Narration: PLAYING');
    }
  }

  playSlideNarration(index) {
    const slide = ADVENTURE_SLIDES[index];
    if (!slide) return;

    if (!this.voiceAudio && typeof Audio !== 'undefined') {
      this.voiceAudio = new Audio();
      this.voiceAudio.preload = 'auto';
    }

    const fallbackSynth = () => {
      if (!this.synth) {
        this.onNotify(`Audio: ${slide.speech}`);
        return;
      }
      if (this.synth.speaking || this.synth.pending) {
        try { this.synth.cancel(); } catch (e) {}
      }
      setTimeout(() => {
        if (!this.narrating) return;
        const utterance = new SpeechSynthesisUtterance(slide.speech);
        this.activeUtterance = utterance;
        utterance.rate = 1.0;
        utterance.pitch = 1.05;
        utterance.onend = () => {
          this.activeUtterance = null;
          if (this.autoplay) {
            this.next();
          } else {
            this.stopNarration();
          }
        };
        utterance.onerror = () => {
          this.activeUtterance = null;
          this.stopNarration();
        };
        this.synth.speak(utterance);
      }, 60);
    };

    if (this.voiceAudio) {
      const key = hashSpeechText(slide.speech);
      this.voiceAudio.onended = () => {
        if (this.autoplay) {
          this.next();
        } else {
          this.stopNarration();
        }
      };
      this.voiceAudio.onerror = () => {
        this.voiceAudio.onended = null;
        this.voiceAudio.onerror = null;
        fallbackSynth();
      };
      this.voiceAudio.src = `media/docent/${key}.wav`;
      this.voiceAudio.currentTime = 0;
      this.voiceAudio.volume = 1.0;
      const p = this.voiceAudio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          this.voiceAudio.onended = null;
          this.voiceAudio.onerror = null;
          fallbackSynth();
        });
      }
    } else {
      fallbackSynth();
    }
  }

  stopNarration() {
    this.narrating = false;
    this.activeUtterance = null;
    if (this.voiceAudio) {
      try {
        this.voiceAudio.onended = null;
        this.voiceAudio.onerror = null;
        this.voiceAudio.pause();
      } catch (e) {}
    }
    if (this.synth && (this.synth.speaking || this.synth.pending)) {
      try { this.synth.cancel(); } catch (e) {}
    }
    this.onNarrationChange(false);
  }

  openLink() {
    this.onOpenLink(WIKI_URL);
  }

  // ---------- Per-Frame Update ----------
  update(delta, time) {
    if (this.autoplay) {
      this.autoplayTimer += delta;
      if (this.autoplayTimer >= this.autoplayInterval) {
        this.autoplayTimer = 0;
        this.next();
      }
    }

    // Subtle pulsing animation on glowing screen border
    if (this.glowBorderMat) {
      const pulse = 0.75 + Math.sin(time * 3.0) * 0.2;
      this.glowBorderMat.opacity = pulse;
    }
  }
}
