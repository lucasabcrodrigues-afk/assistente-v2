# Server Sync (Netlify) — Salvar no servidor e carregar com merge

## O que este módulo faz
- **Salvar no servidor (Netlify)**: envia o DB do ERP para uma Function que persiste em **Netlify Blobs**.
- **Carregar do servidor**:
  - modo **substituir** (replace)
  - modo **mesclar** (merge) para **complementar** dados (ex.: refrigerantes + leites/açúcar)

Tudo é **opt-in** via `window.UPDATE_FLAGS.enableServerSync`.

## Requisitos
1) Netlify Functions habilitado (pasta `netlify/functions`)
2) Dependência: `@netlify/blobs` (recomendado pela Netlify Blobs docs).  
3) Env var no Netlify:
- `ERP_ADMIN_TOKEN` (token forte)

## Endpoints
- `/.netlify/functions/erp_save` (POST)
- `/.netlify/functions/erp_load?key=erp_db_v1` (GET)
- `/.netlify/functions/erp_health` (GET)

## Segurança (importante)
As Functions exigem o header:
- `x-erp-token: <ERP_ADMIN_TOKEN>`

Não coloque esse token “hardcoded” no front.  
Use apenas quando necessário (ex.: tela/admin) ou guarde no `sessionStorage`.

## Exemplos de uso
```js
window.UPDATE_FLAGS = { enableServerSync: true };

// salvar o DB atual no servidor
await Update.integrations.serverSync.saveCurrentToServer({ token: prompt("Token admin:") });

// carregar e SUBSTITUIR
await Update.integrations.serverSync.loadToLocal({ token: prompt("Token admin:") });

// carregar e MESCLAR (complementar estoque) - soma qtd por cod
await Update.integrations.serverSync.mergeFromServer({ token: prompt("Token admin:"), sumStockQty: true });
```

## Observações de limites
As Functions fazem uma verificação simples de tamanho (~900KB por payload).  
Se seu banco crescer muito, o ideal é salvar por coleções (estoque/vendas/caixa) ou compactar.
