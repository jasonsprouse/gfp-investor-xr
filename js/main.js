import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { AudioManager } from './audioManager.js';
import { ClubScene } from './clubScene.js';
import { XRControllerManager } from './xrController.js';
import { NPCManager } from './npcManager.js';
import { VTOLManager } from './vtolManager.js';
import { MobilityManager } from './mobilityManager.js';
import { BoothManager } from './boothManager.js';
import { RelicPavilion } from './relicPavilion.js';
import { DocentNPC } from './docentNPC.js';

class App {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.clock = new THREE.Clock();
    this.playerState = 'WALKING'; // 'WALKING', 'VTOL_PILOT', 'LAST_MILE_DRIVER'
    this.isAscending = false;

    this.initThree();
    this.initAudio();
    this.initScene();
    this.initXR();
    this.initDesktopControls();
    this.initHUD();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  initThree() {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05060b, 0.025);

    // 2. Camera & Dolly Rig (WebXR room-scale & locomotion)
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 1.6, 0);

    // Initial Spawn at Executive Pitch Skyport Observation Deck (y = 30)
    this.dolly = new THREE.Group();
    this.dolly.position.set(0, 30.0, 22.0);
    this.dolly.add(this.camera);
    this.scene.add(this.dolly);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // WebXR VR Button
    const vrButton = VRButton.createButton(this.renderer);
    document.body.appendChild(vrButton);

    this.renderer.xr.addEventListener('sessionstart', () => {
      document.getElementById('hud-overlay').style.display = 'none';
      document.getElementById('instructions-modal').classList.add('hidden');
      setTimeout(() => this.docent && this.docent.greet(), 2500);
    });

    this.renderer.xr.addEventListener('sessionend', () => {
      document.getElementById('hud-overlay').style.display = 'flex';
    });
  }

  initAudio() {
    this.audioManager = new AudioManager((track, isPlaying) => {
      this.updateHUDTrackInfo(track, isPlaying);
    });
  }

  initScene() {
    this.clubScene = new ClubScene(this.scene);
    this.npcManager = new NPCManager(this.scene);
    this.vtolManager = new VTOLManager(this.scene);
    this.mobilityManager = new MobilityManager(this.scene);
    this.boothManager = new BoothManager(this.scene, {
      onNarrationChange: (active) => this.setVoiceSource('booth', active),
      onOpenLink: (url) => this.openBoothLink(url),
      onNotify: (msg) => this.showHUDNotification(msg)
    });
    this.boothManager.interactableObjects.forEach(obj => this.clubScene.interactableObjects.push(obj));

    this.relicPavilion = new RelicPavilion(this.scene, {
      renderer: this.renderer,
      onOpenLink: (url) => this.openBoothLink(url),
      onNotify: (msg) => this.showHUDNotification(msg)
    });
    this.relicPavilion.interactableObjects.forEach(obj => this.clubScene.interactableObjects.push(obj));

    this.docent = new DocentNPC(this.scene, this.npcManager, {
      boothManager: this.boothManager,
      relicPavilion: this.relicPavilion,
      onVoiceChange: (active) => this.setVoiceSource('docent', active),
      onNotify: (msg) => this.showHUDNotification(msg)
    });
    this.docent.interactableObjects.forEach(obj => this.clubScene.interactableObjects.push(obj));

    // Register vehicle interactable hitboxes
    if (this.vtolManager.interactableObjects) {
      this.vtolManager.interactableObjects.forEach(obj => this.clubScene.interactableObjects.push(obj));
    }
    if (this.mobilityManager.interactableObjects) {
      this.mobilityManager.interactableObjects.forEach(obj => this.clubScene.interactableObjects.push(obj));
    }

    this.audioManager.attachRoomVideo(this.clubScene.roomVideo);
    if (this.clubScene.roomVideo) {
      this.clubScene.roomVideo.addEventListener('ended', () => {
        this.handleAction('next');
      });
    }
  }

  initXR() {
    this.xrController = new XRControllerManager(
      this.renderer,
      this.scene,
      this.camera,
      this.dolly,
      this.clubScene.interactableObjects,
      (action) => this.handleAction(action)
    );
  }

  initDesktopControls() {
    this.controls = new PointerLockControls(this.camera, document.body);
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    const reticle = document.getElementById('reticle');

    // Click canvas to lock pointer
    this.container.addEventListener('click', () => {
      if (!this.renderer.xr.isPresenting && !this.controls.isLocked) {
        this.controls.lock();
      } else if (this.controls.isLocked) {
        this.performDesktopRaycast();
      }
    });

    this.controls.addEventListener('lock', () => {
      reticle.style.display = 'block';
    });

    this.controls.addEventListener('unlock', () => {
      reticle.style.display = 'none';
    });

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.moveForward = true; break;
        case 'KeyS': case 'ArrowDown': this.moveBackward = true; break;
        case 'KeyA': case 'ArrowLeft': this.moveLeft = true; break;
        case 'KeyD': case 'ArrowRight': this.moveRight = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.isSprinting = true; break;
        case 'KeyE':
          this.toggleVehicleBoarding();
          break;
        case 'KeyZ':
          if (this.playerState === 'WALKING' && this.boothManager) this.boothManager.commandNearest('prev', this.dolly.position);
          break;
        case 'KeyX':
          if (this.playerState === 'WALKING' && this.boothManager) this.boothManager.commandNearest('toggle', this.dolly.position);
          break;
        case 'KeyC':
          if (this.playerState === 'WALKING' && this.boothManager) this.boothManager.commandNearest('next', this.dolly.position);
          break;
        case 'KeyV':
          if (this.playerState === 'WALKING' && this.boothManager) this.boothManager.commandNearest('auto', this.dolly.position);
          break;
        case 'KeyL':
          if (this.playerState === 'WALKING' && this.boothManager) this.boothManager.commandNearest('link', this.dolly.position);
          break;
        case 'KeyB':
          if (this.playerState === 'WALKING' && this.boothManager) this.boothManager.commandNearest('view', this.dolly.position);
          break;
        case 'KeyT':
          if (this.playerState === 'WALKING' && this.docent) {
            if (this.docent.touring) this.docent.stop(true);
            else this.docent.startTour();
          }
          break;
        case 'KeyH':
          if (this.playerState === 'WALKING' && this.docent) this.docent.explainNearest(this.dolly.position);
          break;
        case 'Space':
          if (this.playerState === 'VTOL_PILOT') {
            this.isAscending = true;
          } else {
            this.handleAction('play');
          }
          break;
        case 'KeyN':
          this.handleAction('next');
          break;
        case 'KeyP':
          this.handleAction('prev');
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.moveForward = false; break;
        case 'KeyS': case 'ArrowDown': this.moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft': this.moveLeft = false; break;
        case 'KeyD': case 'ArrowRight': this.moveRight = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.isSprinting = false; break;
        case 'Space':
          this.isAscending = false;
          break;
      }
    });

    this.desktopRaycaster = new THREE.Raycaster();
  }

  performDesktopRaycast() {
    this.desktopRaycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const intersects = this.desktopRaycaster.intersectObjects(this.clubScene.interactableObjects, true);
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      this.handleAction(hit.userData.action);
    }
  }

  selectTrack(idx) {
    if (idx < 0) idx = this.audioManager.playlist.length - 1;
    if (idx >= this.audioManager.playlist.length) idx = 0;

    this.audioManager.resumeAudioContext();
    this.audioManager.currentIndex = idx;
    this.audioManager.isPlaying = true;

    // Play video directly on in-room 3D Cinema Screen
    const track = this.clubScene.playTrackIndex(idx);

    // Ensure 3D screen is showing video texture if user toggled to visualizer
    const screenSourceBtn = document.getElementById('btn-screen-source');
    if (screenSourceBtn) {
      screenSourceBtn.innerHTML = '<i class="fas fa-film"></i> 3D Screen: Video';
      screenSourceBtn.classList.add('active');
    }

    // Update 2D HUD track info and in-VR controller remote
    this.updateHUDTrackInfo(track, true);
    if (this.xrController) {
      this.xrController.renderHandheldRemote(track.title, true);
    }
  }

  handleAction(action) {
    if (typeof action === 'string' && action.startsWith('relic:')) {
      if (this.relicPavilion) this.relicPavilion.handleAction(action, this.dolly.position);
      return;
    }
    if (typeof action === 'string' && action.startsWith('docent:')) {
      if (this.docent) this.docent.handleAction(action, this.dolly.position);
      return;
    }
    if (typeof action === 'string' && action.startsWith('booth:')) {
      if (this.boothManager) this.boothManager.handleAction(action, this.dolly.position);
      return;
    }
    if (action === 'play' || action === 'toggleVideo') {
      if (this.clubScene.isVideoPlaying) {
        this.clubScene.pauseVideo();
        this.audioManager.isPlaying = false;
        const current = this.audioManager.getCurrentTrack();
        this.updateHUDTrackInfo(current, false);
        if (this.xrController) this.xrController.renderHandheldRemote(current.title, false);
      } else {
        this.audioManager.resumeAudioContext();
        this.clubScene.playVideo();
        this.audioManager.isPlaying = true;
        const current = this.audioManager.getCurrentTrack();
        this.updateHUDTrackInfo(current, true);
        if (this.xrController) this.xrController.renderHandheldRemote(current.title, true);
      }
    } else if (action === 'next') {
      const nextIdx = (this.audioManager.currentIndex + 1) % this.audioManager.playlist.length;
      this.selectTrack(nextIdx);
    } else if (action === 'prev') {
      const prevIdx = (this.audioManager.currentIndex - 1 + this.audioManager.playlist.length) % this.audioManager.playlist.length;
      this.selectTrack(prevIdx);
    } else if (action === 'board_vtol') {
      this.playerState = 'VTOL_PILOT';
      if (this.vtolManager) this.vtolManager.isPiloting = true;
      this.showHUDNotification('✈ eVTOL COCKPIT BOARDED — PREPARING FOR SKYWAY CRUISE');
    } else if (action === 'board_rover') {
      this.playerState = 'LAST_MILE_DRIVER';
      if (this.mobilityManager) this.mobilityManager.isDriving = true;
      this.showHUDNotification('🚗 LAST-MILE POD BOARDED — READY FOR BOULEVARD TRANSIT');
    } else if (action === 'exit_vehicle') {
      if (this.playerState === 'VTOL_PILOT' && this.vtolManager) {
        this.vtolManager.isPiloting = false;
        this.dolly.position.copy(this.vtolManager.getDisembarkWorldPosition());
        this.playerState = 'WALKING';
        this.showHUDNotification('DISEMBARKED ONTO HELIPAD');
      } else if (this.playerState === 'LAST_MILE_DRIVER' && this.mobilityManager) {
        this.mobilityManager.isDriving = false;
        this.dolly.position.copy(this.mobilityManager.getDisembarkWorldPosition());
        this.playerState = 'WALKING';
        this.showHUDNotification('DISEMBARKED ONTO SIDEWALK');
      }
    } else if (action === 'inspect_plinth') {
      this.showHUDNotification('GOOD FAITH PARADIGM INVESTOR PILLAR INSPECTED');
    }
  }

  setVoiceSource(source, active) {
    if (!this.voiceSources) this.voiceSources = new Set();
    if (active) this.voiceSources.add(source);
    else this.voiceSources.delete(source);
    this.audioManager.setDucked(this.voiceSources.size > 0);
  }

  openBoothLink(url) {
    if (!url) return;
    if (this.renderer.xr.isPresenting) {
      this.showHUDNotification('Link: ' + url.replace(/^https?:\/\//, ''));
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  toggleVehicleBoarding() {
    if (this.playerState === 'VTOL_PILOT' || this.playerState === 'LAST_MILE_DRIVER') {
      this.handleAction('exit_vehicle');
    } else {
      const vtolDist = this.vtolManager ? this.dolly.position.distanceTo(this.vtolManager.vtolGroup.position) : 999;
      const roverDist = this.mobilityManager ? this.dolly.position.distanceTo(this.mobilityManager.roverGroup.position) : 999;

      if (vtolDist < 6.5) {
        this.handleAction('board_vtol');
      } else if (roverDist < 5.5) {
        this.handleAction('board_rover');
      }
    }
  }

  showHUDNotification(msg) {
    let notifyEl = document.getElementById('hud-notification');
    if (!notifyEl) {
      notifyEl = document.createElement('div');
      notifyEl.id = 'hud-notification';
      document.body.appendChild(notifyEl);
    }
    notifyEl.textContent = msg;
    notifyEl.classList.add('show');
    clearTimeout(this.notifyTimeout);
    this.notifyTimeout = setTimeout(() => {
      notifyEl.classList.remove('show');
    }, 3800);
  }

  initHUD() {
    const playBtn = document.getElementById('btn-play');
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const volSlider = document.getElementById('volume-slider');
    const laserBtn = document.getElementById('btn-laser');
    const strobeBtn = document.getElementById('btn-strobe');
    const modeBtn = document.getElementById('btn-mode');
    const startBtn = document.getElementById('btn-start-club');
    const modal = document.getElementById('instructions-modal');
    const playlistToggle = document.getElementById('btn-playlist-toggle');
    const playlistDrawer = document.getElementById('playlist-drawer');
    const playlistClose = document.getElementById('btn-close-playlist');
    const playlistItems = document.getElementById('playlist-items');
    const screenSourceBtn = document.getElementById('btn-screen-source');

    // 1. In-Room 3D Cinema Screen Toggle (Switch between In-Room Video and Spectrum Visualizer)
    let screenIsVideo = true;
    screenSourceBtn?.addEventListener('click', () => {
      screenIsVideo = !screenIsVideo;
      if (screenIsVideo) {
        this.clubScene.screenMat.map = this.clubScene.videoTexture;
        this.clubScene.playVideo();
        this.audioManager.isPlaying = true;
        screenSourceBtn.innerHTML = '<i class="fas fa-film"></i> 3D Screen: Video';
        screenSourceBtn.classList.add('active');
        this.updateHUDTrackInfo(this.audioManager.getCurrentTrack(), true);
      } else {
        this.clubScene.screenMat.map = this.clubScene.screenTexture;
        this.clubScene.pauseVideo();
        screenSourceBtn.innerHTML = '<i class="fas fa-sliders-h"></i> 3D Screen: Visualizer';
        screenSourceBtn.classList.remove('active');
      }
      this.clubScene.screenMat.needsUpdate = true;
    });

    // 2. Build Unified Tracklist Drawer for ALL 13 Good Faith Paradigm tracks
    if (playlistItems) {
      playlistItems.innerHTML = '';

      const vHeader = document.createElement('div');
      vHeader.className = 'playlist-section-header';
      vHeader.innerHTML = '<i class="fas fa-film" style="color:#00f0ff; margin-right:6px;"></i> 3D CINEMA MUSIC VIDEOS (13 TRACKS)';
      playlistItems.appendChild(vHeader);

      this.audioManager.playlist.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = `playlist-row ${idx === this.audioManager.currentIndex ? 'active' : ''}`;
        row.setAttribute('data-index', idx);
        row.innerHTML = `
          <span class="pl-idx">${String(idx + 1).padStart(2, '0')}</span>
          <img class="pl-thumb" src="${item.thumb}" alt="${item.title}">
          <div class="pl-meta">
            <div class="pl-title">${item.title}</div>
            <div class="pl-type">${item.type} <span style="color:#00f0ff; font-weight:700; margin-left:4px;">• 3D Screen</span></div>
          </div>
          <span class="pl-play-icon"><i class="fas ${idx === this.audioManager.currentIndex && this.audioManager.isPlaying ? 'fa-volume-high' : 'fa-play'}" style="color:${idx === this.audioManager.currentIndex ? '#00f0ff' : '#8e95aa'}; font-size:11px;"></i></span>
        `;
        row.addEventListener('click', () => {
          this.selectTrack(idx);
          playlistDrawer.classList.add('hidden');
        });
        playlistItems.appendChild(row);
      });
    }

    playlistToggle?.addEventListener('click', () => {
      playlistDrawer?.classList.toggle('hidden');
    });

    playlistClose?.addEventListener('click', () => {
      playlistDrawer?.classList.add('hidden');
    });

    // Stage Video Screen Controls
    const videoFrame = document.getElementById('stage-video-frame');
    const btnVideoToggle = document.getElementById('btn-video-toggle');
    let videoMode = 'stage';

    const setVideoMode = (mode) => {
      videoMode = mode;
      if (videoFrame) videoFrame.className = `video-mode-${mode}`;
      if (mode === 'stage') {
        if (btnVideoToggle) {
          btnVideoToggle.innerHTML = '<i class="fas fa-tv"></i> Video: Stage';
          btnVideoToggle.classList.add('active');
        }
      } else if (mode === 'pip') {
        if (btnVideoToggle) {
          btnVideoToggle.innerHTML = '<i class="fas fa-clone"></i> Video: PIP';
          btnVideoToggle.classList.add('active');
        }
      } else {
        if (btnVideoToggle) {
          btnVideoToggle.innerHTML = '<i class="fas fa-eye-slash"></i> Video: OFF';
          btnVideoToggle.classList.remove('active');
        }
      }
    };

    btnVideoToggle?.addEventListener('click', () => {
      if (videoMode === 'stage') setVideoMode('pip');
      else if (videoMode === 'pip') setVideoMode('hidden');
      else setVideoMode('stage');
    });

    document.getElementById('btn-video-pip')?.addEventListener('click', () => setVideoMode('pip'));
    document.getElementById('btn-video-stage')?.addEventListener('click', () => setVideoMode('stage'));
    document.getElementById('btn-video-hide')?.addEventListener('click', () => setVideoMode('hidden'));

    // Start / Dismiss modal
    startBtn?.addEventListener('click', () => {
      modal?.classList.add('hidden');
      this.selectTrack(0);
      this.controls.lock();
      setTimeout(() => this.docent && this.docent.greet(), 1800);
    });

    // Player Controls
    playBtn?.addEventListener('click', () => this.handleAction('play'));
    prevBtn?.addEventListener('click', () => this.handleAction('prev'));
    nextBtn?.addEventListener('click', () => this.handleAction('next'));

    volSlider?.addEventListener('input', (e) => {
      this.audioManager.setVolume(parseInt(e.target.value));
    });

    // FX Controls
    laserBtn?.addEventListener('click', () => {
      this.clubScene.lasersEnabled = !this.clubScene.lasersEnabled;
      laserBtn.classList.toggle('active', this.clubScene.lasersEnabled);
    });

    strobeBtn?.addEventListener('click', () => {
      this.clubScene.strobesEnabled = !this.clubScene.strobesEnabled;
      strobeBtn.classList.toggle('active', this.clubScene.strobesEnabled);
    });

    modeBtn?.addEventListener('click', () => {
      this.clubScene.visualizerMode = (this.clubScene.visualizerMode + 1) % 2;
      modeBtn.innerHTML = `<i class="fas fa-sliders-h"></i> ${this.clubScene.visualizerMode === 0 ? 'Mode: Spectrum' : 'Mode: Tunnel'}`;
    });

    // View Presets
    document.querySelectorAll('.btn-preset').forEach((btn) => {
      btn?.addEventListener('click', (e) => {
        const view = e.target.getAttribute('data-view');
        this.teleportToPreset(view);
      });
    });
  }

  teleportToPreset(view) {
    if (this.playerState !== 'WALKING') {
      this.handleAction('exit_vehicle');
    }

    if (view && view.startsWith('booth:') && this.boothManager) {
      const booth = this.boothManager.getBooth(view.split(':')[1]);
      if (booth) {
        const stand = this.boothManager.getStandPoint(booth);
        this.dolly.position.set(stand.x, this.dolly.position.y, stand.z);
        const look = booth.group.localToWorld(new THREE.Vector3(0, 2.1, -1.9));
        this.camera.lookAt(look);
      }
      return;
    }

    if (view === 'skyport') {
      this.dolly.position.set(0, 30.0, 22);
      this.camera.lookAt(0, 34.0, 12);
    } else if (view === 'relics') {
      this.dolly.position.set(0, 30.0, 22.4);
      this.camera.lookAt(0, 31.3, 28.5);
    } else if (view === 'docent') {
      this.dolly.position.set(0, 30.0, 20.6);
      this.camera.lookAt(0.6, 31.3, 16.0);
    } else if (view === 'vtol') {
      this.handleAction('board_vtol');
    } else if (view === 'vertiport') {
      this.dolly.position.set(0, 5.2, -135);
      this.camera.lookAt(0, 5.2, -50);
    } else if (view === 'rover') {
      this.handleAction('board_rover');
    } else if (view === 'floor') {
      this.dolly.position.set(0, 0, 3);
      this.camera.lookAt(0, 2, -14);
    } else if (view === 'dj') {
      this.dolly.position.set(0, 1.1, -13.5);
      this.camera.lookAt(0, 2, 8);
    } else if (view === 'amphi') {
      this.dolly.position.set(24, 0, 12);
      this.camera.lookAt(24, 2, 0);
    } else if (view === 'showroom') {
      this.dolly.position.set(-24, 0, 12);
      this.camera.lookAt(-24, 2, 0);
    } else if (view === 'lounge') {
      this.dolly.position.set(-9, 0, 6);
      this.camera.lookAt(0, 1.5, -5);
    } else if (view === 'bar') {
      this.dolly.position.set(9, 0, 4);
      this.camera.lookAt(12, 1.5, 4);
    }
  }

  updateHUDTrackInfo(track, isPlaying) {
    if (!track) return;
    const playIcon = document.querySelector('#btn-play i');
    if (playIcon) {
      playIcon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
    }
    const titleEl = document.getElementById('track-title');
    const badgeEl = document.getElementById('track-badge');
    const thumbEl = document.getElementById('track-thumb-img');

    if (titleEl) titleEl.textContent = track.title;
    if (badgeEl) badgeEl.textContent = track.type;
    if (thumbEl) thumbEl.src = track.thumb;

    const videoTitleEl = document.getElementById('video-screen-title');
    if (videoTitleEl) videoTitleEl.textContent = `${track.title} • @GparadigmOrgLove`;

    // Highlight active in tracklist drawer & update icons
    const rows = document.querySelectorAll('.playlist-row');
    rows.forEach((r) => {
      const idx = parseInt(r.getAttribute('data-index'));
      const isCurrent = (idx === this.audioManager.currentIndex);
      r.classList.toggle('active', isCurrent);
      const icon = r.querySelector('.pl-play-icon i');
      if (icon) {
        if (isCurrent && isPlaying) {
          icon.className = 'fas fa-volume-high';
          icon.style.color = '#00f0ff';
        } else if (isCurrent) {
          icon.className = 'fas fa-pause';
          icon.style.color = '#ff007f';
        } else {
          icon.className = 'fas fa-play';
          icon.style.color = '#8e95aa';
        }
      }
    });

    if (this.xrController) {
      this.xrController.renderHandheldRemote(track.title, isPlaying, this.playerState);
    }
  }

  updateDesktopMovement(delta) {
    if (!this.controls.isLocked) return;

    const speed = (this.isSprinting ? 12 : 6) * delta;
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    if (this.moveForward || this.moveBackward) {
      this.velocity.z -= this.direction.z * speed * 40;
    }
    if (this.moveLeft || this.moveRight) {
      this.velocity.x -= this.direction.x * speed * 40;
    }

    this.controls.moveRight(-this.velocity.x * delta);
    this.controls.moveForward(-this.velocity.z * delta);

    // Multi-tier campus boundaries
    if (this.dolly.position.y >= 20.0) {
      // Skyport Observation Deck
      this.dolly.position.x = Math.max(-16, Math.min(16, this.dolly.position.x));
      this.dolly.position.z = Math.max(10, Math.min(44, this.dolly.position.z));
      this.dolly.position.y = 30.0;
    } else {
      // Vertiport Bravo, Promenade & Entertainment Venues
      this.dolly.position.x = Math.max(-32, Math.min(32, this.dolly.position.x));
      this.dolly.position.z = Math.max(-152, Math.min(26, this.dolly.position.z));
      if (this.dolly.position.z < 22 && this.dolly.position.z >= -135) {
        this.dolly.position.y = 5.0;
      } else if (this.dolly.position.z >= 22) {
        this.dolly.position.y = 0.0;
      }
    }
  }

  start() {
    this.renderer.setAnimationLoop((time, frame) => {
      const delta = Math.min(this.clock.getDelta(), 0.1);
      const t = this.clock.getElapsedTime();

      this.audioManager.updateAudioData();
      this.clubScene.update(delta, t, this.audioManager);
      if (this.npcManager) {
        this.npcManager.update(delta, t, this.audioManager);
      }

      // Update VTOL Flight & Ground Mobility
      if (this.relicPavilion) {
        this.relicPavilion.update(delta, t);
      }
      if (this.docent) {
        this.docent.update(delta, t, this.dolly.position);
      }
      if (this.boothManager) {
        this.boothManager.update(delta, t, this.dolly.position, this.audioManager);
      }
      if (this.vtolManager) {
        const vtolThrust = (this.moveForward || this.isAscending);
        this.vtolManager.updateFlight(delta, t, null, vtolThrust, null);
      }

      if (this.mobilityManager) {
        let throttle = 0;
        let steer = 0;
        if (this.playerState === 'LAST_MILE_DRIVER') {
          if (this.moveForward) throttle += 1.0;
          if (this.moveBackward) throttle -= 0.6;
          if (this.moveLeft) steer -= 1.0;
          if (this.moveRight) steer += 1.0;
        }
        this.mobilityManager.updateDriving(delta, throttle, steer);
      }

      // Lock Dolly to Cockpit when mounted
      if (this.playerState === 'VTOL_PILOT' && this.vtolManager) {
        this.dolly.position.copy(this.vtolManager.getCockpitSeatWorldPosition());
      } else if (this.playerState === 'LAST_MILE_DRIVER' && this.mobilityManager) {
        this.dolly.position.copy(this.mobilityManager.getDriverSeatWorldPosition());
      }

      if (this.renderer.xr.isPresenting) {
        const curVideo = this.clubScene.getCurrentVideo();
        this.xrController.update(
          delta,
          this.clubScene.walkableFloors,
          curVideo ? curVideo.title : '',
          this.clubScene.isVideoPlaying,
          this.playerState,
          (isLeft, stickX, stickY, triggerPressed) => {
            this.handleVRVehicleInput(isLeft, stickX, stickY, triggerPressed);
          }
        );
      } else {
        if (this.playerState === 'WALKING') {
          this.updateDesktopMovement(delta);
        }
        this.pollDesktopGamepad();
      }

      this.updateTelemetryHUD();
      this.renderer.render(this.scene, this.camera);
    });
  }

  handleVRVehicleInput(isLeft, stickX, stickY, triggerPressed) {
    if (this.playerState === 'VTOL_PILOT' && this.vtolManager) {
      if (isLeft) {
        if (Math.abs(stickY) > 0.15) {
          this.vtolManager.targetAirspeed = Math.max(0, -stickY * this.vtolManager.maxAirspeed);
        }
      } else {
        if (Math.abs(stickX) > 0.15) {
          this.vtolManager.vtolGroup.rotation.y -= stickX * 0.04;
        }
      }
    } else if (this.playerState === 'LAST_MILE_DRIVER' && this.mobilityManager) {
      let throttle = 0;
      let steer = 0;
      if (isLeft) {
        throttle = -stickY;
      } else {
        steer = stickX;
      }
      this.mobilityManager.updateDriving(0.016, throttle, steer);
    }
  }

  updateTelemetryHUD() {
    let hud = document.getElementById('vehicle-telemetry-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'vehicle-telemetry-hud';
      hud.className = 'telemetry-badge';
      document.body.appendChild(hud);
    }

    if (this.playerState === 'VTOL_PILOT' && this.vtolManager) {
      hud.style.display = 'block';
      const spd = (this.vtolManager.airspeed * 3.6).toFixed(0);
      const alt = this.vtolManager.vtolGroup.position.y.toFixed(1);
      hud.innerHTML = `<span class="badge-icon">✈</span> <strong>eVTOL FLIGHT</strong> &bull; ALT: ${alt}m &bull; SPD: ${spd} km/h <span class="badge-hint">[E: EXIT]</span>`;
    } else if (this.playerState === 'LAST_MILE_DRIVER' && this.mobilityManager) {
      hud.style.display = 'block';
      const spd = (this.mobilityManager.speed * 3.6).toFixed(0);
      hud.innerHTML = `<span class="badge-icon">🚗</span> <strong>GROUND ROVER</strong> &bull; SPD: ${spd} km/h <span class="badge-hint">[E: EXIT]</span>`;
    } else {
      const vtolDist = this.vtolManager ? this.dolly.position.distanceTo(this.vtolManager.vtolGroup.position) : 999;
      const roverDist = this.mobilityManager ? this.dolly.position.distanceTo(this.mobilityManager.roverGroup.position) : 999;

      if (vtolDist < 6.5) {
        hud.style.display = 'block';
        hud.innerHTML = `<span class="badge-icon">✈</span> <strong>AERO-VTOL READY</strong> &bull; <span class="badge-action">PRESS [E] OR CLICK TO BOARD</span>`;
      } else if (roverDist < 5.5) {
        hud.style.display = 'block';
        hud.innerHTML = `<span class="badge-icon">🚗</span> <strong>LAST-MILE POD READY</strong> &bull; <span class="badge-action">PRESS [E] OR CLICK TO DRIVE</span>`;
      } else {
        const booth = this.boothManager ? this.boothManager.getNearbyBooth(this.dolly.position, 7.5) : null;
        const cluster = this.relicPavilion ? this.relicPavilion.getNearbyCluster(this.dolly.position, 3.6) : null;
        if (booth) {
          hud.style.display = 'block';
          const hasNarr = booth.def.narration;
          const viewHint = booth.views && booth.views.length > 1 ? ' &nbsp;[B] VIEW' : '';
          hud.innerHTML = `<span class="badge-icon">\u{1F4FD}</span> <strong>${booth.def.title}</strong> &bull; <span class="badge-action">${hasNarr ? '[X] NARRATE' : '[X] NEXT'} &nbsp;[Z] PREV &nbsp;[C] NEXT${viewHint} &nbsp;[L] LINK &nbsp;[H] DOCENT</span>`;
        } else if (cluster) {
          hud.style.display = 'block';
          hud.innerHTML = `<span class="badge-icon">\u2728</span> <strong>${cluster.title}</strong> &bull; <span class="badge-action">${cluster.hint.toUpperCase()} &nbsp;[H] DOCENT EXPLAINS</span>`;
        } else if (this.docent && this.docent.isNearKiosk(this.dolly.position)) {
          hud.style.display = 'block';
          hud.innerHTML = `<span class="badge-icon">\u{1F9ED}</span> <strong>DOCENT LUX</strong> &bull; <span class="badge-action">[T] TOUR &nbsp;[H] EXPLAIN NEAREST &nbsp;OR USE THE KIOSK</span>`;
        } else {
          hud.style.display = 'none';
        }
      }
    }
  }

  // Support for standard Bluetooth / USB Gamepads (Xbox, PlayStation, etc.)
  pollDesktopGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];
    if (!gp) return;

    if (!this.lastGpButtons) this.lastGpButtons = {};

    const isDown = (idx) => gp.buttons[idx] && (gp.buttons[idx].pressed || gp.buttons[idx].value > 0.5);

    // Button 0 (A / Cross): Play / Pause
    if (isDown(0) && !this.lastGpButtons[0]) {
      this.handleAction('play');
    }
    // Button 1 (B / Circle): Next Video
    if (isDown(1) && !this.lastGpButtons[1]) {
      this.handleAction('next');
    }
    // Button 2 (X / Square): Prev Video
    if (isDown(2) && !this.lastGpButtons[2]) {
      this.handleAction('prev');
    }
    // D-Pad Left (14) / Right (15)
    if (isDown(14) && !this.lastGpButtons[14]) {
      this.handleAction('prev');
    }
    if (isDown(15) && !this.lastGpButtons[15]) {
      this.handleAction('next');
    }

    // Save states
    for (let i = 0; i < gp.buttons.length; i++) {
      this.lastGpButtons[i] = isDown(i);
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  try {
    const app = new App();
    app.start();
    window.__gfpApp = app; // handy for debugging in the console

    // Optional dev/QA query parameters, e.g. ?clean=1&view=relics&do=relic:plate3:toggle
    //   clean=1        hide the welcome modal and HUD (clean screenshots)
    //   view=<preset>  teleport on load (skyport, relics, docent, floor, booth:<id>, ...)
    //   do=a,b,c       run actions (booth:/relic:/docent:/play...) shortly after load;
    //                  advance:<seconds> fast-forwards relic/docent/booth animations (software-GL QA runs slowly)
    const q = new URLSearchParams(window.location.search);
    if (q.get('clean')) {
      document.getElementById('instructions-modal')?.classList.add('hidden');
      const hud = document.getElementById('hud-overlay');
      if (hud) hud.style.display = 'none';
    }
    if (q.get('view')) app.teleportToPreset(q.get('view'));
    if (q.get('voice') === '0' && app.docent) app.docent.synth = null; // captions only (no speech synthesis)
    if (q.get('do')) {
      setTimeout(() => q.get('do').split(',').forEach((a) => {
        const act = a.trim();
        if (act.startsWith('advance:')) {
          const total = parseFloat(act.split(':')[1]) || 0;
          for (let s = 0; s < total; s += 0.1) {
            app.relicPavilion.update(0.1, s);
            app.docent.update(0.1, s, app.dolly.position);
            app.boothManager.update(0.1, s, app.dolly.position, app.audioManager);
          }
        } else {
          app.handleAction(act);
        }
      }), 1500);
    }
  } catch (err) {
    console.error("Initialization error:", err);
    const box = document.getElementById('debug-error-box');
    if (box) {
      box.style.display = 'block';
      box.textContent += '❌ [Startup Crash] ' + (err.stack || err) + '\n';
    }
  }
});
