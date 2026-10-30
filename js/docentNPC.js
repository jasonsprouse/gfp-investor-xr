import * as THREE from 'three';
import { STOPS, TOUR_ORDER, RELIC_ORDER, GREETING, NOTHING_NEARBY } from './docentScript.js';

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Docent Lux: a procedural NPC that explains and demonstrates the booths and relics.
 * - Speaks with the browser's speech synthesis (voice optional) and always shows caption bubbles.
 * - Walks between stops and physically points at controls, then fires the SAME commands a visitor
 *   would trigger (BoothManager.runCommand / RelicPavilion.runCommand), so demos are real.
 * - A small kiosk at the docent's home spot (TOUR / EXPLAIN / RELICS / STOP) works with the laser or crosshair.
 */
export class DocentNPC {
  constructor(scene, npcManager, {
    boothManager, relicPavilion, home = [-3.4, 30, 16.2], onVoiceChange, onNotify
  } = {}) {
    this.scene = scene;
    this.booths = boothManager;
    this.relics = relicPavilion;
    this.onVoiceChange = onVoiceChange || (() => {});
    this.onNotify = onNotify || (() => {});
    this.deckY = home[1];
    this.home = new THREE.Vector3(home[0], home[1], home[2]);
    this.interactableObjects = [];

    // --- State machine data ---
    this.queue = [];
    this.current = null;
    this.walking = false;
    this.walkTarget = null;
    this.heading = 0;
    this.walkPhase = 0;
    this.walkAmp = 0;
    this.pointTarget = null;
    this.speaking = false;
    this.speechCancel = null;
    this.bubbleText = '';
    this.bubbleVisibleFor = 0;
    this.greeted = false;
    this.touring = false;
    this.armPose = [{ u: 0.05, f: -0.15 }, { u: 0.05, f: -0.15 }];
    this.headYaw = 0;
    this.scratch = new THREE.Vector3();
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.voice = null;
    if (this.synth) {
      this.pickVoice();
      this.synth.addEventListener?.('voiceschanged', () => this.pickVoice());
    }

    // --- Body: white and gold procedural humanoid, kept out of the club dance loop ---
    this.npc = npcManager.createHumanoid({
      x: this.home.x + 1.3, y: this.deckY, z: this.home.z + 0.4, rotY: 0,
      type: 'docent', skinTone: 0xd9a688, outfitColor: 0xf2ecd8, accentColor: 0xffc400,
      hairColor: 0x3a2a1a, register: false
    });
    this.root = this.npc.root;

    // Halo + floor ring so the docent is easy to spot
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.17, 0.012, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc400 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 2.0, 0);
    this.root.add(halo);
    this.halo = halo;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.5, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.root.add(ring);

    // Speech bubble sprite
    this.bubbleCanvas = document.createElement('canvas');
    this.bubbleCanvas.width = 1024;
    this.bubbleCanvas.height = 300;
    this.bubbleTex = new THREE.CanvasTexture(this.bubbleCanvas);
    this.bubbleTex.colorSpace = THREE.SRGBColorSpace;
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubbleTex, transparent: true, depthTest: false }));
    this.bubble.scale.set(3.0, 0.88, 1);
    this.bubble.position.set(0, 2.6, 0);
    this.bubble.renderOrder = 20;
    this.bubble.visible = false;
    this.root.add(this.bubble);

    this.buildKiosk();
  }

  // ---------- Kiosk ----------
  buildKiosk() {
    const g = new THREE.Group();
    g.position.copy(this.home);
    g.rotation.y = Math.atan2(-this.home.x, 22 - this.home.z); // face the spawn point
    this.scene.add(g);
    this.kiosk = g;

    const metal = new THREE.MeshStandardMaterial({ color: 0x0c1220, metalness: 0.85, roughness: 0.3 });
    const gold = new THREE.MeshBasicMaterial({ color: 0xffc400 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.9, 24), metal);
    base.position.y = 0.45;
    g.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.02, 8, 32), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.9;
    g.add(ring);

    const mkCanvas = (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    };

    // Header board
    const hc = mkCanvas(768, 192);
    const hx = hc.getContext('2d');
    hx.fillStyle = 'rgba(5, 9, 20, 0.97)';
    hx.fillRect(0, 0, 768, 192);
    hx.strokeStyle = '#ffc400';
    hx.lineWidth = 6;
    hx.strokeRect(4, 4, 760, 184);
    hx.textAlign = 'center';
    hx.fillStyle = '#ffc400';
    hx.font = 'bold 40px monospace';
    hx.fillText('ASK THE DOCENT', 384, 66);
    hx.fillStyle = '#ffffff';
    hx.font = 'bold 56px sans-serif';
    hx.fillText('DOCENT LUX', 384, 134);
    const ht = new THREE.CanvasTexture(hc);
    ht.colorSpace = THREE.SRGBColorSpace;
    const header = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: ht, side: THREE.DoubleSide }));
    header.position.set(0, 1.85, 0);
    g.add(header);

    // 4 buttons on a tilted desk top
    const buttons = [
      { cmd: 'tour', label: 'TOUR', color: 0xffc400, x: -0.34, z: 0.16 },
      { cmd: 'explain', label: 'EXPLAIN', color: 0x00f0ff, x: 0.34, z: 0.16 },
      { cmd: 'relics', label: 'RELICS', color: 0xb26bff, x: -0.34, z: -0.16 },
      { cmd: 'stop', label: 'STOP', color: 0xff3b6b, x: 0.34, z: -0.16 }
    ];
    buttons.forEach((b) => {
      const mat = new THREE.MeshStandardMaterial({ color: b.color, emissive: b.color, emissiveIntensity: 0.7, roughness: 0.3 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.28), mat);
      mesh.position.set(b.x, 1.0, b.z);
      mesh.userData = { action: `docent:${b.cmd}`, tooltip: b.label };
      g.add(mesh);
      this.interactableObjects.push(mesh);

      const c = mkCanvas(256, 112);
      const cx = c.getContext('2d');
      cx.fillStyle = '#05070f';
      cx.font = 'bold 46px sans-serif';
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.fillText(b.label, 128, 58);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.24), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
      label.rotation.x = -Math.PI / 2;
      label.position.set(b.x, 1.045, b.z);
      label.userData = mesh.userData;
      g.add(label);
      this.interactableObjects.push(label);
    });
  }

  // ---------- Voice ----------
  pickVoice() {
    if (!this.synth) return;
    const voices = this.synth.getVoices ? this.synth.getVoices() : [];
    const en = voices.filter((v) => /^en/i.test(v.lang));
    const score = (v) => {
      let s = 0;
      if (/natural|online/i.test(v.name)) s += 3;
      if (/google/i.test(v.name)) s += 2;
      if (/microsoft (aria|jenny|guy|sonia|libby)/i.test(v.name)) s += 3;
      if (/en-(us|gb)/i.test(v.lang)) s += 1;
      return s;
    };
    en.sort((a, b) => score(b) - score(a));
    this.voice = en[0] || null;
  }

  setSpeaking(active) {
    if (this.speaking !== active) {
      this.speaking = active;
      this.onVoiceChange(active);
    }
  }

  // Speak one sentence (or hold the caption for a word-count based time if speech is unavailable)
  speak(text, onEnd) {
    this.cancelSpeech();
    this.bubbleText = text;
    this.bubbleVisibleFor = 0;
    this.drawBubble(text);
    this.setSpeaking(true);

    let finished = false;
    let timer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      this.speechCancel = null;
      if (onEnd) onEnd();
    };
    this.speechCancel = () => { finished = true; clearTimeout(timer); this.speechCancel = null; };

    const words = text.split(/\s+/).length;
    const captionMs = words * 400 + 900;
    if (this.synth) {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.lang = this.voice ? this.voice.lang : 'en-US';
      u.rate = 1.0;
      u.pitch = 1.05;
      u.onend = finish;
      u.onerror = finish;
      timer = setTimeout(finish, Math.max(captionMs * 2, 5000)); // safety net if no end event arrives
      this.synth.speak(u);
    } else {
      timer = setTimeout(finish, captionMs);
    }
  }

  cancelSpeech() {
    if (this.speechCancel) this.speechCancel();
    if (this.synth) this.synth.cancel();
  }

  drawBubble(text) {
    const c = this.bubbleCanvas;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(8, 14, 30, 0.94)';
    ctx.strokeStyle = '#ffc400';
    ctx.lineWidth = 8;
    const r = 36;
    ctx.beginPath();
    ctx.moveTo(r, 6);
    ctx.lineTo(c.width - r, 6);
    ctx.quadraticCurveTo(c.width - 6, 6, c.width - 6, r);
    ctx.lineTo(c.width - 6, c.height - 50 - r);
    ctx.quadraticCurveTo(c.width - 6, c.height - 50, c.width - r, c.height - 50);
    ctx.lineTo(c.width / 2 + 28, c.height - 50);
    ctx.lineTo(c.width / 2, c.height - 8);
    ctx.lineTo(c.width / 2 - 28, c.height - 50);
    ctx.lineTo(r, c.height - 50);
    ctx.quadraticCurveTo(6, c.height - 50, 6, c.height - 50 - r);
    ctx.lineTo(6, r);
    ctx.quadraticCurveTo(6, 6, r, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Word-wrapped text, shrink to fit
    const maxW = c.width - 90;
    const maxH = c.height - 50 - 40;
    let size = 44;
    let lines = [];
    for (; size >= 24; size -= 2) {
      ctx.font = `bold ${size}px sans-serif`;
      lines = [];
      let line = '';
      text.split(/\s+/).forEach((w) => {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else { line = test; }
      });
      if (line) lines.push(line);
      if (lines.length * size * 1.22 <= maxH) break;
    }
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const total = lines.length * size * 1.22;
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, 20 + (maxH - total) / 2 + i * size * 1.22));
    this.bubbleTex.needsUpdate = true;
  }

  // ---------- Public commands ----------
  greet() {
    if (this.greeted) return;
    this.greeted = true;
    if (this.touring || this.current || this.queue.length) return;
    this.enqueue([{ type: 'say', lines: GREETING }]);
  }

  startTour() {
    this.stop(false, false);
    this.touring = true;
    const steps = [];
    TOUR_ORDER.forEach((key, i) => steps.push(...this.compileStop(key, i === 0)));
    steps.push({ type: 'call', fn: () => { this.touring = false; } });
    this.enqueue(steps);
    this.enqueue(this.goHomeSteps());
  }

  startRelicTour() {
    this.stop(false, false);
    this.touring = true;
    const steps = [];
    RELIC_ORDER.forEach((key, i) => steps.push(...this.compileStop(key, i === 0)));
    steps.push({ type: 'call', fn: () => { this.touring = false; } });
    this.enqueue(steps);
    this.enqueue(this.goHomeSteps());
  }

  // Explain whatever booth or relic cluster is nearest to the visitor
  explainNearest(playerPos) {
    this.stop(false, false);
    let key = null;
    const booth = this.booths ? this.booths.getNearbyBooth(playerPos, 9) : null;
    const cluster = this.relics ? this.relics.getNearbyCluster(playerPos, 4.5) : null;
    if (booth && STOPS[`booth:${booth.def.id}`]) key = `booth:${booth.def.id}`;
    else if (cluster && STOPS[`relic:${cluster.id}`]) key = `relic:${cluster.id}`;
    else if (playerPos.z > 31 && playerPos.z < 46 && Math.abs(playerPos.x) < 9) key = 'helipad';

    if (!key) {
      this.enqueue([{ type: 'say', lines: NOTHING_NEARBY }]);
      return;
    }
    this.enqueue(this.compileStop(key, true));
    this.enqueue(this.goHomeSteps());
  }

  stop(announce = true, goHome = true) {
    this.cancelSpeech();
    this.setSpeaking(false);
    this.queue = [];
    this.current = null;
    this.pointTarget = null;
    this.touring = false;
    this.bubble.visible = false;
    if (announce) this.onNotify('Docent Lux: tour stopped');
    if (goHome) this.enqueue(this.goHomeSteps());
  }

  handleAction(action, playerPos) {
    if (typeof action !== 'string' || !action.startsWith('docent:')) return false;
    const cmd = action.split(':')[1];
    if (cmd === 'tour') this.startTour();
    else if (cmd === 'explain') this.explainNearest(playerPos);
    else if (cmd === 'relics') this.startRelicTour();
    else if (cmd === 'stop') this.stop(true);
    return true;
  }

  isNearKiosk(playerPos, radius = 3.6) {
    return Math.hypot(playerPos.x - this.home.x, playerPos.z - this.home.z) < radius;
  }

  // ---------- Script compiler ----------
  spotFor(at) {
    const v = new THREE.Vector3();
    if (at === 'welcome') return v.set(-1.4, this.deckY, 19.8);
    if (at === 'helipad') return v.set(-6.8, this.deckY, 36.0);
    if (at.startsWith('booth:')) {
      const booth = this.booths.getBooth(at.split(':')[1]);
      v.set(2.3, 0, 1.2);
      return booth.group.localToWorld(v);
    }
    if (at.startsWith('relic:')) {
      return this.relics.getStandPoint(at.split(':')[1], v, 1.5);
    }
    return v.copy(this.home);
  }

  compileStop(key, first) {
    const stop = STOPS[key];
    const spot = this.spotFor(stop.at);
    spot.y = this.deckY;
    const steps = [{ type: 'walk', to: spot }];
    if (!first) steps.push({ type: 'waitPlayer', pos: spot, radius: 9, timeout: 14 });
    stop.steps.forEach((s) => {
      if (s.say) steps.push({ type: 'say', lines: s.say });
      else if (s.wait) steps.push({ type: 'wait', secs: s.wait });
      else if (s.act) steps.push({ type: 'demo', act: s.act });
    });
    return steps;
  }

  goHomeSteps() {
    const spot = new THREE.Vector3(this.home.x + 1.3, this.deckY, this.home.z + 0.4);
    return [{ type: 'walk', to: spot }, { type: 'call', fn: () => { this.pointTarget = null; } }];
  }

  enqueue(steps) {
    this.queue.push(...steps);
  }

  // ---------- Step runner ----------
  beginStep(step) {
    step.t = 0;
    if (step.type === 'walk') {
      this.walkTarget = step.to;
    } else if (step.type === 'say') {
      step.index = 0;
      step.pause = 0;
      step.waiting = false;
      if (this.booths) this.booths.stopAllNarration();
    } else if (step.type === 'demo') {
      const [kind, id, cmd] = step.act.split(':');
      step.kind = kind; step.id = id; step.cmd = cmd;
      step.fired = false;
      const target = new THREE.Vector3();
      if (kind === 'booth') {
        const booth = this.booths.getBooth(id);
        step.booth = booth;
        this.booths.getButtonWorldPos(booth, cmd, target);
      } else {
        this.relics.getFocusPos(id, target);
      }
      step.target = target;
      this.pointTarget = target;
    } else if (step.type === 'call') {
      step.fn();
    }
  }

  tickStep(step, delta, playerPos) {
    step.t += delta;
    switch (step.type) {
      case 'walk': {
        const dx = step.to.x - this.root.position.x;
        const dz = step.to.z - this.root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.12) { this.walking = false; return true; }
        const move = Math.min(dist, 1.7 * delta);
        this.root.position.x += (dx / dist) * move;
        this.root.position.z += (dz / dist) * move;
        this.heading = Math.atan2(dx, dz);
        this.walking = true;
        return false;
      }
      case 'say': {
        if (step.waiting) return false;
        if (step.pause > 0) { step.pause -= delta; return false; }
        if (step.index >= step.lines.length) { this.setSpeaking(false); return true; }
        step.waiting = true;
        this.speak(step.lines[step.index], () => {
          step.index += 1;
          step.pause = 0.25;
          step.waiting = false;
        });
        return false;
      }
      case 'wait':
        return step.t >= step.secs;
      case 'waitPlayer': {
        const d = Math.hypot(playerPos.x - step.pos.x, playerPos.z - step.pos.z);
        return d < step.radius || step.t > step.timeout;
      }
      case 'demo': {
        if (!step.fired && step.t >= 0.9) {
          step.fired = true;
          if (step.kind === 'booth') this.booths.runCommand(step.booth, step.cmd);
          else this.relics.runCommand(step.id, step.cmd);
        }
        if (step.t >= 1.6) { this.pointTarget = null; return true; }
        return false;
      }
      case 'call':
        return true;
      default:
        return true;
    }
  }

  // ---------- Per-frame ----------
  update(delta, time, playerPos) {
    // Queue runner
    if (!this.current) {
      this.current = this.queue.shift() || null;
      if (this.current) this.beginStep(this.current);
    }
    if (this.current && this.tickStep(this.current, delta, playerPos)) {
      this.current = null;
    }
    if (!this.current && !this.queue.length) {
      this.walking = false;
      if (this.speaking && !this.speechCancel) this.setSpeaking(false);
    }

    this.animate(delta, time, playerPos);

    // Bubble visibility: shown while speaking, then lingers briefly
    if (this.speaking) {
      this.bubble.visible = true;
      this.bubbleVisibleFor = 0;
    } else if (this.bubble.visible) {
      this.bubbleVisibleFor += delta;
      if (this.bubbleVisibleFor > 1.4) this.bubble.visible = false;
    }
    this.halo.rotation.z += delta * 1.5;
  }

  animate(delta, time, playerPos) {
    const n = this.npc;
    const root = this.root;

    // Facing: heading while walking, target while pointing, otherwise the visitor
    const toPlayerX = playerPos.x - root.position.x;
    const toPlayerZ = playerPos.z - root.position.z;
    const playerDist = Math.hypot(toPlayerX, toPlayerZ);
    let yaw = root.rotation.y;
    if (this.walking) {
      yaw = this.heading;
    } else if (this.pointTarget) {
      yaw = Math.atan2(this.pointTarget.x - root.position.x, this.pointTarget.z - root.position.z);
    } else if (playerDist < 18) {
      yaw = Math.atan2(toPlayerX, toPlayerZ);
    }
    root.rotation.y += angleDiff(yaw, root.rotation.y) * Math.min(1, delta * 6);

    // Walk cycle
    const ampTarget = this.walking ? 1 : 0;
    this.walkAmp += (ampTarget - this.walkAmp) * Math.min(1, delta * 8);
    this.walkPhase += delta * 7.5 * (this.walking ? 1 : 0);
    n.legs.forEach((leg, i) => {
      const ph = this.walkPhase + (i === 0 ? 0 : Math.PI);
      leg.upperLeg.rotation.x = Math.sin(ph) * 0.55 * this.walkAmp;
      leg.lowerLeg.rotation.x = Math.max(0, Math.sin(ph + Math.PI / 2)) * 0.7 * this.walkAmp;
    });
    n.hips.position.y = 0.95 + Math.abs(Math.sin(this.walkPhase)) * 0.025 * this.walkAmp;

    // Arm targets: rest / speaking gestures / pointing
    const targets = [{ u: 0.05, f: -0.15 }, { u: 0.05, f: -0.15 }];
    if (this.walking) {
      targets[0].u = Math.sin(this.walkPhase) * 0.45 * this.walkAmp;
      targets[1].u = -Math.sin(this.walkPhase) * 0.45 * this.walkAmp;
    } else if (this.speaking) {
      targets[1].u = -0.55 + Math.sin(time * 1.9) * 0.2;
      targets[1].f = -0.85 + Math.sin(time * 2.4) * 0.18;
      targets[0].u = -0.3 + Math.sin(time * 1.5 + 1.2) * 0.12;
      targets[0].f = -0.7;
    }
    if (this.pointTarget && !this.walking) {
      const shoulder = n.arms[1].shoulder.getWorldPosition(this.scratch);
      const dx = this.pointTarget.x - shoulder.x;
      const dz = this.pointTarget.z - shoulder.z;
      const hd = Math.max(0.2, Math.hypot(dx, dz));
      const elev = Math.atan2(this.pointTarget.y - shoulder.y, hd);
      targets[1].u = -clamp(Math.PI / 2 + elev, 0.3, 2.5);
      targets[1].f = -0.05;
    }
    const k = Math.min(1, delta * 9);
    n.arms.forEach((arm, i) => {
      const p = this.armPose[i];
      p.u += (targets[i].u - p.u) * k;
      p.f += (targets[i].f - p.f) * k;
      arm.upperArm.rotation.x = p.u;
      arm.forearm.rotation.x = p.f;
    });

    // Head: look at the visitor (limited), nod while speaking
    let headTarget = 0;
    if (!this.walking && playerDist < 18) {
      headTarget = clamp(angleDiff(Math.atan2(toPlayerX, toPlayerZ), root.rotation.y), -0.9, 0.9);
    }
    this.headYaw += (headTarget - this.headYaw) * Math.min(1, delta * 6);
    n.head.rotation.y = this.headYaw;
    n.head.rotation.x = this.speaking ? Math.sin(time * 3.2) * 0.05 : 0;

    // Keep on the deck
    root.position.x = clamp(root.position.x, -14, 14);
    root.position.z = clamp(root.position.z, 11, 44);
    root.position.y = this.deckY;
  }
}
