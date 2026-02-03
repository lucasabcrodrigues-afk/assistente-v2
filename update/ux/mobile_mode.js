// update/ux/mobile_mode.js
// Responsive UI helpers.  Applies a CSS class to the body element
// when the window width is below a configured breakpoint and
// exposes an init function to update settings and attach the
// necessary resize listener.  Configuration is persisted via the
// global UX namespace if multiple modules need access.

const CFG = {
  storageKey: 'erp_db',
  mobile: { breakpointPx: 860 },
  onboarding: { enabled: true },
};

function applyMobileClass() {
  const bp = Number(CFG.mobile?.breakpointPx || 860);
  const isMobile = window.innerWidth <= bp;
  document.body.classList.toggle('mobile-mode', isMobile);
  return isMobile;
}

function initMobile() {
  applyMobileClass();
  window.addEventListener('resize', () => {
    clearTimeout(initMobile._t);
    initMobile._t = setTimeout(applyMobileClass, 120);
  });
}

/**
 * Initialise mobile mode.  Merges provided configuration into the
 * default and binds the resize listener.  Configuration options
 * include breakpointPx for switching to mobile and onboarding
 * settings although the onboarding options are not used by this
 * module directly.
 *
 * @param {Object} cfg Configuration overrides
 * @returns {Object} Result
 */
export function init(cfg) {
  if (cfg && typeof cfg === 'object') {
    if (cfg.storageKey) CFG.storageKey = cfg.storageKey;
    if (cfg.mobile) CFG.mobile = { ...CFG.mobile, ...cfg.mobile };
    if (cfg.onboarding) CFG.onboarding = { ...CFG.onboarding, ...cfg.onboarding };
  }
  try { mobile.init(); } catch (e) {}
  return { ok: true };
}

export const mobile = {
  apply: applyMobileClass,
  init: initMobile,
};

export default { init, mobile };