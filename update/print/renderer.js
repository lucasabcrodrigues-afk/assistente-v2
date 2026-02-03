// update/print/renderer.js
// Receipt HTML renderer.  Produces the inner markup for a sales
// receipt given a normalised sale object.  This function is used
// by the print engine to inject the receipt into a window before
// printing.  All currency values are formatted using the shared
// centsToBR helper.

import { centsToBR } from '../utils/money.js';

/**
 * Render a receipt as an HTML string.  The returned markup is
 * intended to be inserted into a wrapper page which includes
 * appropriate CSS.  Company info may be passed via opts.
 *
 * @param {Object} sale Normalised sale
 * @param {Object} opts Options
 * @param {Object} [opts.empresa] Company details { nome }
 * @returns {string} HTML fragment
 */
export function renderReceiptHTML(sale, opts = {}) {
  const empresa = opts?.empresa || { nome: 'Sua Empresa' };
  const lines = [];
  lines.push(`<div class="h1">${escapeHtml(empresa.nome)}</div>`);
  lines.push(`<div class="small">Venda: ${escapeHtml(String(sale.numero || sale.id))}</div>`);
  lines.push(`<div class="small">Data: ${escapeHtml(new Date(sale.data).toLocaleString('pt-BR'))}</div>`);
  if (sale.operador) lines.push(`<div class="small">Operador: ${escapeHtml(String(sale.operador))}</div>`);
  lines.push(`<div class="hr"></div>`);
  lines.push(`<div class="items">`);
  for (const it of sale.itens) {
    const qtd = Number(it.qtd || 0);
    const unit = centsToBR(it.preco_c);
    const tot = centsToBR(it.total_c ?? (it.preco_c * qtd));
    lines.push(`<div class="item"><div class="name">${escapeHtml(it.nome || it.cod)}</div><div>${qtd}x</div><div>${unit}</div><div>${tot}</div></div>`);
  }
  lines.push(`</div>`);
  lines.push(`<div class="hr"></div>`);
  lines.push(`<div class="row total"><div>Total</div><div>${centsToBR(sale.total_c)}</div></div>`);
  if (sale.pagamentos?.length) {
    lines.push(`<div class="hr"></div>`);
    lines.push(`<div class="small">Pagamentos</div>`);
    for (const p of sale.pagamentos) {
      lines.push(`<div class="row small"><div>${escapeHtml(p.tipo)}</div><div>${centsToBR(p.valor_c)}</div></div>`);
    }
  }
  if (sale.troco_c && sale.troco_c > 0) {
    lines.push(`<div class="row small"><div>Troco</div><div>${centsToBR(sale.troco_c)}</div></div>`);
  }
  lines.push(`<div class="hr"></div>`);
  lines.push(`<div class="small" style="text-align:center">Obrigado pela preferência!</div>`);
  return lines.join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]|'/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}