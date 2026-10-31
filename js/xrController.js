import * as THREE from 'three';

export class XRControllerManager {
  constructor(renderer, scene, camera, dolly, interactableObjects, onInteractCallback) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.dolly = dolly; // Group containing camera and controllers
    this.interactableObjects = interactableObjects;
    this.onInteract = onInteractCallback;

    this.controllers = [];
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();
    this._zAxis = new THREE.Vector3(0, 0, 1);
    this._forwardVec = new THREE.Vector3();
    this._rightVec = new THREE.Vector3();
    this._raycastFrame = 0;
    this.wristMeshes = new Set();

    // Hardware Button Polling States
    this.buttonStates = {};

    // Teleportation State
    this.teleportMarker = null;
    this.teleportValid = false;
    this.teleportTarget = new THREE.Vector3();
    this.activeTeleportController = null;
    
    // Snap Turn & Smooth Locomotion
    this.snapTurnCooldown = 0;

    // Handheld Media Remote State
    this.remoteCanvas = null;
    this.remoteCtx = null;
    this.remoteTexture = null;
    this.handheldRemote = null;
    this.lastRemoteTitle = '';
    this.lastRemotePlaying = null;
    this.lastNearbyLabel = '';

    // Floating 3D VR Quick-Teleport & Booth Menu
    this.floatingMenu = null;
    this.floatingMenuVisible = false;

    this.buildTeleportMarker();
    this.setupControllers();
    this.buildFloatingVRMenu();
  }

  buildTeleportMarker() {
    // Ring marker on the floor
    const ringGeo = new THREE.RingGeometry(0.3, 0.45, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.teleportMarker = new THREE.Mesh(ringGeo, ringMat);
    this.teleportMarker.visible = false;
    this.scene.add(this.teleportMarker);
  }

  // Procedural Futuristic Cyber-Controller Grip (Self-contained, 0 external network dependencies)
  createProceduralControllerModel(colorHex) {
    const group = new THREE.Group();

    // 1. Sleek ergonomic handle
    const handleGeo = new THREE.CylinderGeometry(0.018, 0.024, 0.15, 16);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x151820,
      metalness: 0.85,
      roughness: 0.25
    });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.rotation.x = -Math.PI / 4;
    handle.position.set(0, -0.03, 0.04);
    group.add(handle);

    // 2. Glowing emitter ring
    const ringGeo = new THREE.TorusGeometry(0.035, 0.005, 12, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 0, -0.02);
    group.add(ring);

    // 3. Tip emitter
    const tipGeo = new THREE.SphereGeometry(0.012, 16, 16);
    const tipMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(0, 0, -0.05);
    group.add(tip);

    return group;
  }

  // Helper to create a labeled 3D button for Wrist Remote or Floating VR Menu
  createMenu3DButton(label, action, colorHex, w, h, d) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0d1324,
      emissive: colorHex,
      emissiveIntensity: 0.45,
      metalness: 0.8,
      roughness: 0.25
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.name = `vrmenu_${action}`;
    mesh.userData = { action };
    group.add(mesh);
    this.interactableObjects.push(mesh);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    const hex = '#' + colorHex.toString(16).padStart(6, '0');
    ctx.fillStyle = '#070b16';
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = hex;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 90);
    ctx.fillStyle = '#ffffff';
    const fontSize = label.length > 14 ? 22 : (label.length > 9 ? 26 : 30);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 48);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.95, h * 0.92),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    face.position.z = d / 2 + 0.001;
    face.userData = { action };
    group.add(face);
    this.interactableObjects.push(face);

    return group;
  }

  // Upgraded Multi-Deck Handheld Cyber Remote Mounted on the Left Controller Grip
  buildHandheldRemote(grip) {
    const remoteGroup = new THREE.Group();
    // Positioned above the controller grip angled towards player's eyes
    remoteGroup.position.set(0, 0.085, -0.03);
    remoteGroup.rotation.x = -Math.PI / 4.5;

    // 1. Futuristic Bezel Body (expanded for 3 rows: Booth Controls, Quick Teleport, Media + Menu)
    const bodyW = 0.23;
    const bodyH = 0.175;
    const bodyGeo = new THREE.BoxGeometry(bodyW, bodyH, 0.014);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x090c16,
      metalness: 0.9,
      roughness: 0.25
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    remoteGroup.add(body);

    // Cyber Edge Neon Trim
    const trimGeo = new THREE.BoxGeometry(bodyW + 0.006, bodyH + 0.006, 0.011);
    const trimMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true
    });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    remoteGroup.add(trim);

    // 2. Canvas Display for Track Title, Active Booth, & Live Status
    this.remoteCanvas = document.createElement('canvas');
    this.remoteCanvas.width = 512;
    this.remoteCanvas.height = 192;
    this.remoteCtx = this.remoteCanvas.getContext('2d');
    this.remoteTexture = new THREE.CanvasTexture(this.remoteCanvas);

    const screenGeo = new THREE.PlaneGeometry(0.21, 0.055);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.remoteTexture,
      transparent: true
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0.052, 0.009);
    remoteGroup.add(screenMesh);

    // 3. Three Rows of Tactile 3D Buttons on Wrist Remote:
    // Row 1 (y = +0.008): Nearest Booth & Docent Controls
    // Row 2 (y = -0.026): Quick-Jump Teleport (Booths, Corridor, Relics, Club)
    // Row 3 (y = -0.060): Media Controls & Floating 3D Menu Toggle
    const rows = [
      {
        y: 0.008,
        buttons: [
          { action: 'vr:booth_prev', label: '◄ SLIDE', color: 0x00f0ff },
          { action: 'vr:booth_narrate', label: 'NARRATE', color: 0x00ff88 },
          { action: 'vr:booth_next', label: 'SLIDE ►', color: 0x00f0ff },
          { action: 'vr:docent_explain', label: 'DOCENT', color: 0xffc400 }
        ]
      },
      {
        y: -0.026,
        buttons: [
          { action: 'vr:cycle_booth', label: 'BOOTHS', color: 0xb26bff },
          { action: 'teleport:adventure', label: 'CORRIDOR', color: 0x00f0ff },
          { action: 'teleport:relics', label: 'RELICS', color: 0xffc400 },
          { action: 'teleport:floor', label: 'CLUB', color: 0xff007f }
        ]
      },
      {
        y: -0.060,
        buttons: [
          { action: 'prev', label: '◄ TRK', color: 0x00f0ff },
          { action: 'play', label: 'PLAY', color: 0xff007f },
          { action: 'next', label: 'TRK ►', color: 0x00f0ff },
          { action: 'vr:toggle_menu', label: '☰ MENU', color: 0xffaa00 }
        ]
      }
    ];

    const btnW = 0.048;
    const btnH = 0.026;
    const btnD = 0.012;
    const xs = [-0.078, -0.026, 0.026, 0.078];

    rows.forEach((row) => {
      row.buttons.forEach((b, idx) => {
        const btn = this.createMenu3DButton(b.label, b.action, b.color, btnW, btnH, btnD);
        btn.position.set(xs[idx], row.y, 0.010);
        remoteGroup.add(btn);
      });
    });

    grip.add(remoteGroup);
    this.handheldRemote = remoteGroup;
    remoteGroup.traverse((child) => {
      if (child.isMesh) this.wristMeshes.add(child);
    });
    this.renderHandheldRemote('Sanctuary of Sound', true);
  }

  // Floating 3D VR Campus & Booth Command Menu (toggled in front of player via Wrist ☰ MENU, Left Stick Click, or [M])
  buildFloatingVRMenu() {
    const menuGroup = new THREE.Group();
    menuGroup.visible = false;
    this.floatingMenu = menuGroup;
    this.scene.add(menuGroup);

    const panelW = 1.55;
    const panelH = 1.05;

    // Backing cyber glass panel
    const bgMesh = new THREE.Mesh(
      new THREE.BoxGeometry(panelW, panelH, 0.025),
      new THREE.MeshStandardMaterial({
        color: 0x060a16,
        metalness: 0.85,
        roughness: 0.25,
        transparent: true,
        opacity: 0.95
      })
    );
    menuGroup.add(bgMesh);

    const borderMesh = new THREE.Mesh(
      new THREE.BoxGeometry(panelW + 0.02, panelH + 0.02, 0.018),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true })
    );
    menuGroup.add(borderMesh);

    // Header Banner
    const hCanvas = document.createElement('canvas');
    hCanvas.width = 1024;
    hCanvas.height = 128;
    const hCtx = hCanvas.getContext('2d');
    hCtx.fillStyle = '#070d1e';
    hCtx.fillRect(0, 0, 1024, 128);
    hCtx.strokeStyle = '#00f0ff';
    hCtx.lineWidth = 4;
    hCtx.strokeRect(4, 4, 1016, 120);
    hCtx.fillStyle = '#00f0ff';
    hCtx.font = 'bold 34px monospace';
    hCtx.textAlign = 'center';
    hCtx.fillText('VR CAMPUS TELEPORT & BOOTH COMMAND DECK', 512, 52);
    hCtx.fillStyle = '#9fb3d9';
    hCtx.font = '22px sans-serif';
    hCtx.fillText('Point Laser / Crosshair & Click Any Button • Press [M] or ✕ to Close', 512, 96);

    const hTex = new THREE.CanvasTexture(hCanvas);
    hTex.colorSpace = THREE.SRGBColorSpace;
    const headerMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(panelW - 0.08, 0.14),
      new THREE.MeshBasicMaterial({ map: hTex })
    );
    headerMesh.position.set(0, panelH / 2 - 0.10, 0.015);
    menuGroup.add(headerMesh);

    // Grid of 4 columns x 5 rows of 3D interactive buttons
    const buttonRows = [
      // Row 1: Pitch Booths (Direct Teleport)
      [
        { label: '1: PRISMATIC BOOTH', action: 'teleport:booth:prismatic', color: 0x00f0ff },
        { label: '2: HARPS OF GOD', action: 'teleport:booth:harps', color: 0xffc400 },
        { label: '3: SACRED ARCHIVE', action: 'teleport:booth:archive', color: 0xff007f },
        { label: '4: COLLECTOR NFT', action: 'teleport:booth:collector', color: 0x00ff88 }
      ],
      // Row 2: Skyport Exhibits & Docent Teleport
      [
        { label: 'ADVENTURE CORRIDOR', action: 'teleport:adventure', color: 0x00f0ff },
        { label: 'RELIC PAVILION', action: 'teleport:relics', color: 0xb26bff },
        { label: 'DOCENT LUX KIOSK', action: 'teleport:docent', color: 0xffc400 },
        { label: 'SKYPORT OVERVIEW', action: 'teleport:skyport', color: 0x00f0ff }
      ],
      // Row 3: Nearest Booth / Exhibit Remote Controls
      [
        { label: '◄ PREV SLIDE', action: 'vr:booth_prev', color: 0x00f0ff },
        { label: 'PLAY / NARRATE', action: 'vr:booth_narrate', color: 0x00ff88 },
        { label: 'NEXT SLIDE ►', action: 'vr:booth_next', color: 0x00f0ff },
        { label: 'SWITCH BOOTH VIEW', action: 'vr:booth_view', color: 0xb26bff }
      ],
      // Row 4: Docent Lux Voice & Guided Tour Controls
      [
        { label: 'DOCENT: FULL TOUR', action: 'docent:tour', color: 0xffc400 },
        { label: 'DOCENT: EXPLAIN HERE', action: 'vr:docent_explain', color: 0x00f0ff },
        { label: 'DOCENT: RELICS TOUR', action: 'docent:relics', color: 0xb26bff },
        { label: 'DOCENT: STOP', action: 'docent:stop', color: 0xff3b6b }
      ],
      // Row 5: Vehicles, Paradigm Club & Close Menu
      [
        { label: '✈ BOARD eVTOL', action: 'teleport:vtol', color: 0xffaa00 },
        { label: '🚗 GROUND ROVER', action: 'teleport:rover', color: 0x00f0ff },
        { label: 'PARADIGM CLUB FLOOR', action: 'teleport:floor', color: 0xff007f },
        { label: '✕ CLOSE MENU', action: 'vr:toggle_menu', color: 0xff3b6b }
      ]
    ];

    const colX = [-0.54, -0.18, 0.18, 0.54];
    const rowY = [0.26, 0.10, -0.06, -0.22, -0.38];
    const bW = 0.33;
    const bH = 0.115;
    const bD = 0.022;

    buttonRows.forEach((row, rIdx) => {
      row.forEach((b, cIdx) => {
        const btn = this.createMenu3DButton(b.label, b.action, b.color, bW, bH, bD);
        btn.position.set(colX[cIdx], rowY[rIdx], 0.018);
        menuGroup.add(btn);
      });
    });

    menuGroup.traverse((child) => {
      child.visible = false;
    });
  }

  toggleFloatingMenu(forceState) {
    if (!this.floatingMenu) return false;
    this.floatingMenuVisible = typeof forceState === 'boolean' ? forceState : !this.floatingMenuVisible;
    this.floatingMenu.traverse((child) => {
      child.visible = this.floatingMenuVisible;
    });
    if (this.floatingMenuVisible) {
      this.positionFloatingMenuInFront();
    }
    return this.floatingMenuVisible;
  }

  positionFloatingMenuInFront() {
    if (!this.floatingMenu) return;
    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    this.camera.getWorldDirection(camDir);
    camDir.y = 0;
    if (camDir.lengthSq() < 0.001) camDir.set(0, 0, -1);
    camDir.normalize();

    this.floatingMenu.position.copy(camPos).addScaledVector(camDir, 1.55);
    this.floatingMenu.position.y = Math.max(this.dolly.position.y + 1.35, camPos.y - 0.1);
    this.floatingMenu.lookAt(camPos.x, this.floatingMenu.position.y, camPos.z);
  }

  renderHandheldRemote(videoTitle, isPlaying, playerState = 'WALKING', nearbyLabel = '') {
    if (!this.remoteCtx) return;
    const ctx = this.remoteCtx;
    const w = this.remoteCanvas.width;
    const h = this.remoteCanvas.height;

    ctx.fillStyle = '#060814';
    ctx.fillRect(0, 0, w, h);

    // Neon Frame
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    // Header with Transit Mode Badge
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    const stateTag = playerState === 'VTOL_PILOT' ? '✈ eVTOL COCKPIT' : (playerState === 'LAST_MILE_DRIVER' ? '🚗 ROVER COCKPIT' : '★ WRIST COMMAND DECK');
    ctx.fillText(stateTag, w / 2, 32);

    // Active Booth / Nearby Exhibit or Track Title
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    const primaryText = nearbyLabel || (videoTitle ? (videoTitle.length > 26 ? videoTitle.substring(0, 24) + '...' : videoTitle) : 'Skyport Deck');
    ctx.fillText(primaryText, w / 2, 74);

    // Live Status
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillStyle = isPlaying ? '#00ff88' : '#ffaa00';
    ctx.fillText(isPlaying ? '● CINEMA PLAYING  •  [☰ MENU] FOR ALL BOOTHS' : '❚❚ CINEMA PAUSED  •  [☰ MENU] FOR ALL BOOTHS', w / 2, 114);

    // Button legend
    ctx.font = '15px monospace';
    ctx.fillStyle = '#8fa4c8';
    ctx.fillText('ROW 1: BOOTH/DOCENT • ROW 2: TELEPORT • ROW 3: MEDIA/MENU', w / 2, 158);

    this.remoteTexture.needsUpdate = true;
  }

  setupControllers() {
    const colors = [0x00f0ff, 0xff007f];

    for (let i = 0; i < 2; i++) {
      // 1. Controller space (for rays & interactions)
      const controller = this.renderer.xr.getController(i);
      controller.userData.index = i;
      controller.userData.isSelecting = false;

      // Dynamic Scalable Controller Laser Ray (unit length 1, scaled dynamically up to 50m)
      const laserGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
      ]);
      const laserMat = new THREE.LineBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.85,
        linewidth: 2
      });
      const laser = new THREE.Line(laserGeo, laserMat);
      laser.name = 'laser';
      laser.scale.z = 25; // Initial 25m throw
      controller.add(laser);

      // Target Reticle (Dot that snaps onto the video screen / buttons)
      const reticleGeo = new THREE.RingGeometry(0.04, 0.08, 16);
      const reticleMat = new THREE.MeshBasicMaterial({
        color: colors[i],
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      });
      const reticle = new THREE.Mesh(reticleGeo, reticleMat);
      reticle.visible = false;
      this.scene.add(reticle);

      // Event Listeners
      controller.addEventListener('selectstart', (e) => this.onSelectStart(e.target));
      controller.addEventListener('selectend', (e) => this.onSelectEnd(e.target));
      controller.addEventListener('squeezestart', (e) => this.onSqueezeStart(e.target));
      controller.addEventListener('squeezeend', (e) => this.onSqueezeEnd(e.target));

      this.dolly.add(controller);

      // 2. Controller Grip (with our procedural model)
      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(this.createProceduralControllerModel(colors[i]));
      
      // Mount Handheld Media Remote on Left Controller Grip (i === 1)
      if (i === 1) {
        this.buildHandheldRemote(grip);
      }

      this.dolly.add(grip);

      this.controllers.push({
        controller: controller,
        grip: grip,
        laser: laser,
        reticle: reticle,
        defaultColor: colors[i]
      });
    }
  }

  getVisibleInteractables(controllerIndex) {
    const isLeftWristOwner = (controllerIndex === 1);
    const out = [];
    const list = this.interactableObjects;
    for (let i = 0; i < list.length; i++) {
      const obj = list[i];
      if (!obj || !obj.visible) continue;
      if (isLeftWristOwner && this.wristMeshes.has(obj)) continue;
      out.push(obj);
    }
    return out;
  }

  onSelectStart(controller) {
    controller.userData.isSelecting = true;
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
    this.raycaster.far = 35;

    const candidates = this.getVisibleInteractables(controller.userData.index);
    const intersects = this.raycaster.intersectObjects(candidates, true);
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      this.triggerHaptic(controller.userData.index);
      if (this.onInteract) {
        this.onInteract(hit.userData.action || hit.name, hit);
      }
      return;
    }

    // Otherwise initiate teleportation on floor
    this.activeTeleportController = controller;
  }

  onSelectEnd(controller) {
    controller.userData.isSelecting = false;
    if (this.activeTeleportController === controller) {
      if (this.teleportValid) {
        // Execute Teleport
        this.dolly.position.x = this.teleportTarget.x;
        this.dolly.position.y = this.teleportTarget.y;
        this.dolly.position.z = this.teleportTarget.z;
        this.triggerHaptic(controller.userData.index);
      }
      this.activeTeleportController = null;
      this.teleportMarker.visible = false;
      this.teleportValid = false;
    }
  }

  onSqueezeStart(controller) {
    this.activeTeleportController = controller;
  }

  onSqueezeEnd(controller) {
    this.onSelectEnd(controller);
  }

  triggerHaptic(controllerIndex = 0, intensity = 0.8, durationMs = 80) {
    const session = this.renderer.xr.getSession();
    if (!session) return;
    const inputSource = session.inputSources[controllerIndex];
    if (inputSource && inputSource.gamepad && inputSource.gamepad.hapticActuators && inputSource.gamepad.hapticActuators[0]) {
      inputSource.gamepad.hapticActuators[0].pulse(intensity, durationMs);
    }
  }

  update(delta, floorMesh, videoTitle, isPlaying, playerState = 'WALKING', onVehicleInput = null) {
    const session = this.renderer.xr.getSession();
    if (!session) return;

    // 1. Update Handheld Remote Display
    if (videoTitle !== this.lastRemoteTitle || isPlaying !== this.lastRemotePlaying || playerState !== this.lastPlayerState) {
      this.lastRemoteTitle = videoTitle;
      this.lastRemotePlaying = isPlaying;
      this.lastPlayerState = playerState;
      this.renderHandheldRemote(videoTitle, isPlaying, playerState);
    }

    // 2. Throttled Dynamic Laser Pointer & Target Reticle (runs every 3rd frame to eliminate 90Hz raycast jitter)
    this._raycastFrame = (this._raycastFrame + 1) % 3;
    if (this._raycastFrame === 0) {
      const candidates0 = this.getVisibleInteractables(0);
      const candidates1 = this.getVisibleInteractables(1);
      this.controllers.forEach((c, idx) => {
        this.tempMatrix.identity().extractRotation(c.controller.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(c.controller.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
        this.raycaster.far = 30;

        const hitInteractables = this.raycaster.intersectObjects(idx === 1 ? candidates1 : candidates0, true);
        if (hitInteractables.length > 0) {
          const hit = hitInteractables[0];
          c.laser.scale.z = hit.distance;
          c.reticle.position.copy(hit.point);
          if (hit.face) {
            c.reticle.quaternion.setFromUnitVectors(this._zAxis, hit.face.normal);
          }
          c.reticle.visible = true;
          c.laser.material.color.setHex(0xff007f);
        } else {
          c.reticle.visible = false;
          c.laser.scale.z = 18;
          c.laser.material.color.setHex(c.defaultColor);
        }
      });
    }

    // 3. Hardware Gamepad Buttons directly controlling video screen & vehicles
    for (const source of session.inputSources) {
      if (source.gamepad && source.gamepad.buttons) {
        const hand = source.handedness || 'none';
        const gp = source.gamepad;
        if (!this.buttonStates[hand]) this.buttonStates[hand] = {};
        const prev = this.buttonStates[hand];
        const isDown = (idx) => gp.buttons[idx] && (gp.buttons[idx].pressed || gp.buttons[idx].value > 0.6);

        // Button 4: 'A' on Right controller, 'X' on Left controller
        if (isDown(4) && !prev[4]) {
          this.triggerHaptic(source.handedness === 'left' ? 1 : 0, 0.8, 100);
          if (playerState === 'VTOL_PILOT' || playerState === 'LAST_MILE_DRIVER') {
            if (this.onInteract) this.onInteract('exit_vehicle');
          } else {
            if (this.onInteract) this.onInteract('play');
          }
        }

        // Button 5: 'B' on Right controller, 'Y' on Left controller -> Next Video
        if (isDown(5) && !prev[5]) {
          this.triggerHaptic(source.handedness === 'left' ? 1 : 0, 0.8, 100);
          if (this.onInteract) this.onInteract('next');
        }

        // Button 3: Left Thumbstick Click -> Toggle Floating 3D VR Menu; Right Thumbstick Click -> Prev Video
        if (isDown(3) && !prev[3]) {
          this.triggerHaptic(source.handedness === 'left' ? 1 : 0, 0.8, 100);
          if (source.handedness === 'left') {
            if (this.onInteract) this.onInteract('vr:toggle_menu');
          } else {
            if (this.onInteract) this.onInteract('prev');
          }
        }

        // Save states for edge triggering
        for (let b = 0; b < gp.buttons.length; b++) {
          prev[b] = isDown(b);
        }
      }
    }

    // 4. Handle Teleportation Aiming (Only when walking on foot)
    if (playerState === 'WALKING') {
      if (this.activeTeleportController) {
        this.tempMatrix.identity().extractRotation(this.activeTeleportController.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(this.activeTeleportController.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

        const floorTargets = Array.isArray(floorMesh) ? floorMesh : (floorMesh.isGroup ? floorMesh.children : [floorMesh]);
        const intersects = this.raycaster.intersectObjects(floorTargets, false);
        if (intersects.length > 0) {
          this.teleportTarget.copy(intersects[0].point);
          this.teleportMarker.position.copy(this.teleportTarget);
          this.teleportMarker.position.y += 0.02;
          this.teleportMarker.visible = true;
          this.teleportValid = true;
        } else {
          this.teleportMarker.visible = false;
          this.teleportValid = false;
        }
      }
    } else {
      if (this.teleportMarker) this.teleportMarker.visible = false;
      this.teleportValid = false;
    }

    // 5. Thumbstick Smooth Locomotion & Vehicle Control
    this.snapTurnCooldown -= delta;
    for (const source of session.inputSources) {
      if (source.gamepad && source.gamepad.axes) {
        const axes = source.gamepad.axes;
        const stickX = axes[2] || 0;
        const stickY = axes[3] || 0;

        if (playerState === 'WALKING') {
          // Left hand thumbstick: Gimbal-lock-free world-space Smooth Locomotion
          if (source.handedness === 'left' || (session.inputSources.length === 1 && source.handedness !== 'right')) {
            if (Math.abs(stickX) > 0.15 || Math.abs(stickY) > 0.15) {
              const speed = 4.2 * delta;
              this.camera.getWorldDirection(this._forwardVec);
              this._forwardVec.y = 0;
              if (this._forwardVec.lengthSq() > 0.0001) {
                this._forwardVec.normalize();
              } else {
                this._forwardVec.set(0, 0, -1);
              }
              // Right vector perpendicular to forward on XZ plane
              this._rightVec.set(-this._forwardVec.z, 0, this._forwardVec.x);

              const moveX = (this._rightVec.x * stickX + this._forwardVec.x * (-stickY)) * speed;
              const moveZ = (this._rightVec.z * stickX + this._forwardVec.z * (-stickY)) * speed;

              this.dolly.position.x += moveX;
              this.dolly.position.z += moveZ;

              // Bounds clamping based on platform altitude
              if (this.dolly.position.y >= 20.0) {
                // Skyport Observation Deck
                this.dolly.position.x = Math.max(-16.0, Math.min(16.0, this.dolly.position.x));
                this.dolly.position.z = Math.max(10.0, Math.min(44.0, this.dolly.position.z));
              } else {
                // Vertiport, Promenade, Venues
                this.dolly.position.x = Math.max(-32.0, Math.min(32.0, this.dolly.position.x));
                this.dolly.position.z = Math.max(-152.0, Math.min(26.0, this.dolly.position.z));
              }
            }
          }

          // Right hand thumbstick: Snap Turn (30 degrees)
          if (source.handedness === 'right') {
            if (Math.abs(stickX) > 0.6 && this.snapTurnCooldown <= 0) {
              const turnAngle = (stickX > 0 ? -1 : 1) * THREE.MathUtils.degToRad(30);
              this.dolly.rotation.y += turnAngle;
              this.snapTurnCooldown = 0.35;
            }
          }
        } else if (onVehicleInput) {
          // Vehicle analog input feed
          const isLeft = (source.handedness === 'left');
          const triggerPressed = source.gamepad.buttons[0] ? (source.gamepad.buttons[0].pressed || source.gamepad.buttons[0].value > 0.5) : false;
          onVehicleInput(isLeft, stickX, stickY, triggerPressed);
        }
      }
    }
  }
}
