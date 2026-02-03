// update/services/ops_cashier.js
// Implements cashier session management.  Supports opening and
// closing sessions, recording movements (sales, refunds, sangria,
// reforço) and computing expected versus counted totals.  Each
// session has its own list of movements and metadata about who
// performed operations.

import * as dbCore from '../storage/db_core.js';
import { asInt } from '../storage/validate.js';
import { generateId } from '../utils/ids.js';
import { nowIso } from '../utils/date.js';

function ensureCollections(db) {
  db.cashSessions = Array.isArray(db.cashSessions) ? db.cashSessions : [];
  db.caixa = db.caixa && typeof db.caixa === 'object' ? db.caixa : { aberto: false, currentSessionId: null };
  db.caixa.aberto = !!db.caixa.aberto;
  db.caixa.currentSessionId = db.caixa.currentSessionId || null;
  return db;
}

function currentSession(db) {
  db = ensureCollections(db);
  if (!db.caixa.currentSessionId) return null;
  return db.cashSessions.find((s) => s && s.id === db.caixa.currentSessionId) || null;
}

/**
 * Initialise the cash module.  No configuration is needed; this
 * function exists for API symmetry.
 */
export function init(/*opts*/) {
  return { ok: true };
}

/**
 * Open a new cash session.  Only one session may be active at a
 * time.  Records the initial amount, operator and optional note.
 *
 * @param {Object} args Parameters
 * @param {number} [args.initial_c] Initial amount in cents
 * @param {string} [args.note] Note/observation
 * @returns {Object} Result
 */
export function open({ initial_c = 0, note = '' } = {}) {
  const db = ensureCollections(dbCore.get());
  if (db.caixa.aberto) return { ok: false, error: 'Caixa já está aberto.' };
  const user = (window?.CoreUsers && window.CoreUsers.auth && typeof window.CoreUsers.auth.currentUser === 'function')
    ? window.CoreUsers.auth.currentUser()
    : null;
  const id = generateId('cs');
  const sess = {
    id,
    openedAtIso: nowIso(),
    closedAtIso: null,
    openedBy: user ? { id: user.id, username: user.username, role: user.role } : null,
    closedBy: null,
    initial_c: asInt(initial_c, 0),
    expected_c: asInt(initial_c, 0),
    counted_c: null,
    diff_c: null,
    note: note || '',
    movements: [],
  };
  db.cashSessions.push(sess);
  db.caixa.aberto = true;
  db.caixa.currentSessionId = id;
  dbCore.safeSave(db);
  // audit
  try {
    if (window?.CoreUsers && window.CoreUsers.audit && typeof window.CoreUsers.audit.log === 'function') {
      window.CoreUsers.audit.log({ action: 'caixa.abrir', entity: 'caixa', entityId: id, before: null, after: { initial_c: sess.initial_c }, meta: { note } });
    }
  } catch (e) {}
  return { ok: true, sessionId: id };
}

// Internal helper to add a movement and update expected total
function addMovement(type, amount_c, meta) {
  const db = ensureCollections(dbCore.get());
  const sess = currentSession(db);
  if (!sess) return { ok: false, error: 'Caixa não está aberto.' };
  const mv = {
    id: generateId('cm'),
    atIso: nowIso(),
    type,
    amount_c: asInt(amount_c, 0),
    meta: meta || null,
  };
  sess.movements.push(mv);
  sess.expected_c = asInt(sess.expected_c, 0) + mv.amount_c;
  dbCore.safeSave(db);
  // audit
  try {
    if (window?.CoreUsers && window.CoreUsers.audit && typeof window.CoreUsers.audit.log === 'function') {
      window.CoreUsers.audit.log({ action: `caixa.movimento.${type}`, entity: 'caixa', entityId: sess.id, before: null, after: { amount_c: mv.amount_c }, meta });
    }
  } catch (e) {}
  return { ok: true, movementId: mv.id, expected_c: sess.expected_c };
}

/** Add sale amount to the current session */
export function addSale({ saleId, amount_c, meta = null } = {}) {
  return addMovement('venda', Math.abs(asInt(amount_c, 0)), { saleId, ...meta });
}

/** Add refund to the current session (estorno).  The amount should be positive; it will be negated internally. */
export function addVoid({ saleId, amount_c, reason = '' } = {}) {
  const amt = -Math.abs(asInt(amount_c, 0));
  return addMovement('estorno', amt, { saleId, reason });
}

/** Withdraw money from the cashier (sangria) */
export function withdraw({ amount_c, reason = 'Sangria' } = {}) {
  return addMovement('sangria', -Math.abs(asInt(amount_c, 0)), { reason });
}

/** Add money to the cashier (reforço) */
export function reinforce({ amount_c, reason = 'Reforço' } = {}) {
  return addMovement('reforco', Math.abs(asInt(amount_c, 0)), { reason });
}

/** Close the current cash session.  Records counted amount, computes diff and marks session as closed. */
export function close({ counted_c, note = '' } = {}) {
  const db = ensureCollections(dbCore.get());
  const sess = currentSession(db);
  if (!sess) return { ok: false, error: 'Caixa não está aberto.' };
  const user = (window?.CoreUsers && window.CoreUsers.auth && typeof window.CoreUsers.auth.currentUser === 'function')
    ? window.CoreUsers.auth.currentUser()
    : null;
  sess.closedAtIso = nowIso();
  sess.closedBy = user ? { id: user.id, username: user.username, role: user.role } : null;
  sess.counted_c = asInt(counted_c, 0);
  sess.diff_c = asInt(sess.counted_c, 0) - asInt(sess.expected_c, 0);
  sess.note = note || sess.note || '';
  db.caixa.aberto = false;
  db.caixa.currentSessionId = null;
  dbCore.safeSave(db);
  // audit
  try {
    if (window?.CoreUsers && window.CoreUsers.audit && typeof window.CoreUsers.audit.log === 'function') {
      window.CoreUsers.audit.log({ action: 'caixa.fechar', entity: 'caixa', entityId: sess.id, before: null, after: { expected_c: sess.expected_c, counted_c: sess.counted_c, diff_c: sess.diff_c }, meta: { note } });
    }
  } catch (e) {}
  return { ok: true, sessionId: sess.id, expected_c: sess.expected_c, counted_c: sess.counted_c, diff_c: sess.diff_c };
}

/** Return a copy of the current session or null if closed. */
export function getCurrent() {
  const db = ensureCollections(dbCore.get());
  const sess = currentSession(db);
  return sess ? JSON.parse(JSON.stringify(sess)) : null;
}

/**
 * List recent cash sessions.  Sessions are returned from oldest
 * to newest and limited by the `limit` parameter.
 *
 * @param {Object} args Options
 * @param {number} [args.limit] Maximum number of sessions to return
 * @returns {Array} Array of session objects
 */
export function listSessions({ limit = 30 } = {}) {
  const db = ensureCollections(dbCore.get());
  const a = db.cashSessions.slice();
  return a.slice(Math.max(0, a.length - limit));
}

export default {
  init,
  open,
  close,
  withdraw,
  reinforce,
  addSale,
  addVoid,
  getCurrent,
  listSessions,
};