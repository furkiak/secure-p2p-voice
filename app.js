(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  let stream = null;
  let peer = null;
  let activePassword = null;
  let sessionId = null;
  let operation = false;
  let connectionTimer = null;
  const consumedCodes = new Set();

  function status(message, tone = 'normal') {
    $('statusText').textContent = message;
    $('statusBar').dataset.tone = tone;
  }

  function closePeer() {
    if (connectionTimer) clearTimeout(connectionTimer);
    connectionTimer = null;
    if (peer) {
      const current = peer;
      peer = null;
      current.ontrack = null;
      current.onconnectionstatechange = null;
      current.oniceconnectionstatechange = null;
      current.close();
    }
    $('remoteAudio').pause();
    $('remoteAudio').srcObject = null;
    $('remoteAudio').classList.add('hidden');
  }

  function endCall(message = 'Call ended · microphone off', tone = 'normal') {
    closePeer();
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    activePassword = null;
    sessionId = null;
    consumedCodes.clear();
    $('secretKey').value = '';
    $('setupPane').classList.remove('hidden');
    $('callPane').classList.add('hidden');
    $('callerPane').classList.add('hidden');
    $('receiverPane').classList.add('hidden');
    for (const id of ['localOffer', 'remoteOffer', 'localAnswer', 'remoteAnswer']) $(id).value = '';
    $('muteButton').textContent = 'Mute microphone';
    status(message, tone);
  }

  function validateDescription(text, expectedType) {
    let description;
    try { description = JSON.parse(text); } catch { throw new Error('Code does not contain a valid WebRTC description.'); }
    if (!description || description.type !== expectedType || typeof description.sdp !== 'string' ||
        !description.sdp || description.sdp.length > 24000)
      throw new Error('Code has the wrong or invalid WebRTC description.');
    return { type: expectedType, sdp: description.sdp };
  }

  function createPeer() {
    closePeer();
    const pc = new RTCPeerConnection(iceConfig);
    peer = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.ontrack = event => {
      if (pc !== peer || !event.streams[0]) return;
      const audio = $('remoteAudio');
      audio.srcObject = event.streams[0];
      audio.classList.remove('hidden');
      audio.play().catch(() => status('Connected, but remote playback needs a tap on the audio control.', 'error'));
    };
    pc.onconnectionstatechange = () => {
      if (pc !== peer) return;
      if (pc.connectionState === 'connected') {
        if (connectionTimer) clearTimeout(connectionTimer);
        connectionTimer = null;
        status('Connected · media protected by WebRTC DTLS-SRTP', 'success');
      } else if (pc.connectionState === 'failed') {
        endCall('Connection failed. This network may need TURN; microphone stopped.', 'error');
      } else if (pc.connectionState === 'disconnected') {
        status('Peer disconnected. Waiting briefly before closing…', 'error');
        if (connectionTimer) clearTimeout(connectionTimer);
        connectionTimer = setTimeout(() => {
          if (pc === peer && pc.connectionState === 'disconnected')
            endCall('Peer disconnected · microphone stopped', 'error');
        }, 6000);
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc === peer && pc.iceConnectionState === 'failed')
        endCall('ICE failed. Try another network or a TURN-enabled service.', 'error');
    };
    return pc;
  }

  function waitForIce(pc, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      let timer;
      const finish = error => {
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', check);
        pc.removeEventListener('icecandidate', check);
        error ? reject(error) : resolve();
      };
      const check = () => {
        if (pc !== peer || pc.signalingState === 'closed') finish(new Error('Call was closed.'));
        else if (pc.iceGatheringState === 'complete') finish();
      };
      pc.addEventListener('icegatheringstatechange', check);
      pc.addEventListener('icecandidate', check);
      timer = setTimeout(() => finish(new Error('ICE gathering timed out. Try another network.')), timeoutMs);
      check();
    });
  }

  async function run(button, action) {
    if (operation) return;
    operation = true;
    button.disabled = true;
    try { await action(); }
    catch (error) {
      status(error?.message || 'Call operation failed.', 'error');
    } finally {
      operation = false;
      button.disabled = false;
    }
  }

  $('startButton').addEventListener('click', async () => {
    if (operation) return;
    const password = $('secretKey').value;
    if (Array.from(password).length < 12 || new TextEncoder().encode(password).length > 128) {
      status('Use a unique shared password of at least 12 characters and at most 128 UTF-8 bytes.', 'error');
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      status('Microphone needs a secure context: localhost or HTTPS.', 'error');
      return;
    }
    await run($('startButton'), async () => {
      status('Requesting microphone permission…');
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
      catch { throw new Error('Microphone permission denied or device unavailable.'); }
      activePassword = password;
      $('secretKey').value = '';
      $('setupPane').classList.add('hidden');
      $('callPane').classList.remove('hidden');
      status('Microphone active · choose your role');
    });
  });

  function selectRole(role) {
    $('callerPane').classList.toggle('hidden', role !== 'caller');
    $('receiverPane').classList.toggle('hidden', role !== 'receiver');
    $('callerButton').setAttribute('aria-pressed', role === 'caller');
    $('receiverButton').setAttribute('aria-pressed', role === 'receiver');
    status(role === 'caller' ? 'Create an offer and send it to the receiver.' : 'Paste the caller’s offer code.');
  }
  $('callerButton').addEventListener('click', () => selectRole('caller'));
  $('receiverButton').addEventListener('click', () => selectRole('receiver'));

  $('offerButton').addEventListener('click', () => run($('offerButton'), async () => {
    if (!stream || !activePassword) throw new Error('Enable the microphone first.');
    $('localOffer').value = '';
    consumedCodes.clear();
    const pc = createPeer();
    status('Gathering connection candidates…');
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIce(pc);
    const result = await CodeEnvelope.encrypt(JSON.stringify(pc.localDescription), activePassword, 'offer');
    sessionId = result.sessionId;
    $('localOffer').value = result.code;
    status('Offer ready · send the code to the receiver.');
  }));

  $('answerButton').addEventListener('click', () => run($('answerButton'), async () => {
    const code = $('remoteOffer').value.trim();
    if (!code) throw new Error('Paste an offer code first.');
    if (consumedCodes.has(code)) throw new Error('This offer was already used in this call.');
    const received = await CodeEnvelope.decrypt(code, activePassword, 'offer');
    const description = validateDescription(received.plainText, 'offer');
    const pc = createPeer();
    sessionId = received.sessionId;
    $('localAnswer').value = '';
    status('Gathering connection candidates…');
    await pc.setRemoteDescription(description);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitForIce(pc);
    const result = await CodeEnvelope.encrypt(JSON.stringify(pc.localDescription),
      activePassword, 'answer', sessionId);
    $('localAnswer').value = result.code;
    consumedCodes.add(code);
    status('Answer ready · send it back to the caller.');
  }));

  $('connectButton').addEventListener('click', () => run($('connectButton'), async () => {
    const code = $('remoteAnswer').value.trim();
    if (!peer || !sessionId || peer.signalingState !== 'have-local-offer')
      throw new Error('Generate an offer before applying an answer.');
    if (!code) throw new Error('Paste an answer code first.');
    if (consumedCodes.has(code)) throw new Error('This answer was already used.');
    const received = await CodeEnvelope.decrypt(code, activePassword, 'answer', sessionId);
    await peer.setRemoteDescription(validateDescription(received.plainText, 'answer'));
    consumedCodes.add(code);
    status('Connecting… if ICE fails, this network may need TURN.');
    const current = peer;
    connectionTimer = setTimeout(() => {
      if (current === peer && current.connectionState !== 'connected')
        endCall('Connection timed out. This network may need TURN; microphone stopped.', 'error');
    }, 30000);
  }));

  $('muteButton').addEventListener('click', () => {
    if (!stream) return;
    const muted = stream.getAudioTracks().some(track => track.enabled);
    stream.getAudioTracks().forEach(track => { track.enabled = !muted; });
    $('muteButton').textContent = muted ? 'Unmute microphone' : 'Mute microphone';
    status(muted ? 'Microphone muted' : 'Microphone live');
  });
  $('hangupButton').addEventListener('click', () => endCall());

  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const source = $(button.dataset.copy);
    if (!source.value) return status('Generate the code first.', 'error');
    try {
      await navigator.clipboard.writeText(source.value);
      status('Code copied. Share it only with your intended peer.');
    } catch {
      source.focus(); source.select();
      status('Clipboard unavailable. The code is selected for manual copying.', 'error');
    }
  }));

  $('solidButton').addEventListener('click', () => {
    const solid = document.body.classList.toggle('solid');
    $('solidButton').setAttribute('aria-pressed', solid);
    $('solidButton').textContent = solid ? 'Use translucent surfaces' : 'Use solid surfaces';
  });

  window.addEventListener('pagehide', () => endCall());
})();
