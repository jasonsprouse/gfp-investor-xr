import * as THREE from 'three';
import { PLAYLIST } from './audioManager.js';

function roundRectHelper(ctx, x, y, width, height, radius) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export class ClubScene {
  constructor(scene) {
    this.scene = scene;
    this.interactableObjects = [];
    this.walkableFloors = [];
    
    // Components to update
    this.danceTiles = [];
    this.spotlights = [];
    this.laserBeams = [];
    this.strobeLights = [];
    this.speakers = [];
    this.turntablePlatters = [];
    this.vuLeds = [];
    this.fogParticles = null;
    this.infoboards = [];
    this.skyportHaloMat = null;
    
    // Video Wall Canvas
    this.screenCanvas = null;
    this.screenCtx = null;
    this.screenTexture = null;
    
    // DJ Console Canvas
    this.djCanvas = null;
    this.djCtx = null;
    this.djTexture = null;
    
    // State
    this.lasersEnabled = true;
    this.strobesEnabled = false;
    this.visualizerMode = 0; // 0: Spectrum, 1: Tunnel, 2: Sacred Waves
    this.adventureKiosk = null;
    
    this.buildArchitecture();
    this.buildDanceFloor();
    this.buildDJStage();
    this.buildBigScreen();
    this.buildLightingRigs();
    this.buildLoungeArea();
    this.buildBarArea();
    this.buildAtmosphere();

    // Executive Investor Pitch Campus & Intermodal Transit
    this.buildSkyportDeck();
    this.buildMetropolisSkyline();
    this.buildVertiportBravo();
    this.buildPromenade();
    this.buildOutdoorEntertainmentVenues();
  }

  // --- Club Architecture (Walls, Floor, Ceiling, Pillars) ---
  buildArchitecture() {
    // Room Dimensions
    const roomW = 34;
    const roomL = 44;
    const roomH = 10;

    // Floor (Polished dark reflective concrete)
    const floorGeo = new THREE.PlaneGeometry(roomW, roomL);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x08080f,
      roughness: 0.15,
      metalness: 0.85
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'teleportFloor'; // Marker for VR teleportation
    this.scene.add(floor);
    this.floorMesh = floor;
    this.walkableFloors.push(floor);

    // Ceiling (Dark industrial grid)
    const ceilGeo = new THREE.PlaneGeometry(roomW, roomL);
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x040406,
      roughness: 0.9,
      metalness: 0.3
    });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.position.y = roomH;
    ceiling.rotation.x = Math.PI / 2;
    this.scene.add(ceiling);

    // Walls Material (Dark soundproof acoustic panels with metallic trims)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0d0f18,
      roughness: 0.6,
      metalness: 0.4
    });

    // Back Wall (Behind DJ)
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallMat);
    backWall.position.set(0, roomH / 2, -roomL / 2);
    this.scene.add(backWall);

    // Front Wall
    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallMat);
    frontWall.position.set(0, roomH / 2, roomL / 2);
    frontWall.rotation.y = Math.PI;
    this.scene.add(frontWall);

    // Left Wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(roomL, roomH), wallMat);
    leftWall.position.set(-roomW / 2, roomH / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    this.scene.add(leftWall);

    // Right Wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(roomL, roomH), wallMat);
    rightWall.position.set(roomW / 2, roomH / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);

    // Vertical Neon Light Pillars along walls
    const pillarPositions = [
      [-roomW / 2 + 0.2, 0], [-roomW / 2 + 0.2, -10], [-roomW / 2 + 0.2, 10],
      [roomW / 2 - 0.2, 0], [roomW / 2 - 0.2, -10], [roomW / 2 - 0.2, 10]
    ];
    pillarPositions.forEach(([px, pz], idx) => {
      const colGeo = new THREE.CylinderGeometry(0.08, 0.08, roomH - 1, 16);
      const colMat = new THREE.MeshBasicMaterial({
        color: idx % 2 === 0 ? 0x00f0ff : 0xff007f
      });
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(px, (roomH - 1) / 2, pz);
      this.scene.add(col);
    });

    // Overhead Industrial Trusses (Black steel square lattice)
    for (let z = -14; z <= 14; z += 7) {
      const trussGeo = new THREE.BoxGeometry(roomW - 2, 0.4, 0.4);
      const trussMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.9, roughness: 0.3 });
      const truss = new THREE.Mesh(trussGeo, trussMat);
      truss.position.set(0, roomH - 0.8, z);
      this.scene.add(truss);
    }
  }

  // --- Reactive LED Dance Floor ---
  buildDanceFloor() {
    const gridCount = 10;
    const tileSize = 1.4;
    const startX = -((gridCount - 1) * tileSize) / 2;
    const startZ = -((gridCount - 1) * tileSize) / 2 + 3; // Shift slightly towards center

    const tileGeo = new THREE.BoxGeometry(tileSize * 0.94, 0.06, tileSize * 0.94);

    for (let r = 0; r < gridCount; r++) {
      for (let c = 0; c < gridCount; c++) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x101222,
          emissive: 0x002233,
          roughness: 0.2,
          metalness: 0.6
        });
        const tile = new THREE.Mesh(tileGeo, mat);
        tile.position.set(startX + c * tileSize, 0.03, startZ + r * tileSize);
        tile.receiveShadow = true;
        this.scene.add(tile);

        this.danceTiles.push({
          mesh: tile,
          mat: mat,
          r: r,
          c: c,
          dist: Math.sqrt(Math.pow(r - gridCount / 2, 2) + Math.pow(c - gridCount / 2, 2))
        });
      }
    }
  }

  // --- Elevated DJ Stage & Interactive Deck ---
  buildDJStage() {
    // Stage Base Platform
    const stageW = 12;
    const stageD = 6;
    const stageH = 1.0;
    const stageGeo = new THREE.BoxGeometry(stageW, stageH, stageD);
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0x121420,
      metalness: 0.8,
      roughness: 0.3
    });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.set(0, stageH / 2, -15);
    stage.receiveShadow = true;
    this.scene.add(stage);

    // Neon trim edge along DJ stage
    const trimGeo = new THREE.BoxGeometry(stageW + 0.1, 0.08, stageD + 0.1);
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.set(0, stageH, -15);
    this.scene.add(trim);

    // DJ Booth Table
    const boothGeo = new THREE.BoxGeometry(4.2, 1.1, 1.2);
    const boothMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c16,
      metalness: 0.9,
      roughness: 0.2
    });
    const booth = new THREE.Mesh(boothGeo, boothMat);
    booth.position.set(0, stageH + 1.1 / 2, -14.5);
    this.scene.add(booth);

    // Neon Front Sign: "GOOD FAITH PARADIGM"
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 1024;
    signCanvas.height = 256;
    const sCtx = signCanvas.getContext('2d');
    sCtx.fillStyle = '#05060c';
    sCtx.fillRect(0, 0, signCanvas.width, signCanvas.height);
    sCtx.font = 'bold 54px Arial';
    sCtx.textAlign = 'center';
    sCtx.shadowColor = '#00f0ff';
    sCtx.shadowBlur = 24;
    sCtx.fillStyle = '#ffffff';
    sCtx.fillText('GOOD FAITH PARADIGM', 512, 110);
    sCtx.shadowColor = '#ff007f';
    sCtx.font = 'bold 36px Arial';
    sCtx.fillStyle = '#ff007f';
    sCtx.fillText('@GparadigmOrgLove', 512, 180);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signGeo = new THREE.PlaneGeometry(3.8, 0.8);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, stageH + 0.55, -13.88);
    this.scene.add(sign);

    // Turntables / CDJs
    [-1.2, 1.2].forEach((tx) => {
      // CDJ Base
      const cdjGeo = new THREE.BoxGeometry(0.8, 0.1, 0.9);
      const cdjMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, metalness: 0.9, roughness: 0.3 });
      const cdj = new THREE.Mesh(cdjGeo, cdjMat);
      cdj.position.set(tx, stageH + 1.1 + 0.05, -14.5);
      this.scene.add(cdj);

      // Rotating Platter
      const platterGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.04, 32);
      const platterMat = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.4, metalness: 0.8 });
      const platter = new THREE.Mesh(platterGeo, platterMat);
      platter.position.set(tx, stageH + 1.1 + 0.12, -14.5);
      this.scene.add(platter);
      this.turntablePlatters.push(platter);
    });

    // DJ Mixer (Center)
    const mixerGeo = new THREE.BoxGeometry(1.0, 0.08, 0.9);
    const mixerMat = new THREE.MeshStandardMaterial({ color: 0x151820, metalness: 0.9, roughness: 0.2 });
    const mixer = new THREE.Mesh(mixerGeo, mixerMat);
    mixer.position.set(0, stageH + 1.1 + 0.04, -14.5);
    this.scene.add(mixer);

    // VU Meter LED bars on mixer
    [-0.1, 0.1].forEach((vx) => {
      const ledsForChannel = [];
      for (let i = 0; i < 8; i++) {
        const ledGeo = new THREE.BoxGeometry(0.04, 0.015, 0.03);
        let color = 0x00ff88;
        if (i >= 5) color = 0xffcc00;
        if (i >= 7) color = 0xff0044;
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.position.set(vx, stageH + 1.1 + 0.09, -14.7 + i * 0.045);
        this.scene.add(led);
        ledsForChannel.push({ mesh: led, activeColor: color, threshold: i / 8 });
      }
      this.vuLeds.push(ledsForChannel);
    });

    // --- Floating Interactive Holographic DJ UI Console ---
    this.buildDJHologram(stageH);

    // --- Massive Concert Speakers (Left and Right of Stage) ---
    [-7, 7].forEach((sx) => {
      this.buildSpeakerStack(sx, 0, -14);
    });
  }

  // Floating 3D Console Buttons on DJ Booth Deck
  buildDJHologram(stageH) {
    // 3D Clickable Buttons on DJ console
    const buttonData = [
      { id: 'prev', label: 'PREV', color: 0x00f0ff, hex: '#00f0ff', x: -0.6 },
      { id: 'play', label: 'PLAY / PAUSE', color: 0xff007f, hex: '#ff007f', x: 0 },
      { id: 'next', label: 'NEXT', color: 0x00f0ff, hex: '#00f0ff', x: 0.6 }
    ];

    buttonData.forEach((b) => {
      const btnGeo = new THREE.BoxGeometry(0.42, 0.15, 0.08);
      
      const bCanvas = document.createElement('canvas');
      bCanvas.width = 256;
      bCanvas.height = 128;
      const bCtx = bCanvas.getContext('2d');
      bCtx.fillStyle = '#0a0d1a';
      bCtx.fillRect(0, 0, 256, 128);
      bCtx.strokeStyle = b.hex;
      bCtx.lineWidth = 8;
      bCtx.strokeRect(6, 6, 244, 116);
      bCtx.font = 'bold 36px Arial, sans-serif';
      bCtx.fillStyle = '#ffffff';
      bCtx.textAlign = 'center';
      bCtx.textBaseline = 'middle';
      bCtx.shadowColor = b.hex;
      bCtx.shadowBlur = 14;
      bCtx.fillText(b.label, 128, 64);

      const bTex = new THREE.CanvasTexture(bCanvas);
      const btnMat = new THREE.MeshStandardMaterial({
        map: bTex,
        emissive: b.color,
        emissiveMap: bTex,
        emissiveIntensity: 0.85,
        roughness: 0.2
      });
      const btnMesh = new THREE.Mesh(btnGeo, btnMat);
      btnMesh.position.set(b.x, stageH + 1.25, -14.0);
      btnMesh.rotation.x = -Math.PI / 8; // Angled slightly upwards towards player
      btnMesh.name = `btn_${b.id}`;
      btnMesh.userData = { action: b.id };
      this.scene.add(btnMesh);
      this.interactableObjects.push(btnMesh);
    });
  }

  buildSpeakerStack(x, y, z) {
    // 3 tiers of festival subwoofers
    const subGeo = new THREE.BoxGeometry(1.8, 1.4, 1.4);
    const subMat = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.8 });
    
    for (let i = 0; i < 3; i++) {
      const sub = new THREE.Mesh(subGeo, subMat);
      sub.position.set(x, y + 0.7 + i * 1.4, z);
      this.scene.add(sub);

      // Cones
      const coneGeo = new THREE.CylinderGeometry(0.4, 0.25, 0.1, 24);
      const coneMat = new THREE.MeshStandardMaterial({ color: 0x22222b, roughness: 0.4 });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.rotation.x = Math.PI / 2;
      cone.position.set(x, y + 0.7 + i * 1.4, z + 0.72);
      this.scene.add(cone);
      this.speakers.push(cone);
    }
  }

  // --- Massive In-Room Video Screen Floating Directly Above DJ Booth ---
  buildBigScreen() {
    // 1. Unified 13-track Video Playlist of Good Faith Paradigm videos
    this.videoPlaylist = PLAYLIST;
    this.currentVideoIdx = 0;
    this.isVideoPlaying = false;

    // 2. HTML5 Video Element for In-Room WebGL/WebXR Texture
    let videoEl = document.getElementById('webxr-room-video');
    if (!videoEl) {
      videoEl = document.createElement('video');
      videoEl.id = 'webxr-room-video';
      videoEl.style.display = 'none';
      document.body.appendChild(videoEl);
    }
    videoEl.crossOrigin = 'anonymous';
    videoEl.playsInline = true;
    videoEl.preload = 'auto';
    videoEl.loop = false;
    videoEl.muted = false;
    videoEl.volume = 1.0;
    videoEl.src = this.videoPlaylist[0].file;
    this.roomVideo = videoEl;

    // 3. WebGL Video Texture
    this.videoTexture = new THREE.VideoTexture(this.roomVideo);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;

    // Fallback Canvas Texture for visualizer mode
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 1024;
    this.screenCanvas.height = 576; // 16:9
    this.screenCtx = this.screenCanvas.getContext('2d');
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);

    // 4. Massive Floating Cinema Screen Mesh (12.0m wide by 6.75m high, 16:9)
    // Directly positioned above the DJ Booth (where the user requested it!)
    const screenW = 12.0;
    const screenH = 6.75;
    const screenX = 0;
    const screenY = 5.8; // Elevated above DJ table & DJ head
    const screenZ = -14.8; // Floating right above the DJ booth
    const tiltAngle = THREE.MathUtils.degToRad(-6); // Tilted forward towards dance floor

    const screenGeo = new THREE.PlaneGeometry(screenW, screenH);
    this.screenMat = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      side: THREE.DoubleSide
    });

    this.screenMesh = new THREE.Mesh(screenGeo, this.screenMat);
    this.screenMesh.position.set(screenX, screenY, screenZ);
    this.screenMesh.rotation.x = tiltAngle;
    this.screenMesh.name = 'inRoomVideoScreen';
    this.screenMesh.userData = { action: 'toggleVideo' };
    this.scene.add(this.screenMesh);
    this.interactableObjects.push(this.screenMesh);

    // 5. High-Tech Cyber Bezel Frame around the Floating Screen
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0e111a,
      metalness: 0.9,
      roughness: 0.2
    });

    const frameGroup = new THREE.Group();
    frameGroup.position.set(screenX, screenY, screenZ);
    frameGroup.rotation.x = tiltAngle;

    // Top & Bottom frame bars
    const hBarGeo = new THREE.BoxGeometry(screenW + 0.5, 0.25, 0.2);
    const topBar = new THREE.Mesh(hBarGeo, frameMat);
    topBar.position.set(0, screenH / 2 + 0.12, -0.05);
    frameGroup.add(topBar);

    const bottomBar = new THREE.Mesh(hBarGeo, frameMat);
    bottomBar.position.set(0, -screenH / 2 - 0.12, -0.05);
    frameGroup.add(bottomBar);

    // Left & Right frame bars
    const vBarGeo = new THREE.BoxGeometry(0.25, screenH + 0.5, 0.2);
    const leftBar = new THREE.Mesh(vBarGeo, frameMat);
    leftBar.position.set(-screenW / 2 - 0.12, 0, -0.05);
    frameGroup.add(leftBar);

    const rightBar = new THREE.Mesh(vBarGeo, frameMat);
    rightBar.position.set(screenW / 2 + 0.12, 0, -0.05);
    frameGroup.add(rightBar);

    // 6. Glowing Neon Bias-Lighting Halo Rim around Screen
    const haloGeo = new THREE.PlaneGeometry(screenW + 0.7, screenH + 0.7);
    this.haloMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const halo = new THREE.Mesh(haloGeo, this.haloMat);
    halo.position.set(0, 0, -0.08);
    frameGroup.add(halo);
    this.screenHalo = halo;

    // 7. Steel Suspension Cables connecting screen to ceiling trusses
    [-screenW / 2 + 0.5, screenW / 2 - 0.5].forEach((cx) => {
      const cableHeight = 10 - (screenY + screenH / 2);
      const cableGeo = new THREE.CylinderGeometry(0.02, 0.02, cableHeight, 8);
      const cableMat = new THREE.MeshStandardMaterial({ color: 0x334455, metalness: 0.9 });
      const cable = new THREE.Mesh(cableGeo, cableMat);
      cable.position.set(cx, 10 - cableHeight / 2, screenZ);
      this.scene.add(cable);
    });

    this.scene.add(frameGroup);
  }

  // Video playback controls for in-room 3D screen
  playVideo() {
    if (this.roomVideo) {
      const p = this.roomVideo.play();
      if (p !== undefined) {
        p.then(() => {
          this.isVideoPlaying = true;
        }).catch((e) => console.warn("In-room video play caught:", e));
      }
    }
  }

  pauseVideo() {
    if (this.roomVideo) {
      this.roomVideo.pause();
      this.isVideoPlaying = false;
    }
  }

  toggleVideo() {
    if (this.isVideoPlaying) {
      this.pauseVideo();
    } else {
      this.playVideo();
    }
    return this.isVideoPlaying;
  }

  playTrackIndex(idx) {
    if (idx < 0) idx = this.videoPlaylist.length - 1;
    if (idx >= this.videoPlaylist.length) idx = 0;
    this.currentVideoIdx = idx;
    const v = this.videoPlaylist[this.currentVideoIdx];

    if (!this.roomVideo.src.endsWith(v.file)) {
      this.roomVideo.src = v.file;
      this.roomVideo.load();
    }

    if (this.screenMat) {
      this.screenMat.map = this.videoTexture;
      this.screenMat.needsUpdate = true;
    }

    this.playVideo();
    return v;
  }

  nextVideo() {
    return this.playTrackIndex((this.currentVideoIdx + 1) % this.videoPlaylist.length);
  }

  prevVideo() {
    return this.playTrackIndex((this.currentVideoIdx - 1 + this.videoPlaylist.length) % this.videoPlaylist.length);
  }

  getCurrentVideo() {
    return this.videoPlaylist[this.currentVideoIdx];
  }

  // --- Moving Spotlights, Lasers & Strobes ---
  buildLightingRigs() {
    // 4 Moving-Head Spotlights on ceiling trusses
    const spotCoords = [
      [-9, 9.0, -10],
      [9, 9.0, -10],
      [-9, 9.0, 6],
      [9, 9.0, 6]
    ];

    const spotColors = [0x00f0ff, 0xff007f, 0x9900ff, 0x00ffaa];

    spotCoords.forEach(([sx, sy, sz], idx) => {
      // Fixture base
      const baseGeo = new THREE.CylinderGeometry(0.25, 0.35, 0.3, 16);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x111116, metalness: 0.9 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.set(sx, sy, sz);
      this.scene.add(base);

      // Light source (shadow map disabled for 90Hz WebXR smoothness; volumetric cone provides visual beam)
      const light = new THREE.SpotLight(spotColors[idx], 12, 35, Math.PI / 8, 0.4, 1.2);
      light.position.set(sx, sy - 0.2, sz);
      light.castShadow = false;
      this.scene.add(light);
      this.scene.add(light.target);

      // Volumetric beam cone
      const coneGeo = new THREE.ConeGeometry(2.4, 16, 16, 1, true);
      coneGeo.translate(0, -8, 0);
      coneGeo.rotateX(-Math.PI / 2);
      const coneMat = new THREE.MeshBasicMaterial({
        color: spotColors[idx],
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const beamCone = new THREE.Mesh(coneGeo, coneMat);
      beamCone.position.set(sx, sy - 0.2, sz);
      this.scene.add(beamCone);

      this.spotlights.push({
        light: light,
        target: light.target,
        beamMesh: beamCone,
        basePos: new THREE.Vector3(sx, sy, sz),
        anglePhase: idx * (Math.PI / 2),
        colorHex: spotColors[idx]
      });
    });

    // Overhead Multi-Beam Lasers
    const laserCount = 8;
    for (let i = 0; i < laserCount; i++) {
      const laserGeo = new THREE.CylinderGeometry(0.015, 0.04, 30, 8);
      laserGeo.translate(0, -15, 0);
      laserGeo.rotateX(-Math.PI / 2);
      const laserMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x00ffff : 0xff0055,
        transparent: true,
        opacity: 0.65,
        depthWrite: false
      });
      const laserMesh = new THREE.Mesh(laserGeo, laserMat);
      laserMesh.position.set(-7 + i * 2, 9.2, -15);
      this.scene.add(laserMesh);
      this.laserBeams.push({
        mesh: laserMesh,
        index: i,
        baseX: -7 + i * 2
      });
    }

    // Overhead Strobe Light Bar (Center)
    const strobeLight = new THREE.PointLight(0xffffff, 0, 40, 2);
    strobeLight.position.set(0, 8.8, 0);
    this.scene.add(strobeLight);
    this.strobeLight = strobeLight;

    // Ambient fill light (deep indigo nightclub wash)
    const ambient = new THREE.AmbientLight(0x0a0c18, 1.4);
    this.scene.add(ambient);
  }

  // --- VIP Lounge Area (Sofas & Glowing Tables) ---
  buildLoungeArea() {
    // Left side VIP lounge
    const loungeZ = [2, 10];
    loungeZ.forEach((lz) => {
      // Curved VIP Sofa
      const sofaGeo = new THREE.CylinderGeometry(3.2, 3.2, 0.7, 24, 1, false, 0, Math.PI);
      const sofaMat = new THREE.MeshStandardMaterial({
        color: 0x120e1c,
        roughness: 0.85,
        metalness: 0.1
      });
      const sofa = new THREE.Mesh(sofaGeo, sofaMat);
      sofa.position.set(-11, 0.35, lz);
      sofa.rotation.y = -Math.PI / 2;
      this.scene.add(sofa);

      // Glowing Acrylic Cocktail Table
      const tableGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.6, 24);
      const tableMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x004455,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.8
      });
      const table = new THREE.Mesh(tableGeo, tableMat);
      table.position.set(-11, 0.3, lz);
      this.scene.add(table);

      // Neon bottles on table
      [-0.2, 0.2].forEach((bx) => {
        const bottleGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.25, 12);
        const bottleMat = new THREE.MeshBasicMaterial({ color: bx > 0 ? 0xff00aa : 0x00ffff });
        const bottle = new THREE.Mesh(bottleGeo, bottleMat);
        bottle.position.set(-11 + bx, 0.72, lz);
        this.scene.add(bottle);
      });
    });
  }

  // --- Bar Area (Right Side) ---
  buildBarArea() {
    const barX = 12;
    const barZ = 4;

    // Bar Counter Top
    const barGeo = new THREE.BoxGeometry(1.6, 1.1, 14);
    const barMat = new THREE.MeshStandardMaterial({
      color: 0x0d1017,
      roughness: 0.2,
      metalness: 0.85
    });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(barX, 1.1 / 2, barZ);
    this.scene.add(bar);

    // Under-counter neon glow strip
    const stripGeo = new THREE.BoxGeometry(0.1, 0.05, 14);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xff007f });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.set(barX - 0.85, 1.05, barZ);
    this.scene.add(strip);

    // Back Shelf on wall
    const shelfGeo = new THREE.BoxGeometry(0.6, 3.5, 12);
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x08080e, metalness: 0.8 });
    const shelf = new THREE.Mesh(shelfGeo, shelfMat);
    shelf.position.set(16.5, 2.5, barZ);
    this.scene.add(shelf);

    // Glowing bottles rows on shelves
    for (let row = 0; row < 3; row++) {
      for (let b = -5; b <= 5; b += 0.8) {
        const bGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.4, 12);
        const colors = [0x00f0ff, 0xff007f, 0x00ff88, 0xffaa00, 0xaa00ff];
        const bMat = new THREE.MeshBasicMaterial({
          color: colors[Math.abs(Math.floor(b + row)) % colors.length]
        });
        const bottle = new THREE.Mesh(bGeo, bMat);
        bottle.position.set(16.1, 1.5 + row * 0.9, barZ + b);
        this.scene.add(bottle);
      }
    }
  }

  // --- Volumetric Smoke / Haze Particles ---
  buildAtmosphere() {
    const particleCount = 200;
    const pGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 30;
      positions[i + 1] = Math.random() * 8 + 0.5;
      positions[i + 2] = (Math.random() - 0.5) * 38;

      speeds[i] = (Math.random() - 0.5) * 0.2;
      speeds[i + 1] = (Math.random() - 0.5) * 0.1;
      speeds[i + 2] = (Math.random() - 0.5) * 0.2;
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Glow smoke particle texture
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
    grad.addColorStop(0.6, 'rgba(120, 0, 255, 0.1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const pTex = new THREE.CanvasTexture(canvas);
    const pMat = new THREE.PointsMaterial({
      size: 1.8,
      map: pTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.fogParticles = new THREE.Points(pGeo, pMat);
    this.fogParticles.userData = { speeds: speeds };
    this.scene.add(this.fogParticles);
  }

  setAdventureKiosk(kiosk) {
    this.adventureKiosk = kiosk;
    if (kiosk && kiosk.interactableObjects) {
      kiosk.interactableObjects.forEach((obj) => {
        if (!this.interactableObjects.includes(obj)) {
          this.interactableObjects.push(obj);
        }
      });
    }
  }

  // --- Animation & Dynamic Audio-Reactivity Update ---
  update(delta, time, audioManager, playerY = 0) {
    const pulse = audioManager ? audioManager.getBeatPulse() : 0;

    if (this.skyportHaloMat) {
      this.skyportHaloMat.opacity = 0.35 + pulse * 0.45;
    }

    if (this.screenMat && this.screenMat.map === this.screenTexture) {
      this.renderBigScreen(time, audioManager);
    }

    // When the visitor is up on the Skyport deck (Y >= 20), skip updating the indoor club 30m below
    if (playerY >= 20.0) {
      return;
    }

    const bass = audioManager ? audioManager.getBass() : 0;
    const mid = audioManager ? audioManager.getMid() : 0;
    const treble = audioManager ? audioManager.getTreble() : 0;

    // 1. Rotate Turntable platters
    this.turntablePlatters.forEach((p) => {
      p.rotation.y += delta * (audioManager && audioManager.isPlaying ? 2.5 : 0.5);
    });

    // 2. Pulse Subwoofer Cones
    this.speakers.forEach((cone) => {
      cone.scale.z = 1.0 + bass * 0.5;
    });

    // 3. Update LED VU meters on DJ Mixer
    if (this.vuLeds.length > 0) {
      this.vuLeds.forEach((ch, chIdx) => {
        const val = chIdx === 0 ? bass : mid;
        ch.forEach((led) => {
          if (val > led.threshold && audioManager && audioManager.isPlaying) {
            led.mesh.material.color.setHex(led.activeColor);
          } else {
            led.mesh.material.color.setHex(0x111116);
          }
        });
      });
    }

    // 4. LED Dance Floor Animation
    this.danceTiles.forEach((tile) => {
      // Wave equation based on distance and time
      const wave = Math.sin(time * 3 - tile.dist * 0.8);
      const intensity = Math.max(0, wave * 0.5 + 0.5) * (0.3 + bass * 0.7);
      
      let hue = (time * 0.1 + tile.dist * 0.05) % 1.0;
      if (pulse > 0.6) hue = (hue + 0.5) % 1.0; // Flash invert on kick
      
      tile.mat.emissive.setHSL(hue, 0.9, Math.min(0.8, intensity * 0.7));
    });

    // 5. Moving Head Spotlights
    this.spotlights.forEach((spot, i) => {
      const speed = 1.2;
      const tx = Math.sin(time * speed + spot.anglePhase) * 9;
      const tz = Math.cos(time * (speed * 0.8) + spot.anglePhase) * 11;
      spot.target.position.set(tx, 0.1, tz);
      spot.target.updateMatrixWorld();

      // Point beam cone to target
      spot.beamMesh.lookAt(spot.target.position);
      spot.beamMesh.material.opacity = 0.15 + bass * 0.35;
      spot.light.intensity = 8 + bass * 14;
    });

    // 6. Laser Beams
    if (this.lasersEnabled) {
      this.laserBeams.forEach((laser, i) => {
        laser.mesh.visible = true;
        const angleX = Math.sin(time * 2.5 + i * 0.6) * 0.45;
        const angleZ = Math.cos(time * 1.8 + i * 0.5) * 0.35;
        laser.mesh.rotation.x = angleX;
        laser.mesh.rotation.z = angleZ;
        laser.mesh.material.opacity = 0.4 + (i % 2 === 0 ? bass : treble) * 0.5;
      });
    } else {
      this.laserBeams.forEach((laser) => { laser.mesh.visible = false; });
    }

    // 7. Strobe Light
    if (this.strobesEnabled || (audioManager && audioManager.isPlaying && pulse > 0.85)) {
      this.strobeLight.intensity = (Math.sin(time * 45) > 0.4) ? 14 : 0;
    } else {
      this.strobeLight.intensity = 0;
    }

    // 8. Fog Particles Drift
    if (this.fogParticles) {
      const pos = this.fogParticles.geometry.attributes.position.array;
      const spd = this.fogParticles.userData.speeds;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] += spd[i] * delta;
        pos[i + 1] += spd[i + 1] * delta;
        pos[i + 2] += spd[i + 2] * delta;

        // Boundaries wrap
        if (pos[i] > 16) pos[i] = -16;
        if (pos[i] < -16) pos[i] = 16;
        if (pos[i + 1] > 9) pos[i + 1] = 0.5;
        if (pos[i + 1] < 0.5) pos[i + 1] = 9;
        if (pos[i + 2] > 20) pos[i + 2] = -20;
        if (pos[i + 2] < -20) pos[i + 2] = 20;
      }
      this.fogParticles.geometry.attributes.position.needsUpdate = true;
    }

    // 9. Pulsating Bias-Lighting Halo around Video Screen
    if (this.haloMat && audioManager) {
      this.haloMat.opacity = 0.35 + pulse * 0.45;
    }
  }

  // Draw Visualizer & Stream Wall
  renderBigScreen(time, audioManager) {
    if (!this.screenCtx) return;
    const ctx = this.screenCtx;
    const w = this.screenCanvas.width;
    const h = this.screenCanvas.height;

    // Dark backdrop with motion blur fade
    ctx.fillStyle = 'rgba(5, 7, 15, 0.28)';
    ctx.fillRect(0, 0, w, h);

    const track = audioManager ? audioManager.getCurrentTrack() : null;
    const isPlaying = audioManager ? audioManager.isPlaying : false;
    const freq = audioManager ? audioManager.frequencyData : [];

    // Mode 0: Spectrum Analyzer Bars
    if (this.visualizerMode === 0) {
      const barCount = 32;
      const barW = (w - 120) / barCount;
      const startX = 60;

      for (let i = 0; i < barCount; i++) {
        const val = freq[i] ? freq[i] / 255 : Math.abs(Math.sin(time * 4 + i * 0.3));
        const barH = val * (h * 0.65);
        const x = startX + i * barW;
        const y = h - 60 - barH;

        const grad = ctx.createLinearGradient(0, y, 0, h - 60);
        grad.addColorStop(0, '#00f0ff');
        grad.addColorStop(0.5, '#7928ca');
        grad.addColorStop(1, '#ff007f');

        ctx.fillStyle = grad;
        ctx.fillRect(x + 2, y, barW - 4, barH);
      }
    } 
    // Mode 1: Cyberpunk Concentric Waveform Tunnel
    else if (this.visualizerMode === 1) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      for (let r = 1; r <= 8; r++) {
        ctx.beginPath();
        const radius = (r * 32 + (time * 40) % 32) * (1 + (freq[r] ? freq[r] / 300 : 0));
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = r % 2 === 0 ? '#ff007f' : '#00f0ff';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Overhead Banner Text
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 18;
    ctx.font = 'bold 38px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('GOOD FAITH PARADIGM XR', w / 2, 60);

    if (track) {
      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = '#00f0ff';
      ctx.fillText(`NOW PLAYING: ${track.title.toUpperCase()}`, w / 2, 105);

      ctx.font = '20px sans-serif';
      ctx.fillStyle = '#ff007f';
      ctx.fillText(`${track.type}  •  youtube.com/@GparadigmOrgLove`, w / 2, 140);
    }
    ctx.restore();

    this.screenTexture.needsUpdate = true;
  }

  // --- Create High-Resolution Investor Plinth Infoboard Texture ---
  createPlinthCanvasTexture(pillarNum, title, subtitle, bullets, metricLabel, metricVal) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');

    // Cyber Glass Background with Radial Glow
    const bgGrad = ctx.createLinearGradient(0, 0, 1024, 640);
    bgGrad.addColorStop(0, 'rgba(8, 16, 32, 0.95)');
    bgGrad.addColorStop(1, 'rgba(4, 8, 18, 0.98)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 640);

    // Glowing Neon Border
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 1004, 620);

    // Header Tag
    ctx.fillStyle = '#ff007f';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`GOOD FAITH PARADIGM // PILLAR ${pillarNum}`, 40, 56);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText(title, 40, 115);

    // Subtitle
    ctx.fillStyle = '#00f0ff';
    ctx.font = '22px monospace';
    ctx.fillText(subtitle, 40, 155);

    // Divider Line
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 175);
    ctx.lineTo(984, 175);
    ctx.stroke();

    // Bullet Points
    let yPos = 230;
    bullets.forEach((bullet) => {
      ctx.fillStyle = '#00f0ff';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('▸', 44, yPos);
      ctx.fillStyle = '#e4ecf8';
      ctx.font = '25px sans-serif';
      ctx.fillText(bullet, 78, yPos);
      yPos += 54;
    });

    // Metric Badge at bottom
    if (metricLabel) {
      ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
      ctx.fillRect(40, 475, 944, 115);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 475, 944, 115);

      ctx.fillStyle = '#88a6d0';
      ctx.font = '18px monospace';
      ctx.fillText(metricLabel, 60, 515);

      ctx.fillStyle = '#00ff66';
      ctx.font = 'bold 34px monospace';
      ctx.fillText(metricVal, 60, 560);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // --- Zone 1: Executive Pitch Skyport Observation Campus (y = 30) ---
  buildSkyportDeck() {
    const deckW = 34;
    const deckL = 38;
    const deckY = 30.0;
    const deckZ = 28.0;

    // 1. High-Altitude Obsidian Observation Deck Floor
    const deckGeo = new THREE.PlaneGeometry(deckW, deckL);
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x090c14,
      roughness: 0.2,
      metalness: 0.8
    });
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.set(0, deckY, deckZ);
    deckMesh.rotation.x = -Math.PI / 2;
    deckMesh.receiveShadow = true;
    deckMesh.name = 'skyportFloor';
    this.scene.add(deckMesh);
    this.walkableFloors.push(deckMesh);

    // Structural Deck Underside Trusses
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x141824, metalness: 0.8 });
    const underMesh = new THREE.Mesh(new THREE.BoxGeometry(deckW + 2, 1.8, deckL + 2), trussMat);
    underMesh.position.set(0, deckY - 0.9, deckZ);
    this.scene.add(underMesh);

    // Glowing Perimeter Edge Strip & Glass Balustrade
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    // Glowing perimeter edge strips: four thin bars (not a solid slab that would bury the deck floor)
    [
      [0, -deckL / 2, deckW + 0.2, 0.2],
      [0, deckL / 2, deckW + 0.2, 0.2],
      [-deckW / 2, 0, 0.2, deckL],
      [deckW / 2, 0, 0.2, deckL]
    ].forEach(([ox, oz, w, d]) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), edgeMat);
      bar.position.set(ox, deckY + 0.06, deckZ + oz);
      this.scene.add(bar);
    });

    // Soft warm point lights over the deck so booths, relics and the docent are readable.
    // Range-limited so they do not reach the club interior 20 m below.
    [[-9, 14], [9, 14], [-9, 26], [9, 26], [0, 22], [0, 37]].forEach(([lx, lz]) => {
      const light = new THREE.PointLight(0xfff0d8, 1.7, 20, 1.4);
      light.position.set(lx, deckY + 5.5, lz);
      this.scene.add(light);
    });

    // Dedicated Adventure Corridor Cyber Accent Light (x: 9.0, z: 14.5)
    const adventureAccentLight = new THREE.PointLight(0x00f0ff, 1.2, 12, 1.6);
    adventureAccentLight.position.set(9.0, deckY + 3.2, 14.5);
    this.scene.add(adventureAccentLight);

    const glassBalustradeMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.24,
      roughness: 0.15,
      metalness: 0.25
    });
    const railingPositions = [
      { x: -deckW / 2, z: deckZ, w: 0.1, l: deckL },
      { x: deckW / 2, z: deckZ, w: 0.1, l: deckL },
      { x: 0, z: deckZ - deckL / 2, w: deckW, l: 0.1 }
    ];
    railingPositions.forEach((pos) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(pos.w, 1.25, pos.l), glassBalustradeMat);
      rail.position.set(pos.x, deckY + 0.65, pos.z);
      this.scene.add(rail);

      const topRail = new THREE.Mesh(new THREE.BoxGeometry(pos.w || 0.15, 0.08, pos.l || 0.15), edgeMat);
      topRail.position.set(pos.x, deckY + 1.28, pos.z);
      this.scene.add(topRail);
    });

    // 2. Centerpiece 12.0m x 6.75m Floating Presentation Screen at Skyport
    const screenW = 12.0;
    const screenH = 6.75;
    const skyScreenGeo = new THREE.PlaneGeometry(screenW, screenH);
    this.skyportScreenMesh = new THREE.Mesh(skyScreenGeo, this.screenMat);
    this.skyportScreenMesh.position.set(0, deckY + 4.8, 12.5);
    this.skyportScreenMesh.rotation.y = 0; // Facing south towards observation seating
    this.skyportScreenMesh.name = 'skyportVideoScreen';
    this.skyportScreenMesh.userData = { action: 'toggleVideo' };
    this.scene.add(this.skyportScreenMesh);
    this.interactableObjects.push(this.skyportScreenMesh);

    // Frame & Halo for Skyport Screen
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0d18, metalness: 0.9, roughness: 0.2 });
    const skyFrameGroup = new THREE.Group();
    skyFrameGroup.position.set(0, deckY + 4.8, 12.5);

    const hBar = new THREE.Mesh(new THREE.BoxGeometry(screenW + 0.4, 0.25, 0.2), frameMat);
    const hBarTop = hBar.clone();
    hBarTop.position.y = screenH / 2 + 0.12;
    const hBarBottom = hBar.clone();
    hBarBottom.position.y = -screenH / 2 - 0.12;
    skyFrameGroup.add(hBarTop, hBarBottom);

    const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.25, screenH + 0.4, 0.2), frameMat);
    const vBarLeft = vBar.clone();
    vBarLeft.position.x = -screenW / 2 - 0.12;
    const vBarRight = vBar.clone();
    vBarRight.position.x = screenW / 2 + 0.12;
    skyFrameGroup.add(vBarLeft, vBarRight);

    this.skyportHaloMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const skyHalo = new THREE.Mesh(new THREE.PlaneGeometry(screenW + 0.7, screenH + 0.7), this.skyportHaloMat);
    skyHalo.position.z = -0.06;
    skyFrameGroup.add(skyHalo);
    this.scene.add(skyFrameGroup);

    // Support pylons anchoring screen to deck
    [-screenW / 2 + 0.4, screenW / 2 - 0.4].forEach((px) => {
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.15, 3.0, 16),
        new THREE.MeshStandardMaterial({ color: 0x1f2738, metalness: 0.9 })
      );
      pylon.position.set(px, deckY + 1.5, 12.5);
      this.scene.add(pylon);
    });

    // 3. Amphitheater Executive Seating facing screen
    const seatingMat = new THREE.MeshStandardMaterial({ color: 0x181e2b, roughness: 0.6 });
    for (let row = 0; row < 3; row++) {
      const rowRadius = 14 + row * 2.8;
      const rowAngle = Math.PI * 0.45;
      const tierGeo = new THREE.CylinderGeometry(rowRadius, rowRadius, 0.45, 24, 1, false, Math.PI / 2 - rowAngle / 2, rowAngle);
      const tierMesh = new THREE.Mesh(tierGeo, seatingMat);
      tierMesh.position.set(0, deckY + 0.2 + row * 0.35, 12.5);
      this.scene.add(tierMesh);
    }

    // 4. Four Interactive Investor Pitch Plinths
    const plinthData = [
      {
        num: '01',
        title: 'SACRED SOUND & INSIGHT ENGINE',
        sub: 'Proprietary Audio Synthesis & Spiritual Harmonics',
        bullets: [
          '13 Master Official Tracks by Good Faith Paradigm',
          'Web Audio FFT Real-Time Spectral Visualizer',
          'Algorithmic Audio Synthesis & Sacred Frequency'
        ],
        metricLabel: 'CATALOG ASSETS',
        metricVal: '100% PROPRIETARY • 13 PRODUCTION TRACKS',
        pos: new THREE.Vector3(-8.5, deckY, 21.0),
        rotY: Math.PI / 6
      },
      {
        num: '02',
        title: 'URBAN AIR MOBILITY (UAM)',
        sub: 'Point-to-Point Quiet Electric Aviation',
        bullets: [
          'Tandem Tilt-Rotor eVTOL Passenger Architecture',
          'Autonomous High-Speed Skyway Transit Corridors',
          'Direct Skyport Aerotropolis-to-Venue Routing'
        ],
        metricLabel: 'TRANSIT ADVANTAGE',
        metricVal: '85% FASTER THAN METROPOLITAN GRIDLOCK',
        pos: new THREE.Vector3(-3.2, deckY, 18.5),
        rotY: Math.PI / 16
      },
      {
        num: '03',
        title: 'AUTONOMOUS LAST-MILE PODS',
        sub: 'Electric Intermodal Ground Fleet',
        bullets: [
          'On-Demand Pod Transit Bridging Aerodromes to Venues',
          'Real-Time Autonomous Steering & Waypoint Guidance',
          'Inductive Fast-Charging Stations at Arrivals'
        ],
        metricLabel: 'FLEET EFFICIENCY',
        metricVal: 'ZERO-EMISSIONS • 24/7 AUTONOMOUS DISPATCH',
        pos: new THREE.Vector3(3.2, deckY, 18.5),
        rotY: -Math.PI / 16
      },
      {
        num: '04',
        title: 'SPATIAL WebXR EXPERIENTIAL VENUES',
        sub: 'Metaverse & Physical Venue Convergence',
        bullets: [
          'Zero-Install WebXR on Meta Quest 2/3, Vision Pro & PC',
          'Audio-Reactive Dance Floors, DJ Booths & Holograms',
          'Global Scalability for Live Virtual Investor Events'
        ],
        metricLabel: 'TAM OPPORTUNITY',
        metricVal: '$1.3 TRILLION IMMERSIVE SPATIAL MARKET',
        pos: new THREE.Vector3(8.5, deckY, 21.0),
        rotY: -Math.PI / 6
      }
    ];

    plinthData.forEach((p) => {
      const plinthGroup = new THREE.Group();
      plinthGroup.position.copy(p.pos);
      plinthGroup.rotation.y = p.rotY;

      // Base Pedestal
      const baseMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.45, 1.0, 16),
        new THREE.MeshStandardMaterial({ color: 0x121824, metalness: 0.8, roughness: 0.3 })
      );
      baseMesh.position.y = 0.5;

      const ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.03, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0x00f0ff })
      );
      ringMesh.position.y = 0.95;
      ringMesh.rotation.x = Math.PI / 2;

      // Angled Display Tablet
      const tabletTex = this.createPlinthCanvasTexture(p.num, p.title, p.sub, p.bullets, p.metricLabel, p.metricVal);
      const tabletGeo = new THREE.PlaneGeometry(1.6, 1.0);
      const tabletMat = new THREE.MeshBasicMaterial({ map: tabletTex, side: THREE.DoubleSide });
      const tablet = new THREE.Mesh(tabletGeo, tabletMat);
      tablet.position.set(0, 1.45, 0);
      tablet.rotation.x = -Math.PI / 5;
      tablet.name = `plinth_${p.num}`;
      tablet.userData = { action: 'inspect_plinth', tooltip: p.title };

      // Tablet Bezel Frame
      const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(1.66, 1.06, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x0a0e18, metalness: 0.9 })
      );
      bezel.position.set(0, 1.45, -0.025);
      bezel.rotation.x = -Math.PI / 5;

      plinthGroup.add(baseMesh, ringMesh, bezel, tablet);
      this.scene.add(plinthGroup);
      this.interactableObjects.push(tablet);
      this.infoboards.push(tablet);
    });

    // 5. Helipad Alpha (eVTOL Flight Deck)
    const padRadius = 6.0;
    const padMesh = new THREE.Mesh(
      new THREE.CircleGeometry(padRadius, 32),
      new THREE.MeshStandardMaterial({ color: 0x0c121e, metalness: 0.6, roughness: 0.3 })
    );
    padMesh.position.set(0, deckY + 0.02, 38.0);
    padMesh.rotation.x = -Math.PI / 2;
    padMesh.receiveShadow = true;
    padMesh.name = 'helipadAlphaFloor';
    this.scene.add(padMesh);
    this.walkableFloors.push(padMesh);

    // Glowing Concentric Rings
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const ring1 = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.5, 32), ringMat);
    ring1.position.set(0, deckY + 0.03, 38.0);
    ring1.rotation.x = -Math.PI / 2;
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.8, 32), new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    ring2.position.set(0, deckY + 0.03, 38.0);
    ring2.rotation.x = -Math.PI / 2;
    this.scene.add(ring1, ring2);

    // Large 'H' Marking on Helipad
    const hBarMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hBar1 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.0), hBarMat);
    hBar1.position.set(-1.0, deckY + 0.04, 38.0);
    hBar1.rotation.x = -Math.PI / 2;
    const hBar2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.0), hBarMat);
    hBar2.position.set(1.0, deckY + 0.04, 38.0);
    hBar2.rotation.x = -Math.PI / 2;
    const hCross = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), hBarMat);
    hCross.position.set(0, deckY + 0.04, 38.0);
    hCross.rotation.x = -Math.PI / 2;
    this.scene.add(hBar1, hBar2, hCross);

    // Helipad Perimeter Strobe Lights
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const lx = Math.cos(a) * 5.6;
      const lz = 38.0 + Math.sin(a) * 5.6;
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.25, 8),
        new THREE.MeshBasicMaterial({ color: 0x00f0ff })
      );
      beacon.position.set(lx, deckY + 0.12, lz);
      this.scene.add(beacon);
    }
  }

  // --- Procedural Smart Metropolis Skyline Vista ---
  buildMetropolisSkyline() {
    const cityGroup = new THREE.Group();
    const buildingMatDark = new THREE.MeshStandardMaterial({ color: 0x060912, metalness: 0.9, roughness: 0.2 });
    const windowColors = [0x00f0ff, 0xff007f, 0xffaa00, 0x00ff88];

    // Distribute 80 procedural skyscrapers across the metropolitan basin
    for (let i = 0; i < 80; i++) {
      const bx = (Math.random() - 0.5) * 320;
      const bz = -240 + Math.random() * 320;

      // Keep clearance around skyport and club
      if (Math.abs(bx) < 25 && bz > -30 && bz < 55) continue;
      if (Math.abs(bx) < 20 && bz > -160 && bz < -120) continue;

      const bw = 12 + Math.random() * 22;
      const bd = 12 + Math.random() * 22;
      const bh = 25 + Math.random() * 65;
      const by = bh / 2 - 10;

      const towerGeo = new THREE.BoxGeometry(bw, bh, bd);
      const tower = new THREE.Mesh(towerGeo, buildingMatDark);
      tower.position.set(bx, by, bz);
      cityGroup.add(tower);

      // Emissive Grid Window Bands
      const bandCount = 2 + Math.floor(Math.random() * 4);
      for (let b = 0; b < bandCount; b++) {
        const bandGeo = new THREE.BoxGeometry(bw + 0.1, 0.8, bd + 0.1);
        const winColor = windowColors[Math.floor(Math.random() * windowColors.length)];
        const bandMat = new THREE.MeshBasicMaterial({ color: winColor });
        const band = new THREE.Mesh(bandGeo, bandMat);
        band.position.set(bx, by - bh / 2 + 10 + b * 12, bz);
        cityGroup.add(band);
      }

      // Rooftop Beacon Strobe
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff0040 })
      );
      beacon.position.set(bx, by + bh / 2 + 0.3, bz);
      cityGroup.add(beacon);
    }

    this.scene.add(cityGroup);
  }

  // --- Zone 2: Vertiport Bravo Aerodrome & Terminal (y = 5.0, z = -140) ---
  buildVertiportBravo() {
    const portW = 32;
    const portL = 28;
    const portY = 5.0;
    const portZ = -140.0;

    // 1. Aerodrome Landing Deck
    const deckGeo = new THREE.PlaneGeometry(portW, portL);
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x0a0e18, metalness: 0.7, roughness: 0.3 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(0, portY, portZ);
    deck.rotation.x = -Math.PI / 2;
    deck.receiveShadow = true;
    deck.name = 'vertiportBravoFloor';
    this.scene.add(deck);
    this.walkableFloors.push(deck);

    // Deck Foundation Pillars
    [-portW / 2 + 3, portW / 2 - 3].forEach((px) => {
      [-portL / 2 + 3, portL / 2 - 3].forEach((pz) => {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(1.2, 1.4, portY + 10, 16),
          new THREE.MeshStandardMaterial({ color: 0x111624, metalness: 0.8 })
        );
        pillar.position.set(px, (portY - 10) / 2, portZ + pz);
        this.scene.add(pillar);
      });
    });

    // 2. Helipad Bravo
    const padMesh = new THREE.Mesh(
      new THREE.CircleGeometry(6.0, 32),
      new THREE.MeshStandardMaterial({ color: 0x0f1522, metalness: 0.5, roughness: 0.4 })
    );
    padMesh.position.set(0, portY + 0.02, portZ);
    padMesh.rotation.x = -Math.PI / 2;
    this.scene.add(padMesh);
    this.walkableFloors.push(padMesh);

    // Glowing Helipad Rings & H
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.2, 5.5, 32),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    ring.position.set(0, portY + 0.03, portZ);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);

    const hMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const h1 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.0), hMat);
    h1.position.set(-1.0, portY + 0.04, portZ);
    h1.rotation.x = -Math.PI / 2;
    const h2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.0), hMat);
    h2.position.set(1.0, portY + 0.04, portZ);
    h2.rotation.x = -Math.PI / 2;
    const hc = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), hMat);
    hc.position.set(0, portY + 0.04, portZ);
    hc.rotation.x = -Math.PI / 2;
    this.scene.add(h1, h2, hc);

    // 3. Passenger Arrival Terminal Pavilion
    const termGeo = new THREE.BoxGeometry(10, 4.5, 7);
    const termGlass = new THREE.MeshStandardMaterial({
      color: 0x05152a,
      transparent: true,
      opacity: 0.35,
      metalness: 0.25,
      roughness: 0.15
    });
    const terminal = new THREE.Mesh(termGeo, termGlass);
    terminal.position.set(-9.0, portY + 2.25, portZ + 8.0);
    this.scene.add(terminal);

    // Terminal Illuminated Sign
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const signCtx = signCanvas.getContext('2d');
    signCtx.fillStyle = 'rgba(6, 12, 24, 0.9)';
    signCtx.fillRect(0, 0, 512, 128);
    signCtx.strokeStyle = '#00f0ff';
    signCtx.lineWidth = 4;
    signCtx.strokeRect(4, 4, 504, 120);
    signCtx.fillStyle = '#00f0ff';
    signCtx.font = 'bold 32px monospace';
    signCtx.textAlign = 'center';
    signCtx.fillText('VERTIPORT BRAVO', 256, 50);
    signCtx.fillStyle = '#ffffff';
    signCtx.font = '20px sans-serif';
    signCtx.fillText('PASSENGER ARRIVALS & MOBILITY', 256, 95);

    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5.0, 1.25),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCanvas), side: THREE.DoubleSide })
    );
    signMesh.position.set(-9.0, portY + 4.9, portZ + 8.0);
    this.scene.add(signMesh);

    // 4. Autonomous Mobility Staging Bay (Inductive Charging Cradle)
    const bayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(6.0, 8.0),
      new THREE.MeshStandardMaterial({ color: 0x08101c, metalness: 0.9, roughness: 0.2 })
    );
    bayMesh.position.set(6.0, portY + 0.03, portZ + 5.0);
    bayMesh.rotation.x = -Math.PI / 2;
    this.scene.add(bayMesh);

    // Induction Coils Marker
    const coil = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 1.9, 24),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    coil.position.set(6.0, portY + 0.04, portZ + 5.0);
    coil.rotation.x = -Math.PI / 2;
    this.scene.add(coil);
  }

  // --- Entertainment Promenade & Boulevard (Connecting Vertiport to Exterior Plaza outside Club) ---
  buildPromenade() {
    const roadW = 12.0;
    const startZ = -135.0;
    const endZ = -25.0;
    const roadL = endZ - startZ;
    const centerZ = (startZ + endZ) / 2;

    // 1. Roadway Surface
    const roadGeo = new THREE.PlaneGeometry(roadW, roadL);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x0c0f18,
      roughness: 0.35,
      metalness: 0.7
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.set(0, 5.0, centerZ);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    road.name = 'promenadeRoadFloor';
    this.scene.add(road);
    this.walkableFloors.push(road);

    // Center Glowing Dividing Line
    const lineGeo = new THREE.PlaneGeometry(0.3, roadL);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const centerLine = new THREE.Mesh(lineGeo, lineMat);
    centerLine.position.set(0, 5.02, centerZ);
    centerLine.rotation.x = -Math.PI / 2;
    this.scene.add(centerLine);

    // 2. Flanking Raised Sidewalks with Cyber Curbs
    const walkW = 3.5;
    const walkMat = new THREE.MeshStandardMaterial({ color: 0x131926, roughness: 0.4, metalness: 0.6 });
    [-roadW / 2 - walkW / 2, roadW / 2 + walkW / 2].forEach((sx) => {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(walkW, 0.3, roadL), walkMat);
      walk.position.set(sx, 5.15, centerZ);
      walk.receiveShadow = true;
      this.scene.add(walk);
      this.walkableFloors.push(walk);

      // Glowing curb strip
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.1, roadL),
        new THREE.MeshBasicMaterial({ color: 0x00f0ff })
      );
      curb.position.set(sx > 0 ? sx - walkW / 2 : sx + walkW / 2, 5.3, centerZ);
      this.scene.add(curb);
    });

    // 3. Cyber Streetlamp Posts along the Promenade
    for (let z = startZ + 15; z < endZ - 10; z += 28) {
      [-roadW / 2 - walkW + 0.5, roadW / 2 + walkW - 0.5].forEach((lx) => {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.1, 5.5, 12),
          new THREE.MeshStandardMaterial({ color: 0x151b2a, metalness: 0.9 })
        );
        post.position.set(lx, 5.15 + 2.75, z);
        this.scene.add(post);

        // Overhang Arm & Emissive Lantern
        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.08, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x151b2a, metalness: 0.9 })
        );
        arm.position.set(lx > 0 ? lx - 0.9 : lx + 0.9, 5.15 + 5.5, z);
        this.scene.add(arm);

        const lantern = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.12, 0.4),
          new THREE.MeshBasicMaterial({ color: 0x00f0ff })
        );
        lantern.position.set(lx > 0 ? lx - 1.6 : lx + 1.6, 5.15 + 5.4, z);
        this.scene.add(lantern);
      });
    }

    // 4. Overhead Illuminated Sign Archways across Boulevard (strictly outside the club)
    const archPositions = [startZ + 30, (startZ + endZ) / 2, endZ - 6];
    archPositions.forEach((az, idx) => {
      const archGroup = new THREE.Group();
      archGroup.position.set(0, 5.0, az);

      const archFrame = new THREE.Mesh(
        new THREE.BoxGeometry(roadW + walkW * 2 + 1, 0.4, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x1a2132, metalness: 0.9 })
      );
      archFrame.position.y = 6.2;
      archGroup.add(archFrame);

      // Support Columns
      [-roadW / 2 - walkW - 0.2, roadW / 2 + walkW + 0.2].forEach((colX) => {
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.25, 6.2, 12),
          new THREE.MeshStandardMaterial({ color: 0x1a2132, metalness: 0.9 })
        );
        col.position.set(colX, 3.1, 0);
        archGroup.add(col);
      });

      // Digital Highway Signboard
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 512;
      signCanvas.height = 96;
      const signCtx = signCanvas.getContext('2d');
      signCtx.fillStyle = 'rgba(5, 10, 22, 0.9)';
      signCtx.fillRect(0, 0, 512, 96);
      signCtx.strokeStyle = '#00f0ff';
      signCtx.lineWidth = 3;
      signCtx.strokeRect(4, 4, 504, 88);
      signCtx.fillStyle = '#00f0ff';
      signCtx.font = 'bold 26px monospace';
      signCtx.textAlign = 'center';
      const label = idx === 0 ? 'ENTERTAINMENT BOULEVARD' : (idx === 1 ? 'PARADIGM VR CLUB ▸ 100M' : 'VIP CLUB & SHOWROOM ENTRANCE');
      signCtx.fillText(label, 256, 55);

      const signTex = new THREE.CanvasTexture(signCanvas);
      const signBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(6.0, 1.2),
        new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
      );
      signBoard.position.set(0, 5.2, 0);
      archGroup.add(signBoard);

      this.scene.add(archGroup);
    });
  }

  // --- Outdoor Entertainment Venues (Amphitheater & Mobility Showroom) ---
  buildOutdoorEntertainmentVenues() {
    // 1. Outdoor Acoustic Amphitheater at (x: 24, y: 0, z: 10)
    const amphiGroup = new THREE.Group();
    amphiGroup.position.set(24, 0, 10);

    const amphiFloor = new THREE.Mesh(
      new THREE.CircleGeometry(14, 32),
      new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.7, roughness: 0.3 })
    );
    amphiFloor.rotation.x = -Math.PI / 2;
    amphiGroup.add(amphiFloor);
    this.walkableFloors.push(amphiFloor);

    // Tiered Semi-Circular Seating
    const tierMat = new THREE.MeshStandardMaterial({ color: 0x161e2e, roughness: 0.6 });
    for (let r = 1; r <= 3; r++) {
      const radius = 6.0 + r * 2.2;
      const stepGeo = new THREE.CylinderGeometry(radius, radius, 0.4, 24, 1, false, Math.PI * 0.25, Math.PI * 0.9);
      const step = new THREE.Mesh(stepGeo, tierMat);
      step.position.y = 0.2 + r * 0.3;
      amphiGroup.add(step);
    }

    // Holographic Sacred Geometry Sculpture in center
    const torus1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.05, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    torus1.position.y = 2.4;
    const torus2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.04, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0xff007f })
    );
    torus2.position.y = 2.4;
    torus2.rotation.x = Math.PI / 3;
    amphiGroup.add(torus1, torus2);
    this.scene.add(amphiGroup);

    // 2. Future Mobility Showroom at (x: -24, y: 0, z: 10)
    const showGroup = new THREE.Group();
    showGroup.position.set(-24, 0, 10);

    const showFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({ color: 0x0c101c, metalness: 0.8, roughness: 0.2 })
    );
    showFloor.rotation.x = -Math.PI / 2;
    showGroup.add(showFloor);
    this.walkableFloors.push(showFloor);

    // Glass Walls
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.22,
      metalness: 0.25,
      roughness: 0.15
    });
    const glassBox = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 16), glassMat);
    glassBox.position.y = 3;
    showGroup.add(glassBox);

    // Elevated Concept Vehicle Turntable Plinth
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.8, 0.35, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a2236, metalness: 0.9 })
    );
    plinth.position.y = 0.18;
    const plinthRing = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 3.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    plinthRing.rotation.x = -Math.PI / 2;
    plinthRing.position.y = 0.36;
    showGroup.add(plinth, plinthRing);

    this.scene.add(showGroup);
  }
}
