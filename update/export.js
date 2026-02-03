// update/export.js
// Utilities for exporting report data to CSV and building a
// printable HTML report.  This module replicates functionality
// originally provided by the reports export module but adapted to
// ES modules and the unified structure.

/**
 * Escape a value for inclusion in a CSV field.  Values containing
 * commas, semicolons, quotes or newlines are wrapped in quotes and
 * internal quotes are doubled.  Null or undefined values are
 * converted to empty strings.
 *
 * @param {any} val Value to escape
 * @returns {string} Escaped value
 */
function escapeCSV(val) {
  const s = (val === null || val === undefined) ? '' : String(val);
  if (/[;",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Convert an array of objects into a CSV string.  Uses the keys of
 * the first row to build the header.  By default a semicolon is
 * used as the delimiter as is common in Brazilian locales.
 *
 * @param {Array<Object>} rows Data rows
 * @param {Object} opts Options
 * @param {string} [opts.delimiter=';'] Field delimiter
 * @returns {string} CSV text
 */
export function toCSV(rows, { delimiter = ';' } = {}) {
  const arr = Array.isArray(rows) ? rows : [];
  if (!arr.length) return '';
  const cols = Object.keys(arr[0]);
  const head = cols.map(escapeCSV).join(delimiter);
  const body = arr.map(r => cols.map(c => escapeCSV(r[c])).join(delimiter)).join('\n');
  return head + '\n' + body;
}

/**
 * Trigger a browser download of a CSV file.  Creates a Blob and a
 * temporary anchor element to prompt the user to save the file.
 *
 * @param {string} filename File name to suggest to the user
 * @param {string} csvText CSV content
 */
export function downloadCSV(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// (Removed duplicate escapeHtml documentation. See below for the
// consolidated documentation and implementation.)
/**
 * Escape HTML entities in a string.  Converts special characters
 * to their corresponding HTML entities to prevent breaking markup
 * or introducing XSS.  Handles the five common characters: ampersand,
 * less-than, greater-than, single quote and double quote.  This
 * implementation corrects a bug in the previous version where the
 * single quote key in the replacement map was malformed.
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

/**
 * Build a simple printable HTML report summarising sales, cash,
 * stock and debtors for a period.  The report is returned as a
 * complete HTML document which can be written into a new window for
 * printing.  See README for usage.
 *
 * @param {Object} period Period with startIso and endIso
 * @param {Object} blocks Summary blocks: sales, cash, stock, debt
 * @returns {string} HTML document string
 */
export function buildPrintableReport(period, blocks) {
  const s = period?.startIso || '';
  const e = period?.endIso || '';
  const sales = blocks?.sales || {};
  const cash = blocks?.cash || {};
  const stock = blocks?.stock || {};
  const debt = blocks?.debt || {};
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório</title>
<style>
  body{font-family:Arial,sans-serif;margin:24px;color:#111}
  h1{margin:0 0 8px 0}
  h2{margin:18px 0 8px 0}
  .muted{color:#444}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .card{border:1px solid #ddd;border-radius:10px;padding:12px}
  .row{display:flex;justify-content:space-between;gap:16px}
  .big{font-size:18px;font-weight:700}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border-bottom:1px solid #eee;padding:6px 4px;font-size:13px;text-align:left}
  @media print{ body{margin:0} .no-print{display:none} }
</style>
</head><body>
<div class="no-print muted">Relatório pronto para impressão (PDF-lite via impressão do navegador)</div>
<h1>Relatório do Período</h1>
<div class="muted">De ${escapeHtml(s)} até ${escapeHtml(e)}</div>

<h2>Vendas</h2>
<div class="grid">
  <div class="card"><div class="row"><div>Total</div><div class="big">${escapeHtml(sales.total_fmt || '')}</div></div></div>
  <div class="card"><div class="row"><div>Quantidade</div><div class="big">${escapeHtml(String(sales.count || 0))}</div></div></div>
  <div class="card"><div class="row"><div>Ticket médio</div><div class="big">${escapeHtml(sales.ticketMedio_fmt || '')}</div></div></div>
</div>

<h2>Caixa</h2>
<div class="grid">
  <div class="card"><div class="row"><div>Sessões</div><div class="big">${escapeHtml(String(cash.sessions || 0))}</div></div></div>
  <div class="card"><div class="row"><div>Esperado</div><div class="big">${escapeHtml(cash.expected_fmt || '')}</div></div></div>
  <div class="card"><div class="row"><div>Contado</div><div class="big">${escapeHtml(cash.counted_fmt || '')}</div></div></div>
  <div class="card"><div class="row"><div>Diferença</div><div class="big">${escapeHtml(cash.diff_fmt || '')}</div></div></div>
</div>

<h2>Estoque</h2>
<div class="grid">
  <div class="card"><div class="row"><div>Total de itens</div><div class="big">${escapeHtml(String(stock.totalItens || 0))}</div></div></div>
  <div class="card"><div class="row"><div>Baixo estoque</div><div class="big">${escapeHtml(String(stock.baixoEstoqueCount || 0))}</div></div></div>
</div>
${(stock.baixoEstoque && stock.baixoEstoque.length) ? `
  <table>
    <thead><tr><th>Código</th><th>Produto</th><th>Qtd</th><th>Mín</th></tr></thead>
    <tbody>
      ${stock.baixoEstoque.map(p => `<tr><td>${escapeHtml(p.cod)}</td><td>${escapeHtml(p.nome)}</td><td>${escapeHtml(String(p.qtd))}</td><td>${escapeHtml(String(p.min))}</td></tr>`).join('')}
    </tbody>
  </table>` : ''}

<h2>Devedores</h2>
<div class="grid">
  <div class="card"><div class="row"><div>Clientes</div><div class="big">${escapeHtml(String(debt.count || 0))}</div></div></div>
  <div class="card"><div class="row"><div>Total pendente</div><div class="big">${escapeHtml(debt.pendente_fmt || '')}</div></div></div>
</div>

</body></html>`;
}

/**
 * Open a new window or tab and write HTML into it so the user can
 * print the report.  If the pop‑up is blocked an error is
 * returned.
 *
 * @param {string} html Complete HTML document
 * @returns {Object} Result of the attempt
 */
export function openPrintWindow(html) {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return { ok: false, error: 'Pop-up bloqueado.' };
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onload = () => { try { w.focus(); } catch (e) { /* ignore */ } };
  return { ok: true };
}

export default { toCSV, downloadCSV, buildPrintableReport, openPrintWindow };