/*
 * app.js — application controller. Owns the state machine
 *
 *   setup ──► connect (caller | callee) ──► call ──► setup
 *
 * and wires the DOM to the core modules (crypto, codec, call, sas, qr).
 */
(function (global) {
  'use strict';

  const SPV = global.SPV;
  const { SPVError, Store, formatDuration } = SPV.Util;
  const { Crypto, Codec, Call, I18n, UI } = SPV;
  const { $, toast } = UI;
  const t = I18n.t;
  const doc = global.document;

  // ---- settings -----------------------------------------------------------

  const DEFAULTS = {
    lang: 'auto',
    theme: 'auto',
    name: '',
    micId: '',
    speakerId: '',
    quality: 32,
    echo: true,
    noise: true,
    agc: true,
    iceMode: 'google',
    customIce: '',
    relay: false,
  };
  const saved = Store.get('settings', {});
  const settings = Object.assign({}, DEFAULTS, saved && typeof saved === 'object' ? saved : {});
  const saveSettings = () => Store.set('settings', settings);

  // ---- state --------------------------------------------------------------

  const CONNECT_TIMEOUT_MS = 60000;

  const state = {
    password: '',
    stream: null,
    listenOnly: false,
    role: 'caller',
    session: null,
    pendingInvite: '',
    offerCode: '',
    offerLink: '',
    answerCode: '',
    connected: false,
    callStart: 0,
    timer: 0,
    connectTimer: 0,
    answerApplied: false,
    audioCtx: null,
    meters: { local: null, remote: null },
    levelFrame: 0,
    remoteStream: null,
    wakeLock: null,
    peerName: '',
    peerMuted: false,
    sas: null,
    sasState: 'pending',
    callStateKey: 'call.connecting',
    route: null,
    unread: 0,
    strengthScore: -1,
    micErrorKey: '',
  };

  // ---- small helpers ------------------------------------------------------

  function relabel(el, key) {
    el.dataset.i18n = key;
    el.textContent = t(key);
  }

  function relabelAttrs(el, spec) {
    el.dataset.i18nAttr = spec;
    for (const pair of spec.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key));
    }
  }

  const hasMessage = (key) => Object.prototype.hasOwnProperty.call(I18n.dictionaries.en, key);

  /** Human-readable, localized text for any error we can raise. */
  function errorText(err, ctx = {}) {
    if (err instanceof SPVError) {
      if (err.code === 'WRONG_TYPE') return t(ctx.expected === 'answer' ? 'err.WRONG_TYPE.expectAnswer' : 'err.WRONG_TYPE.expectOffer');
      if (err.code === 'NO_MEDIA') return t('mic.insecure');
      if (hasMessage('err.' + err.code)) return t('err.' + err.code);
    } else if (err) {
      console.error(err);
    }
    return t('err.generic');
  }

  const canLink = () => /^https?:$/.test(global.location.protocol);

  function setBusy(button, busy) {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
  }

  // ---- 1 · setup ----------------------------------------------------------

  function renderStrength() {
    const value = $('secret').value;
    const box = $('strength');
    if (!value) {
      state.strengthScore = -1;
      box.dataset.fill = '0';
      $('strengthLabel').textContent = '';
      $('strengthHint').dataset.i18n = 'setup.hint.empty';
      $('strengthHint').textContent = t('setup.hint.empty');
      return;
    }
    const { score } = Crypto.estimateStrength(value);
    state.strengthScore = score;
    box.dataset.fill = String(score === 0 ? 1 : score);
    $('strengthLabel').textContent = t('strength.' + score);
    const hintKey = score <= 1 ? 'setup.hint.weak' : score === 2 ? 'setup.hint.fair' : 'setup.hint.good';
    $('strengthHint').dataset.i18n = hintKey;
    $('strengthHint').textContent = t(hintKey);
  }

  function setRevealed(show) {
    $('secret').type = show ? 'text' : 'password';
    $('btnReveal').setAttribute('aria-pressed', String(show));
    UI.setIcon($('btnReveal').querySelector('svg'), show ? '#i-eye-off' : '#i-eye');
  }

  function bindSetup() {
    $('secret').addEventListener('input', renderStrength);
    $('secret').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onContinue();
    });
    $('btnReveal').addEventListener('click', () => setRevealed($('secret').type === 'password'));
    $('btnGenerate').addEventListener('click', () => {
      $('secret').value = Crypto.generatePassphrase();
      setRevealed(true);
      renderStrength();
      toast(t('toast.generated'), 'ok');
    });
    $('btnCopySecret').addEventListener('click', async () => {
      const v = $('secret').value;
      if (!v) return $('secret').focus();
      toast(await UI.copyText(v) ? t('toast.copied') : t('toast.copyFailed'), 'ok');
    });
    $('btnContinue').addEventListener('click', onContinue);
    $('btnMicRetry').addEventListener('click', onContinue);
    $('btnListenOnly').addEventListener('click', () => {
      state.listenOnly = true;
      state.stream = null;
      goConnect();
    });
  }

  function micErrorKeyOf(err) {
    if (err instanceof SPVError && err.code === 'NO_MEDIA') return 'mic.insecure';
    switch (err && err.name) {
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'mic.notFound';
      case 'NotReadableError':
      case 'AbortError':
        return 'mic.busy';
      default:
        return 'mic.denied';
    }
  }

  function micOptions() {
    return { deviceId: settings.micId, echoCancellation: settings.echo, noiseSuppression: settings.noise, autoGainControl: settings.agc };
  }

  async function onContinue() {
    const password = $('secret').value;
    if (!password.trim()) {
      toast(t('err.passwordEmpty'), 'error');
      return $('secret').focus();
    }
    if (Crypto.canonicalPassword(password).length < 8) {
      toast(t('err.passwordShort'), 'error');
      return $('secret').focus();
    }
    state.password = password;
    $('micError').hidden = true;
    state.listenOnly = false;

    const button = $('btnContinue');
    setBusy(button, true);
    try {
      if (!state.stream) state.stream = await Call.Media.getMic(micOptions());
      refreshDevices();
      goConnect();
    } catch (err) {
      state.micErrorKey = micErrorKeyOf(err);
      $('micErrorText').textContent = t(state.micErrorKey);
      $('micError').hidden = false;
    } finally {
      setBusy(button, false);
    }
  }

  // ---- 2 · connect --------------------------------------------------------

  function goConnect() {
    UI.showView('connect');
    UI.setStatus('idle', state.listenOnly ? 'status.listenOnly' : 'status.ready');
    if (state.pendingInvite) {
      $('inviteInput').value = state.pendingInvite;
      state.pendingInvite = '';
      setRole('callee');
      $('btnCreateAnswer').focus();
    } else {
      setRole(state.role);
    }
  }

  function setRole(role) {
    state.role = role;
    const callee = role === 'callee';
    $('roleSwitch').dataset.i = callee ? '1' : '0';
    $('tabCaller').setAttribute('aria-selected', String(!callee));
    $('tabCallee').setAttribute('aria-selected', String(callee));
    $('tabCaller').tabIndex = callee ? -1 : 0;
    $('tabCallee').tabIndex = callee ? 0 : -1;
    $('panelCaller').hidden = callee;
    $('panelCallee').hidden = !callee;
  }

  function renderCodeMeta() {
    $('offerMeta').textContent = state.offerCode ? t('code.meta', { n: state.offerCode.length }) : '';
    $('answerMeta').textContent = state.answerCode ? t('code.meta', { n: state.answerCode.length }) : '';
  }

  function closeSession() {
    clearTimeout(state.connectTimer);
    if (state.session) {
      const s = state.session;
      state.session = null;
      s.close();
    }
  }

  /** Back to a pristine "connect" screen (keeps password + microphone). */
  function resetConnectUI() {
    closeSession();
    state.offerCode = state.offerLink = state.answerCode = '';
    state.answerApplied = false;
    for (const id of ['offerCode', 'answerCode', 'replyInput', 'inviteInput']) $(id).value = '';
    for (const id of ['offerOut', 'offerQr', 'answerQr', 'cardAnswer', 'offerProgress', 'connectProgress', 'answerProgress']) $(id).hidden = true;
    for (const id of ['btnQrOffer', 'btnQrAnswer']) $(id).setAttribute('aria-expanded', 'false');
    for (const id of ['btnCreateOffer', 'btnConnect', 'btnCreateAnswer']) setBusy($(id), false);
    relabel($('btnCreateOffer'), 'caller.s1.button');
    renderCodeMeta();
  }

  function newSession() {
    closeSession();
    const session = new Call.CallSession({
      rtcConfig: Call.buildRtcConfig(settings),
      stream: state.stream,
      name: settings.name,
      bitrateKbps: Number(settings.quality) || 32,
    });
    // ignore anything a superseded session may still emit
    const live = (fn) => (...args) => (state.session === session ? fn(...args) : undefined);
    session
      .on('remote-stream', live(onRemoteStream))
      .on('connected', live(onConnected))
      .on('state', live(onPeerState))
      .on('failed', live(onFailed))
      .on('chat', live(onChat))
      .on('peer-info', live(onPeerInfo))
      .on('peer-muted', live(onPeerMuted))
      .on('peer-left', live(onPeerLeft))
      .on('stats', live(onStats));
    state.session = session;
    state.answerApplied = false;
    return session;
  }

  function armConnectTimeout() {
    clearTimeout(state.connectTimer);
    state.connectTimer = setTimeout(() => {
      if (!state.connected && state.session) onFailed();
    }, CONNECT_TIMEOUT_MS);
  }

  function showCodeError(err, expected) {
    UI.setStatus('warn', lastKeyForRole());
    toast(errorText(err, { expected }), 'error', 6000);
  }

  const lastKeyForRole = () => (state.role === 'caller' ? (state.offerCode ? 'status.waitingReply' : 'status.ready') : 'status.ready');

  // caller ------------------------------------------------------------------

  async function onCreateOffer() {
    const button = $('btnCreateOffer');
    setBusy(button, true);
    $('offerOut').hidden = true;
    $('offerQr').hidden = true;
    $('btnQrOffer').setAttribute('aria-expanded', 'false');
    $('offerProgress').hidden = false;
    UI.setStatus('busy', 'status.gathering');
    try {
      const session = newSession();
      const sdp = await session.createOffer();
      const code = await Codec.encode({ type: 'offer', sdp, password: state.password });
      if (state.session !== session) return;
      state.offerCode = code;
      state.offerLink = canLink() ? Codec.buildLink(global.location.href, code) : '';
      $('offerCode').value = code;
      $('offerOut').hidden = false;
      relabel(button, 'caller.s1.again');
      renderCodeMeta();
      UI.setStatus('busy', 'status.offerReady');
    } catch (err) {
      closeSession();
      UI.setStatus('error', 'status.failed');
      toast(errorText(err), 'error', 7000);
    } finally {
      $('offerProgress').hidden = true;
      setBusy(button, false);
    }
  }

  async function onConnect() {
    const text = $('replyInput').value.trim();
    if (!text) return toast(t('err.codeEmpty'), 'error');
    if (!state.session) return toast(t('err.STATE'), 'error');
    if (state.answerApplied) return; // already connecting; a second answer would only confuse the handshake
    const button = $('btnConnect');
    setBusy(button, true);
    try {
      const { sdp } = await Codec.decode(text, state.password, { expectedType: 'answer' });
      $('connectProgress').hidden = false;
      UI.setStatus('busy', 'status.connecting');
      armConnectTimeout();
      await state.session.acceptAnswer(sdp);
      state.answerApplied = true;
    } catch (err) {
      $('connectProgress').hidden = true;
      clearTimeout(state.connectTimer);
      showCodeError(err, 'answer');
    } finally {
      setBusy(button, false);
    }
  }

  // callee ------------------------------------------------------------------

  async function onCreateAnswer() {
    const text = $('inviteInput').value.trim();
    if (!text) return toast(t('err.codeEmpty'), 'error');
    const button = $('btnCreateAnswer');
    setBusy(button, true);
    try {
      const { sdp: offerSdp } = await Codec.decode(text, state.password, { expectedType: 'offer' });
      $('answerProgress').hidden = false;
      $('cardAnswer').hidden = true;
      UI.setStatus('busy', 'status.gathering');
      const session = newSession();
      const answerSdp = await session.acceptOffer(offerSdp);
      const code = await Codec.encode({ type: 'answer', sdp: answerSdp, password: state.password });
      if (state.session !== session) return;
      state.answerCode = code;
      $('answerCode').value = code;
      $('cardAnswer').hidden = false;
      $('cardAnswer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      renderCodeMeta();
      UI.setStatus('busy', 'status.answerReady');
    } catch (err) {
      if (state.session && !state.answerCode) closeSession();
      showCodeError(err, 'offer');
    } finally {
      $('answerProgress').hidden = true;
      setBusy(button, false);
    }
  }

  // sharing -----------------------------------------------------------------

  async function copyCode(text) {
    toast((await UI.copyText(text)) ? t('toast.copied') : t('toast.copyFailed'), 'ok');
  }

  async function shareCode(kind) {
    const code = kind === 'offer' ? state.offerCode : state.answerCode;
    const link = kind === 'offer' ? state.offerLink : '';
    const data = link
      ? { title: t('share.title'), text: t('share.text'), url: link }
      : { title: t('share.title'), text: code };
    const result = await UI.shareData(data);
    if (result === 'unsupported') await copyCode(link || code);
  }

  function toggleQr(kind) {
    const panel = $(kind === 'offer' ? 'offerQr' : 'answerQr');
    const button = $(kind === 'offer' ? 'btnQrOffer' : 'btnQrAnswer');
    const show = panel.hidden;
    if (show) {
      const payload = kind === 'offer' ? state.offerLink || state.offerCode : state.answerCode;
      try {
        UI.renderQr($(kind === 'offer' ? 'offerQrImage' : 'answerQrImage'), payload);
      } catch (err) {
        return toast(errorText(err), 'error');
      }
      if (kind === 'offer') relabel($('offerQrHint'), state.offerLink ? 'qr.invite.hint' : 'qr.invite.hintRaw');
    }
    panel.hidden = !show;
    button.setAttribute('aria-expanded', String(show));
  }

  function bindConnect() {
    for (const tab of [$('tabCaller'), $('tabCallee')]) {
      tab.addEventListener('click', () => setRole(tab.dataset.role));
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const next = state.role === 'caller' ? 'callee' : 'caller';
          setRole(next);
          $(next === 'caller' ? 'tabCaller' : 'tabCallee').focus();
        }
      });
    }
    $('btnCreateOffer').addEventListener('click', onCreateOffer);
    $('btnConnect').addEventListener('click', onConnect);
    $('btnCreateAnswer').addEventListener('click', onCreateAnswer);
    $('btnCopyOffer').addEventListener('click', () => copyCode(state.offerCode));
    $('btnCopyAnswer').addEventListener('click', () => copyCode(state.answerCode));
    $('btnShareOffer').addEventListener('click', () => shareCode('offer'));
    $('btnShareAnswer').addEventListener('click', () => shareCode('answer'));
    $('btnQrOffer').addEventListener('click', () => toggleQr('offer'));
    $('btnQrAnswer').addEventListener('click', () => toggleQr('answer'));
    for (const id of ['offerCode', 'answerCode']) $(id).addEventListener('focus', (e) => e.target.select());
    $('btnScanReply').addEventListener('click', async () => {
      const text = await scanQr();
      if (text) {
        $('replyInput').value = text;
        toast(t('toast.scanned'), 'ok');
        onConnect();
      }
    });
    $('btnScanInvite').addEventListener('click', async () => {
      const text = await scanQr();
      if (text) {
        $('inviteInput').value = text;
        toast(t('toast.scanned'), 'ok');
        onCreateAnswer();
      }
    });
    $('btnReset').addEventListener('click', () => {
      resetConnectUI();
      UI.setStatus('idle', state.listenOnly ? 'status.listenOnly' : 'status.ready');
    });
    $('btnBack').addEventListener('click', () => {
      resetConnectUI();
      releaseMic();
      UI.showView('setup');
      UI.setStatus('idle', 'status.setup');
      $('secret').focus();
    });
  }

  function releaseMic() {
    if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }

  // ---- invitation links ---------------------------------------------------

  function loadInviteFromHash() {
    let hash = global.location.hash || '';
    try {
      hash = decodeURIComponent(hash);
    } catch (_) {
      /* keep the raw fragment */
    }
    const body = Codec.extractCode(hash);
    if (!body) return;
    global.history.replaceState(null, '', global.location.pathname + global.location.search);
    const code = Codec.PREFIX + body;
    if (!$('viewConnect').hidden) {
      $('inviteInput').value = code;
      setRole('callee');
    } else {
      state.pendingInvite = code;
      $('inviteBanner').hidden = false;
    }
    toast(t('toast.invitationLoaded'), 'info');
  }

  // ---- QR scanner ---------------------------------------------------------

  let scanSupported = false;

  async function detectScanSupport() {
    try {
      if (!('BarcodeDetector' in global) || !global.navigator.mediaDevices?.getUserMedia) return;
      const formats = await global.BarcodeDetector.getSupportedFormats();
      scanSupported = formats.includes('qr_code');
    } catch (_) {
      scanSupported = false;
    }
    $('btnScanReply').hidden = !scanSupported;
    $('btnScanInvite').hidden = !scanSupported;
  }

  /** Resolves with the decoded text, or null if cancelled / unavailable. */
  function scanQr() {
    if (!scanSupported) {
      toast(t('scan.unsupported'), 'error');
      return Promise.resolve(null);
    }
    const dialog = $('scannerDialog');
    const video = $('scannerVideo');
    return new Promise((resolve) => {
      let stream = null;
      let stopped = false;
      const finish = (value) => {
        if (stopped) return;
        stopped = true;
        if (stream) stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
        if (dialog.open) dialog.close();
        resolve(value);
      };
      dialog.addEventListener('close', () => finish(null), { once: true });
      $('btnCloseScanner').onclick = () => finish(null);
      dialog.showModal();

      (async () => {
        try {
          stream = await global.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          if (stopped) return stream.getTracks().forEach((track) => track.stop());
          video.srcObject = stream;
          await video.play();
          const detector = new global.BarcodeDetector({ formats: ['qr_code'] });
          while (!stopped) {
            const found = await detector.detect(video).catch(() => []);
            const hit = found.find((c) => c.rawValue && (Codec.extractCode(c.rawValue) || c.rawValue.length > 20));
            if (hit) return finish(hit.rawValue);
            await new Promise((r) => setTimeout(r, 220));
          }
        } catch (err) {
          toast(t('scan.denied'), 'error');
          finish(null);
        }
      })();
    });
  }

  // ---- 3 · call -----------------------------------------------------------

  function onRemoteStream(stream) {
    state.remoteStream = stream;
    const audio = $('remoteAudio');
    audio.srcObject = stream;
    applySpeaker();
    audio.play().catch(() => {
      if (state.connected) $('audioBlocked').hidden = false;
    });
    if (state.connected) startMeters();
  }

  function onPeerState(connection) {
    if (!state.connected) return;
    if (connection === 'disconnected') {
      setCallState('call.unstable');
      UI.setStatus('warn', 'status.unstable');
    } else if (connection === 'connected') {
      setCallState('call.connected');
      UI.setStatus('ok', 'status.connected');
    }
  }

  function onConnected() {
    clearTimeout(state.connectTimer);
    $('toasts').replaceChildren(); // errors from the signaling steps no longer matter
    state.connected = true;
    state.callStart = Date.now();
    state.peerName = '';
    state.peerMuted = false;
    state.unread = 0;
    state.route = null;
    wipeSecrets();

    resetCallUI();
    UI.showView('call');
    UI.setStatus('ok', 'status.connected');
    setCallState('call.connected');
    startTimer();
    startMeters();
    requestWakeLock();
    $('remoteAudio').play().catch(() => {});

    state.session
      .computeSas()
      .then(renderSas)
      .catch(() => {
        $('sasCard').hidden = true;
      });
  }

  /** The password and codes have served their purpose: drop them. */
  function wipeSecrets() {
    state.password = '';
    state.offerCode = state.offerLink = state.answerCode = '';
    for (const id of ['secret', 'offerCode', 'answerCode', 'replyInput', 'inviteInput']) $(id).value = '';
    setRevealed(false);
    renderStrength();
    renderCodeMeta();
  }

  function onFailed() {
    clearTimeout(state.connectTimer);
    if (state.connected) {
      setCallState('call.failed');
      UI.setStatus('error', 'status.failed');
      return;
    }
    $('connectProgress').hidden = true;
    $('waitProgress').hidden = true;
    UI.setStatus('error', 'status.failed');
    toast(t('status.failed') + ' — ' + t('err.NO_CANDIDATES'), 'error', 8000);
  }

  function setCallState(key) {
    state.callStateKey = key;
    relabel($('callState'), key);
  }

  function resetCallUI() {
    $('chatLog').replaceChildren();
    $('chatPanel').hidden = true;
    $('detailsPanel').hidden = true;
    $('chatBadge').hidden = true;
    $('btnChat').setAttribute('aria-pressed', 'false');
    $('btnDetails').setAttribute('aria-pressed', 'false');
    $('audioBlocked').hidden = true;
    $('callTimer').textContent = '00:00';
    $('sasEmoji').replaceChildren();
    $('sasCard').hidden = false;
    setSasState('pending');
    for (const id of ['chipRoute', 'chipQuality']) $(id).hidden = true;
    for (const id of ['stRoute', 'stRtt', 'stJitter', 'stLoss', 'stDown', 'stUp']) $(id).textContent = '–';
    renderParticipants();
    renderMute();
    setLevel($('tilePeer'), 0);
    setLevel($('tileSelf'), 0);
  }

  // participants + mute ------------------------------------------------------

  function renderParticipants() {
    const selfName = settings.name.trim();
    const selfEl = $('selfName');
    if (selfName) {
      delete selfEl.dataset.i18n;
      selfEl.textContent = selfName;
    } else relabel(selfEl, 'call.you');
    setAvatar('self', selfName);

    const peerEl = $('peerName');
    if (state.peerName) {
      delete peerEl.dataset.i18n;
      peerEl.textContent = state.peerName;
    } else relabel(peerEl, 'call.peer');
    setAvatar('peer', state.peerName);
    $('peerMuteBadge').hidden = !state.peerMuted;
    renderSubs();
  }

  /** Initial of the chosen name, or a generic person icon when there is none. */
  function setAvatar(who, name) {
    const letter = Array.from(name.trim())[0] || '';
    $(who + 'Letter').textContent = letter;
    $(who + 'Letter').hidden = !letter;
    $(who + 'Icon').toggleAttribute('hidden', !!letter); // SVG elements have no .hidden property
  }

  let peerSpeaking = false;
  function renderSubs() {
    const session = state.session;
    $('selfSub').textContent = state.listenOnly ? t('call.listenOnly') : session && session.muted ? t('call.muted') : '';
    $('peerSub').textContent = state.peerMuted ? t('call.muted') : peerSpeaking ? t('call.speaking') : '';
  }

  function renderMute() {
    const muted = !!(state.session && state.session.muted);
    const button = $('btnMute');
    button.setAttribute('aria-pressed', String(muted));
    button.disabled = state.listenOnly;
    UI.setIcon($('iconMic'), muted ? '#i-mic-off' : '#i-mic');
    relabel(button.querySelector('span'), muted ? 'call.unmute.short' : 'call.mute.short');
    relabelAttrs(button, muted ? 'aria-label:call.unmute;title:call.unmute' : 'aria-label:call.mute;title:call.mute');
    $('selfMuteBadge').hidden = !muted;
    renderSubs();
  }

  function toggleMute() {
    if (!state.session || state.listenOnly) return;
    state.session.setMuted(!state.session.muted);
    renderMute();
  }

  function onPeerInfo({ name }) {
    state.peerName = name.trim();
    renderParticipants();
  }

  function onPeerMuted(muted) {
    state.peerMuted = muted;
    renderParticipants();
  }

  // timer, levels, wake lock --------------------------------------------------

  function startTimer() {
    stopTimer();
    const tick = () => {
      const text = formatDuration((Date.now() - state.callStart) / 1000);
      $('callTimer').textContent = text;
      doc.title = `${text} · ${t('app.title')}`;
    };
    tick();
    state.timer = setInterval(tick, 1000);
  }

  function stopTimer() {
    clearInterval(state.timer);
    state.timer = 0;
    doc.title = t('app.title');
  }

  const lastLevel = new WeakMap();
  function setLevel(tile, value) {
    const q = Math.round(value * 20) / 20;
    if (lastLevel.get(tile) === q) return;
    lastLevel.set(tile, q);
    tile.querySelector('.avatar').style.setProperty('--lvl', String(q));
  }

  function startMeters() {
    stopMeters();
    const AudioContextClass = global.AudioContext || global.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      state.audioCtx = new AudioContextClass();
      if (state.audioCtx.resume) state.audioCtx.resume().catch(() => {});
    } catch (_) {
      return;
    }
    if (state.stream) state.meters.local = new Call.AudioMeter(state.audioCtx, state.stream);
    if (state.remoteStream) state.meters.remote = new Call.AudioMeter(state.audioCtx, state.remoteStream);

    const frame = () => {
      state.levelFrame = global.requestAnimationFrame(frame);
      if (doc.hidden) return;
      const muted = state.session && state.session.muted;
      setLevel($('tileSelf'), muted || !state.meters.local ? 0 : state.meters.local.read());
      const remote = state.meters.remote ? state.meters.remote.read() : 0;
      setLevel($('tilePeer'), remote);
      const speaking = remote > 0.14;
      if (speaking !== peerSpeaking) {
        peerSpeaking = speaking;
        renderSubs();
      }
    };
    frame();
  }

  function stopMeters() {
    global.cancelAnimationFrame(state.levelFrame);
    state.levelFrame = 0;
    for (const key of ['local', 'remote']) {
      if (state.meters[key]) state.meters[key].close();
      state.meters[key] = null;
    }
    if (state.audioCtx) state.audioCtx.close().catch(() => {});
    state.audioCtx = null;
    peerSpeaking = false;
  }

  async function requestWakeLock() {
    try {
      if (!global.navigator.wakeLock || state.wakeLock) return;
      state.wakeLock = await global.navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => {
        state.wakeLock = null;
      });
    } catch (_) {
      /* optional */
    }
  }

  function releaseWakeLock() {
    if (state.wakeLock) state.wakeLock.release().catch(() => {});
    state.wakeLock = null;
  }

  // SAS ------------------------------------------------------------------------

  function renderSas(sas) {
    state.sas = sas;
    const box = $('sasEmoji');
    box.replaceChildren();
    sas.symbols.forEach((symbol, i) => {
      const span = doc.createElement('span');
      span.textContent = symbol;
      span.style.setProperty('--n', String(i));
      box.appendChild(span);
    });
    box.setAttribute('aria-label', sas.symbols.join(' '));
    setSasState('pending');
  }

  function setSasState(next) {
    state.sasState = next;
    $('sasCard').dataset.state = next;
    $('sasStatus').textContent = t('sas.' + (next === 'pending' ? 'pending' : next === 'verified' ? 'verified' : 'mismatch'));
    const helpKey = next === 'verified' ? 'sas.verifiedHelp' : next === 'mismatch' ? 'sas.mismatchHelp' : 'sas.help';
    $('sasHelp').dataset.i18n = helpKey;
    $('sasHelp').textContent = t(helpKey);
  }

  // chat + details -------------------------------------------------------------

  function appendMessage({ text, ts }, mine) {
    const log = $('chatLog');
    const li = doc.createElement('li');
    li.className = 'msg' + (mine ? ' me' : '');
    const p = doc.createElement('span');
    p.textContent = text;
    const time = doc.createElement('time');
    time.textContent = new Date(ts).toLocaleTimeString(I18n.language, { hour: '2-digit', minute: '2-digit' });
    li.append(p, time);
    log.appendChild(li);
    while (log.children.length > 300) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  function onChat(msg) {
    appendMessage(msg, false);
    if ($('chatPanel').hidden) {
      state.unread++;
      $('chatBadge').hidden = false;
    }
  }

  function togglePanel(panelId, buttonId) {
    const panel = $(panelId);
    panel.hidden = !panel.hidden;
    $(buttonId).setAttribute('aria-pressed', String(!panel.hidden));
    return !panel.hidden;
  }

  function onStats(s) {
    if (s.route) {
      state.route = s.route;
      $('chipRoute').hidden = false;
    }
    renderRoute();
    if (s.quality) {
      $('chipQuality').hidden = false;
      $('chipQuality').dataset.q = s.quality;
      $('chipRtt').textContent = s.rttMs == null ? '' : s.rttMs < 1 ? '< 1 ms' : `${Math.round(s.rttMs)} ms`;
    }
    $('stRtt').textContent = s.rttMs != null && s.rttMs < 1 ? '< 1 ms' : UI.fmt(s.rttMs, 'ms');
    $('stJitter').textContent = UI.fmt(s.jitterMs, 'ms', 1);
    $('stLoss').textContent = UI.fmt(s.lossPct, '%', 1);
    $('stDown').textContent = UI.fmt(s.kbpsIn, 'kbps');
    $('stUp').textContent = UI.fmt(s.kbpsOut, 'kbps');
  }

  function renderRoute() {
    if (!state.route) return;
    $('chipRoute').textContent = t('route.' + state.route);
    $('stRoute').textContent = t('route.' + state.route + '.long');
  }

  function onPeerLeft() {
    toast(t('toast.peerLeft'), 'info');
    endCall(false);
  }

  function endCall(notifyPeer) {
    const session = state.session;
    state.session = null;
    if (session) {
      if (notifyPeer) session.hangup();
      else session.close();
    }
    stopTimer();
    stopMeters();
    releaseWakeLock();
    releaseMic();
    state.remoteStream = null;
    state.connected = false;
    $('remoteAudio').srcObject = null;
    resetConnectUI();
    state.listenOnly = false;
    state.role = 'caller';
    UI.showView('setup');
    UI.setStatus('idle', 'status.ended');
    $('btnContinue').focus();
  }

  function bindCall() {
    $('btnMute').addEventListener('click', toggleMute);
    $('btnChat').addEventListener('click', () => {
      if (togglePanel('chatPanel', 'btnChat')) {
        state.unread = 0;
        $('chatBadge').hidden = true;
        $('chatInput').focus();
        $('chatLog').scrollTop = $('chatLog').scrollHeight;
      }
    });
    $('btnDetails').addEventListener('click', () => togglePanel('detailsPanel', 'btnDetails'));
    $('btnHangup').addEventListener('click', () => {
      endCall(true);
      toast(t('toast.callEnded'), 'info');
    });
    $('chatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = state.session && state.session.sendChat($('chatInput').value);
      if (msg) {
        appendMessage(msg, true);
        $('chatInput').value = '';
      }
    });
    $('btnSasMatch').addEventListener('click', () => setSasState('verified'));
    $('btnSasDiffer').addEventListener('click', () => {
      setSasState('mismatch');
      toast(t('toast.sasMismatch'), 'error', 9000);
    });
    $('btnEnableAudio').addEventListener('click', () => {
      $('remoteAudio').play().then(() => {
        $('audioBlocked').hidden = true;
      }).catch(() => {});
    });
    doc.addEventListener('keydown', (e) => {
      if (state.connected && (e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement.tagName)) {
        toggleMute();
      }
    });
    doc.addEventListener('visibilitychange', () => {
      if (!doc.hidden && state.connected) requestWakeLock();
    });
    global.addEventListener('beforeunload', (e) => {
      if (state.connected) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // ---- settings dialog ----------------------------------------------------

  function applySpeaker() {
    const audio = $('remoteAudio');
    if (settings.speakerId && typeof audio.setSinkId === 'function') audio.setSinkId(settings.speakerId).catch(() => {});
  }

  function fillSelect(select, devices, selected, fallbackKey) {
    select.replaceChildren();
    const def = doc.createElement('option');
    def.value = '';
    def.textContent = t(fallbackKey);
    select.appendChild(def);
    devices.forEach((d, i) => {
      if (d.deviceId === 'default' || !d.deviceId) return;
      const o = doc.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || t('settings.device', { n: i + 1 });
      select.appendChild(o);
    });
    select.value = [...select.options].some((o) => o.value === selected) ? selected : '';
  }

  async function refreshDevices() {
    const { inputs, outputs } = await Call.Media.listDevices();
    fillSelect($('setMic'), inputs, settings.micId, 'settings.defaultDevice');
    const canSink = typeof $('remoteAudio').setSinkId === 'function';
    $('rowSpeaker').hidden = !canSink || outputs.length === 0;
    fillSelect($('setSpeaker'), outputs, settings.speakerId, 'settings.defaultDevice');
  }

  function renderIceHint() {
    $('iceHint').textContent = t('settings.ice.hint.' + settings.iceMode);
    $('customIceBlock').hidden = settings.iceMode !== 'custom';
  }

  function fillSettings() {
    $('setLang').value = settings.lang;
    $('setTheme').value = settings.theme;
    $('setName').value = settings.name;
    $('setQuality').value = String(settings.quality);
    $('setEcho').checked = settings.echo;
    $('setNoise').checked = settings.noise;
    $('setAgc').checked = settings.agc;
    $('setIce').value = settings.iceMode;
    $('setCustomIce').value = settings.customIce;
    $('setRelay').checked = settings.relay;
    renderIceHint();
    refreshDevices();
  }

  /** Swap the capture device / processing flags, live if a stream exists. */
  async function reacquireMic() {
    if (!state.stream) return;
    try {
      const next = await Call.Media.getMic(micOptions());
      const old = state.stream;
      if (state.session) await state.session.replaceStream(next);
      state.stream = next;
      old.getTracks().forEach((track) => track.stop());
      if (state.connected) startMeters();
      refreshDevices();
    } catch (err) {
      toast(t(micErrorKeyOf(err)), 'error');
    }
  }

  function bindSettings() {
    const dialog = $('settingsDialog');
    $('btnSettings').addEventListener('click', () => {
      fillSettings();
      dialog.showModal();
    });
    $('btnCloseSettings').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });

    const on = (id, fn) => $(id).addEventListener('change', (e) => {
      fn(e.target);
      saveSettings();
    });
    on('setLang', (el) => {
      settings.lang = el.value;
      I18n.setLanguage(settings.lang);
      refreshDevices();
    });
    on('setTheme', (el) => {
      settings.theme = el.value;
      UI.applyTheme(settings.theme);
    });
    $('setName').addEventListener('input', (e) => {
      settings.name = e.target.value.slice(0, Call.MAX_NAME_LENGTH);
      saveSettings();
      renderParticipants();
    });
    on('setMic', (el) => {
      settings.micId = el.value;
      reacquireMic();
    });
    on('setSpeaker', (el) => {
      settings.speakerId = el.value;
      applySpeaker();
    });
    on('setQuality', (el) => {
      settings.quality = Number(el.value);
      if (state.session) state.session.setBitrate(settings.quality);
    });
    on('setEcho', (el) => {
      settings.echo = el.checked;
      reacquireMic();
    });
    on('setNoise', (el) => {
      settings.noise = el.checked;
      reacquireMic();
    });
    on('setAgc', (el) => {
      settings.agc = el.checked;
      reacquireMic();
    });
    on('setIce', (el) => {
      settings.iceMode = el.value;
      renderIceHint();
    });
    $('setCustomIce').addEventListener('input', (e) => {
      settings.customIce = e.target.value;
      saveSettings();
    });
    on('setRelay', (el) => {
      settings.relay = el.checked;
    });
    $('btnResetSettings').addEventListener('click', () => {
      Object.assign(settings, DEFAULTS);
      saveSettings();
      I18n.setLanguage(settings.lang);
      UI.applyTheme(settings.theme);
      fillSettings();
      renderParticipants();
      toast(t('toast.reset'), 'info');
    });
  }

  // ---- language re-render -------------------------------------------------

  function renderDynamic() {
    UI.renderStatus();
    renderStrength();
    renderCodeMeta();
    renderParticipants();
    renderMute();
    renderRoute();
    if (state.sas) setSasState(state.sasState);
    renderIceHint();
    if (state.connected) doc.title = `${$('callTimer').textContent} · ${t('app.title')}`;
    if (!$('micError').hidden) $('micErrorText').textContent = t(state.micErrorKey);
  }

  // ---- boot ----------------------------------------------------------------

  function init() {
    I18n.setLanguage(settings.lang);
    UI.applyTheme(settings.theme);
    UI.initGlassPointer();
    bindSetup();
    bindConnect();
    bindCall();
    bindSettings();
    I18n.onChange(renderDynamic);
    renderStrength();
    renderCodeMeta();
    UI.showView('setup');
    UI.setStatus('idle', 'status.setup');

    if (!(global.crypto && global.crypto.subtle)) {
      $('btnContinue').disabled = true;
      UI.setStatus('error', 'status.failed');
      toast(t('err.NO_CRYPTO'), 'error', 20000);
    }

    detectScanSupport();
    loadInviteFromHash();
    global.addEventListener('hashchange', loadInviteFromHash);

    if ('serviceWorker' in global.navigator && canLink()) {
      global.navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();

})(window);
