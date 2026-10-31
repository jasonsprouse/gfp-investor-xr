// Audio Manager for Good Faith Paradigm (@GparadigmOrgLove) VR Club
export const PLAYLIST = [
  { id: 'A5P1PgpvS4Y', title: 'Sanctuary of Sound', type: 'Featured Track', thumb: 'https://img.youtube.com/vi/A5P1PgpvS4Y/mqdefault.jpg', file: 'media/videos/A5P1PgpvS4Y.mp4' },
  { id: '7jt3ELpDbLc', title: 'Light In Your Mind', type: 'Club Anthem', thumb: 'https://img.youtube.com/vi/7jt3ELpDbLc/mqdefault.jpg', file: 'media/videos/7jt3ELpDbLc.mp4' },
  { id: 'jXbYazDL3T8', title: 'Have You Seen the Light', type: 'Trance / Synth', thumb: 'https://img.youtube.com/vi/jXbYazDL3T8/mqdefault.jpg', file: 'media/videos/jXbYazDL3T8.mp4' },
  { id: 'olZue8qOPC0', title: 'Hold The Grace', type: 'Spiritual Groove', thumb: 'https://img.youtube.com/vi/olZue8qOPC0/mqdefault.jpg', file: 'media/videos/olZue8qOPC0.mp4' },
  { id: 'KZjgxko3CHo', title: 'TimeLapse', type: 'Atmospheric Beat', thumb: 'https://img.youtube.com/vi/KZjgxko3CHo/mqdefault.jpg', file: 'media/videos/KZjgxko3CHo.mp4' },
  { id: 'YbeU8FVCx34', title: "Golden Plates and Spirit's Light", type: 'Deep Synthesis', thumb: 'https://img.youtube.com/vi/YbeU8FVCx34/mqdefault.jpg', file: 'media/videos/YbeU8FVCx34.mp4' },
  { id: 'aEm9naYeeug', title: 'Christ Mind', type: 'Vocal Meditation', thumb: 'https://img.youtube.com/vi/aEm9naYeeug/mqdefault.jpg', file: 'media/videos/aEm9naYeeug.mp4' },
  { id: 'dOLFyJHM9TY', title: 'The Eleventh Alignment', type: 'Electro Sacred', thumb: 'https://img.youtube.com/vi/dOLFyJHM9TY/mqdefault.jpg', file: 'media/videos/dOLFyJHM9TY.mp4' },
  { id: '8ItoGu1n09Q', title: 'A Thousand Doors', type: 'Ambient Pulse', thumb: 'https://img.youtube.com/vi/8ItoGu1n09Q/mqdefault.jpg', file: 'media/videos/8ItoGu1n09Q.mp4' },
  { id: 'ory3ih9Y5to', title: 'Seeking the Third Story', type: 'Sacred Waves', thumb: 'https://img.youtube.com/vi/ory3ih9Y5to/mqdefault.jpg', file: 'media/videos/ory3ih9Y5to.mp4' },
  { id: 'Hp3KePfS1lY', title: 'The Theophany', type: 'Official Short', thumb: 'https://img.youtube.com/vi/Hp3KePfS1lY/mqdefault.jpg', file: 'media/videos/Hp3KePfS1lY.mp4' },
  { id: 'vet5jXDYvyI', title: 'The Mathematics of Theophany', type: 'Official Short', thumb: 'https://img.youtube.com/vi/vet5jXDYvyI/mqdefault.jpg', file: 'media/videos/vet5jXDYvyI.mp4' },
  { id: 'jaE4c4B-HEE', title: 'The Insight Engine', type: 'Official Short', thumb: 'https://img.youtube.com/vi/jaE4c4B-HEE/mqdefault.jpg', file: 'media/videos/jaE4c4B-HEE.mp4' }
];

export class AudioManager {
  constructor(onTrackChangeCallback) {
    this.onTrackChange = onTrackChangeCallback;
    this.playlist = PLAYLIST;

    this.currentIndex = 0;
    this.isPlaying = false;
    this.volume = 80;
    this.ytPlayer = null;
    this.ytReady = false;

    // Web Audio Visualizer Analyzer
    this.audioCtx = null;
    this.analyser = null;
    this.voiceGain = null;
    this.voiceBufferCache = new Map();
    this.activeVoiceSource = null;
    this._unlockedBuffer = false;
    this.frequencyData = new Uint8Array(64);
    this.timeDomainData = new Uint8Array(64);
    this.lastBeatTime = 0;

    this.initWebAudio();
  }

  initYouTube() {
    const createPlayer = () => {
      if (!window.YT || !window.YT.Player) return;
      const el = document.getElementById('yt-player');
      if (!el) return;
      try {
        this.ytPlayer = new YT.Player('yt-player', {
          height: '100%',
          width: '100%',
          videoId: this.playlist[this.currentIndex].id,
          playerVars: {
            autoplay: 0,
            controls: 1,
            disablekb: 0,
            fs: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1
          },
          events: {
            onReady: (event) => {
              this.ytReady = true;
              try { this.ytPlayer.setVolume(this.volume); } catch(e){}
              if (this.onTrackChange) {
                this.onTrackChange(this.getCurrentTrack(), this.isPlaying);
              }
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) {
                this.isPlaying = true;
              } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                this.isPlaying = false;
                if (event.data === YT.PlayerState.ENDED) {
                  this.nextTrack();
                }
              }
              if (this.onTrackChange) {
                this.onTrackChange(this.getCurrentTrack(), this.isPlaying);
              }
            },
            onError: (e) => {
              console.warn("YouTube player fallback to next track:", e);
              setTimeout(() => this.nextTrack(), 1500);
            }
          }
        });
      } catch (err) {
        console.warn("YouTube player creation error:", err);
      }
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }
  }

  initWebAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.audioCtx = new AudioContext();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.8;
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(this.analyser.frequencyBinCount);

    this.analyser.connect(this.audioCtx.destination);

    // Dedicated voice narration channel routed directly to WebXR headset destination
    this.voiceGain = this.audioCtx.createGain();
    this.voiceGain.gain.value = 1.35;
    this.voiceGain.connect(this.audioCtx.destination);
  }

  resumeAudioContext() {
    if (!this.audioCtx) this.initWebAudio();
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    if (!this._unlockedBuffer && this.audioCtx.state === 'running') {
      this._unlockedBuffer = true;
      try {
        const silent = this.audioCtx.createBuffer(1, 1, 22050);
        const src = this.audioCtx.createBufferSource();
        src.buffer = silent;
        src.connect(this.audioCtx.destination);
        src.start(0);
      } catch (e) {}
    }
  }

  decodeWavPcmFallback(arrayBuffer) {
    if (!this.audioCtx) return null;
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 44) return null;
    let offset = 12;
    let channels = 1;
    let sampleRate = 22050;
    let bitsPerSample = 16;
    let dataOffset = 44;
    let dataLength = view.byteLength - 44;

    while (offset + 8 <= view.byteLength) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === 'fmt ') {
        channels = view.getUint16(offset + 10, true) || 1;
        sampleRate = view.getUint32(offset + 12, true) || 22050;
        bitsPerSample = view.getUint16(offset + 22, true) || 16;
      } else if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataLength = Math.min(chunkSize, view.byteLength - dataOffset);
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    const bytesPerSample = Math.max(1, bitsPerSample >> 3);
    const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
    if (frameCount <= 0) return null;

    const audioBuffer = this.audioCtx.createBuffer(channels, frameCount, sampleRate);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        const samplePos = dataOffset + (i * channels + ch) * bytesPerSample;
        if (bitsPerSample === 16) {
          channelData[i] = view.getInt16(samplePos, true) / 32768.0;
        } else if (bitsPerSample === 8) {
          channelData[i] = (view.getUint8(samplePos) - 128) / 128.0;
        }
      }
    }
    return audioBuffer;
  }

  async loadVoiceBuffer(url) {
    if (this.voiceBufferCache.has(url)) {
      return this.voiceBufferCache.get(url);
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const arrayBuf = await resp.arrayBuffer();
    if (!this.audioCtx) this.initWebAudio();
    let decoded = null;
    try {
      decoded = await this.audioCtx.decodeAudioData(arrayBuf.slice(0));
    } catch (err) {
      decoded = this.decodeWavPcmFallback(arrayBuf);
    }
    if (!decoded) throw new Error(`Failed to decode audio buffer for ${url}`);
    this.voiceBufferCache.set(url, decoded);
    return decoded;
  }

  stopVoiceFile() {
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.onended = null;
        this.activeVoiceSource.stop(0);
        this.activeVoiceSource.disconnect();
      } catch (e) {}
      this.activeVoiceSource = null;
    }
  }

  playVoiceFile(url, { onEnded, onError } = {}) {
    this.stopVoiceFile();
    this.resumeAudioContext();
    if (!this.audioCtx) {
      if (onError) onError(new Error('No AudioContext'));
      return () => {};
    }

    let cancelled = false;
    let sourceNode = null;

    this.loadVoiceBuffer(url)
      .then(async (buffer) => {
        if (cancelled) return;
        if (this.audioCtx.state === 'suspended') {
          try { await this.audioCtx.resume(); } catch (e) {}
        }
        if (cancelled) return;
        sourceNode = this.audioCtx.createBufferSource();
        sourceNode.buffer = buffer;
        sourceNode.connect(this.voiceGain || this.audioCtx.destination);
        this.activeVoiceSource = sourceNode;
        sourceNode.onended = () => {
          if (this.activeVoiceSource === sourceNode) {
            this.activeVoiceSource = null;
          }
          if (!cancelled && onEnded) onEnded();
        };
        sourceNode.start(0);
      })
      .catch((err) => {
        if (!cancelled && onError) onError(err);
      });

    return () => {
      cancelled = true;
      if (sourceNode) {
        try {
          sourceNode.onended = null;
          sourceNode.stop(0);
          sourceNode.disconnect();
        } catch (e) {}
        if (this.activeVoiceSource === sourceNode) {
          this.activeVoiceSource = null;
        }
        sourceNode = null;
      }
    };
  }

  attachRoomVideo(videoEl) {
    this.roomVideo = videoEl;
    if (!this.audioCtx) this.initWebAudio();
    if (!this.audioCtx) return;
    try {
      if (!this.videoMediaSource && videoEl) {
        this.videoMediaSource = this.audioCtx.createMediaElementSource(videoEl);
        this.videoGain = this.audioCtx.createGain();
        this.videoGain.gain.setValueAtTime((this.volume / 100) * 0.9, this.audioCtx.currentTime);
        this.videoMediaSource.connect(this.videoGain);
        this.videoGain.connect(this.analyser);
      }
    } catch (e) {
      console.warn("MediaElementSource notice:", e);
    }
  }

  // Stubs for compatibility
  startSynthClock() {}
  stopSynthClock() {}

  // Playback Control
  playTrack(index) {
    this.resumeAudioContext();
    if (index < 0) index = this.playlist.length - 1;
    if (index >= this.playlist.length) index = 0;
    this.currentIndex = index;
    this.isPlaying = true;

    const track = this.getCurrentTrack();
    if (this.onTrackChange) {
      this.onTrackChange(track, true);
    }
    return track;
  }

  togglePlay() {
    this.resumeAudioContext();
    this.isPlaying = !this.isPlaying;
    if (this.onTrackChange) {
      this.onTrackChange(this.getCurrentTrack(), this.isPlaying);
    }
    return this.isPlaying;
  }

  nextTrack() {
    this.playTrack((this.currentIndex + 1) % this.playlist.length);
  }

  prevTrack() {
    this.playTrack((this.currentIndex - 1 + this.playlist.length) % this.playlist.length);
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(100, vol));
    if (this.ytPlayer && this.ytReady) {
      try { this.ytPlayer.setVolume(this.volume); } catch(e){}
    }
    if (this.roomVideo) {
      this.roomVideo.volume = Math.max(0, Math.min(1, (this.volume / 100) * (this.ducked ? 0.18 : 1)));
    }
    if (this.videoGain && this.audioCtx) {
      this.videoGain.gain.setValueAtTime((this.volume / 100) * 0.9 * (this.ducked ? 0.18 : 1), this.audioCtx.currentTime);
    }
  }

  // Lower the club music while a booth or docent narration is playing
  setDucked(ducked) {
    this.ducked = !!ducked;
    if (this.roomVideo) {
      this.roomVideo.volume = Math.max(0, Math.min(1, (this.volume / 100) * (this.ducked ? 0.18 : 1)));
    }
    if (this.videoGain && this.audioCtx) {
      const base = (this.volume / 100) * 0.9;
      this.videoGain.gain.setTargetAtTime(this.ducked ? base * 0.18 : base, this.audioCtx.currentTime, 0.25);
    }
  }

  toggleSynthMute() {
    return false;
  }

  getCurrentTrack() {
    return this.playlist[this.currentIndex];
  }

  // Frequency Data for Visualizer / Lights
  updateAudioData() {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.frequencyData);
      this.analyser.getByteTimeDomainData(this.timeDomainData);

      // Detect beat peaks directly from music audio stream
      if (this.isPlaying) {
        let bassSum = 0;
        for (let i = 0; i < 4; i++) {
          bassSum += this.frequencyData[i];
        }
        const avgBass = bassSum / 4;
        if (avgBass > 135 && performance.now() - this.lastBeatTime > 240) {
          this.lastBeatTime = performance.now();
        }
      }
    }
  }

  getBass() {
    if (!this.isPlaying) return 0;
    // Average first 6 frequency bins
    let sum = 0;
    for (let i = 0; i < 6; i++) {
      sum += this.frequencyData[i];
    }
    return (sum / 6) / 255;
  }

  getMid() {
    if (!this.isPlaying) return 0;
    let sum = 0;
    for (let i = 6; i < 24; i++) {
      sum += this.frequencyData[i];
    }
    return (sum / 18) / 255;
  }

  getTreble() {
    if (!this.isPlaying) return 0;
    let sum = 0;
    for (let i = 24; i < 48; i++) {
      sum += this.frequencyData[i];
    }
    return (sum / 24) / 255;
  }

  getBeatPulse() {
    // Pulse based on real audio beat peak decay
    if (!this.isPlaying) return 0;
    const elapsed = performance.now() - this.lastBeatTime;
    if (elapsed < 300) {
      return 1.0 - (elapsed / 300);
    }
    const bass = this.getBass();
    return bass > 0.4 ? (bass - 0.4) * 1.6 : 0;
  }
}
