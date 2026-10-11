/*
 * ui.js — presentation helpers with no application logic: DOM shortcuts,
 * status pill, toasts, clipboard / share, QR rendering, theming and the
 * pointer-following glass highlight.
 */
(function (global) {
  'use strict';

  const SPV = global.SPV || (global.SPV = {});
  const { t } = SPV.I18n;
  const QR = SPV.QR;

  const doc = global.document;
  const $ = (id) => doc.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---- views + stepper ----------------------------------------------------

  const VIEWS = { setup: 'viewSetup', connect: 'viewConnect', call: 'viewCall' };
  const STEP_OF = { setup: 1, connect: 2, call: 3 };

  function showView(name) {
    for (const [key, id] of Object.entries(VIEWS)) {
      const el = $(id);
      const active = key === name;
      if (el.hidden === active) {
        el.hidden = !active; // restarts the entrance animation when it becomes visible
      }
    }
    const step = STEP_OF[name];
    doc.querySelectorAll('#stepper li').forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('is-active', n === step);
      li.classList.toggle('is-done', n < step);
    });
    $('stepper').hidden = name === 'call';
    global.scrollTo({ top: 0, behavior: 'auto' });
  }

  // ---- status pill --------------------------------------------------------

  let lastStatus = { tone: 'idle', key: 'status.setup' };

  /** @param {'idle'|'busy'|'ok'|'warn'|'error'} tone */
  function setStatus(tone, key) {
    lastStatus = { tone, key };
    renderStatus();
  }

  function renderStatus() {
    $('statusPill').dataset.tone = lastStatus.tone;
    $('statusText').textContent = t(lastStatus.key);
  }

  // ---- toasts -------------------------------------------------------------

  const TOAST_ICON = { ok: '#i-check', error: '#i-alert', info: '#i-info' };

  /** @param {string} message already-translated text */
  function toast(message, tone = 'ok', ms = 3800) {
    const el = doc.createElement('div');
    el.className = 'toast';
    el.dataset.tone = tone;
    el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = doc.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', TOAST_ICON[tone] || TOAST_ICON.ok);
    svg.appendChild(use);
    const span = doc.createElement('span');
    span.textContent = message;
    el.append(svg, span);
    const host = $('toasts');
    while (host.children.length >= 3) host.firstChild.remove();
    host.appendChild(el);
    const close = () => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 320);
    };
    setTimeout(close, ms);
    el.addEventListener('click', close);
    return el;
  }

  // ---- clipboard + share --------------------------------------------------

  async function copyText(text) {
    try {
      await global.navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'sr-only';
      doc.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = doc.execCommand('copy');
      } catch (_) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  /** @returns {Promise<'shared'|'cancelled'|'unsupported'>} */
  async function shareData(data) {
    if (!global.navigator.share) return 'unsupported';
    try {
      await global.navigator.share(data);
      return 'shared';
    } catch (err) {
      return err && err.name === 'AbortError' ? 'cancelled' : 'unsupported';
    }
  }

  // ---- QR -----------------------------------------------------------------

  function renderQr(container, text) {
    const qr = QR.encode(text, { maxVersion: 32 });
    const border = 3;
    const size = qr.size + border * 2;
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', QR.toSvgPath(qr, border));
    path.setAttribute('fill', '#000');
    svg.appendChild(path);
    container.replaceChildren(svg);
    return qr;
  }

  // ---- theme --------------------------------------------------------------

  function applyTheme(pref) {
    const root = doc.documentElement;
    if (pref === 'light' || pref === 'dark') root.dataset.theme = pref;
    else delete root.dataset.theme;
  }

  // ---- liquid highlight ---------------------------------------------------

  function initGlassPointer() {
    if (!global.matchMedia || !global.matchMedia('(hover: hover)').matches) return;
    let frame = 0;
    let pending = null;
    doc.addEventListener(
      'pointermove',
      (e) => {
        pending = e;
        if (frame) return;
        frame = global.requestAnimationFrame(() => {
          frame = 0;
          const target = pending.target.closest && pending.target.closest('.glass');
          if (!target) return;
          const r = target.getBoundingClientRect();
          target.style.setProperty('--mx', `${pending.clientX - r.left}px`);
          target.style.setProperty('--my', `${pending.clientY - r.top}px`);
        });
      },
      { passive: true },
    );
  }

  // ---- misc ---------------------------------------------------------------

  function setIcon(svg, symbolId) {
    svg.querySelector('use').setAttribute('href', symbolId);
  }

  function fmt(value, unit, digits = 0) {
    return value === null || value === undefined || Number.isNaN(value) ? '–' : `${value.toFixed(digits)} ${unit}`;
  }

  SPV.UI = {
    $,
    showView,
    setStatus,
    renderStatus,
    toast,
    copyText,
    shareData,
    renderQr,
    applyTheme,
    initGlassPointer,
    setIcon,
    fmt,
  };

  if (typeof module === 'object' && module.exports) module.exports = SPV.UI;
})(typeof window !== 'undefined' ? window : globalThis);
