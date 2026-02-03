// update/reports/cash.js
// Cash session report functions.  Produces a list of cash sessions
// and aggregates totals across a given period.  Sessions include
// opening and closing times and expected/count differences.

import { get as getDB } from '../storage/db_core.js';
import { parseDateAny, inPeriod } from '../utils/date.js';
import { moneyBR } from '../utils/money.js';

// Helper to parse the date of a cash session
function sessionDate(s) {
  const d = s?.openedAtIso ? new Date(s.openedAtIso) : parseDateAny(s);
  return d && !isNaN(d.getTime()) ? d : null;
}

/**
 * Generate rows for each cash session within the period.  Each
 * row normalises numeric fields to integers and stringifies ids.
 *
 * @param {Object} period Period filter with startIso/endIso
 * @returns {Array<Object>} Session rows
 */
export function rows(period) {
  const db = getDB();
  const ss = Array.isArray(db.cashSessions) ? db.cashSessions : [];
  const out = [];
  for (const s of ss) {
    if (!s) continue;
    const d = sessionDate(s);
    if (!inPeriod(d, period)) continue;
    out.push({
      id: String(s.id),
      openedAtIso: String(s.openedAtIso || ''),
      closedAtIso: String(s.closedAtIso || ''),
      initial_c: Number(s.initial_c) || 0,
      expected_c: Number(s.expected_c) || 0,
      counted_c: (s.counted_c === null || s.counted_c === undefined) ? '' : (Number(s.counted_c) || 0),
      diff_c: (s.diff_c === null || s.diff_c === undefined) ? '' : (Number(s.diff_c) || 0),
    });
  }
  return out;
}

/**
 * Compute aggregate statistics for cash sessions.  Sums expected,
 * counted and difference values and returns both raw centavos and
 * formatted BRL strings.
 *
 * @param {Object} period Period filter
 * @returns {Object} Summary of sessions
 */
export function summary(period) {
  const rs = rows(period);
  const expected_c = rs.reduce((s, r) => s + (Number(r.expected_c) || 0), 0);
  const counted_c = rs.reduce((s, r) => s + (Number(r.counted_c) || 0), 0);
  const diff_c = rs.reduce((s, r) => s + (Number(r.diff_c) || 0), 0);
  return {
    sessions: rs.length,
    expected_c,
    expected_fmt: moneyBR(expected_c),
    counted_c,
    counted_fmt: moneyBR(counted_c),
    diff_c,
    diff_fmt: moneyBR(diff_c),
  };
}

export default { rows, summary };

/**
 * Initialise the cash report module.  Exists for API
 * compatibility with the installer.  Does nothing.
 *
 * @param {Object} opts Options (unused)
 * @returns {Object} Result
 */
export function init(opts = {}) {
  return { ok: true };
}