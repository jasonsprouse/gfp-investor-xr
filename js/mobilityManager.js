import * as THREE from 'three';

export class MobilityManager {
  constructor(scene) {
    this.scene = scene;

    // Driving State & Telemetry
    this.isDriving = false;
    this.speed = 0.0;
    this.targetSpeed = 0.0;
    this.maxSpeed = 16.0; // m/s (~58 km/h)
    this.steeringAngle = 0.0;
    this.maxSteeringAngle = 0.55; // radians (~32 deg)
    this.heading = Math.PI; // facing south along promenade toward club

    // Staging Location at Vertiport Bravo
    this.initialPosition = new THREE.Vector3(6.0, 5.2, -135.0);

    // 3D Objects & Hierarchy
    this.roverGroup = new THREE.Group();
    this.wheels = [];
    this.frontWheelSteerGroups = [];
    this.headlights = [];
    this.underglow = null;

    // Boarding Trigger Box
    this.boardingTrigger = null;
    this.interactableObjects = [];

    this.initRover();
  }

  initRover() {
    // 1. Chassis Materials
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x0e1422,
      metalness: 0.85,
      roughness: 0.25
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00c8ff,
      emissiveIntensity: 0.7,
      roughness: 0.3
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x081528,
      metalness: 0.1,
      roughness: 0.1,
      transmission: 0.82,
      transparent: true,
      opacity: 0.88
    });
    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      roughness: 0.8,
      metalness: 0.1
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      metalness: 0.9,
      roughness: 0.15
    });

    // 2. Main Aerodynamic Lower Chassis
    const baseGeo = new THREE.BoxGeometry(1.6, 0.45, 3.2);
    const baseMesh = new THREE.Mesh(baseGeo, chassisMat);
    baseMesh.position.set(0, 0.4, 0);
    this.roverGroup.add(baseMesh);

    // Side Cyber Accent Trim
    const trimGeo = new THREE.BoxGeometry(0.08, 0.15, 3.0);
    const leftTrim = new THREE.Mesh(trimGeo, accentMat);
    leftTrim.position.set(-0.84, 0.4, 0);
    const rightTrim = new THREE.Mesh(trimGeo, accentMat);
    rightTrim.position.set(0.84, 0.4, 0);
    this.roverGroup.add(leftTrim, rightTrim);

    // 3. Panoramic Cabin Canopy Dome
    const cabinGeo = new THREE.CylinderGeometry(0.7, 0.8, 1.1, 16, 1, false, 0, Math.PI);
    cabinGeo.rotateZ(Math.PI / 2);
    cabinGeo.rotateY(Math.PI / 2);
    const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
    cabinMesh.position.set(0, 0.95, -0.15);
    cabinMesh.scale.set(1.0, 0.9, 1.4);
    this.roverGroup.add(cabinMesh);

    // Interior Driver Seat
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x222a38, roughness: 0.6 });
    const seatGroup = new THREE.Group();
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.15, 0.65), seatMat);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.8, 0.12), seatMat);
    seatBack.position.set(0, 0.4, 0.28);
    seatGroup.add(seatBase, seatBack);
    seatGroup.position.set(0, 0.48, -0.1);
    this.roverGroup.add(seatGroup);

    // Interior Dashboard & Steering Yoke
    const dashMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.3), chassisMat);
    dashMesh.position.set(0, 0.8, -0.65);
    const yokeMesh = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 16), accentMat);
    yokeMesh.position.set(0, 0.88, -0.55);
    yokeMesh.rotation.x = -Math.PI / 4;
    this.roverGroup.add(dashMesh, yokeMesh);

    // 4. Wheels & Suspension Kinematics (4 Wheels)
    const wheelPositions = [
      { x: -0.92, y: 0.35, z: -1.05, isFront: true },  // Front Left
      { x: 0.92, y: 0.35, z: -1.05, isFront: true },   // Front Right
      { x: -0.92, y: 0.35, z: 1.05, isFront: false },  // Rear Left
      { x: 0.92, y: 0.35, z: 1.05, isFront: false }    // Rear Right
    ];

    wheelPositions.forEach((pos) => {
      const steerMount = new THREE.Group();
      steerMount.position.set(pos.x, pos.y, pos.z);

      // Rotating Wheel Axle Group
      const spinGroup = new THREE.Group();

      // Rubber Tire
      const tireGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 24);
      tireGeo.rotateZ(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeo, rubberMat);

      // Hub & Rim
      const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.26, 16);
      rimGeo.rotateZ(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, rimMat);

      // Glowing Center Accent
      const centerGeo = new THREE.SphereGeometry(0.08, 12, 12);
      const center = new THREE.Mesh(centerGeo, accentMat);

      spinGroup.add(tire, rim, center);
      steerMount.add(spinGroup);

      this.wheels.push(spinGroup);
      if (pos.isFront) {
        this.frontWheelSteerGroups.push(steerMount);
      }
      this.roverGroup.add(steerMount);
    });

    // 5. LED Headlights & Beam Projectors
    const headlightGeo = new THREE.BoxGeometry(0.24, 0.08, 0.05);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    for (let h = -1; h <= 1; h += 2) {
      const hlMesh = new THREE.Mesh(headlightGeo, hlMat);
      hlMesh.position.set(h * 0.55, 0.45, -1.61);
      this.roverGroup.add(hlMesh);

      // Forward Light Cone
      const spot = new THREE.SpotLight(0x00f0ff, 1.5, 30, Math.PI / 5, 0.35);
      spot.position.set(h * 0.55, 0.45, -1.6);
      spot.target.position.set(h * 0.55, 0, -20);
      this.roverGroup.add(spot);
      this.roverGroup.add(spot.target);
      this.headlights.push(spot);
    }

    // Rear Taillights
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xff0040 });
    const leftTl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), tlMat);
    leftTl.position.set(-0.55, 0.5, 1.61);
    const rightTl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), tlMat);
    rightTl.position.set(0.55, 0.5, 1.61);
    this.roverGroup.add(leftTl, rightTl);

    // 6. Cyan Chassis Underglow Ground Light
    const glowGeo = new THREE.PlaneGeometry(1.6, 3.2);
    glowGeo.rotateX(-Math.PI / 2);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });
    this.underglow = new THREE.Mesh(glowGeo, glowMat);
    this.underglow.position.set(0, 0.06, 0);
    this.roverGroup.add(this.underglow);

    // 7. Interactive Boarding Trigger & Holographic Signboard
    const triggerGeo = new THREE.CylinderGeometry(2.2, 2.2, 1.4, 16);
    const triggerMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.25
    });
    this.boardingTrigger = new THREE.Mesh(triggerGeo, triggerMat);
    this.boardingTrigger.position.set(0, 0.8, 0);
    this.boardingTrigger.userData = {
      type: 'mobility_boarding',
      tooltip: 'Board Ground Rover',
      action: 'board_rover'
    };
    this.roverGroup.add(this.boardingTrigger);
    this.interactableObjects.push(this.boardingTrigger);

    // Holographic Rover Billboard
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
    signCtx.font = 'bold 34px monospace';
    signCtx.textAlign = 'center';
    signCtx.fillText('PARADIGM LAST-MILE POD', 256, 48);
    signCtx.fillStyle = '#ffffff';
    signCtx.font = '22px sans-serif';
    signCtx.fillText('CLICK / PULL TRIGGER TO DRIVE', 256, 92);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.55),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide })
    );
    signMesh.position.set(0, 2.0, 0);
    this.roverGroup.add(signMesh);

    // Initial Position at Vertiport Bravo
    this.roverGroup.position.copy(this.initialPosition);
    this.scene.add(this.roverGroup);
  }

  // Smooth Ground Driving Physics Step
  updateDriving(delta, throttleInput, steerInput) {
    if (!this.isDriving) return;

    // 1. Steering Dynamics
    const targetSteer = steerInput * this.maxSteeringAngle;
    this.steeringAngle = THREE.MathUtils.lerp(this.steeringAngle, targetSteer, delta * 8.0);

    // Rotate front wheel steering mounts
    this.frontWheelSteerGroups.forEach((mount) => {
      mount.rotation.y = -this.steeringAngle;
    });

    // 2. Throttle & Speed Dynamics
    this.targetSpeed = throttleInput * this.maxSpeed;
    this.speed = THREE.MathUtils.lerp(this.speed, this.targetSpeed, delta * 3.5);

    // 3. Ground Heading & Displacement Kinematics
    if (Math.abs(this.speed) > 0.05) {
      // Bicycle model steering update
      this.heading += (this.speed * Math.sin(this.steeringAngle) / 2.5) * delta;
      this.roverGroup.rotation.y = this.heading;

      // Translate forward in local direction
      const forwardDir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
      this.roverGroup.position.addScaledVector(forwardDir, this.speed * delta);

      // Clamp rover position within the Entertainment Boulevard corridor (outside club walls)
      this.roverGroup.position.x = Math.max(-14.0, Math.min(14.0, this.roverGroup.position.x));
      this.roverGroup.position.z = Math.max(-148.0, Math.min(-26.0, this.roverGroup.position.z));
      this.roverGroup.position.y = 5.2; // ground deck level
    }

    // 4. Spin Wheels Proportional to Linear Velocity
    const wheelRotDelta = (this.speed * delta) / 0.35;
    this.wheels.forEach((wheel) => {
      wheel.rotation.x -= wheelRotDelta;
    });
  }

  // Driver seat position for camera dolly rig
  getDriverSeatWorldPosition() {
    const seatLocal = new THREE.Vector3(0, 1.15, -0.15);
    return this.roverGroup.localToWorld(seatLocal);
  }

  // Safe sidewalk dismount point
  getDisembarkWorldPosition() {
    const exitLocal = new THREE.Vector3(-1.8, 0.1, 0);
    return this.roverGroup.localToWorld(exitLocal);
  }
}
