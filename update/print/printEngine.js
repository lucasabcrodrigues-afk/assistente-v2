// update/print/printEngine.js
// Engine for printing receipts.  Opens a new browser window and
// injects a complete HTML document containing the receipt markup
// and inline CSS.  Uses the shared receipt renderer and accepts
// settings that influence paper size and automatic printing.

import { renderReceiptHTML } from './renderer.js';

/**
 * Print a sale receipt.  Opens a pop‑up window containing the
 * rendered receipt and calls `window.print()`.  The CSS is
 * inlined for portability.  See fiscal/index.js for usage.
 *
 * @param {Object} sale Normalised sale
 * @param {Object} settings Print settings with printModel
 * @param {Object} companyInfo Information about the company
 */
export async function printReceipt(sale, settings = {}, companyInfo = {}) {
  const model = settings.printModel || '58mm';
  const css = await loadCss(settings);
  const html = `
    <html lang="pt-br">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Impressão</title>
        <style>${css}</style>
      </head>
      <body class="paper ${model === '80mm' ? 'paper-80' : model === 'A4' ? 'paper-a4' : 'paper-58'}">
        <div id="app">${renderReceiptHTML(sale, { empresa: companyInfo })}</div>
        <script>
          window.onload = () => { setTimeout(() => window.print(), 50); };
        </script>
      </body>
    </html>
  `;
  const w = window.open('', '_blank', 'noopener,noreferrer,width=420,height=700');
  if (!w) throw new Error('Popup bloqueado. Permita popups para imprimir.');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// Load CSS for printing.  At present this returns a hard‑coded
// stylesheet equivalent to the original print.css.  If a custom
// print.css asset is available in your deployment you may fetch
// it here instead.
async function loadCss(settings) {
  return `
    @media print { body{margin:0;} }
    :root{ --font: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    body{ font-family: var(--font); color:#000; background:#fff; }
    .paper{ padding:8px; }
    .paper-58{ width:58mm; }
    .paper-80{ width:80mm; }
    .paper-a4{ width:210mm; }
    .h1{ font-size:14px; font-weight:700; text-align:center; }
    .small{ font-size:11px; }
    .row{ display:flex; justify-content:space-between; gap:8px; }
    .hr{ border-top:1px dashed #000; margin:6px 0; }
    .items{ margin-top:6px; }
    .item{ display:flex; justify-content:space-between; font-size:11px; }
    .item .name{ max-width:70%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .total{ font-size:13px; font-weight:700; }
  `;
}