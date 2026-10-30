import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const RARIBLE = 'https://rarible.com/token/0xd07dc4262bcdbf85190c01c996b4c06a461d2430:';
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // easeInOutCubic
const MILES_PER_SEC = 555.56; // 2,000,000 mph

/**
 * Relic Pavilion: digital examples of the Golden Plates and the Harps of God.
 * Everything is click / trigger to animate (action strings `relic:<id>:<cmd>`).
 * Clusters (local +x to the right when facing the display):
 *   plates  - three solid-gold plates; Plate III: card slide turns 2000 into 2001
 *   cards   - Yellow Y #492856 and Green G #490643 Harps of God (flip, buy link)
 *   sphinx  - $1 Unfinished Pyramid + Sphinx capstone, 3-second count = 1,666.7 miles
 *   medals  - 2 oz Gold / Silver / Copper raffle medallions (flip)
 */
export class RelicPavilion {
  constructor(scene, { renderer, position = [0, 30, 28.5], onOpenLink, onNotify } = {}) {
    this.scene = scene;
    this.onOpenLink = onOpenLink || (() => {});
    this.onNotify = onNotify || (() => {});
    this.interactableObjects = [];
    this.maxInteractDistance = 18;
    this.tweens = [];
    this.loader = new THREE.TextureLoader();
    this.panels = {};
    this.state = {
      plate3Covered: false,
      sphinx: { phase: 'idle', t: 0, crowned: false },
      cards: { yellow: false, green: false },
      medals: { gold: false, silver: false, copper: false },
      lastMedal: null
    };

    this.clusters = {
      plates: { x: -2.4, title: 'GOLDEN PLATES', hint: 'Click Plate III' },
      cards: { x: -7.0, title: 'HARPS OF GOD', hint: 'Click a card to flip it' },
      sphinx: { x: 2.8, title: 'SPHINX & $1 PYRAMID', hint: 'Click CROWN & COUNT' },
      medals: { x: 6.8, title: 'RAFFLE MEDALLIONS', hint: 'Click a coin to flip it' }
    };

    this.group = new THREE.Group();
    this.group.position.set(position[0], position[1], position[2]);
    this.group.rotation.y = Math.PI; // relics face -z, toward the spawn point
    scene.add(this.group);
    this.worldPos = new THREE.Vector3();
    this.group.getWorldPosition(this.worldPos);

    this.initMaterials(renderer);
    this.buildPlatform();
    this.buildPlates();
    this.buildCards();
    this.buildSphinx();
    this.buildMedallions();
  }

  // ---------- Materials ----------
  initMaterials(renderer) {
    let envMap = null;
    try {
      if (renderer) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
      }
    } catch (e) {
      console.warn('RelicPavilion: environment map unavailable, using emissive fallback', e);
      envMap = null; // metals fall back to emissive lift below
    }
    const lift = envMap ? 0.22 : 0.45;
    this.mat = {
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x0c1220, metalness: 0.85, roughness: 0.3, envMap, envMapIntensity: 0.6 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.28, envMap, envMapIntensity: 1.3, emissive: 0x6b4a08, emissiveIntensity: lift }),
      silver: new THREE.MeshStandardMaterial({ color: 0xc8cfd9, metalness: 1, roughness: 0.25, envMap, envMapIntensity: 1.2, emissive: 0x333a44, emissiveIntensity: lift }),
      copper: new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 1, roughness: 0.3, envMap, envMapIntensity: 1.2, emissive: 0x4a2208, emissiveIntensity: lift }),
      emerald: new THREE.MeshStandardMaterial({ color: 0x00c66b, metalness: 0.2, roughness: 0.1, emissive: 0x00a050, emissiveIntensity: 0.6, envMap }),
      sapphire: new THREE.MeshStandardMaterial({ color: 0x1e50ff, metalness: 0.2, roughness: 0.1, emissive: 0x1030c0, emissiveIntensity: 0.6, envMap }),
      diamond: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.02, emissive: 0xbfe8ff, emissiveIntensity: 0.5, envMap }),
      accentCyan: new THREE.MeshBasicMaterial({ color: 0x00f0ff }),
      accentGold: new THREE.MeshBasicMaterial({ color: 0xffc400 })
    };
    this.envMap = envMap;

    // Local key lights over the pavilion (range-limited; the deck rig in ClubScene fills the rest)
    [-5.5, 0, 5.5].forEach((x) => {
      const light = new THREE.PointLight(0xfff4e0, 2.4, 12, 1.3);
      light.position.set(x, 3.4, 1.8);
      this.group.add(light);
    });
  }

  // ---------- Helpers ----------
  addInteractive(mesh, action, tooltip) {
    mesh.userData = { action, tooltip };
    this.interactableObjects.push(mesh);
    return mesh;
  }

  tween(obj, key, to, dur, onUpdate, onDone) {
    this.tweens = this.tweens.filter((t) => !(t.obj === obj && t.key === key)); // replace running tween
    this.tweens.push({ obj, key, from: obj[key], to, dur, t: 0, onUpdate, onDone });
  }

  makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return { canvas, ctx: canvas.getContext('2d') };
  }

  canvasTexture(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  loadTexture(url) {
    const tex = this.loader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // Small info placard for a cluster (tilted up toward the visitor in front of the display,
  // so it never hides the relic). Redrawn via updatePanel().
  makePanel(id, x, _unusedY, accentCss) {
    const { canvas, ctx } = this.makeCanvas(800, 320);
    const tex = this.canvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.88),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    mesh.position.set(x, 0.5, 1.7);
    mesh.rotation.x = -0.9;
    this.group.add(mesh);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.12), this.mat.darkMetal);
    stand.position.set(x, 0.1, 1.74);
    this.group.add(stand);
    this.panels[id] = { canvas, ctx, tex, accent: accentCss, mesh };
    return mesh;
  }

  updatePanel(id, { kicker, title, lines = [], status = '' }) {
    const p = this.panels[id];
    const { ctx, canvas } = p;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#050914'; // opaque so old text never ghosts through
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = p.accent;
    ctx.font = 'bold 28px monospace';
    ctx.fillText(kicker, 28, 50);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(title, 28, 108);
    ctx.fillStyle = '#c9d6f0';
    ctx.font = '28px sans-serif';
    lines.forEach((l, i) => ctx.fillText(l, 28, 156 + i * 38));
    if (status) {
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 34px monospace';
      ctx.fillText(status, 28, 290);
    }
    p.tex.needsUpdate = true;
  }

  // Button with a text label; returns the mesh
  makeButton(text, color, x, y, z, action, tooltip, w = 0.5, d = 0.22) {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.3 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), mat);
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    this.addInteractive(mesh, action, tooltip);

    const { canvas, ctx } = this.makeCanvas(256, 112);
    ctx.fillStyle = '#05070f';
    ctx.font = `bold ${text.length > 8 ? 36 : 48}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 58);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.92, d * 0.8),
      new THREE.MeshBasicMaterial({ map: this.canvasTexture(canvas), transparent: true })
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(x, y + 0.045, z);
    this.group.add(label);
    this.addInteractive(label, action, tooltip);
    return mesh;
  }

  // ---------- Platform ----------
  buildPlatform() {
    const base = new THREE.Mesh(new THREE.BoxGeometry(19.5, 0.04, 4.6), this.mat.darkMetal);
    base.position.set(0, 0.02, 0.3);
    this.group.add(base);
    [[0, 2.6, 19.5, 0.06], [0, -2.0, 19.5, 0.06]].forEach(([x, z, w, d]) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), this.mat.accentGold);
      strip.position.set(x, 0.05, z);
      this.group.add(strip);
    });
    // Title banner
    const { canvas, ctx } = this.makeCanvas(1600, 160);
    ctx.fillStyle = 'rgba(5, 9, 20, 0.96)';
    ctx.fillRect(0, 0, 1600, 160);
    ctx.strokeStyle = '#ffc400';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, 1590, 150);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText('DIGITAL RELICS: HARPS OF GOD & GOLDEN PLATES', 800, 82);
    ctx.fillStyle = '#ffc400';
    ctx.font = '34px monospace';
    ctx.fillText('Click or trigger any relic to see it work', 800, 130);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(8.0, 0.8),
      new THREE.MeshBasicMaterial({ map: this.canvasTexture(canvas), side: THREE.DoubleSide })
    );
    banner.position.set(-0.4, 4.05, -1.6);
    this.group.add(banner);
    [-4.3, 3.5].forEach((x) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.1, 8), this.mat.darkMetal);
      post.position.set(x, 2.05, -1.6);
      this.group.add(post);
    });
  }

  // ---------- Golden Plates ----------
  drawPlate(ctx, w, h, kind, covered = false) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#f6dc8a');
    g.addColorStop(0.45, '#c99a2e');
    g.addColorStop(1, '#8c6414');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // brushed streaks
    ctx.globalAlpha = 0.07;
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#3a2606';
      ctx.fillRect(0, (i * 7.3) % h, w, 1.5);
    }
    ctx.globalAlpha = 1;
    // bevelled border
    ctx.strokeStyle = 'rgba(70, 44, 6, 0.85)';
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.strokeStyle = 'rgba(255, 240, 190, 0.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, w - 52, h - 52);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ink = 'rgba(58, 36, 4, 0.95)';
    const result = { zero: null };

    if (kind === 1) {
      ctx.fillStyle = ink;
      ctx.font = 'bold 42px serif';
      ctx.fillText('PLATE I', w / 2, 90);
      ctx.font = 'bold 54px serif';
      ctx.fillText('UNIVERSE', w / 2, 175);
      ctx.font = 'bold 40px serif';
      ctx.fillText('MULTIVERSE PROOF', w / 2, 270);
      ctx.font = '40px serif';
      ctx.fillText('(1\u221E = 1\u221E)\u221E', w / 2, 360);
      ctx.fillText('\u21D4', w / 2, 425);
      ctx.fillText('(\u03B1\u221E = \u03C9\u221E)\u221E', w / 2, 490);
    } else if (kind === 2) {
      ctx.fillStyle = ink;
      ctx.font = 'bold 42px serif';
      ctx.fillText('PLATE II', w / 2, 90);
      ctx.font = 'bold 60px serif';
      ctx.fillText('ADVISOR', w / 2, 230);
      ctx.font = 'bold 120px serif';
      ctx.fillText('#1', w / 2, 360);
    } else {
      ctx.fillStyle = ink;
      ctx.font = 'bold 42px serif';
      ctx.fillText('PLATE III', w / 2, 90);
      // "ART $20"
      ctx.font = 'bold 66px serif';
      ctx.textAlign = 'left';
      let x = 70;
      const y1 = 230;
      ctx.fillText('ART $', x, y1);
      x += ctx.measureText('ART $').width;
      ctx.fillStyle = '#7a1f00';
      ctx.fillText('20', x, y1);
      // "MYSTERY $100"
      ctx.fillStyle = ink;
      ctx.font = 'bold 44px serif';
      let mx = 54;
      const y2 = 360;
      ctx.fillText('MYSTERY $', mx, y2);
      mx += ctx.measureText('MYSTERY $').width;
      ctx.font = 'bold 66px serif';
      ctx.fillStyle = covered ? '#0b7a3a' : ink; // the "1" is revealed once the zero is covered
      ctx.fillText('1', mx, y2);
      mx += ctx.measureText('1').width;
      ctx.fillStyle = '#7a1f00';
      const zw = ctx.measureText('0').width;
      ctx.fillText('0', mx, y2);
      result.zero = { x: mx + zw / 2, y: y2 };
      ctx.fillText('0', mx + zw, y2);
      ctx.textAlign = 'center';
      ctx.fillStyle = ink;
      ctx.font = '30px serif';
      ctx.fillText('"20" + "00" = 2000', w / 2, 470);
    }
    return result;
  }

  buildPlates() {
    const cx = this.clusters.plates.x;
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.55, 1.1), this.mat.darkMetal);
    pedestal.position.set(cx, 0.3, 0);
    this.group.add(pedestal);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.03, 1.12), this.mat.accentGold);
    edge.position.set(cx, 0.58, 0);
    this.group.add(edge);

    const pw = 0.95;
    const ph = pw * 1.25;
    const py = 0.6 + ph / 2 + 0.05;
    const gemMats = [this.mat.emerald, this.mat.sapphire, this.mat.diamond];
    this.plates = [];

    [1, 2, 3].forEach((kind, i) => {
      const x = cx + (i - 1) * 1.2;
      const { canvas, ctx } = this.makeCanvas(512, 640);
      const info = this.drawPlate(ctx, 512, 640, kind);
      const tex = this.canvasTexture(canvas);
      const face = new THREE.MeshStandardMaterial({
        map: tex, metalness: 0.7, roughness: 0.45, envMap: this.envMap, envMapIntensity: 1.1,
        emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: this.envMap ? 0.28 : 0.5
      });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.05), [this.mat.gold, this.mat.gold, this.mat.gold, this.mat.gold, face, this.mat.gold]);
      plate.position.set(x, py, 0);
      plate.rotation.y = (i - 1) * -0.1;
      this.group.add(plate);

      // Gem inlays at the corners
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy], gi) => {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), gemMats[(gi + i) % 3]);
        gem.position.set(sx * (pw / 2 - 0.1), sy * (ph / 2 - 0.1), 0.035);
        gem.scale.set(1, 1.3, 0.8);
        plate.add(gem);
      });

      this.plates.push({ kind, plate, canvas, ctx, tex, info, x });
    });

    // Plate III is the interactive one
    const p3 = this.plates[2];
    this.addInteractive(p3.plate, 'relic:plate3:toggle', 'Slide the Harp card over the zero');
    this.plate3 = p3;

    // Harp card overlay that slides over the zero of "$100"
    const cardW = 0.27;
    const cardH = cardW * 1.25;
    const cardTex = this.loadTexture('media/booths/relics/yellow_front.jpg');
    this.overlayCard = new THREE.Mesh(
      new THREE.PlaneGeometry(cardW, cardH),
      new THREE.MeshBasicMaterial({ map: cardTex }) // self-lit so the real card art keeps its colors
    );
    const cardFrame = new THREE.Mesh(new THREE.BoxGeometry(cardW + 0.02, cardH + 0.02, 0.012), this.mat.darkMetal);
    cardFrame.position.z = -0.008;
    this.overlayCard.add(cardFrame);
    p3.plate.add(this.overlayCard);
    this.addInteractive(this.overlayCard, 'relic:plate3:toggle', 'Slide the Harp card over the zero');

    // Convert canvas coords of the first "0" in "$100" to plate-local coordinates
    const z = p3.info.zero;
    this.zeroLocal = { x: (z.x / 512 - 0.5) * pw, y: (0.5 - z.y / 640) * ph };
    this.cardRestX = -pw / 2 + cardW / 2 + 0.06;
    this.cardRestY = -ph / 2 + cardH / 2 + 0.08;
    this.overlayCard.position.set(this.cardRestX, this.cardRestY, 0.05);
    this.overlayCard.userData.progress = 0;

    // Year badge + panel
    this.makePanel('plates', cx, 2.55, '#ffc400');
    this.makeButton('SLIDE', 0xffc400, cx + 1.2, 0.64, 0.62, 'relic:plate3:toggle', 'Slide card', 0.55, 0.24);
    this.refreshPlatesPanel();
  }

  refreshPlatesPanel() {
    const covered = this.state.plate3Covered;
    this.updatePanel('plates', {
      kicker: 'THE THREE GOLDEN PLATES',
      title: 'Plate III:  ' + (covered ? '2001' : '2000'),
      lines: [
        'Solid gold, inlaid with emerald, sapphire & diamond.',
        covered ? 'Card covers the zero: 2000 becomes 2001.' : 'Click Plate III: slide the Harp card over the zero.'
      ],
      status: covered ? 'YEAR: 2001' : 'YEAR: 2000'
    });
  }

  setPlate3Covered(covered) {
    this.state.plate3Covered = covered;
    const card = this.overlayCard;
    const targetX = this.zeroLocal.x;
    const targetY = this.zeroLocal.y;
    const p3 = this.plate3;
    // progress 0 -> 1 drives both axes
    const fromX = this.cardRestX;
    const fromY = this.cardRestY;
    this.tween(card.userData, 'progress', covered ? 1 : 0, 1.2, (p) => {
      card.position.x = fromX + (targetX - fromX) * p;
      card.position.y = fromY + (targetY - fromY) * p;
    }, () => {
      this.drawPlate(p3.ctx, 512, 640, 3, covered);
      p3.tex.needsUpdate = true;
      this.refreshPlatesPanel();
    });
    this.refreshPlatesPanel();
  }

  // ---------- Harps of God cards ----------
  buildCards() {
    const baseX = this.clusters.cards.x;
    const defs = [
      { id: 'yellow', x: baseX - 0.75, label: 'Y HARPS OF GOD', token: '492856', color: 0xffc400, front: 'yellow_front', back: 'yellow_back' },
      { id: 'green', x: baseX + 0.75, label: 'G HARPS-OF-GOD', token: '490643', color: 0x00ff88, front: 'green_front', back: 'green_back' }
    ];
    this.cards = {};

    defs.forEach((d) => {
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.9, 24), this.mat.darkMetal);
      pedestal.position.set(d.x, 0.47, 0);
      this.group.add(pedestal);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.02, 8, 32), new THREE.MeshBasicMaterial({ color: d.color }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(d.x, 0.93, 0);
      this.group.add(ring);

      const w = 0.62;
      const h = w * 1.25;
      const holder = new THREE.Group();
      holder.position.set(d.x, 0.95 + h / 2 + 0.1, 0);
      this.group.add(holder);

      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.03), this.mat.gold);
      holder.add(frame);
      const mk = (name, rotY) => {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ map: this.loadTexture(`media/booths/relics/${name}.jpg`) })
        );
        m.position.z = rotY ? -0.017 : 0.017;
        m.rotation.y = rotY;
        holder.add(m);
        this.addInteractive(m, `relic:${d.id}:flip`, `Flip ${d.label}`);
      };
      mk(d.front, 0);
      mk(d.back, Math.PI);
      this.addInteractive(frame, `relic:${d.id}:flip`, `Flip ${d.label}`);

      this.makeButton('BUY', d.color, d.x, 0.97, 0.56, `relic:${d.id}:link`, `Open ${d.label} on Rarible`, 0.46, 0.2);
      this.cards[d.id] = { ...d, holder, angle: 0, flipped: false, flipTween: { v: 0 } };
    });

    this.makePanel('cards', baseX, 2.9, '#ffc400');
    this.refreshCardsPanel();
  }

  refreshCardsPanel() {
    const y = this.state.cards.yellow;
    const g = this.state.cards.green;
    this.updatePanel('cards', {
      kicker: 'ERC-1155 DIGITAL TWIN NFTs',
      title: 'Harps of God',
      lines: [
        `Yellow Y #492856 (${y ? 'back' : 'front'})   Green G #490643 (${g ? 'back' : 'front'})`,
        'Raffle entry + VIP museum pass. Press BUY for Rarible.'
      ],
      status: 'CLICK A CARD TO FLIP'
    });
  }

  flipCard(id) {
    const c = this.cards[id];
    this.state.cards[id] = !this.state.cards[id];
    c.flipped = this.state.cards[id];
    const from = c.angle;
    const to = c.flipped ? Math.PI : 0;
    c.flipTween.v = 0;
    this.tween(c.flipTween, 'v', 1, 0.8, (p) => {
      c.angle = from + (to - from) * p;
    });
    this.refreshCardsPanel();
  }

  // ---------- Sphinx + $1 Unfinished Pyramid ----------
  buildSphinx() {
    const cx = this.clusters.sphinx.x;
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.85, 32), this.mat.darkMetal);
    table.position.set(cx, 0.45, 0);
    this.group.add(table);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.025, 8, 48), this.mat.accentGold);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, 0.88, 0);
    this.group.add(ring);

    // Unfinished pyramid: 7 stepped courses with a flat top (the capstone is missing)
    const pyramid = new THREE.Group();
    pyramid.position.set(cx, 0.9, 0);
    this.group.add(pyramid);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb8ab88, roughness: 0.8, metalness: 0.05, emissive: 0x5a4c30, emissiveIntensity: 0.55 });
    const courses = 7;
    for (let i = 0; i < courses; i++) {
      const size = 1.5 - i * 0.16;
      const step = new THREE.Mesh(new THREE.BoxGeometry(size, 0.12, size), stoneMat);
      step.position.y = 0.06 + i * 0.125;
      pyramid.add(step);
    }
    this.pyramidTopY = 0.9 + courses * 0.125;

    // Sphinx capstone: golden 4-sided cap with a tiny procedural sphinx
    const sphinx = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.36, 4), this.mat.gold);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = 0.18;
    sphinx.add(cap);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.14), this.mat.gold);
    body.position.set(0, 0.41, 0);
    sphinx.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), this.mat.gold);
    head.position.set(0.16, 0.5, 0);
    sphinx.add(head);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), this.mat.emerald);
    eye.position.set(0.21, 0.52, 0.04);
    sphinx.add(eye);
    [-0.05, 0.05].forEach((z) => {
      const paw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.04), this.mat.gold);
      paw.position.set(0.15, 0.37, z);
      sphinx.add(paw);
    });
    this.sphinxRestY = this.pyramidTopY + 0.85;
    this.sphinxCrownY = this.pyramidTopY - 0.02;
    sphinx.position.set(cx, this.sphinxRestY, 0);
    this.group.add(sphinx);
    this.sphinx = sphinx;
    sphinx.traverse((o) => { if (o.isMesh) this.addInteractive(o, 'relic:sphinx:count', 'Crown the pyramid and count 3 seconds'); });

    // Star streaks that stream past during the 2,000,000 mph count
    const streakCount = 70;
    const pos = new Float32Array(streakCount * 6);
    this.streakSeeds = [];
    for (let i = 0; i < streakCount; i++) {
      this.streakSeeds.push({
        x: (Math.random() - 0.5) * 5, y: 0.9 + Math.random() * 2.2, z: (Math.random() - 0.5) * 2.2,
        speed: 0.6 + Math.random() * 1.4
      });
    }
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.streakMat = new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0 });
    this.streaks = new THREE.LineSegments(streakGeo, this.streakMat);
    this.streaks.frustumCulled = false;
    this.streaks.position.set(cx, 0, 0);
    this.group.add(this.streaks);
    this.streakPhase = 0;

    this.makePanel('sphinx', cx, 2.9, '#ffc400');
    this.makeButton('CROWN & COUNT', 0xffc400, cx, 0.92, 1.0, 'relic:sphinx:count', 'Crown the pyramid and count', 1.0, 0.24);
    this.refreshSphinxPanel();
  }

  refreshSphinxPanel() {
    const s = this.state.sphinx;
    let counter = '';
    let status = '';
    if (s.phase === 'counting') {
      const t = Math.min(s.t, 3);
      const n = Math.min(3, Math.floor(t) + 1);
      counter = `${n}-1000`;
      status = `${(t * MILES_PER_SEC).toFixed(1)} mi`;
    } else if (s.phase === 'done') {
      counter = '3-1000';
      status = '3 s = 1,666.7 MILES';
    }
    this.updatePanel('sphinx', {
      kicker: '$1 BILL  |  UNFINISHED PYRAMID',
      title: counter ? `Counting:  ${counter}` : 'Sphinx Capstone',
      lines: ['At 2,000,000 mph the Sphinx travels', '555.56 miles every second.'],
      status: status || 'CLICK CROWN & COUNT'
    });
  }

  startSphinxCount() {
    const s = this.state.sphinx;
    if (s.phase === 'counting') return;
    if (s.phase === 'done') {
      // reset: lift the Sphinx back above the pyramid
      s.phase = 'idle';
      s.crowned = false;
      this.tween(this.sphinx.position, 'y', this.sphinxRestY, 0.9);
      this.refreshSphinxPanel();
      return;
    }
    s.phase = 'counting';
    s.t = 0;
    s.crowned = true;
    this.tween(this.sphinx.position, 'y', this.sphinxCrownY, 0.8, null);
    this.refreshSphinxPanel();
  }

  updateSphinx(delta) {
    const s = this.state.sphinx;
    if (s.phase === 'counting') {
      const prevN = Math.floor(s.t);
      s.t += delta;
      if (Math.floor(s.t) !== prevN || s.t === delta) this.refreshSphinxPanel();
      else if (Math.floor(s.t * 10) !== Math.floor((s.t - delta) * 10)) this.refreshSphinxPanel();
      if (s.t >= 3) {
        s.t = 3;
        s.phase = 'done';
        this.refreshSphinxPanel();
      }
    }
    // streak fade in/out
    const target = s.phase === 'counting' ? 0.85 : 0;
    this.streakMat.opacity += (target - this.streakMat.opacity) * Math.min(1, delta * 4);
    if (this.streakMat.opacity > 0.01) {
      this.streakPhase += delta;
      const arr = this.streaks.geometry.attributes.position.array;
      this.streakSeeds.forEach((sd, i) => {
        const x = ((sd.x + this.streakPhase * sd.speed * 6 + 2.5) % 5) - 2.5;
        const len = 0.35 + sd.speed * 0.35;
        arr[i * 6] = x; arr[i * 6 + 1] = sd.y; arr[i * 6 + 2] = sd.z;
        arr[i * 6 + 3] = x - len; arr[i * 6 + 4] = sd.y; arr[i * 6 + 5] = sd.z;
      });
      this.streaks.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ---------- Medallions ----------
  drawCoinFace(side, metal) {
    const { canvas, ctx } = this.makeCanvas(512, 512);
    const base = { gold: ['#f2d27a', '#a87a16'], silver: ['#eef1f6', '#8f98a6'], copper: ['#e09a62', '#7a4519'] }[metal];
    const g = ctx.createRadialGradient(200, 180, 30, 256, 256, 280);
    g.addColorStop(0, base[0]);
    g.addColorStop(1, base[1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(256, 256, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 24, 4, 0.7)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(256, 256, 232, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(40, 24, 4, 0.92)';
    if (side === 'front') {
      ctx.font = 'bold 40px serif';
      ctx.fillText('IN GOD WE TRUST', 256, 120);
      ctx.font = 'bold 150px serif';
      ctx.fillText('2013', 256, 262);
      ctx.font = 'bold 44px serif';
      ctx.fillText('LIBERTY', 256, 392);
      ctx.font = '28px serif';
      ctx.fillText('2 OZ ' + metal.toUpperCase(), 256, 446);
    } else {
      ctx.font = 'bold 34px serif';
      ctx.fillText('E PLURIBUS UNOM', 256, 100);
      for (let i = 0; i < 4; i++) ctx.fillRect(168 + i * 52, 160, 26, 160);
      ctx.font = 'bold 32px serif';
      ctx.fillText('ONE TRILLION DOLLAR', 256, 380);
      ctx.font = '26px serif';
      ctx.fillText('UNITED STATES OF AMERICA  11 11', 256, 430);
    }
    return this.canvasTexture(canvas);
  }

  buildMedallions() {
    const cx = this.clusters.medals.x;
    const metals = [
      { id: 'gold', x: cx - 1.0, mat: this.mat.gold, color: 0xffc400, label: 'GOLD' },
      { id: 'silver', x: cx, mat: this.mat.silver, color: 0xdfe6f0, label: 'SILVER' },
      { id: 'copper', x: cx + 1.0, mat: this.mat.copper, color: 0xe08a4a, label: 'COPPER' }
    ];
    this.coins = {};
    metals.forEach((m) => {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 20), this.mat.darkMetal);
      stand.position.set(m.x, 0.47, 0);
      this.group.add(stand);
      const holder = new THREE.Group();
      holder.position.set(m.x, 1.5, 0);
      this.group.add(holder);

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 48), m.mat);
      body.rotation.x = Math.PI / 2;
      holder.add(body);
      const faces = [['front', 0.032, 0], ['back', -0.032, Math.PI]];
      faces.forEach(([side, z, rotY]) => {
        const coinTex = this.drawCoinFace(side, m.id);
        const face = new THREE.Mesh(
          new THREE.CircleGeometry(0.375, 48),
          new THREE.MeshStandardMaterial({
            map: coinTex, metalness: 0.6, roughness: 0.4, envMap: this.envMap,
            envMapIntensity: 0.9, emissiveMap: coinTex, emissive: 0xffffff, emissiveIntensity: 0.4
          })
        );
        face.position.z = z;
        face.rotation.y = rotY;
        holder.add(face);
        this.addInteractive(face, `relic:${m.id}:flip`, `Flip the ${m.label} medallion`);
      });
      this.addInteractive(body, `relic:${m.id}:flip`, `Flip the ${m.label} medallion`);
      this.coins[m.id] = { ...m, holder, angle: 0, flipped: false, flipTween: { v: 0 } };
    });

    this.makePanel('medals', cx, 2.6, '#ffc400');
    this.refreshMedalsPanel();
  }

  refreshMedalsPanel() {
    const last = this.state.lastMedal;
    const names = { gold: 'GOLD', silver: 'SILVER', copper: 'COPPER' };
    this.updatePanel('medals', {
      kicker: 'GOOD FAITH PARADIGM RAFFLE',
      title: '2 oz Gold, Silver & Copper',
      lines: [
        'Front: IN GOD WE TRUST 2013.  Back: 11 11.',
        'Raffle entry comes with each Harps of God NFT.'
      ],
      status: last ? `${names[last]}: ${this.state.medals[last] ? 'REVERSE' : 'OBVERSE'}` : 'CLICK A COIN TO FLIP'
    });
  }

  flipCoin(id) {
    const c = this.coins[id];
    this.state.medals[id] = !this.state.medals[id];
    this.state.lastMedal = id;
    c.flipped = this.state.medals[id];
    const from = c.angle;
    const to = c.flipped ? Math.PI : 0;
    c.flipTween.v = 0;
    this.tween(c.flipTween, 'v', 1, 0.8, (p) => {
      c.angle = from + (to - from) * p;
    });
    this.refreshMedalsPanel();
  }

  // ---------- Interaction API ----------
  handleAction(action, playerPos) {
    if (typeof action !== 'string' || !action.startsWith('relic:')) return false;
    const [, id, cmd] = action.split(':');
    if (playerPos && playerPos.distanceTo(this.worldPos) > this.maxInteractDistance + 8) {
      this.onNotify('Walk closer to the relic pavilion');
      return true;
    }
    this.runCommand(id, cmd);
    return true;
  }

  runCommand(id, cmd) {
    if (id === 'plate3' && cmd === 'toggle') this.setPlate3Covered(!this.state.plate3Covered);
    else if (this.cards[id] && cmd === 'flip') this.flipCard(id);
    else if (this.cards[id] && cmd === 'link') this.onOpenLink(RARIBLE + this.cards[id].token);
    else if (id === 'sphinx' && cmd === 'count') this.startSphinxCount();
    else if (this.coins[id] && cmd === 'flip') this.flipCoin(id);
  }

  // World position the docent should stand at for a cluster
  getStandPoint(clusterId, out = new THREE.Vector3(), offsetX = 0) {
    const c = this.clusters[clusterId];
    out.set((c ? c.x : 0) + offsetX, 0, 2.6);
    return this.group.localToWorld(out);
  }

  // World position to point at for a target (plate3, yellow, green, sphinx, gold...)
  getFocusPos(id, out = new THREE.Vector3()) {
    let local = null;
    if (id === 'plate3') local = this.plate3.plate.position;
    else if (this.cards[id]) local = this.cards[id].holder.position;
    else if (id === 'sphinx') local = this.sphinx.position;
    else if (this.coins[id]) local = this.coins[id].holder.position;
    out.copy(local || new THREE.Vector3(0, 1.2, 0));
    return this.group.localToWorld(out);
  }

  getNearbyCluster(playerPos, radius = 3.6) {
    let best = null;
    let bestDist = radius;
    const tmp = new THREE.Vector3();
    Object.entries(this.clusters).forEach(([id, c]) => {
      tmp.set(c.x, 0, 0);
      this.group.localToWorld(tmp);
      const d = Math.hypot(playerPos.x - tmp.x, playerPos.z - tmp.z);
      if (d < bestDist) { best = { id, ...c }; bestDist = d; }
    });
    return best;
  }

  update(delta, time) {
    // Tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += delta;
      const p = Math.min(1, tw.t / tw.dur);
      const e = ease(p);
      tw.obj[tw.key] = tw.from + (tw.to - tw.from) * e;
      if (tw.onUpdate) tw.onUpdate(e);
      if (p >= 1) {
        this.tweens.splice(i, 1);
        if (tw.onDone) tw.onDone();
      }
    }

    // Cards: slow sway + flip angle
    Object.values(this.cards).forEach((c, i) => {
      c.holder.rotation.y = c.angle + Math.sin(time * 0.8 + i * 1.7) * 0.12;
    });
    // Coins: gentle spin offset around flip angle
    Object.values(this.coins).forEach((c, i) => {
      c.holder.rotation.y = c.angle + Math.sin(time * 0.9 + i) * 0.18;
      c.holder.position.y = 1.5 + Math.sin(time * 1.2 + i * 2) * 0.02;
    });
    // Idle hover for the Sphinx while not crowned
    if (!this.state.sphinx.crowned && this.tweens.every((t) => t.obj !== this.sphinx.position)) {
      this.sphinx.position.y = this.sphinxRestY + Math.sin(time * 1.4) * 0.04;
    }
    this.updateSphinx(delta);
  }
}
