// update/utils/log.js
// Simple logging helpers used throughout the update module.  These
// functions centralise error and warning logging so that we can
// later extend them to send logs to a remote service or to
// integrate with an in‑browser console.

/**
 * Log an error to the console.  Always uses console.error so that
 * stack traces remain visible in developer tools.  In future this
 * could be extended to display user‑friendly notifications.
 *
 * @param {...any} args Arguments to pass through to console.error
 */
export function error(...args) {
  try {
    console.error(...args);
  } catch (e) {
    // ignore logging failures
  }
}

/**
 * Log a warning to the console.  Uses console.warn to highlight
 * potential issues without interrupting execution.  This helper
 * makes it easy to disable or redirect warnings globally.
 *
 * @param {...any} args Arguments to pass through to console.warn
 */
export function warn(...args) {
  try {
    console.warn(...args);
  } catch (e) {
    // ignore logging failures
  }
}

/**
 * Informational logging.  Uses console.log; this function can be
 * suppressed in production builds if desired.
 *
 * @param {...any} args Arguments to pass through to console.log
 */
export function info(...args) {
  try {
    console.log(...args);
  } catch (e) {
    // ignore logging failures
  }
}