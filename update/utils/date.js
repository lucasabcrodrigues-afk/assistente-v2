// update/utils/date.js
// Utility functions for handling dates and time periods.  These
// helpers provide simple parsing and comparison logic used across
// the update module.  The goal is to centralise all date logic in
// one place so that formatting and boundary checks remain
// consistent throughout the code base.

/**
 * Return the current time as an ISO‑8601 string.  This helper is
 * used instead of `new Date().toISOString()` directly so that it
 * can be mocked or overridden in tests if necessary.
 *
 * @returns {string} ISO string representing now
 */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * Attempt to parse a date from an arbitrary object.  Many
 * structures in the ERP store date information under different
 * property names.  This function tries a list of common fields and
 * returns a Date object if a valid ISO string is found.  If no
 * date can be parsed it returns null.
 *
 * @param {Object} obj Object which may contain a date field
 * @returns {Date|null} Parsed date or null
 */
export function parseDateAny(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = [
    obj.dataIso, obj.dateIso, obj.createdAt, obj.updatedAt,
    obj.data, obj.date, obj.atIso, obj.openedAtIso, obj.closedAtIso,
  ];
  const cand = candidates.find(x => x);
  if (!cand) return null;
  const d = new Date(cand);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Determine whether a date falls within an inclusive start/end
 * period.  If no start or end boundaries are specified the period
 * is considered unbounded on that side.  Invalid or null dates
 * return false.
 *
 * @param {Date|null} dateObj Date to test
 * @param {Object} period Period boundaries
 * @param {string} [period.startIso] ISO string for start (inclusive)
 * @param {string} [period.endIso] ISO string for end (inclusive)
 * @returns {boolean} True if date falls within period
 */
export function inPeriod(dateObj, { startIso, endIso } = {}) {
  if (!dateObj || !(dateObj instanceof Date)) return false;
  const t = dateObj.getTime();
  const s = startIso ? new Date(startIso).getTime() : -Infinity;
  const e = endIso ? new Date(endIso).getTime() : Infinity;
  return t >= s && t <= e;
}