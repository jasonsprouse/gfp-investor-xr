import * as THREE from 'three';
import { BOOTH_DEFS } from './boothData.js';

const pad2 = (n) => String(n).padStart(2, '0');
const hexCss = (hex) => '#' + hex.toString(16).padStart(6, '0');

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Interactive investor-pitch booths. Each booth has a 16:9 presentation screen, a console with
 * PREV / NARRATE / NEXT / AUTO / LINK buttons, and optional per-slide MP3 narration.
 * Actions are routed through `handleAction('booth:<id>:<command>')`.
 */
export class BoothManager {
  constructor(scene, { onNarrationChange, onOpenLink, onNotify } = {}) {
    this.scene = scene;
    this.onNarrationChange = onNarrationChange || (() => {});
    this.onOpenLink = onOpenLink || (() => {});
    this.onNotify = onNotify || (() => {});
    this.loader = new THREE.TextureLoader();
    this.booths = [];
    this.interactableObjects = [];
    this.maxInteractDistance = 18;
    this.anyNarrating = false;

    BOOTH_DEFS.forEach((def) => this.booths.push(this.buildBooth(def)));
  }

  // ---------- Construction ----------
  buildBooth(def) {
    const accentCss = hexCss(def.accent);
    const group = new THREE.Group();
    group.position.set(def.position[0], def.position[1], def.position[2]);
    group.rotation.y = def.rotY;
    this.scene.add(group);

    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0c1220, metalness: 0.85, roughness: 0.3 });
    const accentMat = new THREE.MeshBasicMaterial({ color: def.accent });

    // Floor pad with glowing edge strips
    const padMesh = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.08, 5.2), darkMetal);
    padMesh.position.set(0, 0.04, 0.2);
    group.add(padMesh);
    [[0, 2.8, 6.0, 0.05], [0, -2.4, 6.0, 0.05], [-3.0, 0.2, 0.05, 5.2], [3.0, 0.2, 0.05, 5.2]].forEach(([x, z, w, d]) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), accentMat);
      strip.position.set(x, 0.09, z);
      group.add(strip);
    });

    // Back wall frame: two pylons + header beam
    const screenW = 4.0;
    const screenH = 2.25; // 16:9
    const screenY = 2.35;
    const screenZ = -1.9;
    [-2.25, 2.25].forEach((x) => {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.4, 0.3), darkMetal);
      pylon.position.set(x, 2.2, screenZ - 0.1);
      group.add(pylon);
      const glowLine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 4.3, 0.04), accentMat);
      glowLine.position.set(x, 2.2, screenZ + 0.08);
      group.add(glowLine);
    });

    // Halo behind screen (pulses with the music)
    const haloMat = new THREE.MeshBasicMaterial({
      color: def.accent, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide
    });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(screenW + 0.5, screenH + 0.5), haloMat);
    halo.position.set(0, screenY, screenZ - 0.03);
    group.add(halo);

    // Header banner
    const headerCanvas = document.createElement('canvas');
    headerCanvas.width = 1280;
    headerCanvas.height = 180;
    const hctx = headerCanvas.getContext('2d');
    hctx.fillStyle = 'rgba(5, 9, 20, 0.96)';
    hctx.fillRect(0, 0, 1280, 180);
    hctx.strokeStyle = accentCss;
    hctx.lineWidth = 6;
    hctx.strokeRect(5, 5, 1270, 170);
    hctx.textAlign = 'center';
    hctx.fillStyle = '#ffffff';
    hctx.font = 'bold 66px sans-serif';
    hctx.fillText(def.title, 640, 85);
    hctx.fillStyle = accentCss;
    hctx.font = '34px monospace';
    hctx.fillText(def.tagline, 640, 140);
    const headerTex = new THREE.CanvasTexture(headerCanvas);
    headerTex.colorSpace = THREE.SRGBColorSpace;
    const header = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 0.65),
      new THREE.MeshBasicMaterial({ map: headerTex, side: THREE.DoubleSide })
    );
    header.position.set(0, 4.05, screenZ + 0.02);
    group.add(header);

    // Presentation screen
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), screenMat);
    screen.position.set(0, screenY, screenZ);
    screen.name = `booth_${def.id}_screen`;
    screen.userData = { action: `booth:${def.id}:toggle`, tooltip: 'Play / pause narration' };
    group.add(screen);
    this.interactableObjects.push(screen);

    // Console desk
    const desk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.95, 0.75), darkMetal);
    desk.position.set(0, 0.55, 0.1);
    group.add(desk);
    const deskEdge = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.04, 0.77), accentMat);
    deskEdge.position.set(0, 1.04, 0.1);
    group.add(deskEdge);

    // Caption board (tilted toward the visitor)
    const captionCanvas = document.createElement('canvas');
    captionCanvas.width = 1200;
    captionCanvas.height = 320;
    const captionTex = new THREE.CanvasTexture(captionCanvas);
    captionTex.colorSpace = THREE.SRGBColorSpace;
    const caption = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.853),
      new THREE.MeshBasicMaterial({ map: captionTex, side: THREE.DoubleSide })
    );
    caption.position.set(0, 1.62, -0.12);
    caption.rotation.x = -0.4;
    group.add(caption);

    const booth = {
      def, group, screenMat, haloMat, captionCanvas, captionCtx: captionCanvas.getContext('2d'), captionTex,
      index: 0, narrating: false, autoplay: true, audio: null, textures: {}, loading: {}, labels: {},
      worldPos: new THREE.Vector3()
    };
    group.getWorldPosition(booth.worldPos);

    // Console buttons
    const hasNarration = def.narration;
    const buttons = [
      { cmd: 'prev', label: 'PREV', color: 0x00f0ff, x: -1.3 },
      { cmd: 'toggle', label: hasNarration ? 'PLAY' : 'NEXT', color: 0xff007f, x: -0.65, narrate: true },
      { cmd: 'next', label: 'NEXT', color: 0x00f0ff, x: 0 },
      { cmd: 'auto', label: hasNarration ? 'AUTO' : 'LOOP', color: 0xffaa00, x: 0.65 },
      { cmd: 'link', label: 'LINK', color: 0x00ff88, x: 1.3 }
    ];
    buttons.forEach((b) => {
      const mat = new THREE.MeshStandardMaterial({
        color: b.color, emissive: b.color, emissiveIntensity: 0.7, roughness: 0.3
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.3), mat);
      mesh.position.set(b.x, 1.11, 0.25);
      mesh.name = `booth_${def.id}_${b.cmd}`;
      mesh.userData = { action: `booth:${def.id}:${b.cmd}`, tooltip: b.label };
      group.add(mesh);
      this.interactableObjects.push(mesh);

      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 256;
      labelCanvas.height = 160;
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      labelTex.colorSpace = THREE.SRGBColorSpace;
      const labelMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.46, 0.27),
        new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
      );
      labelMesh.rotation.x = -Math.PI / 2;
      labelMesh.position.set(b.x, 1.162, 0.25);
      labelMesh.userData = mesh.userData;
      group.add(labelMesh);
      this.interactableObjects.push(labelMesh);

      booth.labels[b.cmd] = { canvas: labelCanvas, tex: labelTex, text: b.label };
      this.drawLabel(booth, b.cmd, b.label);
    });

    this.drawCaption(booth);
    this.showSlide(booth, 0, false);
    return booth;
  }

  drawLabel(booth, cmd, text, active = false) {
    const l = booth.labels[cmd];
    if (!l) return;
    l.text = text;
    const ctx = l.canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 160);
    ctx.fillStyle = active ? '#ffffff' : '#05070f';
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 82);
    l.tex.needsUpdate = true;
  }

  // ---------- Slide display ----------
  slideUrl(booth, idx) {
    return `${booth.def.mediaDir}/slide_${pad2(idx + 1)}.jpg`;
  }

  loadTexture(booth, idx) {
    if (booth.textures[idx]) return Promise.resolve(booth.textures[idx]);
    if (booth.loading[idx]) return booth.loading[idx];
    booth.loading[idx] = new Promise((resolve, reject) => {
      this.loader.load(
        this.slideUrl(booth, idx),
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          tex.anisotropy = 4;
          booth.textures[idx] = tex;
          resolve(tex);
        },
        undefined,
        reject
      );
    });
    return booth.loading[idx];
  }

  showSlide(booth, idx, prefetch = true) {
    const count = booth.def.slides.length;
    booth.index = ((idx % count) + count) % count;
    const wanted = booth.index;
    this.drawCaption(booth);
    this.loadTexture(booth, wanted)
      .then((tex) => {
        if (booth.index !== wanted) return; // user moved on
        booth.screenMat.map = tex;
        booth.screenMat.color.setHex(0xffffff);
        booth.screenMat.needsUpdate = true;
      })
      .catch(() => this.onNotify(`Could not load slide ${wanted + 1} for ${booth.def.title}`));
    if (prefetch && count > 1) this.loadTexture(booth, (wanted + 1) % count).catch(() => {});
  }

  drawCaption(booth) {
    const { def } = booth;
    const ctx = booth.captionCtx;
    const w = booth.captionCanvas.width;
    const h = booth.captionCanvas.height;
    const accent = hexCss(def.accent);
    const slide = def.slides[booth.index];

    ctx.fillStyle = 'rgba(5, 9, 20, 0.97)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = accent;
    ctx.font = 'bold 34px monospace';
    ctx.fillText(`SLIDE ${pad2(booth.index + 1)} / ${pad2(def.slides.length)}`, 36, 58);

    ctx.textAlign = 'right';
    let status;
    if (def.narration) {
      status = booth.narrating ? '\u25B6 NARRATING' : '\u275A\u275A READY - PRESS PLAY';
    } else {
      status = 'SELF-GUIDED';
    }
    ctx.fillStyle = booth.narrating ? '#00ff88' : '#ffaa00';
    ctx.fillText(status, w - 36, 58);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px sans-serif';
    const lines = wrapText(ctx, slide.title, w - 72).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, 36, 128 + i * 58));

    ctx.font = '28px monospace';
    ctx.fillStyle = '#8aa0c8';
    const url = slide.url || def.url;
    const shortUrl = url ? url.replace(/^https?:\/\//, '').slice(0, 62) : '';
    const autoText = def.narration ? `AUTO-ADVANCE ${booth.autoplay ? 'ON' : 'OFF'}   ` : '';
    ctx.fillText(`${autoText}${shortUrl}`, 36, 262);

    // Progress bar
    const pct = (booth.index + 1) / def.slides.length;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(36, 288, w - 72, 10);
    ctx.fillStyle = accent;
    ctx.fillRect(36, 288, (w - 72) * pct, 10);

    booth.captionTex.needsUpdate = true;
  }

  // ---------- Narration ----------
  ensureAudio(booth) {
    if (booth.audio) return booth.audio;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => this.onNarrationEnded(booth));
    audio.addEventListener('error', () => {
      booth.narrating = false;
      this.drawLabel(booth, 'toggle', 'PLAY');
      this.drawCaption(booth);
      this.refreshNarrationState();
    });
    booth.audio = audio;
    return audio;
  }

  startNarration(booth) {
    if (!booth.def.narration) return;
    // Only one booth speaks at a time
    this.booths.forEach((b) => { if (b !== booth && b.narrating) this.stopNarration(b); });
    const audio = this.ensureAudio(booth);
    audio.src = `${booth.def.mediaDir}/slide_${pad2(booth.index + 1)}.mp3`;
    audio.volume = 1;
    booth.narrating = true;
    this.drawLabel(booth, 'toggle', 'PAUSE');
    this.drawCaption(booth);
    this.refreshNarrationState();
    const p = audio.play();
    if (p && p.catch) {
      p.catch(() => {
        booth.narrating = false;
        this.drawLabel(booth, 'toggle', 'PLAY');
        this.drawCaption(booth);
        this.refreshNarrationState();
        this.onNotify('Narration blocked by the browser - click ENTER first, then press PLAY again');
      });
    }
  }

  stopNarration(booth) {
    if (booth.audio) booth.audio.pause();
    booth.narrating = false;
    if (booth.def.narration) this.drawLabel(booth, 'toggle', 'PLAY');
    this.drawCaption(booth);
    this.refreshNarrationState();
  }

  onNarrationEnded(booth) {
    const last = booth.index === booth.def.slides.length - 1;
    if (booth.autoplay && !last) {
      this.showSlide(booth, booth.index + 1);
      this.startNarration(booth);
    } else {
      this.stopNarration(booth);
    }
  }

  refreshNarrationState() {
    const active = this.booths.some((b) => b.narrating);
    if (active !== this.anyNarrating) {
      this.anyNarrating = active;
      this.onNarrationChange(active);
    }
  }

  // ---------- Interaction ----------
  handleAction(action, playerPos) {
    if (typeof action !== 'string' || !action.startsWith('booth:')) return false;
    const [, id, cmd] = action.split(':');
    const booth = this.booths.find((b) => b.def.id === id);
    if (!booth) return true;

    if (playerPos && playerPos.distanceTo(booth.worldPos) > this.maxInteractDistance) {
      this.onNotify(`Walk closer to the "${booth.def.title}" booth`);
      return true;
    }
    this.runCommand(booth, cmd);
    return true;
  }

  runCommand(booth, cmd) {
    const wasNarrating = booth.narrating;
    switch (cmd) {
      case 'next':
      case 'prev': {
        if (wasNarrating) this.stopNarration(booth);
        this.showSlide(booth, booth.index + (cmd === 'next' ? 1 : -1));
        if (wasNarrating) this.startNarration(booth);
        break;
      }
      case 'toggle': {
        if (!booth.def.narration) {
          this.showSlide(booth, booth.index + 1);
        } else if (wasNarrating) {
          this.stopNarration(booth);
        } else {
          this.startNarration(booth);
        }
        break;
      }
      case 'auto': {
        booth.autoplay = !booth.autoplay;
        this.drawLabel(booth, 'auto', booth.def.narration ? (booth.autoplay ? 'AUTO' : 'MANUAL') : 'LOOP');
        this.drawCaption(booth);
        this.onNotify(booth.def.narration
          ? `${booth.def.title}: auto-advance ${booth.autoplay ? 'ON' : 'OFF'}`
          : `${booth.def.title}: self-guided - use PREV / NEXT`);
        break;
      }
      case 'link': {
        const slide = booth.def.slides[booth.index];
        this.onOpenLink(slide.url || booth.def.url);
        break;
      }
    }
  }

  // Nearest booth within radius of the player, or null
  getNearbyBooth(playerPos, radius = 7) {
    let best = null;
    let bestDist = radius;
    this.booths.forEach((b) => {
      const d = playerPos.distanceTo(b.worldPos);
      if (d < bestDist) { best = b; bestDist = d; }
    });
    return best;
  }

  // Keyboard shortcut helper for the nearest booth
  commandNearest(cmd, playerPos) {
    const booth = this.getNearbyBooth(playerPos, 9);
    if (!booth) return false;
    this.runCommand(booth, cmd);
    return true;
  }

  update(delta, time, playerPos, audioManager) {
    const pulse = audioManager && audioManager.getBeatPulse ? audioManager.getBeatPulse() : 0;
    this.booths.forEach((b) => {
      b.haloMat.opacity = 0.3 + pulse * 0.3 + (b.narrating ? 0.12 : 0);
      if (b.narrating && b.audio) {
        // Simple distance attenuation + auto-pause when the visitor walks away
        const d = playerPos.distanceTo(b.worldPos);
        if (d > 26) {
          this.stopNarration(b);
          return;
        }
        b.audio.volume = THREE.MathUtils.clamp(1 - (d - 5) / 22, 0.2, 1);
      }
    });
  }
}
