// update/fiscal/providers.js
// Fiscal providers encapsulate the logic for issuing fiscal
// documents.  Two providers are included: a simulated provider
// which returns a dummy document and an API provider which sends
// requests to a configured backend.

export class SimulatedProvider {
  constructor() {}
  async emit(sale, ctx) {
    return {
      status: 'simulated',
      message: 'Documento não fiscal (simulado).',
      key: `SIM-${sale.id}`,
      payload: { sale },
    };
  }
  async status(key, ctx) {
    return { status: 'simulated', key };
  }
}

export class ApiProvider {
  constructor(baseUrl) {
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
  }
  async emit(sale, ctx) {
    if (!this.baseUrl) {
      return { status: 'error', message: 'apiBaseUrl não configurado.' };
    }
    const url = `${this.baseUrl}/api/fiscal/emitir`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sale }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { status: 'error', message: `Falha API (${res.status}): ${txt || res.statusText}` };
    }
    const data = await res.json();
    return data;
  }
  async status(key, ctx) {
    if (!this.baseUrl) {
      return { status: 'error', message: 'apiBaseUrl não configurado.' };
    }
    const url = `${this.baseUrl}/api/fiscal/status/${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return { status: 'error', message: `Falha API status (${res.status})` };
    return await res.json();
  }
}