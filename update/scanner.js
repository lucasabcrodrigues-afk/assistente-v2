// update/scanner.js
// Unified scanner that supports USB barcode scanners (keyboard
// emulation) and camera scanning via the BarcodeDetector API.  The
// module provides an init function to register callbacks for
// decoded codes and an openCamera function to trigger a modal
// camera scanner.

const CFG = {
  onCode: null,
  usb: {
    enabled: true,
    minLength: 4,
    maxGapMs: 35,
    enterTerminates: true,
  },
  camera: { enabled: true },
};

let _buffer = '';
let _lastTs = 0;
let _listening = false;

function emit(code, meta) {
  if (typeof CFG.onCode === 'function') {
    try { CFG.onCode(code, meta || {}); } catch (e) { console.error(e); }
    return true;
  }
  return false;
}

function handleKeydown(e) {
  if (!CFG.usb.enabled) return;
  const t = Date.now();
  const gap = t - _lastTs;
  _lastTs = t;
  // Reset buffer if gap too large
  if (gap > CFG.usb.maxGapMs) _buffer = '';
  const k = e.key;
  // Terminate on Enter
  if (k === 'Enter' && CFG.usb.enterTerminates) {
    const code = _buffer.trim();
    _buffer = '';
    if (code.length >= CFG.usb.minLength) {
      emit(code, { source: 'usb' });
      // Prevent form submission if scanning
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  // Accept digits/letters
  if (k.length === 1) {
    _buffer += k;
  }
}

/**
 * Initialise the scanner.  Merges options into the default
 * configuration and registers a keydown listener once.  Returns
 * an object indicating success.  You should call this once
 * early in your application and provide an onCode callback to
 * receive scanned codes.
 *
 * @param {Object} opts Configuration overrides
 * @returns {Object} Result
 */
export function init(opts = {}) {
  Object.assign(CFG, opts || {});
  if (!_listening) {
    window.addEventListener('keydown', handleKeydown, true);
    _listening = true;
  }
  return { ok: true };
}

/**
 * Open the camera scanner overlay.  Uses the BarcodeDetector API
 * if available.  Presents a full‑screen overlay with a video
 * preview and a close button.  When a barcode is detected the
 * overlay is removed and both the provided onDetected callback and
 * the configured onCode callback are invoked.  Returns a result
 * indicating whether the camera was successfully opened.
 *
 * @param {Object} opts Options
 * @param {Function} [opts.onDetected] Callback when a code is detected
 * @returns {Promise<Object>} Result
 */
export async function openCamera({ onDetected = null } = {}) {
  if (!CFG.camera.enabled) return { ok: false, error: 'Scanner câmera desativado.' };
  // The BarcodeDetector API is only available in secure contexts (https).  In
  // environments such as `file://` or plain http the API will be missing and
  // the camera cannot be used.  Return a failure so the caller can
  // gracefully fall back to the legacy scanner overlay.
  if (!window.isSecureContext) {
    return { ok: false, error: 'Scanner via câmera requer conexão segura (https).' };
  }
  if (!('BarcodeDetector' in window)) {
    return { ok: false, error: 'BarcodeDetector não suportado neste navegador.' };
  }
  const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'] });
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.85)';
  overlay.style.zIndex = '99999';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.innerHTML = '<div style="color:#fff;font-family:Arial;margin-bottom:10px">Aponte a câmera para o código</div>';
  const video = document.createElement('video');
  video.style.width = 'min(92vw, 520px)';
  video.style.borderRadius = '14px';
  video.style.border = '2px solid rgba(255,255,255,0.25)';
  video.setAttribute('playsinline', 'true');
  overlay.appendChild(video);
  const btn = document.createElement('button');
  btn.textContent = 'Fechar';
  btn.style.marginTop = '12px';
  btn.style.padding = '10px 14px';
  btn.style.borderRadius = '10px';
  btn.style.border = '0';
  btn.style.cursor = 'pointer';
  overlay.appendChild(btn);
  document.body.appendChild(overlay);
  let stream = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    overlay.remove();
  };
  btn.addEventListener('click', stop);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    const tick = async () => {
      if (stopped) return;
      try {
        const barcodes = await detector.detect(video);
        if (barcodes && barcodes.length) {
          const code = barcodes[0].rawValue || '';
          if (code) {
            if (typeof onDetected === 'function') onDetected(code);
            emit(code, { source: 'camera' });
            stop();
            return;
          }
        }
      } catch (e) {
        // ignore detection errors
      }
      requestAnimationFrame(tick);
    };
    tick();
    return { ok: true };
  } catch (e) {
    stop();
    return { ok: false, error: e?.message || String(e) };
  }
}

export default { init, openCamera };