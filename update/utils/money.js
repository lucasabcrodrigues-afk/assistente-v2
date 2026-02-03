// update/utils/money.js
// Helpers for parsing and formatting monetary values.  In this
// system all currency values are represented internally as
// integer centavos (cents), to avoid floating point rounding
// issues.  These helpers convert between human strings, numbers
// and centavos.

/**
 * Convert a value in various forms (number in reais, string with
 * comma/point separators or integer centavos) into an integer
 * representing centavos.  If the input is already a large integer
 * greater than 999 it is treated as centavos.  Strings are
 * normalised by removing thousand separators and replacing comma
 * decimal separators with a dot.
 *
 * @param {number|string} v Value to convert
 * @returns {number} Integer centavos
 */
export function moneyToCentsBR(v) {
  if (typeof v === 'number') {
    // Assume large integers are already centavos
    if (Number.isInteger(v) && Math.abs(v) > 999) return v;
    return Math.round(v * 100);
  }
  if (typeof v !== 'string') return 0;
  const s = v.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Convert a centavos integer into a locale formatted BRL currency
 * string.  Uses the browser's locale formatting with the
 * `pt-BR` locale to ensure correct currency symbol and decimal
 * separators.
 *
 * @param {number} c Centavos
 * @returns {string} Formatted currency string
 */
export function centsToBR(c) {
  const n = (Number(c) || 0) / 100;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Alias for centsToBR for backwards compatibility.  Some legacy
 * modules refer to `moneyBR` so we expose it here.
 *
 * @param {number} c Centavos
 * @returns {string} Formatted currency string
 */
export function moneyBR(c) {
  return centsToBR(c);
}

/*
 * Nova API de utilitários monetários para uso consistente no back-end e eventuais módulos
 * de front-end.  Estes helpers encapsulam o uso de centavos (inteiros) para evitar
 * imprecisões de ponto flutuante. Caso já exista código utilizando as funções
 * `moneyToCentsBR` e `centsToBR`, estas são reexportadas aqui para compatibilidade.
 */

/**
 * Alias de moneyToCentsBR. Converte valores em reais (número ou string) para
 * centavos inteiros.
 * @param {number|string} v
 * @returns {number}
 */
export function toCents(v) {
  return moneyToCentsBR(v);
}

/**
 * Converte centavos inteiros para número em reais com duas casas decimais.
 * Útil quando se precisa de um valor numérico (não formatado) para cálculos
 * adicionais ou exibição controlada.
 * @param {number} c
 * @returns {number}
 */
export function fromCents(c) {
  const n = Number(c) || 0;
  return n / 100;
}

/**
 * Alias de centsToBR. Formata centavos em uma string BRL utilizando locale pt-BR.
 * @param {number} c
 * @returns {string}
 */
export function formatBRL(c) {
  return centsToBR(c);
}

/**
 * Soma centavos múltiplos de maneira segura, tratando entradas não numéricas
 * como zero. Aceita um número arbitrário de parâmetros.
 * @param {...number} values
 * @returns {number}
 */
export function sumCents(...values) {
  return values.reduce((acc, v) => {
    const n = Number(v);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/**
 * Multiplica um valor unitário em centavos por uma quantidade, retornando
 * sempre um inteiro. Utiliza Math.round() para evitar frações quando
 * `unitCents` for fornecido como número de ponto flutuante.
 * @param {number} unitCents
 * @param {number} qty
 * @returns {number}
 */
export function mulCents(unitCents, qty) {
  const unit = Number(unitCents);
  const q = Number(qty);
  const safeUnit = Number.isFinite(unit) ? unit : 0;
  const safeQty = Number.isFinite(q) ? q : 0;
  return Math.round(safeUnit * safeQty);
}