// update/fiscal/adapter.js
// Adapter for transforming internal sale objects into the format
// expected by fiscal providers and print templates.  Attempts to
// gracefully handle alternative property names used throughout the
// system.

/**
 * Normalise a sale object.  The returned structure contains
 * consistently named fields and ensures numeric values are
 * converted to numbers.  Unknown fields are ignored.  This
 * function does not mutate the input sale.
 *
 * @param {Object} sale Raw sale object
 * @returns {Object} Normalised sale
 */
export function normalizeSale(sale) {
  const itens = sale.itens || sale.items || [];
  const pagamentos = sale.pagamentos || sale.payments || [];
  return {
    id: String(sale.id ?? sale.numero ?? sale.code ?? Date.now()),
    numero: sale.numero ?? sale.id ?? null,
    data: sale.data || sale.createdAt || new Date().toISOString(),
    operador: sale.operador || sale.user || null,
    cliente: sale.cliente || null,
    itens: itens.map(i => ({
      cod: i.cod || i.code || '',
      nome: i.nome || i.name || '',
      qtd: Number(i.qtd ?? i.qty ?? 1),
      preco_c: Number(i.preco_c ?? i.price_c ?? 0),
      total_c: Number(i.total_c ?? (Number(i.preco_c ?? 0) * Number(i.qtd ?? 1))),
    })),
    total_c: Number(sale.total_c ?? sale.totalCents ?? sale.total ?? 0),
    desconto_c: Number(sale.desconto_c ?? 0),
    acrescimo_c: Number(sale.acrescimo_c ?? 0),
    pagamentos: pagamentos.map(p => ({
      tipo: p.tipo || p.method || 'N/A',
      valor_c: Number(p.valor_c ?? p.amount_c ?? 0),
    })),
    troco_c: Number(sale.troco_c ?? 0),
  };
}