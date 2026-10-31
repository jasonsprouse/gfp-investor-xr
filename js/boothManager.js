import * as THREE from 'three';
import { BOOTH_DEFS } from './boothData.js';

const pad2 = (n) => String(n).padStart(2, '0');
const hexCss = (hex) => '#' + hex.toString(16).padStart(6, '0');

const VIEW_LABELS = {
  slide: 'SLIDE', transcript: 'TEXT', video: 'VIDEO', gfp: 'GFP', both: 'BOTH'
};
const VIEW_TITLES = {
  slide: 'SLIDE', transcript: 'NARRATION TRANSCRIPT', video: 'VIDEO EVIDENCE', gfp: 'GFP SYNTHESIS', both: 'VIDEO + GFP'
};

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
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
 * Interactive investor-pitch booths. Each booth has a 16:9 presentation screen composed on a canvas
 * (slide image + optional text panel depending on the active VIEW), a console with
 * PREV / PLAY / NEXT / AUTO / VIEW / LINK buttons, and optional per-slide MP3 narration.
 * Actions are routed through `handleAction('booth:<id>:<command>')`.
 */
export class BoothManager {
  constructor(scene, { audioManager, onNarrationChange, onOpenLink, onNotify } = {}) {
    this.scene = scene;
    this.audioManager = audioManager || null;
    this.onNarrationChange = onNarrationChange || (() => {});
    this.onOpenLink = onOpenLink || (() => {});
    this.onNotify = onNotify || (() => {});
    this.booths = [];
    this.interactableObjects = [];
    this.maxInteractDistance = 35;
    this.anyNarrating = false;
    this.imageCache = new Map();

    BOOTH_DEFS.forEach((def) => this.booths.push(this.buildBooth(def)));
    this.booths.forEach((b) => this.loadSlideData(b));
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
    const screenY = 3.0;
    const screenZ = -1.9;
    [-2.25, 2.25].forEach((x) => {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.3, 0.3), darkMetal);
      pylon.position.set(x, 2.65, screenZ - 0.1);
      group.add(pylon);
      const glowLine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 5.2, 0.04), accentMat);
      glowLine.position.set(x, 2.65, screenZ + 0.08);
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
    let titleSize = 66;
    hctx.font = `bold ${titleSize}px sans-serif`;
    while (hctx.measureText(def.title).width > 1190 && titleSize > 30) {
      titleSize -= 2;
      hctx.font = `bold ${titleSize}px sans-serif`;
    }
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
    header.position.set(0, 4.7, screenZ + 0.02);
    group.add(header);

    // Presentation screen: slides are composed onto a 1280x720 canvas (image + text panel per VIEW)
    const compCanvas = document.createElement('canvas');
    compCanvas.width = 1280;
    compCanvas.height = 720;
    const screenTex = new THREE.CanvasTexture(compCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    screenTex.anisotropy = 4;
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, side: THREE.DoubleSide });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), screenMat);
    screen.position.set(0, screenY, screenZ);
    screen.name = `booth_${def.id}_screen`;
    screen.userData = {
      action: `booth:${def.id}:${def.narration ? 'toggle' : 'next'}`,
      tooltip: def.narration ? 'Play / pause narration' : 'Next slide'
    };
    group.add(screen);
    this.interactableObjects.push(screen);

    // Console desk
    const desk = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.95, 0.75), darkMetal);
    desk.position.set(0, 0.55, 0.1);
    group.add(desk);
    const deskEdge = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.04, 0.77), accentMat);
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
    caption.position.set(0, 1.38, -0.05);
    caption.rotation.x = -0.8;
    group.add(caption);

    const views = def.views && def.views.length ? def.views : ['slide'];
    const booth = {
      def, group, screenMat, screenTex, compCanvas, compCtx: compCanvas.getContext('2d'),
      haloMat, captionCanvas, captionCtx: captionCanvas.getContext('2d'), captionTex,
      index: 0, narrating: false, autoplay: true, audio: null,
      views, viewIndex: 0, view: views[0],
      data: def.slides.map((s) => ({ ...s })), autoTimer: 0,
      buttons: {}, labels: {}, worldPos: new THREE.Vector3()
    };
    group.getWorldPosition(booth.worldPos);

    // Console buttons (centered row, spacing 0.58)
    const hasNarration = def.narration;
    const buttonDefs = [{ cmd: 'prev', label: 'PREV', color: 0x00f0ff }];
    if (hasNarration) buttonDefs.push({ cmd: 'toggle', label: 'PLAY', color: 0xff007f });
    buttonDefs.push({ cmd: 'next', label: 'NEXT', color: 0x00f0ff });
    buttonDefs.push({ cmd: 'auto', label: hasNarration ? 'AUTO' : 'SHOW', color: 0xffaa00 });
    if (views.length > 1) buttonDefs.push({ cmd: 'view', label: VIEW_LABELS[views[0]], color: 0xb26bff });
    buttonDefs.push({ cmd: 'link', label: 'LINK', color: 0x00ff88 });

    const spacing = 0.58;
    const startX = -((buttonDefs.length - 1) * spacing) / 2;
    buttonDefs.forEach((b, i) => {
      const x = startX + i * spacing;
      const mat = new THREE.MeshStandardMaterial({
        color: b.color, emissive: b.color, emissiveIntensity: 0.7, roughness: 0.3
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.3), mat);
      mesh.position.set(x, 1.11, 0.25);
      mesh.name = `booth_${def.id}_${b.cmd}`;
      mesh.userData = { action: `booth:${def.id}:${b.cmd}`, tooltip: b.label };
      group.add(mesh);
      this.interactableObjects.push(mesh);
      booth.buttons[b.cmd] = mesh;

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
      labelMesh.position.set(x, 1.162, 0.25);
      labelMesh.userData = mesh.userData;
      group.add(labelMesh);
      this.interactableObjects.push(labelMesh);

      booth.labels[b.cmd] = { canvas: labelCanvas, tex: labelTex, text: b.label };
      this.drawLabel(booth, b.cmd, b.label);
    });

    this.drawCaption(booth);
    this.composeSlide(booth);
    this.prefetch(booth);
    return booth;
  }

  drawLabel(booth, cmd, text) {
    const l = booth.labels[cmd];
    if (!l) return;
    l.text = text;
    const ctx = l.canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 160);
    ctx.fillStyle = '#05070f';
    ctx.font = `bold ${text.length > 5 ? 48 : 60}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 82);
    l.tex.needsUpdate = true;
  }

  // ---------- Slide data (per-slide text from the digital-golden-plates decks) ----------
  loadSlideData(booth) {
    if (!booth.def.dataUrl) return;
    fetch(booth.def.dataUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((rows) => {
        if (!Array.isArray(rows) || !rows.length) return;
        booth.data = rows.map((row, i) => ({ ...(booth.def.slides[i] || {}), ...row }));
        if (booth.index >= booth.data.length) booth.index = 0;
        this.drawCaption(booth);
        this.composeSlide(booth);
      })
      .catch(() => this.onNotify(`Slide text for "${booth.def.title}" failed to load - showing images only`));
  }

  // ---------- Image loading ----------
  imageUrls(booth, idx) {
    const n = pad2(idx + 1);
    const dir = booth.def.mediaDir;
    if (booth.def.imgMode === 'pair') return { a: `${dir}/slide_${n}_a.jpg`, b: `${dir}/slide_${n}_b.jpg` };
    return { a: `${dir}/slide_${n}.jpg` };
  }

  loadImage(url) {
    if (this.imageCache.has(url)) return this.imageCache.get(url);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${url}`));
      img.src = url;
    });
    this.imageCache.set(url, p);
    p.catch(() => this.imageCache.delete(url));
    return p;
  }

  // Images needed for the slide in the active view
  neededImages(booth, idx) {
    const urls = this.imageUrls(booth, idx);
    if (!urls.b) return { a: urls.a };
    if (booth.view === 'video') return { a: urls.a };
    if (booth.view === 'gfp') return { b: urls.b };
    return urls;
  }

  prefetch(booth) {
    const count = booth.data.length;
    if (count < 2) return;
    const next = (booth.index + 1) % count;
    Object.values(this.neededImages(booth, next)).forEach((u) => this.loadImage(u).catch(() => {}));
  }

  // ---------- Slide composition ----------
  showSlide(booth, idx, prefetch = true) {
    const count = booth.data.length;
    booth.index = ((idx % count) + count) % count;
    booth.autoTimer = 0;
    this.drawCaption(booth);
    this.composeSlide(booth);
    if (prefetch) this.prefetch(booth);
  }

  composeSlide(booth) {
    const wanted = booth.index;
    const wantedView = booth.view;
    const needed = this.neededImages(booth, wanted);
    const keys = Object.keys(needed);
    Promise.all(keys.map((k) => this.loadImage(needed[k]).catch(() => null)))
      .then((imgs) => {
        if (booth.index !== wanted || booth.view !== wantedView) return; // user moved on
        const loaded = {};
        keys.forEach((k, i) => { loaded[k] = imgs[i]; });
        this.paintSlide(booth, loaded);
      });
    // Immediate placeholder while images load
    if (!booth.painted) this.paintSlide(booth, {});
  }

  drawImageContain(ctx, img, x, y, w, h) {
    if (!img) {
      ctx.fillStyle = '#8aa0c8';
      ctx.font = '28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOADING...', x + w / 2, y + h / 2);
      return;
    }
    const s = Math.min(w / img.width, h / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  // Word-wrapped text panel with auto font-fit. blocks: [{t,k,w,c,f,style,gap,bullet}]
  drawTextBlocks(ctx, x, y, w, h, blocks, accent, startSize = 36) {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 14, 30, 0.97)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.beginPath();
    ctx.rect(x + 4, y + 4, w - 8, h - 8);
    ctx.clip();

    const pad = 22;
    const maxW = w - pad * 2;
    const fontOf = (b, size) => `${b.style || ''} ${b.w || ''} ${Math.round(size * b.k)}px ${b.f || 'sans-serif'}`.trim();
    const layout = (size) => {
      let total = 0;
      const rows = blocks.map((b) => {
        ctx.font = fontOf(b, size);
        const lines = wrapText(ctx, (b.bullet ? '\u2022 ' : '') + b.t, maxW);
        const lh = size * b.k * 1.28;
        total += lines.length * lh + (b.gap || 0);
        return { b, lines, lh };
      });
      return { rows, total };
    };

    let size = startSize;
    let lay = layout(size);
    while (lay.total > h - pad * 2 && size > 15) {
      size -= 1;
      lay = layout(size);
    }

    let cy = y + pad;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lay.rows.forEach(({ b, lines, lh }) => {
      ctx.font = fontOf(b, size);
      ctx.fillStyle = b.c || '#e8eefc';
      lines.forEach((line) => {
        ctx.fillText(line, x + pad, cy);
        cy += lh;
      });
      cy += b.gap || 0;
    });
    ctx.restore();
  }

  paintSlide(booth, imgs) {
    booth.painted = true;
    const ctx = booth.compCtx;
    const W = 1280;
    const H = 720;
    const accent = hexCss(booth.def.accent);
    const s = booth.data[booth.index] || {};
    const mode = booth.view;

    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, W, H);

    if (mode === 'video' || mode === 'gfp') {
      const isVideo = mode === 'video';
      const img = isVideo ? imgs.a : imgs.b;
      this.drawImageContain(ctx, img, 10, 10, 800, H - 20);
      this.drawTextBlocks(ctx, 820, 10, W - 830, H - 20, [
        { t: VIEW_TITLES[mode], k: 0.8, w: 'bold', c: isVideo ? '#ffc400' : '#00f0ff', f: 'monospace', gap: 4 },
        { t: [s.category, s.time].filter(Boolean).join('  |  '), k: 0.7, c: '#8aa0c8', gap: 10 },
        { t: s.title || '', k: 1.12, w: 'bold', c: '#ffffff', gap: 10 },
        { t: (isVideo ? s.cap1 : s.cap2) || '', k: 0.72, style: 'italic', c: '#9fb4d8', gap: 14 },
        ...((isVideo ? s.video_points : s.gfp_points) || []).map((p) => ({ t: p, k: 0.9, bullet: true, gap: 8 }))
      ], accent);
    } else if (mode === 'both') {
      this.drawTextBlocks(ctx, 10, 10, W - 20, 96, [
        { t: [s.category, s.time].filter(Boolean).join('  |  '), k: 0.55, c: '#8aa0c8', gap: 2 },
        { t: s.title || '', k: 0.95, w: 'bold', c: '#ffffff', gap: 0 }
      ], accent);
      this.drawImageContain(ctx, imgs.a, 10, 116, 625, 470);
      this.drawImageContain(ctx, imgs.b, 645, 116, 625, 470);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2, 116);
      ctx.lineTo(W / 2, 586);
      ctx.stroke();
      this.drawTextBlocks(ctx, 10, 596, 625, 114, [
        { t: 'VIDEO EVIDENCE', k: 0.6, w: 'bold', c: '#ffc400', f: 'monospace', gap: 2 },
        { t: s.cap1 || '', k: 0.62, style: 'italic', c: '#9fb4d8' }
      ], '#ffc400');
      this.drawTextBlocks(ctx, 645, 596, 625, 114, [
        { t: 'GFP SYNTHESIS', k: 0.6, w: 'bold', c: '#00f0ff', f: 'monospace', gap: 2 },
        { t: s.cap2 || '', k: 0.62, style: 'italic', c: '#9fb4d8' }
      ], '#00f0ff');
    } else if (mode === 'transcript') {
      this.drawImageContain(ctx, imgs.a, 10, 10, 560, H - 20);
      this.drawTextBlocks(ctx, 580, 10, W - 590, H - 20, [
        { t: VIEW_TITLES.transcript, k: 0.75, w: 'bold', c: '#00f0ff', f: 'monospace', gap: 4 },
        { t: [`SLIDE ${pad2(booth.index + 1)}`, s.time].filter(Boolean).join('  |  '), k: 0.65, c: '#8aa0c8', gap: 8 },
        { t: s.title || '', k: 1.1, w: 'bold', c: '#ffffff', gap: 8 },
        { t: s.synthesis || '', k: 0.72, style: 'italic', c: '#9fb4d8', gap: 12 },
        { t: s.narration || '', k: 0.85 }
      ], accent, 50);
    } else {
      // 'slide': full-bleed image
      this.drawImageContain(ctx, imgs.a, 0, 0, W, H);
    }
    booth.screenTex.needsUpdate = true;
  }

  // ---------- Caption board ----------
  drawCaption(booth) {
    const { def } = booth;
    const ctx = booth.captionCtx;
    const w = booth.captionCanvas.width;
    const h = booth.captionCanvas.height;
    const accent = hexCss(def.accent);
    const slide = booth.data[booth.index] || {};
    const url = slide.url || def.url;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#050914'; // opaque: a translucent fill would leave ghosts of the previous slide text
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = accent;
    ctx.font = 'bold 34px monospace';
    const viewTag = booth.views.length > 1 ? `  [${VIEW_LABELS[booth.view]}]` : '';
    ctx.fillText(`SLIDE ${pad2(booth.index + 1)} / ${pad2(booth.data.length)}${viewTag}`, 36, 58);

    ctx.textAlign = 'right';
    let status;
    if (def.narration) {
      status = booth.narrating ? '\u25B6 NARRATING' : '\u275A\u275A READY - PRESS PLAY';
    } else {
      status = booth.autoplay ? '\u25B6 SLIDE SHOW' : '\u275A\u275A PAUSED';
    }
    ctx.fillStyle = (booth.narrating || (!def.narration && booth.autoplay)) ? '#00ff88' : '#ffaa00';
    ctx.fillText(status, w - 36, 58);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px sans-serif';
    const lines = wrapText(ctx, slide.title || '', w - 72).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, 36, 128 + i * 58));

    ctx.font = '28px monospace';
    ctx.fillStyle = '#8aa0c8';
    const shortUrl = url ? url.replace(/^https?:\/\//, '').slice(0, 56) : '';
    const autoText = def.narration ? `AUTO-ADVANCE ${booth.autoplay ? 'ON' : 'OFF'}   ` : '';
    ctx.fillText(`${autoText}${shortUrl}`, 36, 262);

    // Progress bar
    const pct = (booth.index + 1) / booth.data.length;
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
    if (booth._stopWebAudio) {
      try { booth._stopWebAudio(); } catch (e) {}
      booth._stopWebAudio = null;
    }
    const mp3Url = `${booth.def.mediaDir}/slide_${pad2(booth.index + 1)}.mp3`;
    booth.narrating = true;
    this.drawLabel(booth, 'toggle', 'PAUSE');
    this.drawCaption(booth);
    this.refreshNarrationState();

    const playHtmlFallback = () => {
      const audio = this.ensureAudio(booth);
      audio.src = mp3Url;
      audio.volume = 1;
      const p = audio.play();
      if (p && p.catch) {
        p.catch(() => {
          booth.narrating = false;
          this.drawLabel(booth, 'toggle', 'PLAY');
          this.drawCaption(booth);
          this.refreshNarrationState();
        });
      }
    };

    if (this.audioManager && typeof this.audioManager.playVoiceFile === 'function') {
      booth._stopWebAudio = this.audioManager.playVoiceFile(mp3Url, {
        onEnded: () => {
          booth._stopWebAudio = null;
          this.onNarrationEnded(booth);
        },
        onError: () => {
          booth._stopWebAudio = null;
          playHtmlFallback();
        }
      });
    } else {
      playHtmlFallback();
    }
  }

  stopNarration(booth) {
    if (booth._stopWebAudio) {
      try { booth._stopWebAudio(); } catch (e) {}
      booth._stopWebAudio = null;
    }
    if (booth.audio) booth.audio.pause();
    booth.narrating = false;
    if (booth.def.narration) this.drawLabel(booth, 'toggle', 'PLAY');
    this.drawCaption(booth);
    this.refreshNarrationState();
  }

  stopAllNarration() {
    this.booths.forEach((b) => { if (b.narrating) this.stopNarration(b); });
  }

  onNarrationEnded(booth) {
    const last = booth.index === booth.data.length - 1;
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
    const booth = this.getBooth(id);
    if (!booth) return true;

    if (playerPos && playerPos.distanceTo(booth.worldPos) > this.maxInteractDistance) {
      this.onNotify(`Walk closer to the "${booth.def.title}" booth`);
      return true;
    }
    this.runCommand(booth, cmd);
    return true;
  }

  getBooth(id) {
    return this.booths.find((b) => b.def.id === id) || null;
  }

  setView(booth, view) {
    const i = booth.views.indexOf(view);
    if (i < 0) return;
    booth.viewIndex = i;
    booth.view = view;
    this.drawLabel(booth, 'view', VIEW_LABELS[view]);
    this.drawCaption(booth);
    this.composeSlide(booth);
    this.prefetch(booth);
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
        booth.autoTimer = 0;
        if (booth.def.narration) {
          this.drawLabel(booth, 'auto', booth.autoplay ? 'AUTO' : 'MANUAL');
          this.onNotify(`${booth.def.title}: auto-advance ${booth.autoplay ? 'ON' : 'OFF'}`);
        } else {
          this.drawLabel(booth, 'auto', booth.autoplay ? 'SHOW' : 'PAUSED');
          this.onNotify(`${booth.def.title}: slide show ${booth.autoplay ? 'running' : 'paused'}`);
        }
        this.drawCaption(booth);
        break;
      }
      case 'view': {
        if (booth.views.length > 1) {
          this.setView(booth, booth.views[(booth.viewIndex + 1) % booth.views.length]);
        }
        break;
      }
      case 'link': {
        const slide = booth.data[booth.index] || {};
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

  // World-space spot in front of a booth's console (where a visitor or the docent stands)
  getStandPoint(booth, out = new THREE.Vector3()) {
    out.set(0, 0, 2.4);
    return booth.group.localToWorld(out);
  }

  // World-space position of a console button (for pointing gestures)
  getButtonWorldPos(booth, cmd, out = new THREE.Vector3()) {
    const mesh = booth.buttons[cmd] || booth.buttons.next;
    return mesh.getWorldPosition(out);
  }

  update(delta, time, playerPos, audioManager) {
    const pulse = audioManager && audioManager.getBeatPulse ? audioManager.getBeatPulse() : 0;
    this.booths.forEach((b) => {
      b.haloMat.opacity = 0.3 + pulse * 0.3 + (b.narrating ? 0.12 : 0);

      // Timed slide show for self-guided booths (only while a visitor is nearby)
      if (!b.def.narration && b.autoplay && b.def.autoMs && b.data.length > 1) {
        if (playerPos.distanceTo(b.worldPos) < 14) {
          b.autoTimer += delta * 1000;
          if (b.autoTimer >= b.def.autoMs) this.showSlide(b, b.index + 1);
        }
      }

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
