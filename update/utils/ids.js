// update/utils/ids.js
// Utility for generating unique identifiers.  IDs are composed of
// a prefix, the current timestamp and a random hex string.  This
// replicates the behaviour of legacy modules which generated IDs
// with `uid()` and ensures they remain unique across page reloads.

/**
 * Generate a pseudo‑unique identifier.  A prefix may be supplied
 * to namespace the ID; if omitted the default `id` prefix is
 * used.  The timestamp provides millisecond resolution and the
 * random component adds entropy to avoid collisions when called
 * multiple times in quick succession.
 *
 * @param {string} [prefix='id'] Optional prefix
 * @returns {string} Unique identifier string
 */
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

// Alias for backward compatibility: some modules expect generateId()
export const generateId = uid;

export default {
  uid,
  generateId,
};