// update/whatsapp.js
// Simplified WhatsApp integration.  Provides helpers to build a
// click‑to‑chat link and open WhatsApp in a new tab.  Also
// normalises Brazilian phone numbers into E.164 format.

/**
 * Normalise a phone number to E.164.  Assumes Brazilian numbers
 * when no country code is present.  Removes all non‑digit
 * characters.
 *
 * @param {string|number} phone Phone number
 * @returns {string} Normalised phone (e.g. '5591999999999')
 */
export function normalizePhoneE164(phone) {
  const s = String(phone || '').replace(/\D/g, '');
  if (!s) return '';
  if (s.startsWith('55')) return s;
  return '55' + s;
}

/**
 * Build a WhatsApp click‑to‑chat URL.  Takes an optional E.164
 * phone number and a message string which is URI encoded.
 *
 * @param {Object} opts Options
 * @param {string} [opts.phoneE164] Phone number in E.164 (digits only)
 * @param {string} [opts.text] Message text
 * @returns {string} WhatsApp URL
 */
export function buildLink({ phoneE164, text } = {}) {
  const p = normalizePhoneE164(phoneE164);
  const t = encodeURIComponent(String(text || ''));
  if (p) return `https://wa.me/${p}?text=${t}`;
  return `https://wa.me/?text=${t}`;
}

/**
 * Open a WhatsApp chat with the specified message and phone.  Uses
 * window.open() to launch in a new tab.  Returns the URL for
 * testing convenience.
 *
 * @param {Object} opts Options
 * @param {string} [opts.phoneE164] Phone number in E.164
 * @param {string} [opts.text] Message text
 * @returns {Object} Result containing the URL
 */
export function sendText({ phoneE164, text } = {}) {
  const url = buildLink({ phoneE164, text });
  window.open(url, '_blank', 'noopener,noreferrer');
  return { ok: true, url };
}

export default { buildLink, sendText, normalizePhoneE164 };