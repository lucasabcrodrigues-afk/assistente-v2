// update/ux/onboarding.js
// Simple onboarding checklist stored in localStorage.  Provides
// functions to load, save, update and render a list of first
// steps for new users.  Uses the configured storage key to avoid
// collisions with other apps.  Checklist entries can be customised
// or extended by editing DEFAULT_STEPS.

import { getStorageKey } from '../config.js';

const DEFAULT_STEPS = [
  { id: 's1', label: 'Cadastrar 3 produtos (código, nome, custo, preço)', done: false },
  { id: 's2', label: 'Fazer 1 venda de teste e imprimir o recibo', done: false },
  { id: 's3', label: 'Abrir e fechar o caixa com conferência', done: false },
  { id: 's4', label: 'Fazer um backup e testar restauração (preview)', done: false },
  { id: 's5', label: 'Criar um usuário Caixa e testar permissões', done: false },
];

function key() {
  return `${getStorageKey()}__onboarding`;
}

function load() {
  const raw = localStorage.getItem(key());
  if (!raw) return { steps: DEFAULT_STEPS.slice(), updatedAt: new Date().toISOString() };
  try {
    const obj = JSON.parse(raw);
    const steps = Array.isArray(obj.steps) ? obj.steps : DEFAULT_STEPS.slice();
    return { steps, updatedAt: obj.updatedAt || new Date().toISOString() };
  } catch (e) {
    return { steps: DEFAULT_STEPS.slice(), updatedAt: new Date().toISOString() };
  }
}

function save(state) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(key(), JSON.stringify(state));
}

/**
 * Mark a checklist step as done or not done.  Persists the updated
 * state to localStorage and returns the new state.  If the step
 * does not exist this function does nothing.
 *
 * @param {string} stepId ID of the step
 * @param {boolean} [done=true] Whether the step is completed
 * @returns {Object} Updated state
 */
export function setDone(stepId, done = true) {
  const st = load();
  const s = st.steps.find(x => x.id === stepId);
  if (s) s.done = !!done;
  save(st);
  return st;
}

/**
 * Render the onboarding checklist into a container element.  Steps
 * are displayed as checkbox labels and changes are saved
 * automatically when toggled.  If onboarding is disabled the
 * function returns immediately.
 *
 * @param {HTMLElement} container Element in which to render
 */
export function render(container) {
  const st = load();
  if (!container) return;
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'onboarding card';
  wrap.style.border = '1px solid #ddd';
  wrap.style.borderRadius = '12px';
  wrap.style.padding = '12px';
  wrap.style.margin = '8px 0';
  const title = document.createElement('div');
  title.textContent = 'Primeiros passos (checklist)';
  title.style.fontWeight = '700';
  title.style.marginBottom = '8px';
  wrap.appendChild(title);
  st.steps.forEach(step => {
    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.margin = '6px 0';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!step.done;
    cb.addEventListener('change', () => setDone(step.id, cb.checked));
    const span = document.createElement('span');
    span.textContent = step.label;
    row.appendChild(cb);
    row.appendChild(span);
    wrap.appendChild(row);
  });
  container.appendChild(wrap);
}

/**
 * Expose the underlying load and save functions for advanced use.
 */
export const onboarding = { load, save, setDone, render };
export default onboarding;