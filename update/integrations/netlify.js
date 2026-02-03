// update/integrations/netlify.js
// A collection of simple integrations designed for deployment on
// Netlify or other static hosts.  Includes WhatsApp sharing, web
// share API, barcode scanning via the camera, printing of non
// fiscal receipts and helper functions for formatting money and
// dates.

import { moneyToCentsBR, moneyBR } from '../utils/money.js';

// --- WhatsApp / Share API ---

/**
 * Open a WhatsApp share URL with the given text and optional phone.
 * The phone number should be passed as a string containing only
 * digits (country + area + number).  If omitted the user will be
 * prompted to enter the destination in WhatsApp.
 *
 * @param {string} texto Message text
 * @param {string} [telefone] Phone number (E.164 without '+')
 */
export function shareWhatsApp(texto, telefone) {
  const msg = encodeURIComponent(texto || '');
  let url = 'https://wa.me/';
  if (telefone) {
    url += telefone.replace(/\D/g, '');
  }
  url += `?text=${msg}`;
  window.open(url, '_blank', 'noopener');
}

/**
 * Use the Web Share API to share a plain text message.  Returns
 * an object indicating success or failure and includes an error
 * message if the share API is unavailable or the user cancels.
 *
 * @param {string} texto Message to share
 * @returns {Promise<Object>} Result object
 */
export async function shareSystem(texto) {
  if (navigator.share) {
    try {
      await navigator.share({ text: texto || '' });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
  return { ok: false, error: 'Web Share API indisponível' };
}

// --- Simple stock lookup ---

/**
 * Find a product in the estoque array by matching the code.  The
 * comparison is case insensitive and trims spaces on the code.
 *
 * @param {string} code Product code
 * @param {Array<Object>} estoqueArray Array of products
 * @returns {Object|null} Matching product or null
 */
export function lookupInEstoque(code, estoqueArray) {
  const c = String(code || '').trim();
  if (!c) return null;
  const arr = Array.isArray(estoqueArray) ? estoqueArray : [];
  return arr.find(p => String(p.cod || '').trim() === c) || null;
}

// --- Camera scanning (BarcodeDetector) ---
let _scanStream = null;
let _scanVideo = null;
let _scanTimer = null;
let _detector = null;

/**
 * Start the camera to scan barcodes.  Uses the BarcodeDetector API
 * if available.  Calls onCode when a barcode is detected and
 * automatically stops scanning.  Optionally accepts a video
 * element to render the camera feed.
 *
 * @param {Object} opts Options
 * @param {Function} [opts.onCode] Callback with detected code
 * @param {Function} [opts.onError] Callback on error
 * @param {HTMLVideoElement} [opts.videoEl] Video element to use
 * @returns {Promise<Object>} Result with ok flag and video element
 */
export async function startCameraScan({ onCode, onError, videoEl } = {}) {
  try {
    if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Câmera indisponível neste navegador.');
    }
    if (!('BarcodeDetector' in window)) {
      throw new Error('BarcodeDetector não suportado. Use um navegador compatível.');
    }
    _detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e'] });
    _scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    _scanVideo = videoEl || document.createElement('video');
    _scanVideo.setAttribute('playsinline', 'true');
    _scanVideo.muted = true;
    _scanVideo.srcObject = _scanStream;
    await _scanVideo.play();
    const tick = async () => {
      try {
        if (!_scanVideo || _scanVideo.readyState < 2) return;
        const codes = await _detector.detect(_scanVideo);
        if (codes && codes.length) {
          const raw = codes[0].rawValue || '';
          if (raw) {
            if (typeof onCode === 'function') onCode(raw);
            stopCameraScan();
          }
        }
      } catch (e) {
        // ignore intermittent detection errors
      }
    };
    _scanTimer = window.setInterval(tick, 200);
    return { ok: true, video: _scanVideo };
  } catch (e) {
    if (typeof onError === 'function') onError(e);
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Stop the camera scan and clean up resources.  Safe to call even
 * if scanning has not been started.  Resets internal state.
 */
export function stopCameraScan() {
  if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null; }
  if (_scanVideo) { try { _scanVideo.pause(); } catch (e) {} _scanVideo = null; }
  if (_scanStream) {
    try { _scanStream.getTracks().forEach(t => t.stop()); } catch (e) {}
    _scanStream = null;
  }
  _detector = null;
}

// --- Non‑fiscal receipt printing ---

/**
 * Build the HTML for a non‑fiscal receipt.  Generates a ticket
 * layout with items, totals and payment information.  Accepts
 * optional paper size to adjust CSS classes.
 *
 * @param {Object} venda Sale object containing itens, totals, etc.
 * @param {string} paper Paper size: '58mm' | '80mm' | 'A4'
 * @returns {string} HTML string
 */
function buildReciboHTML(venda, paper) {
  const p = paper === '80mm' ? 'small80' : (paper === 'A4' ? 'a4' : 'small58');
  const itens = Array.isArray(venda?.itens) ? venda.itens : [];
  const subtotal = venda?.subtotal_c ?? itens.reduce((s, i) => s + (Number(i.preco_c) || 0) * (Number(i.qtd) || 0), 0);
  const desconto = Number(venda?.desconto_c) || 0;
  const total = Number(venda?.total_c) || (subtotal - desconto);
  const pag = venda?.pagamento || {};
  const recebido = Number(pag.recebido_c) || 0;
  const troco = Number(pag.troco_c) || Math.max(0, recebido - total);
  const rows = itens.map(i => {
    const qtd = Number(i.qtd) || 0;
    const pc = Number(i.preco_c) || 0;
    const vl = qtd * pc;
    const nome = String(i.nome || '').slice(0, 44);
    return `
      <div class="row item">
        <div class="name">${escapeHtml(nome)}</div>
        <div class="qty">${qtd}x</div>
        <div class="val">${moneyBR(vl)}</div>
      </div>`;
  }).join('');
  const id = venda?.id ? String(venda.id) : 'SEM-ID';
  const cliente = venda?.cliente ? String(venda.cliente) : 'Consumidor Final';
  const data = fmtDate(venda?.dataIso);
  return `
    <div class="print-wrap ${p}">
      <div class="ticket">
        <div class="center h" style="font-size:14px">COMPROVANTE (NÃO FISCAL)</div>
        <div class="center muted">${data}</div>
        <div class="sep"></div>
        <div class="muted"><span class="h">Venda:</span> ${escapeHtml(id)}</div>
        <div class="muted"><span class="h">Cliente:</span> ${escapeHtml(cliente)}</div>
        <div class="sep"></div>
        ${rows || '<div class="muted">Sem itens.</div>'}
        <div class="sep"></div>
        <div class="row"><div>Subtotal</div><div>${moneyBR(subtotal)}</div></div>
        ${desconto ? `<div class="row"><div>Desconto</div><div>- ${moneyBR(desconto)}</div></div>` : ''}
        <div class="row tot"><div>Total</div><div>${moneyBR(total)}</div></div>
        <div class="sep"></div>
        <div class="muted"><span class="h">Pagamento:</span> ${escapeHtml(String(pag.metodo || ''))}</div>
        ${recebido ? `<div class="row"><div>Recebido</div><div>${moneyBR(recebido)}</div></div>` : ''}
        ${troco ? `<div class="row"><div>Troco</div><div>${moneyBR(troco)}</div></div>` : ''}
        <div class="sep"></div>
        <div class="center muted">Obrigado pela preferência!</div>
      </div>
    </div>`;
}

/**
 * Escape HTML entities in a string.  Converts five common special
 * characters into their HTML entity equivalents to prevent markup
 * injection and XSS.  Fixes a previous issue where the single
 * quote key was malformed.
 *
 * @param {string} s Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(s) {
  return String(s || '').replace(/[&<>'"]/g, (c) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return map[c] || c;
  });
}

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDate(iso) {
  try {
    const d = iso ? new Date(iso) : new Date();
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch (e) { return ''; }
}

/**
 * Print a non‑fiscal receipt in a pop‑up window.  Builds the HTML
 * using buildReciboHTML and writes it into a new window with the
 * appropriate CSS.  Auto printing is optional.
 *
 * @param {Object} venda Sale object
 * @param {Object} opts Options
 * @param {string} [opts.paper='58mm'] Paper size
 * @param {boolean} [opts.auto=true] Auto print on load
 * @returns {Object} Result object
 */
export function printRecibo(venda, { paper = '58mm', auto = true } = {}) {
  const html = buildReciboHTML(venda, paper);
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return { ok: false, error: 'Pop-up bloqueado. Permita pop-ups para imprimir.' };
  const cssHref = (() => {
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    const found = links.find(l => (l.getAttribute('href') || '').includes('print_templates.css') || (l.getAttribute('href') || '').includes('print_receipt.css'));
    return found ? found.href : null;
  })();
  w.document.open();
  w.document.write(`<!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Impressão</title>
      ${cssHref ? `<link rel="stylesheet" href="${cssHref}">` : ''}
      <style>
        /* fallback simples caso css não esteja disponível */
        ${cssHref ? '' : '@media print{body{font-family:Arial,sans-serif}}'}
      </style>
    </head>
    <body>${html}</body></html>`);
  w.document.close();
  if (auto) {
    w.onload = () => {
      try { w.focus(); w.print(); } catch (e) {}
    };
  }
  return { ok: true };
}

/**
 * Build a plain text representation of a receipt for sharing via
 * WhatsApp or other chat applications.  Includes items, totals
 * and payment method in a human readable format.  Uses
 * asterisks to emphasise sections as per original implementation.
 *
 * @param {Object} venda Sale object
 * @returns {string} Formatted receipt text
 */
export function buildReciboTexto(venda) {
  const itens = Array.isArray(venda?.itens) ? venda.itens : [];
  const subtotal = venda?.subtotal_c ?? itens.reduce((s, i) => s + (Number(i.preco_c) || 0) * (Number(i.qtd) || 0), 0);
  const desconto = Number(venda?.desconto_c) || 0;
  const total = Number(venda?.total_c) || (subtotal - desconto);
  const id = venda?.id ? String(venda.id) : 'SEM-ID';
  const data = fmtDate(venda?.dataIso);
  const linhas = [];
  linhas.push('*COMPROVANTE (NÃO FISCAL)*');
  linhas.push(`${data}`);
  linhas.push(`Venda: ${id}`);
  linhas.push('');
  itens.forEach(i => {
    const qtd = Number(i.qtd) || 0;
    const pc = Number(i.preco_c) || 0;
    linhas.push(`- ${qtd}x ${i.nome} (${moneyBR(pc)})`);
  });
  linhas.push('');
  linhas.push(`Subtotal: ${moneyBR(subtotal)}`);
  if (desconto) linhas.push(`Desconto: - ${moneyBR(desconto)}`);
  linhas.push(`*Total: ${moneyBR(total)}*`);
  const pag = venda?.pagamento || {};
  if (pag.metodo) linhas.push(`Pagamento: ${pag.metodo}`);
  return linhas.join('\n');
}

// Export as a single object for compatibility
const IntegracoesNetlify = {
  shareWhatsApp,
  shareSystem,
  lookupInEstoque,
  startCameraScan,
  stopCameraScan,
  printRecibo,
  buildReciboTexto,
};

export default IntegracoesNetlify;