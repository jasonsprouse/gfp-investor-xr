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

    this.buildTeleportMarker();
    this.setupControllers();
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

  // Handheld Cyber Media Remote Mounted on the Controller Grip
  buildHandheldRemote(grip) {
    const remoteGroup = new THREE.Group();
    // Positioned right above the controller grip angled towards player's eyes
    remoteGroup.position.set(0, 0.065, -0.02);
    remoteGroup.rotation.x = -Math.PI / 5;

    // 1. Futuristic Bezel Body
    const bodyGeo = new THREE.BoxGeometry(0.18, 0.11, 0.016);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x090c16,
      metalness: 0.9,
      roughness: 0.25
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    remoteGroup.add(body);

    // Cyber Edge Neon Trim
    const trimGeo = new THREE.BoxGeometry(0.186, 0.116, 0.012);
    const trimMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true
    });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    remoteGroup.add(trim);

    // 2. Canvas Display for Track Title & Live Playback Status
    this.remoteCanvas = document.createElement('canvas');
    this.remoteCanvas.width = 512;
    this.remoteCanvas.height = 256;
    this.remoteCtx = this.remoteCanvas.getContext('2d');
    this.remoteTexture = new THREE.CanvasTexture(this.remoteCanvas);

    const screenGeo = new THREE.PlaneGeometry(0.165, 0.06);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.remoteTexture,
      transparent: true
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0.02, 0.01);
    remoteGroup.add(screenMesh);

    // 3. Tactile 3D Buttons on Handheld Remote
    const remoteButtons = [
      { id: 'prev', label: 'PREV', color: 0x00f0ff, x: -0.055 },
      { id: 'play', label: 'PLAY', color: 0xff007f, x: 0 },
      { id: 'next', label: 'NEXT', color: 0x00f0ff, x: 0.055 }
    ];

    remoteButtons.forEach((b) => {
      const bGeo = new THREE.BoxGeometry(0.046, 0.024, 0.014);
      const bMat = new THREE.MeshStandardMaterial({
        color: b.color,
        emissive: b.color,
        emissiveIntensity: 0.85,
        roughness: 0.2
      });
      const bMesh = new THREE.Mesh(bGeo, bMat);
      bMesh.position.set(b.x, -0.024, 0.012);
      bMesh.name = `remote_${b.id}`;
      bMesh.userData = { action: b.id };
      remoteGroup.add(bMesh);
      this.interactableObjects.push(bMesh);
    });

    grip.add(remoteGroup);
    this.handheldRemote = remoteGroup;
    this.renderHandheldRemote('Sanctuary of Sound', true);
  }

  renderHandheldRemote(videoTitle, isPlaying, playerState = 'WALKING') {
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
    const stateTag = playerState === 'VTOL_PILOT' ? '✈ eVTOL COCKPIT' : (playerState === 'LAST_MILE_DRIVER' ? '🚗 ROVER COCKPIT' : '★ INVESTOR XR CAMPUS');
    ctx.fillText(stateTag, w / 2, 34);

    // Track Title
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    const title = videoTitle ? (videoTitle.length > 24 ? videoTitle.substring(0, 22) + '...' : videoTitle) : 'TimeLapse';
    ctx.fillText(title, w / 2, 85);

    // Live Status
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.fillStyle = isPlaying ? '#00ff88' : '#ffaa00';
    ctx.fillText(isPlaying ? '● SCREEN PLAYING' : '❚❚ SCREEN PAUSED', w / 2, 126);

    // Button legend
    ctx.font = '16px Arial, sans-serif';
    ctx.fillStyle = '#7a859e';
    ctx.fillText(playerState === 'WALKING' ? 'Press [A / X] to Toggle Play' : 'Press [A / X] to Exit Vehicle', w / 2, 175);

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

  onSelectStart(controller) {
    controller.userData.isSelecting = true;
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
    this.raycaster.far = 50; // Extend raycast range to 50 meters

    // Check interaction with in-room video screen, DJ buttons, or handheld remote
    const intersects = this.raycaster.intersectObjects(this.interactableObjects, true);
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

    // 2. Continuous Dynamic Laser Pointer & Screen Target Reticle
    this.controllers.forEach((c) => {
      this.tempMatrix.identity().extractRotation(c.controller.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(c.controller.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
      this.raycaster.far = 50;

      const hitInteractables = this.raycaster.intersectObjects(this.interactableObjects, true);
      if (hitInteractables.length > 0) {
        const hit = hitInteractables[0];
        c.laser.scale.z = hit.distance;
        c.reticle.position.copy(hit.point);
        if (hit.face) {
          c.reticle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.face.normal);
        }
        c.reticle.visible = true;
        c.laser.material.color.setHex(0xff007f); // Neon pink when locked onto screen, button, or vehicle
      } else {
        c.reticle.visible = false;
        c.laser.scale.z = 25;
        c.laser.material.color.setHex(c.defaultColor);
      }
    });

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

        // Button 3: Thumbstick Click -> Prev Video
        if (isDown(3) && !prev[3]) {
          this.triggerHaptic(source.handedness === 'left' ? 1 : 0, 0.8, 100);
          if (this.onInteract) this.onInteract('prev');
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
          // Left hand thumbstick: Smooth Locomotion
          if (source.handedness === 'left' || (session.inputSources.length === 1 && source.handedness !== 'right')) {
            if (Math.abs(stickX) > 0.15 || Math.abs(stickY) > 0.15) {
              const speed = 4.2 * delta;
              const cameraYaw = this.camera.rotation.y;
              const dirX = stickX * Math.cos(cameraYaw) + stickY * Math.sin(cameraYaw);
              const dirZ = -stickX * Math.sin(cameraYaw) + stickY * Math.cos(cameraYaw);

              this.dolly.position.x += dirX * speed;
              this.dolly.position.z += dirZ * speed;

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
