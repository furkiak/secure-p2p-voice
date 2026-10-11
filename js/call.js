/*
 * call.js — everything that touches WebRTC and media devices.
 *
 *   Media            microphone capture + device enumeration
 *   CallSession      one peer connection: offer/answer, chat channel, stats
 *   AudioMeter       smoothed 0..1 loudness of a MediaStream
 *   buildRtcConfig   ICE server presets / custom servers
 *
 * The UI never touches RTCPeerConnection directly; it only talks to a
 * CallSession and listens to its events.
 */
(function (global) {
  'use strict';

  const SPV = global.SPV || (global.SPV = {});
  const { SPVError, clamp, randomBytes, toBase64Url } = SPV.Util || require('./util.js');
  const Sas = SPV.Sas || require('./sas.js');

  // ---- ICE configuration --------------------------------------------------

  const ICE_PRESETS = {
    google: ['stun:stun.l.google.com:19302'],
    cloudflare: ['stun:stun.cloudflare.com:3478'],
    none: [], // same-network calls only; nothing leaves your device
  };

  /**
   * One server per line: `stun:host:port` or `turn:host:port username credential`.
   * Returns the valid entries and the lines that were ignored.
   */
  function parseIceServers(text) {
    const servers = [];
    const invalid = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const [url, username, ...rest] = line.split(/\s+/);
      const credential = rest.join(' ');
      if (!/^(stun|stuns|turn|turns):[^\s/]+$/i.test(url)) {
        invalid.push(line);
      } else if (/^turns?:/i.test(url) && !(username && credential)) {
        invalid.push(line);
      } else if (/^turns?:/i.test(url)) {
        servers.push({ urls: url, username, credential });
      } else {
        servers.push({ urls: url });
      }
    }
    return { servers, invalid };
  }

  /** @param {{iceMode?:string, customIce?:string, relay?:boolean}} settings */
  function buildRtcConfig(settings = {}) {
    let iceServers;
    if (settings.iceMode === 'custom') iceServers = parseIceServers(settings.customIce).servers;
    else iceServers = (ICE_PRESETS[settings.iceMode] || ICE_PRESETS.google).map((urls) => ({ urls }));
    const config = { iceServers, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' };
    if (settings.relay && iceServers.some((s) => /^turns?:/i.test(s.urls))) config.iceTransportPolicy = 'relay';
    return config;
  }

  // ---- quality heuristics -------------------------------------------------

  /** 'lan' | 'p2p' | 'relay' from the selected candidate pair's types. */
  function classifyRoute(localType, remoteType) {
    if (localType === 'relay' || remoteType === 'relay') return 'relay';
    if (localType === 'host' && remoteType === 'host') return 'lan';
    return 'p2p';
  }

  /** 'good' | 'fair' | 'poor' (null while there is no data yet). */
  function classifyQuality(rttMs, lossPct) {
    if (rttMs == null && lossPct == null) return null;
    const rtt = rttMs ?? 0;
    const loss = lossPct ?? 0;
    if (rtt > 400 || loss > 8) return 'poor';
    if (rtt > 180 || loss > 2.5) return 'fair';
    return 'good';
  }

  // ---- microphone ---------------------------------------------------------

  const Media = {
    async getMic({ deviceId, echoCancellation = true, noiseSuppression = true, autoGainControl = true } = {}) {
      if (!global.navigator?.mediaDevices?.getUserMedia) {
        throw new SPVError('NO_MEDIA', 'Microphone access needs a secure (https) page.');
      }
      const audio = { echoCancellation, noiseSuppression, autoGainControl, channelCount: 1 };
      if (deviceId) audio.deviceId = { exact: deviceId };
      try {
        return await global.navigator.mediaDevices.getUserMedia({ audio, video: false });
      } catch (err) {
        if (deviceId && err.name === 'OverconstrainedError') {
          delete audio.deviceId; // the saved device is gone: fall back to the default
          return global.navigator.mediaDevices.getUserMedia({ audio, video: false });
        }
        throw err;
      }
    },

    async listDevices() {
      try {
        const all = await global.navigator.mediaDevices.enumerateDevices();
        return {
          inputs: all.filter((d) => d.kind === 'audioinput'),
          outputs: all.filter((d) => d.kind === 'audiooutput'),
        };
      } catch (_) {
        return { inputs: [], outputs: [] };
      }
    },
  };

  // ---- loudness meter -----------------------------------------------------

  class AudioMeter {
    constructor(ctx, stream) {
      this.level = 0;
      this._ok = false;
      try {
        this._source = ctx.createMediaStreamSource(stream);
        this._analyser = ctx.createAnalyser();
        this._analyser.fftSize = 512;
        this._analyser.smoothingTimeConstant = 0.4;
        this._source.connect(this._analyser);
        this._buf = new Uint8Array(this._analyser.fftSize);
        this._ok = true;
      } catch (_) {
        /* meters are cosmetic: ignore unsupported environments */
      }
    }

    /** Current smoothed level in 0..1 (fast attack, slow release). */
    read() {
      if (!this._ok) return 0;
      this._analyser.getByteTimeDomainData(this._buf);
      let sum = 0;
      for (let i = 0; i < this._buf.length; i++) {
        const v = (this._buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this._buf.length);
      const target = clamp(Math.sqrt(rms) * 1.6, 0, 1);
      this.level = target > this.level ? target : this.level * 0.88 + target * 0.12;
      return this.level;
    }

    close() {
      try {
        this._source && this._source.disconnect();
      } catch (_) {
        /* already disconnected */
      }
      this._ok = false;
    }
  }

  // ---- peer connection ----------------------------------------------------

  const MAX_CHAT_LENGTH = 2000;
  const MAX_NAME_LENGTH = 24;
  const MAX_MESSAGE_BYTES = 8 * 1024;
  const MAX_SDP_LENGTH = 32 * 1024;

  /** Resolves when ICE gathering finished, or after a bounded wait. */
  function waitForIceGathering(pc, { settleMs = 3500, maxMs = 12000 } = {}) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      let settle = null;
      const done = () => {
        clearTimeout(settle);
        clearTimeout(hard);
        pc.removeEventListener('icegatheringstatechange', onState);
        pc.removeEventListener('icecandidate', onCandidate);
        resolve();
      };
      const onState = () => pc.iceGatheringState === 'complete' && done();
      const onCandidate = (e) => {
        if (!e.candidate) return done(); // end-of-candidates
        // once the first candidate shows up give the rest (server reflexive…) a moment, no more
        if (!settle) settle = setTimeout(done, settleMs);
      };
      const hard = setTimeout(done, maxMs);
      pc.addEventListener('icegatheringstatechange', onState);
      pc.addEventListener('icecandidate', onCandidate);
    });
  }

  function preferOpus(pc) {
    try {
      const caps = global.RTCRtpReceiver.getCapabilities('audio');
      const opus = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/opus');
      if (!opus.length) return;
      for (const t of pc.getTransceivers()) {
        if (t.setCodecPreferences && (t.receiver.track || {}).kind === 'audio') t.setCodecPreferences(opus);
      }
    } catch (_) {
      /* optional optimisation */
    }
  }

  const connectionStateOf = (pc) => {
    if (pc.connectionState) return pc.connectionState;
    const s = pc.iceConnectionState; // older Safari / Firefox
    return s === 'completed' ? 'connected' : s;
  };

  class CallSession {
    /**
     * @param {{rtcConfig:RTCConfiguration, stream?:MediaStream, name?:string, bitrateKbps?:number}} opts
     */
    constructor({ rtcConfig, stream = null, name = '', bitrateKbps = 32 } = {}) {
      this.rtcConfig = rtcConfig;
      this.stream = stream;
      this.name = String(name || '').slice(0, MAX_NAME_LENGTH);
      this.bitrateKbps = bitrateKbps;
      this.pc = null;
      this.channel = null;
      this.muted = false;
      this.connectedAt = 0;
      this.closed = false;
      this._listeners = {};
      this._statsTimer = 0;
      this._lastStats = null;
    }

    // minimal event emitter
    on(event, fn) {
      (this._listeners[event] ||= []).push(fn);
      return this;
    }

    _emit(event, payload) {
      for (const fn of this._listeners[event] || []) {
        try {
          fn(payload);
        } catch (err) {
          console.error('listener for', event, 'failed', err);
        }
      }
    }

    // -- negotiation ---------------------------------------------------------

    _createPeer() {
      if (this.pc) throw new SPVError('STATE', 'Session already started.');
      const pc = new global.RTCPeerConnection(this.rtcConfig);
      this.pc = pc;

      if (this.stream) this.stream.getAudioTracks().forEach((track) => pc.addTrack(track, this.stream));

      // Both ends open the same pre-negotiated channel: no extra signaling round-trip.
      this.channel = pc.createDataChannel('spv', { negotiated: true, id: 0, ordered: true });
      this.channel.onopen = () => this._sendHello();
      this.channel.onmessage = (e) => this._onMessage(e.data);

      pc.ontrack = (event) => {
        const stream = event.streams[0] || new global.MediaStream([event.track]);
        this._emit('remote-stream', stream);
      };
      const onState = () => this._onConnectionState();
      pc.onconnectionstatechange = onState;
      pc.oniceconnectionstatechange = onState;
      return pc;
    }

    _onConnectionState() {
      if (this.closed || !this.pc) return;
      const state = connectionStateOf(this.pc);
      this._emit('state', state);
      if (state === 'connected' && !this.connectedAt) {
        this.connectedAt = Date.now();
        this._applyBitrate();
        this._startStats();
        this._emit('connected');
      } else if (state === 'failed') {
        this._emit('failed');
      }
    }

    /**
     * Apply a local description and resolve with the final SDP. The gathering
     * listener is attached *before* setLocalDescription so no candidate (or the
     * end-of-candidates marker) can slip past it.
     */
    async _setLocalAndGather(description) {
      const gathered = waitForIceGathering(this.pc);
      await this.pc.setLocalDescription(description);
      await gathered;
      const sdp = this.pc.localDescription && this.pc.localDescription.sdp;
      if (!sdp || !/^a=candidate:/m.test(sdp)) {
        throw new SPVError('NO_CANDIDATES', 'No network candidates were found.');
      }
      return sdp;
    }

    /** Caller, step 1. Resolves with the local SDP once candidates are in. */
    async createOffer() {
      const pc = this._createPeer();
      if (!this.stream) pc.addTransceiver('audio', { direction: 'recvonly' }); // listen-only caller
      preferOpus(pc);
      return this._setLocalAndGather(await pc.createOffer());
    }

    /** Callee: take the caller's SDP, resolve with the answer SDP. */
    async acceptOffer(sdp) {
      assertSdp(sdp);
      const pc = this._createPeer();
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp });
      } catch (err) {
        throw new SPVError('BAD_SDP', err.message);
      }
      preferOpus(pc);
      return this._setLocalAndGather(await pc.createAnswer());
    }

    /** Caller, step 2: complete the handshake with the callee's SDP. */
    async acceptAnswer(sdp) {
      assertSdp(sdp);
      if (!this.pc) throw new SPVError('STATE', 'No offer was created.');
      try {
        await this.pc.setRemoteDescription({ type: 'answer', sdp });
      } catch (err) {
        throw new SPVError('BAD_SDP', err.message);
      }
    }

    /** Emoji verification string, available once both descriptions are set. */
    computeSas() {
      const { localDescription: l, remoteDescription: r } = this.pc || {};
      if (!l || !r) return Promise.reject(new SPVError('STATE', 'Not negotiated yet.'));
      return Sas.compute(l.sdp, r.sdp);
    }

    // -- in-call controls ----------------------------------------------------

    setMuted(muted) {
      this.muted = !!muted;
      if (this.stream) this.stream.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
      this._send({ t: 'mute', v: this.muted });
    }

    /** Swap the microphone without renegotiating. */
    async replaceStream(newStream) {
      const track = newStream.getAudioTracks()[0];
      const sender = this.pc && this.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      track.enabled = !this.muted;
      if (sender) await sender.replaceTrack(track);
      this.stream = newStream;
    }

    sendChat(text) {
      const clean = String(text).trim().slice(0, MAX_CHAT_LENGTH);
      if (!clean) return null;
      const msg = { id: toBase64Url(randomBytes(6)), text: clean, ts: Date.now() };
      return this._send({ t: 'chat', ...msg }) ? msg : null;
    }

    hangup() {
      if (this._send({ t: 'bye' })) setTimeout(() => this.close(), 250); // let it flush
      else this.close();
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      clearInterval(this._statsTimer);
      try {
        this.channel && this.channel.close();
      } catch (_) {
        /* already closed */
      }
      try {
        this.pc && this.pc.close();
      } catch (_) {
        /* already closed */
      }
      this._emit('closed');
    }

    // -- data channel --------------------------------------------------------

    _send(obj) {
      if (!this.channel || this.channel.readyState !== 'open') return false;
      try {
        this.channel.send(JSON.stringify(obj));
        return true;
      } catch (_) {
        return false;
      }
    }

    _sendHello() {
      this._send({ t: 'hello', name: this.name, muted: this.muted });
    }

    _onMessage(raw) {
      if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return;
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (_) {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      switch (msg.t) {
        case 'hello':
          this._emit('peer-info', { name: typeof msg.name === 'string' ? msg.name.slice(0, MAX_NAME_LENGTH) : '' });
          this._emit('peer-muted', !!msg.muted);
          break;
        case 'mute':
          this._emit('peer-muted', !!msg.v);
          break;
        case 'chat':
          if (typeof msg.text === 'string' && msg.text.trim()) {
            this._emit('chat', {
              id: typeof msg.id === 'string' ? msg.id.slice(0, 16) : '',
              text: msg.text.slice(0, MAX_CHAT_LENGTH),
              ts: Date.now(), // never trust the peer's clock for display
            });
          }
          break;
        case 'bye':
          this._emit('peer-left');
          break;
        default:
      }
    }

    // -- stats ---------------------------------------------------------------

    async _applyBitrate() {
      try {
        const sender = this.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
        if (!sender || !this.bitrateKbps) return;
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = this.bitrateKbps * 1000;
        await sender.setParameters(params);
      } catch (_) {
        /* not supported everywhere */
      }
    }

    setBitrate(kbps) {
      this.bitrateKbps = kbps;
      return this._applyBitrate();
    }

    _startStats() {
      clearInterval(this._statsTimer);
      this._statsTimer = setInterval(() => this._sampleStats(), 2000);
      this._sampleStats();
    }

    async _sampleStats() {
      if (this.closed || !this.pc) return;
      try {
        const report = await this.pc.getStats();
        const all = new Map();
        report.forEach((r) => all.set(r.id, r));
        let pair = null;
        let inbound = null;
        let outbound = null;
        report.forEach((r) => {
          if (r.type === 'transport' && r.selectedCandidatePairId) pair = all.get(r.selectedCandidatePairId) || pair;
          if (r.type === 'inbound-rtp' && (r.kind || r.mediaType) === 'audio') inbound = r;
          if (r.type === 'outbound-rtp' && (r.kind || r.mediaType) === 'audio') outbound = r;
        });
        if (!pair) {
          report.forEach((r) => {
            if (r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) pair = r;
          });
        }

        const now = performance.now();
        const prev = this._lastStats;
        const cur = {
          t: now,
          rx: inbound ? inbound.bytesReceived || 0 : 0,
          tx: outbound ? outbound.bytesSent || 0 : 0,
          got: inbound ? inbound.packetsReceived || 0 : 0,
          lost: inbound ? inbound.packetsLost || 0 : 0,
        };
        this._lastStats = cur;

        let kbpsIn = null;
        let kbpsOut = null;
        let lossPct = null;
        if (prev && now > prev.t) {
          const secs = (now - prev.t) / 1000;
          kbpsIn = Math.max(0, ((cur.rx - prev.rx) * 8) / 1000 / secs);
          kbpsOut = Math.max(0, ((cur.tx - prev.tx) * 8) / 1000 / secs);
          const dGot = cur.got - prev.got;
          const dLost = Math.max(0, cur.lost - prev.lost);
          lossPct = dGot + dLost > 0 ? (dLost / (dGot + dLost)) * 100 : 0;
        }

        const local = pair && all.get(pair.localCandidateId);
        const remote = pair && all.get(pair.remoteCandidateId);
        const rttMs = pair && typeof pair.currentRoundTripTime === 'number' ? pair.currentRoundTripTime * 1000 : null;
        const route = local && remote ? classifyRoute(local.candidateType, remote.candidateType) : null;
        this._emit('stats', {
          rttMs,
          jitterMs: inbound && typeof inbound.jitter === 'number' ? inbound.jitter * 1000 : null,
          lossPct,
          kbpsIn,
          kbpsOut,
          route,
          protocol: local ? local.protocol : null,
          quality: classifyQuality(rttMs, lossPct),
        });
      } catch (_) {
        /* stats are best-effort */
      }
    }
  }

  function assertSdp(sdp) {
    if (typeof sdp !== 'string' || sdp.length > MAX_SDP_LENGTH || !/^v=0\r?\n/.test(sdp)) {
      throw new SPVError('BAD_SDP', 'Invalid session description.');
    }
  }

  SPV.Call = {
    ICE_PRESETS,
    MAX_CHAT_LENGTH,
    MAX_NAME_LENGTH,
    parseIceServers,
    buildRtcConfig,
    classifyRoute,
    classifyQuality,
    Media,
    AudioMeter,
    CallSession,
    waitForIceGathering,
  };

  if (typeof module === 'object' && module.exports) module.exports = SPV.Call;
})(typeof window !== 'undefined' ? window : globalThis);
