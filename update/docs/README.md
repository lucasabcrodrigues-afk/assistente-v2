# Módulo `update`

O módulo **update** consolida os oito módulos originais do seu ERP/loja em um único pacote organizado e moderno para aplicações 100% front‑end.  Ele centraliza acesso ao banco de dados local (localStorage), operações de estoque, inventário e caixa, relatórios, impressão fiscal e não fiscal, integrações com Netlify (WhatsApp, scanner, recibo), UX responsiva, catálogo de produtos offline e utilidades.  Este pacote foi refatorado para reduzir duplicação, padronizar nomes, validar dados com segurança e manter compatibilidade retroativa com a estrutura do banco existente.

## Principais características

* **Banco local** – migra e valida versões antigas do schema, cria snapshots automáticos e oferece backup/import/export com preview.
* **Operações de loja** – manipulação de estoque, inventário, cancelamento/estorno de vendas e gestão de sessões de caixa.
* **Relatórios** – relatórios de vendas, estoque, caixa e devedores com exportação CSV e relatório imprimível.
* **Fiscal e impressão** – emissão de documentos fiscais via providers simulados ou API, fila offline, impressão de recibos e templates responsivos.
* **Integrações** – compartilhamento via WhatsApp e Web Share API, scanner de códigos de barras via câmera, impressão de recibos não fiscais.
* **UX** – modo mobile automático por breakpoint, checklist de onboarding personalizável.
* **Catálogo offline** – cadastro e lookup de produtos por código de barras, com importação/exportação CSV/JSON.
* **Utilidades** – helpers para datas, dinheiro, geração de IDs, logging e merge inteligente de bancos.

## Estrutura

```
update/
├── index.js             # Entry point que agrupa todas as APIs
├── install.js           # Rotina de instalação/configuração
├── config.js            # Chave de storage global
├── compat/              # Aliases para compatibilidade retroativa
├── storage/             # Núcleo de DB, schema, validação, backup
├── services/            # Operações de loja (estoque, inventário, vendas, caixa)
├── reports/             # Relatórios de vendas, estoque, caixa e devedores
├── fiscal/              # Emissão fiscal, providers, fila offline, settings
├── print/               # Renderizador e motor de impressão de recibos
├── integrations/        # Integrações Netlify (WhatsApp, share, scanner, recibo)
├── ux/                  # Onboarding checklist e modo mobile
├── utils/               # Helpers de datas, dinheiro, ids, log e merge
├── assets/              # CSS para impressão e recibos
├── templates/           # Templates HTML de recibo pré‑gerados
└── docs/                # Documentação (este README, integração, API, checklist)
```

Os submódulos foram reorganizados em **camadas**: `storage` para o núcleo do banco e backups, `services` para lógica de negócio, `reports` para consultas agregadas, `fiscal` e `print` para emissão e impressão, `integrations` para utilidades Netlify/UX, `ux` para experiência do usuário, `utils` para funções de baixo nível e `assets/templates` para recursos estáticos.

## Como usar

Importe e instale o módulo na inicialização do seu app:

```js
import { Update } from './update/index.js';

// Configura o storageKey (opcional) e opções de UX
Update.install({ storageKey: 'MEU_DB', mobile: { breakpointPx: 720 } });

// A partir daqui use as APIs agrupadas:
Update.ops.stock.addMovement(...);
const vendas = Update.reports.sales.rows({ startIso: '2025-01-01', endIso: '2025-01-31' });
Update.fiscal.FiscalPrint.onSaleCompleted(sale, { db, save: () => Update.db.safeSave(db) });
```

Se estiver carregando via `<script>`, o módulo expõe `window.Update` automaticamente.  Consulte `docs/INTEGRATION.md` para detalhes sobre integração em páginas estáticas.