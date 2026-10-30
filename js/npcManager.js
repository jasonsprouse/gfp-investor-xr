import * as THREE from 'three';

export class NPCManager {
  constructor(scene) {
    this.scene = scene;
    this.npcs = [];
    this.buildNPCs();
  }

  // Create an articulated humanoid character
  createHumanoid({
    x, y = 0, z,
    rotY = 0,
    type = 'dancer', // 'podium', 'dancer', 'vip', 'dj', 'bartender'
    skinTone = 0xe0a899,
    outfitColor = 0xff007f,
    accentColor = 0x00f0ff,
    hairColor = 0x1a1520,
    danceStyle = 0
  }) {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.rotation.y = rotY;

    // Materials
    const skinMat = new THREE.MeshStandardMaterial({
      color: skinTone,
      roughness: 0.6,
      metalness: 0.1
    });

    const outfitMat = new THREE.MeshStandardMaterial({
      color: outfitColor,
      roughness: 0.25,
      metalness: 0.8,
      emissive: outfitColor,
      emissiveIntensity: 0.35
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.8
    });

    const hairMat = new THREE.MeshStandardMaterial({
      color: hairColor,
      roughness: 0.8,
      metalness: 0.2
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x111116,
      roughness: 0.4,
      metalness: 0.7
    });

    // 1. Hips / Pelvis (Center of hierarchy)
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    root.add(hips);

    const pelvisMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.12, 0.16, 16),
      outfitMat
    );
    hips.add(pelvisMesh);

    // Glowing belt accent
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.145, 0.03, 16),
      accentMat
    );
    hips.add(belt);

    // 2. Spine & Torso
    const spine = new THREE.Group();
    spine.position.y = 0.08;
    hips.add(spine);

    // Waist
    const waistMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.14, 16),
      skinMat
    );
    waistMesh.position.y = 0.07;
    spine.add(waistMesh);

    // Chest / Top
    const chest = new THREE.Group();
    chest.position.y = 0.18;
    spine.add(chest);

    const chestMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.12, 0.2, 16),
      outfitMat
    );
    chestMesh.position.y = 0.08;
    chest.add(chestMesh);

    // Neck & Head
    const neck = new THREE.Group();
    neck.position.y = 0.2;
    chest.add(neck);

    const head = new THREE.Group();
    head.position.y = 0.08;
    neck.add(head);

    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 16),
      skinMat
    );
    head.add(headMesh);

    // Hair
    const hairMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      hairMat
    );
    hairMesh.position.set(0, 0.03, -0.02);
    hairMesh.scale.set(1.02, 1.1, 1.05);
    head.add(hairMesh);

    // Cyber Visor / Shades
    const visorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.04, 0.09),
      accentMat
    );
    visorMesh.position.set(0, 0.01, 0.08);
    head.add(visorMesh);

    // Headphones (For DJ)
    if (type === 'dj') {
      const hpBand = new THREE.Mesh(
        new THREE.TorusGeometry(0.13, 0.015, 8, 24, Math.PI),
        darkMat
      );
      hpBand.rotation.z = Math.PI / 2;
      hpBand.position.y = 0.02;
      head.add(hpBand);

      [-0.12, 0.12].forEach((hpx) => {
        const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), accentMat);
        ear.rotation.z = Math.PI / 2;
        ear.position.set(hpx, 0.01, 0);
        head.add(ear);
      });
    }

    // 3. Arms (Shoulders -> Upper Arm -> Forearm -> Hand)
    const arms = [];
    [-1, 1].forEach((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.2, 0.14, 0);
      chest.add(shoulder);

      const upperArm = new THREE.Group();
      shoulder.add(upperArm);

      const upperArmMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.04, 0.24, 12),
        skinMat
      );
      upperArmMesh.position.y = -0.12;
      upperArm.add(upperArmMesh);

      // Arm glow band
      const armBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.048, 0.03, 12),
        accentMat
      );
      armBand.position.y = -0.08;
      upperArm.add(armBand);

      const forearm = new THREE.Group();
      forearm.position.y = -0.24;
      upperArm.add(forearm);

      const forearmMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.032, 0.22, 12),
        skinMat
      );
      forearmMesh.position.y = -0.11;
      forearm.add(forearmMesh);

      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 12, 12),
        skinMat
      );
      hand.position.y = -0.23;
      forearm.add(hand);

      // Drink glass in hand for VIPs / Bartender
      if (type === 'vip' && side === 1) {
        const glass = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.02, 0.08, 12),
          new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8 })
        );
        glass.position.set(0, -0.05, 0.04);
        hand.add(glass);
      } else if (type === 'bartender' && side === 1) {
        const shaker = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.035, 0.16, 16),
          new THREE.MeshStandardMaterial({ color: 0xd0d0d8, metalness: 0.95, roughness: 0.1 })
        );
        shaker.position.set(0, -0.06, 0.02);
        hand.add(shaker);
      }

      arms.push({ shoulder, upperArm, forearm, hand, side });
    });

    // 4. Legs (Upper Leg -> Lower Leg -> Boots)
    const legs = [];
    [-1, 1].forEach((side) => {
      const hipJoint = new THREE.Group();
      hipJoint.position.set(side * 0.1, -0.08, 0);
      hips.add(hipJoint);

      const upperLeg = new THREE.Group();
      hipJoint.add(upperLeg);

      const upperLegMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.05, 0.38, 14),
        skinMat
      );
      upperLegMesh.position.y = -0.19;
      upperLeg.add(upperLegMesh);

      const lowerLeg = new THREE.Group();
      lowerLeg.position.y = -0.38;
      upperLeg.add(lowerLeg);

      // Thigh-high club boots
      const lowerLegMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.045, 0.38, 14),
        outfitMat
      );
      lowerLegMesh.position.y = -0.19;
      lowerLeg.add(lowerLegMesh);

      // Boot heel/foot
      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.06, 0.14),
        darkMat
      );
      foot.position.set(0, -0.4, 0.03);
      lowerLeg.add(foot);

      legs.push({ hipJoint, upperLeg, lowerLeg, foot, side });
    });

    this.scene.add(root);

    const npcData = {
      root,
      hips,
      spine,
      chest,
      head,
      neck,
      arms,
      legs,
      type,
      danceStyle,
      baseY: y,
      timeOffset: Math.random() * 10
    };

    this.npcs.push(npcData);
    return npcData;
  }

  // Populate Club with Podium Dancers, Floor Crowd, VIP Lounge Guests, Bartender & DJ
  buildNPCs() {
    // 1. Two Elevated Podium Go-Go Dancers (Left and Right of Dance Floor)
    const podiumCoords = [
      { x: -6.5, z: 2, rot: Math.PI * 0.35, outfit: 0xff007f, accent: 0x00f0ff, hair: 0x221133 },
      { x: 6.5, z: 2, rot: -Math.PI * 0.35, outfit: 0x00f0ff, accent: 0xff007f, hair: 0xeedd88 }
    ];

    podiumCoords.forEach((p, idx) => {
      // Elevated glowing glass podium
      const podGeo = new THREE.CylinderGeometry(1.2, 1.3, 0.7, 24);
      const podMat = new THREE.MeshStandardMaterial({
        color: 0x0a0c16,
        metalness: 0.9,
        roughness: 0.2
      });
      const pod = new THREE.Mesh(podGeo, podMat);
      pod.position.set(p.x, 0.35, p.z);
      this.scene.add(pod);

      // Neon rim around podium
      const rimGeo = new THREE.TorusGeometry(1.25, 0.03, 12, 32);
      rimGeo.rotateX(Math.PI / 2);
      const rimMat = new THREE.MeshBasicMaterial({ color: p.accent });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.set(p.x, 0.7, p.z);
      this.scene.add(rim);

      this.createHumanoid({
        x: p.x,
        y: 0.7,
        z: p.z,
        rotY: p.rot,
        type: 'podium',
        outfitColor: p.outfit,
        accentColor: p.accent,
        hairColor: p.hair,
        danceStyle: idx % 2
      });
    });

    // 2. Main Dance Floor Crowd (6 Dancers)
    const dancerSpots = [
      { x: -2.2, z: 0.5, rot: 0.2, outfit: 0x9900ff, accent: 0x00ffff, style: 0 },
      { x: 2.0, z: 1.0, rot: -0.4, outfit: 0xff0055, accent: 0xffcc00, style: 1 },
      { x: -1.2, z: 4.2, rot: 0.8, outfit: 0x00ffaa, accent: 0xff00aa, style: 2 },
      { x: 1.6, z: 4.5, rot: -0.6, outfit: 0xff3300, accent: 0x00ffff, style: 0 },
      { x: 0.0, z: 2.2, rot: 0.0, outfit: 0x00f0ff, accent: 0xff007f, style: 1 },
      { x: -3.0, z: 3.2, rot: 0.5, outfit: 0xff00bb, accent: 0x00ffbb, style: 2 }
    ];

    dancerSpots.forEach((d) => {
      this.createHumanoid({
        x: d.x,
        y: 0,
        z: d.z,
        rotY: d.rot,
        type: 'dancer',
        outfitColor: d.outfit,
        accentColor: d.accent,
        danceStyle: d.style
      });
    });

    // 3. VIP Lounge Guests (3 Guests chilling on sofas)
    const vipSpots = [
      { x: -11.5, z: 1.8, rot: Math.PI / 2, outfit: 0x201530, accent: 0xff007f, style: 3 },
      { x: -10.5, z: 2.6, rot: Math.PI * 0.7, outfit: 0x102035, accent: 0x00f0ff, style: 3 },
      { x: -11.0, z: 10.5, rot: Math.PI / 2, outfit: 0x301020, accent: 0xffaa00, style: 3 }
    ];

    vipSpots.forEach((v) => {
      this.createHumanoid({
        x: v.x,
        y: 0,
        z: v.z,
        rotY: v.rot,
        type: 'vip',
        outfitColor: v.outfit,
        accentColor: v.accent,
        danceStyle: 3
      });
    });

    // 4. The DJ behind the deck
    this.createHumanoid({
      x: 0,
      y: 1.0, // On raised stage
      z: -15.2,
      rotY: 0, // Facing crowd
      type: 'dj',
      outfitColor: 0x121422,
      accentColor: 0x00f0ff,
      hairColor: 0x111116,
      danceStyle: 4
    });

    // 5. The Bartender behind the bar counter
    this.createHumanoid({
      x: 13.5,
      y: 0,
      z: 4.0,
      rotY: -Math.PI / 2, // Facing bar patrons
      type: 'bartender',
      outfitColor: 0x1a1a24,
      accentColor: 0xff007f,
      hairColor: 0x442211,
      danceStyle: 5
    });
  }

  // Animate all NPCs with rhythmic beat-synced dancing
  update(delta, time, audioManager) {
    const bass = audioManager ? audioManager.getBass() : 0;
    const pulse = audioManager ? audioManager.getBeatPulse() : 0;
    const isPlaying = audioManager ? audioManager.isPlaying : false;

    // Tempo multiplier: when music is playing, tempo is energetic
    const tempo = isPlaying ? 7.5 : 3.0;

    this.npcs.forEach((npc) => {
      const t = time * tempo + npc.timeOffset;
      const { hips, spine, chest, head, arms, legs, type, danceStyle, baseY } = npc;

      // --- STYLE 0: Sensual Hip-Sway & Arm Wave (Go-Go Dancers & Podium) ---
      if (danceStyle === 0 || type === 'podium') {
        const bounce = Math.abs(Math.sin(t * 2)) * 0.06 * (1 + bass * 0.5);
        hips.position.y = 0.95 + bounce;

        // Hip sway
        hips.rotation.z = Math.sin(t) * 0.22;
        hips.rotation.y = Math.cos(t * 0.5) * 0.15;

        // Spine counter-sway
        spine.rotation.z = -hips.rotation.z * 0.75;
        spine.rotation.x = Math.sin(t * 2) * 0.08;

        // Head groove
        head.rotation.x = Math.sin(t * 2) * 0.12 + (pulse > 0.6 ? 0.1 : 0);
        head.rotation.y = Math.sin(t * 0.5) * 0.18;

        // Left arm: Hand near head / hair
        arms[0].upperArm.rotation.x = -1.2 + Math.sin(t) * 0.2;
        arms[0].upperArm.rotation.z = -0.8;
        arms[0].forearm.rotation.x = -1.6;

        // Right arm: Hand on hip / swaying
        arms[1].upperArm.rotation.x = 0.2 + Math.cos(t) * 0.25;
        arms[1].upperArm.rotation.z = 0.6 + Math.sin(t) * 0.15;
        arms[1].forearm.rotation.x = -0.7;

        // Leg bending
        legs[0].upperLeg.rotation.x = Math.sin(t) * 0.15;
        legs[1].upperLeg.rotation.x = -Math.sin(t) * 0.15;
      }

      // --- STYLE 1: House Shuffle & Energy Bounce ---
      else if (danceStyle === 1) {
        const bounce = Math.abs(Math.sin(t * 2)) * 0.08 * (1 + bass * 0.8);
        hips.position.y = 0.95 + bounce;

        hips.rotation.y = Math.sin(t) * 0.25;
        spine.rotation.x = 0.1 + Math.sin(t * 2) * 0.1;

        head.rotation.x = Math.sin(t * 2) * 0.18;

        // Both arms pumping rhythmically
        arms[0].upperArm.rotation.x = -0.6 + Math.sin(t * 2) * 0.4;
        arms[0].upperArm.rotation.z = -0.3;
        arms[0].forearm.rotation.x = -1.2 + Math.sin(t * 2) * 0.3;

        arms[1].upperArm.rotation.x = -0.6 - Math.sin(t * 2) * 0.4;
        arms[1].upperArm.rotation.z = 0.3;
        arms[1].forearm.rotation.x = -1.2 - Math.sin(t * 2) * 0.3;

        // Alternating knee stepping
        legs[0].upperLeg.rotation.x = Math.sin(t * 2) * 0.3;
        legs[0].lowerLeg.rotation.x = Math.max(0, -Math.sin(t * 2) * 0.4);
        legs[1].upperLeg.rotation.x = -Math.sin(t * 2) * 0.3;
        legs[1].lowerLeg.rotation.x = Math.max(0, Math.sin(t * 2) * 0.4);
      }

      // --- STYLE 2: Hands in the Air Party Groove ---
      else if (danceStyle === 2) {
        const bounce = Math.abs(Math.sin(t * 2)) * 0.07;
        hips.position.y = 0.95 + bounce;

        hips.rotation.z = Math.sin(t) * 0.15;
        head.rotation.x = Math.sin(t * 2) * 0.15;

        // Both arms raised high above head
        arms[0].upperArm.rotation.x = -2.6 + Math.sin(t) * 0.2;
        arms[0].upperArm.rotation.z = -0.4;
        arms[0].forearm.rotation.x = -0.5;

        arms[1].upperArm.rotation.x = -2.6 - Math.sin(t) * 0.2;
        arms[1].upperArm.rotation.z = 0.4;
        arms[1].forearm.rotation.x = -0.5;
      }

      // --- STYLE 3: VIP Lounge Seated / Lounging ---
      else if (danceStyle === 3 || type === 'vip') {
        // Seated on sofa
        hips.position.y = 0.58;
        legs[0].upperLeg.rotation.x = -1.4;
        legs[0].lowerLeg.rotation.x = 1.4;
        legs[1].upperLeg.rotation.x = -1.4;
        legs[1].lowerLeg.rotation.x = 1.4;

        // Subtle head and body nod to the beat
        spine.rotation.x = 0.05 + Math.sin(t * 1.5) * 0.04;
        head.rotation.x = Math.sin(t * 1.5) * 0.08;
        head.rotation.y = Math.sin(t * 0.3) * 0.2;

        // Sipping drink / hand gesture
        arms[1].upperArm.rotation.x = -0.8 + Math.sin(t * 0.8) * 0.15;
        arms[1].upperArm.rotation.z = 0.2;
        arms[1].forearm.rotation.x = -1.2;

        arms[0].upperArm.rotation.x = -0.2;
        arms[0].forearm.rotation.x = -0.6;
      }

      // --- STYLE 4: The DJ ---
      else if (type === 'dj') {
        const bounce = Math.abs(Math.sin(t * 2)) * 0.04 * (1 + bass * 0.6);
        hips.position.y = 0.95 + bounce;

        // Heavy head bobbing to the music
        head.rotation.x = Math.sin(t * 2) * 0.25;
        head.rotation.z = 0.12; // tilted towards headphones

        spine.rotation.x = 0.15 + Math.sin(t * 2) * 0.06;

        // Left hand: One hand holding headphone to ear
        arms[0].upperArm.rotation.x = -1.8;
        arms[0].upperArm.rotation.z = -0.7;
        arms[0].forearm.rotation.x = -1.8;

        // Right hand: Touching turntable / tweaking mixer knobs
        arms[1].upperArm.rotation.x = -0.8 + Math.sin(t * 1.2) * 0.2;
        arms[1].upperArm.rotation.z = 0.3;
        arms[1].forearm.rotation.x = -0.9 + Math.cos(t * 2.5) * 0.15;
      }

      // --- STYLE 5: The Bartender ---
      else if (type === 'bartender') {
        head.rotation.x = Math.sin(t * 1.5) * 0.1;

        // Shaking cocktail shaker vigorously with both hands
        const shake = Math.sin(t * 4) * 0.35;
        arms[0].upperArm.rotation.x = -1.1 + shake * 0.2;
        arms[0].forearm.rotation.x = -1.3;
        arms[1].upperArm.rotation.x = -1.1 - shake * 0.2;
        arms[1].forearm.rotation.x = -1.3;
      }
    });
  }
}
