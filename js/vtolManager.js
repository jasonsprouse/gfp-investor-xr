import * as THREE from 'three';

export class VTOLManager {
  constructor(scene) {
    this.scene = scene;

    // Flight Dynamics & State
    this.state = 'LANDED_ALPHA'; // 'LANDED_ALPHA', 'FLYING', 'LANDED_BRAVO'
    this.isPiloting = false;
    this.altitude = 30.0;
    this.airspeed = 0.0;
    this.targetAirspeed = 0.0;
    this.maxAirspeed = 28.0;
    this.heading = 0.0; // radians
    this.pitch = 0.0;
    this.roll = 0.0;
    this.rotorSpeed = 0.0;
    this.rotorAngle = 0.0;

    // Helipad Locations
    this.helipadAlphaPos = new THREE.Vector3(0, 30.2, 38); // matches Helipad Alpha in clubScene (z = 38)
    this.helipadBravoPos = new THREE.Vector3(0, 5.2, -140);

    // Skyway Navigation Corridor Waypoints
    this.waypoints = [
      new THREE.Vector3(0, 30.2, 38),     // Alpha Launch
      new THREE.Vector3(0, 42.0, 10),     // Climb
      new THREE.Vector3(25, 48.0, -35),   // Scenic curve right over city
      new THREE.Vector3(15, 45.0, -85),   // Scenic curve back
      new THREE.Vector3(0, 25.0, -120),   // Descent alignment
      new THREE.Vector3(0, 5.2, -140)     // Bravo Touchdown
    ];
    this.currentWaypointIdx = 0;
    this.skywayRings = [];

    // 3D Objects & Hierarchy
    this.vtolGroup = new THREE.Group();
    this.rotors = [];
    this.lights = [];
    this.avionicsCanvas = null;
    this.avionicsCtx = null;
    this.avionicsTexture = null;

    // Boarding Trigger Box
    this.boardingTrigger = null;
    this.interactableObjects = [];

    this.initVTOL();
    this.initSkywayRings();
  }

  initVTOL() {
    // 1. Main Fuselage Body
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x111625,
      metalness: 0.9,
      roughness: 0.2
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00a0ff,
      emissiveIntensity: 0.6,
      roughness: 0.3
    });
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.8,
      roughness: 0.3
    });

    // Sleek Aerodynamic Pod Body
    const podGeo = new THREE.ConeGeometry(1.6, 6.2, 24);
    podGeo.rotateX(Math.PI / 2);
    const podMesh = new THREE.Mesh(podGeo, bodyMat);
    podMesh.scale.set(1.2, 0.75, 1.0);
    podMesh.position.set(0, 0.9, 0);
    this.vtolGroup.add(podMesh);

    // Top Aerodynamic Fairing
    const fairingGeo = new THREE.BoxGeometry(1.4, 0.45, 4.2);
    const fairingMesh = new THREE.Mesh(fairingGeo, whiteMat);
    fairingMesh.position.set(0, 1.45, 0.2);
    this.vtolGroup.add(fairingMesh);

    // Twin Tail Booms & Stabilizers
    const boomGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.8, 12);
    boomGeo.rotateX(Math.PI / 2);
    const leftBoom = new THREE.Mesh(boomGeo, bodyMat);
    leftBoom.position.set(-1.4, 1.1, 2.5);
    const rightBoom = new THREE.Mesh(boomGeo, bodyMat);
    rightBoom.position.set(1.4, 1.1, 2.5);
    this.vtolGroup.add(leftBoom, rightBoom);

    // Vertical Fins with GFP branding accents
    const finGeo = new THREE.BoxGeometry(0.06, 1.2, 0.9);
    const leftFin = new THREE.Mesh(finGeo, accentMat);
    leftFin.position.set(-1.4, 1.6, 3.8);
    const rightFin = new THREE.Mesh(finGeo, accentMat);
    rightFin.position.set(1.4, 1.6, 3.8);
    this.vtolGroup.add(leftFin, rightFin);

    // Horizontal Tail Wing
    const tailWingGeo = new THREE.BoxGeometry(2.9, 0.05, 0.6);
    const tailWing = new THREE.Mesh(tailWingGeo, bodyMat);
    tailWing.position.set(0, 1.9, 3.8);
    this.vtolGroup.add(tailWing);

    // 2. Panoramic Tinted Cockpit Glass
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x05182e,
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.85,
      transparent: true,
      opacity: 0.92,
      ior: 1.5
    });
    const canopyGeo = new THREE.SphereGeometry(1.25, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.45);
    const canopy = new THREE.Mesh(canopyGeo, glassMat);
    canopy.scale.set(0.95, 0.8, 1.8);
    canopy.position.set(0, 1.15, -0.9);
    this.vtolGroup.add(canopy);

    // Cockpit Pilot & Co-Pilot Luxury Seats
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.7 });
    for (let s = -1; s <= 1; s += 2) {
      const seatGroup = new THREE.Group();
      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.6), seatMat);
      const backMesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.12), seatMat);
      backMesh.position.set(0, 0.4, 0.25);
      seatGroup.add(baseMesh, backMesh);
      seatGroup.position.set(s * 0.38, 0.75, -0.6);
      this.vtolGroup.add(seatGroup);
    }

    // 3. Tilting Dual-Rotor Nacelles (Front Left/Right, Rear Left/Right)
    const nacellePositions = [
      { x: -2.2, y: 1.1, z: -1.4, name: 'FL' },
      { x: 2.2, y: 1.1, z: -1.4, name: 'FR' },
      { x: -2.4, y: 1.3, z: 1.8, name: 'RL' },
      { x: 2.4, y: 1.3, z: 1.8, name: 'RR' }
    ];

    // Wing Struts supporting the nacelles
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.08, 0.45), bodyMat);
    frontWing.position.set(0, 1.05, -1.4);
    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.09, 0.5), bodyMat);
    rearWing.position.set(0, 1.25, 1.8);
    this.vtolGroup.add(frontWing, rearWing);

    nacellePositions.forEach((pos) => {
      const nacelleGroup = new THREE.Group();
      nacelleGroup.position.set(pos.x, pos.y, pos.z);

      // Nacelle Motor Pod
      const motorGeo = new THREE.CylinderGeometry(0.24, 0.22, 0.85, 16);
      motorGeo.rotateX(Math.PI / 2);
      const motorMesh = new THREE.Mesh(motorGeo, bodyMat);
      nacelleGroup.add(motorMesh);

      // Emissive Thrust Ring
      const ringGeo = new THREE.TorusGeometry(0.25, 0.035, 8, 24);
      const thrustRing = new THREE.Mesh(ringGeo, accentMat);
      thrustRing.position.set(0, 0, 0.4);
      nacelleGroup.add(thrustRing);

      // Spinning Rotor Hub & Propeller Blades
      const hubGroup = new THREE.Group();
      hubGroup.position.set(0, 0.45, 0);
      hubGroup.rotation.x = -Math.PI / 2; // Upright for vertical lift

      const hubCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 12), whiteMat);
      hubGroup.add(hubCenter);

      // 4 Aerodynamic Rotor Blades with Glowing Tips
      const bladeGeo = new THREE.BoxGeometry(0.12, 0.015, 1.25);
      const tipGeo = new THREE.BoxGeometry(0.12, 0.02, 0.2);
      for (let b = 0; b < 4; b++) {
        const bladeArm = new THREE.Group();
        bladeArm.rotation.y = (b * Math.PI) / 2;

        const blade = new THREE.Mesh(bladeGeo, bodyMat);
        blade.position.set(0, 0, 0.65);
        const tip = new THREE.Mesh(tipGeo, accentMat);
        tip.position.set(0, 0, 1.2);

        bladeArm.add(blade, tip);
        hubGroup.add(bladeArm);
      }

      nacelleGroup.add(hubGroup);
      this.rotors.push(hubGroup);
      this.vtolGroup.add(nacelleGroup);
    });

    // 4. Avionics Digital Dashboard
    this.avionicsCanvas = document.createElement('canvas');
    this.avionicsCanvas.width = 512;
    this.avionicsCanvas.height = 256;
    this.avionicsCtx = this.avionicsCanvas.getContext('2d');
    this.avionicsTexture = new THREE.CanvasTexture(this.avionicsCanvas);

    const dashGeo = new THREE.PlaneGeometry(0.8, 0.4);
    const dashMat = new THREE.MeshBasicMaterial({
      map: this.avionicsTexture,
      transparent: true,
      opacity: 0.95
    });
    const dashMesh = new THREE.Mesh(dashGeo, dashMat);
    dashMesh.position.set(0, 1.15, -1.35);
    dashMesh.rotation.x = -Math.PI / 6;
    this.vtolGroup.add(dashMesh);

    // 5. Exterior Navigation & Strobe Lights
    const navLightGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const leftNav = new THREE.Mesh(navLightGeo, new THREE.MeshBasicMaterial({ color: 0xff0040 })); // Port Red
    leftNav.position.set(-2.4, 1.1, -1.4);
    const rightNav = new THREE.Mesh(navLightGeo, new THREE.MeshBasicMaterial({ color: 0x00ff66 })); // Starboard Green
    rightNav.position.set(2.4, 1.1, -1.4);
    const tailStrobe = new THREE.Mesh(navLightGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    tailStrobe.position.set(0, 2.0, 4.0);
    this.vtolGroup.add(leftNav, rightNav, tailStrobe);
    this.lights.push(tailStrobe);

    // 6. Interactive Boarding Trigger & Gantry Zone
    const triggerGeo = new THREE.CylinderGeometry(2.8, 2.8, 1.5, 16);
    const triggerMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.25
    });
    this.boardingTrigger = new THREE.Mesh(triggerGeo, triggerMat);
    this.boardingTrigger.position.set(0, 1.0, 0);
    this.boardingTrigger.userData = {
      type: 'vtol_boarding',
      tooltip: 'Board eVTOL Aircraft',
      action: 'board_vtol'
    };
    this.vtolGroup.add(this.boardingTrigger);
    this.interactableObjects.push(this.boardingTrigger);

    // Holographic Boarding Sign Billboard
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const signCtx = signCanvas.getContext('2d');
    signCtx.fillStyle = 'rgba(5, 12, 28, 0.85)';
    signCtx.fillRect(0, 0, 512, 128);
    signCtx.strokeStyle = '#00f0ff';
    signCtx.lineWidth = 4;
    signCtx.strokeRect(4, 4, 504, 120);
    signCtx.fillStyle = '#00f0ff';
    signCtx.font = 'bold 36px monospace';
    signCtx.textAlign = 'center';
    signCtx.fillText('PARADIGM AERO-VTOL', 256, 48);
    signCtx.fillStyle = '#ffffff';
    signCtx.font = '22px sans-serif';
    signCtx.fillText('CLICK / PULL TRIGGER TO BOARD', 256, 92);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.6),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide })
    );
    signMesh.position.set(0, 2.6, 0);
    this.vtolGroup.add(signMesh);

    // Initial Position on Skyport Helipad Alpha
    this.vtolGroup.position.copy(this.helipadAlphaPos);
    this.scene.add(this.vtolGroup);
  }

  // Visual Navigation Skyway Rings through the metropolitan sky
  initSkywayRings() {
    const ringGeo = new THREE.TorusGeometry(5.0, 0.16, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x0077ff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.75
    });

    for (let i = 1; i < this.waypoints.length - 1; i++) {
      const ring = new THREE.Mesh(ringGeo, ringMat.clone());
      ring.position.copy(this.waypoints[i]);

      // Aim ring along direction vector
      const nextWp = this.waypoints[i + 1];
      ring.lookAt(nextWp);

      this.scene.add(ring);
      this.skywayRings.push(ring);
    }
  }

  // Render Cockpit Glass Avionics
  updateAvionics(time) {
    if (!this.avionicsCtx) return;
    const ctx = this.avionicsCtx;
    ctx.clearRect(0, 0, 512, 256);

    // HUD Glass Cyber Background
    ctx.fillStyle = 'rgba(6, 15, 30, 0.8)';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, 500, 244);

    // Header: Good Faith Paradigm Aero System
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('GFP-AERO // AVIONICS HUD', 24, 34);

    // Flight State & Autopilot
    ctx.fillStyle = this.isPiloting ? '#00ff66' : '#ffaa00';
    ctx.font = '16px monospace';
    ctx.fillText(`STATUS: ${this.state} ${this.isPiloting ? '[ENGAGED]' : '[STANDBY]'}`, 24, 62);

    // Speed & Altitude Gauges
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`SPD: ${(this.airspeed * 3.6).toFixed(0)} KM/H`, 24, 110);
    ctx.fillText(`ALT: ${this.vtolGroup.position.y.toFixed(1)} M`, 24, 150);

    // Artificial Horizon Pitch Ladder
    ctx.save();
    ctx.translate(380, 130);
    ctx.rotate(this.roll);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-60, this.pitch * 30);
    ctx.lineTo(60, this.pitch * 30);
    ctx.stroke();

    // Center Crosshair
    ctx.strokeStyle = '#ff007f';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Corridor Navigation Progress
    const destName = this.state.includes('BRAVO') ? 'SKYPORT ALPHA' : 'VERTIPORT BRAVO';
    ctx.fillStyle = '#00f0ff';
    ctx.font = '16px monospace';
    ctx.fillText(`NAV TARGET: ${destName}`, 24, 195);
    ctx.fillStyle = '#88a0c0';
    ctx.font = '14px sans-serif';
    ctx.fillText('PRESS [SPACE] OR TRIGGER FOR THRUST', 24, 228);

    this.avionicsTexture.needsUpdate = true;
  }

  // Smooth Cinematic / Interactive Flight Step
  updateFlight(delta, time, inputAxes, triggerThrust, actionButton) {
    // 1. Rotor Spin Physics
    const targetRotorSpeed = this.isPiloting ? 25.0 : (this.state === 'FLYING' ? 20.0 : 4.0);
    this.rotorSpeed = THREE.MathUtils.lerp(this.rotorSpeed, targetRotorSpeed, delta * 3.0);
    this.rotorAngle += this.rotorSpeed * delta;

    this.rotors.forEach((rotor, idx) => {
      rotor.rotation.z = (idx % 2 === 0 ? 1 : -1) * this.rotorAngle;
    });

    // 2. Navigation Strobe Blink
    if (this.lights.length > 0) {
      this.lights[0].material.color.setHex((Math.sin(time * 6) > 0.8) ? 0xffffff : 0x222222);
    }

    this.updateAvionics(time);

    // If not piloted and stationary, do nothing further
    if (!this.isPiloting && this.state !== 'FLYING') return;

    // 3. Automated Navigation Assist / Manual Hybrid Control
    // Determine target waypoint based on destination
    let targetWp = null;
    if (this.state === 'LANDED_ALPHA' || (this.state === 'FLYING' && this.currentWaypointIdx < this.waypoints.length - 1)) {
      if (this.state === 'LANDED_ALPHA') {
        this.state = 'FLYING';
        this.currentWaypointIdx = 1;
      }
      targetWp = this.waypoints[this.currentWaypointIdx];
    } else if (this.state === 'LANDED_BRAVO') {
      // Ready to return back to Alpha
      targetWp = this.waypoints[0];
    }

    if (targetWp && this.state === 'FLYING') {
      const distToWp = this.vtolGroup.position.distanceTo(targetWp);

      // Progress through waypoints
      if (distToWp < 8.0 && this.currentWaypointIdx < this.waypoints.length - 1) {
        // Pulse ring passed
        if (this.skywayRings[this.currentWaypointIdx - 1]) {
          this.skywayRings[this.currentWaypointIdx - 1].material.color.setHex(0x00ff66);
        }
        this.currentWaypointIdx++;
        targetWp = this.waypoints[this.currentWaypointIdx];
      }

      // Smooth flight guidance toward target waypoint
      const toTarget = new THREE.Vector3().subVectors(targetWp, this.vtolGroup.position);
      const targetDist = toTarget.length();

      // Desired speed: cruise at maxAirspeed, decelerate upon approach to Bravo
      const cruiseSpeed = this.currentWaypointIdx >= this.waypoints.length - 1 ? 5.0 : this.maxAirspeed;
      this.targetAirspeed = cruiseSpeed;
      this.airspeed = THREE.MathUtils.lerp(this.airspeed, this.targetAirspeed, delta * 1.5);

      if (targetDist > 0.5) {
        toTarget.normalize();
        this.vtolGroup.position.addScaledVector(toTarget, this.airspeed * delta);

        // Smooth bank and orient vehicle towards direction of travel
        const targetRotY = Math.atan2(-toTarget.x, -toTarget.z);
        this.vtolGroup.rotation.y = THREE.MathUtils.lerp(this.vtolGroup.rotation.y, targetRotY, delta * 2.0);
        this.pitch = THREE.MathUtils.lerp(this.pitch, toTarget.y * 0.4, delta * 2.0);
        this.vtolGroup.rotation.x = this.pitch;
      }

      // Check for landing completion at Vertiport Bravo
      if (this.currentWaypointIdx >= this.waypoints.length - 1 && targetDist < 1.2) {
        this.state = 'LANDED_BRAVO';
        this.airspeed = 0;
        this.vtolGroup.position.copy(this.helipadBravoPos);
        this.vtolGroup.rotation.set(0, Math.PI, 0);
      }
    }
  }

  // Get seat world position for mounting player camera/dolly rig
  getCockpitSeatWorldPosition() {
    const seatLocal = new THREE.Vector3(0, 1.25, -0.6);
    return this.vtolGroup.localToWorld(seatLocal);
  }

  // Disembark spot outside the aircraft on the pad
  getDisembarkWorldPosition() {
    const exitLocal = new THREE.Vector3(-2.8, 0.2, 0.5);
    return this.vtolGroup.localToWorld(exitLocal);
  }

  // Reset flight corridor to return to Alpha if requested
  startReturnFlight() {
    this.state = 'FLYING';
    this.currentWaypointIdx = this.waypoints.length - 2;
    // Reverse waypoint orientation
    this.waypoints.reverse();
  }
}
