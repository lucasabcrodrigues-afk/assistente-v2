# Integração do Módulo `update`

Este guia explica como integrar o módulo **update** no seu ERP/loja rodando 100 % no navegador (Netlify ou similar).  O objetivo é substituir os antigos oito módulos por um único pacote mais limpo e fácil de manter, sem quebrar a estrutura de dados existente.

## 1. Instalando o módulo

Há duas maneiras de carregar o módulo: como ES Module (import) ou como script global.  Escolha a abordagem compatível com o build do seu site.

### Via `import`

1. Copie a pasta `update/` para o mesmo diretório dos seus scripts front‑end.
2. No script de inicialização da sua aplicação, importe o módulo e chame `Update.install()`:

```js
import { Update } from './update/index.js';

// Exemplo de configuração: defina a chave de storage e o breakpoint do modo mobile
Update.install({
  storageKey: 'MEU_DB',
  mobile: { breakpointPx: 720 },
});

// Após a instalação, todas as APIs ficam disponíveis em Update
const db = Update.db.get();
const vendas = Update.reports.sales.rows({ startIso: '2025-01-01', endIso: '2025-01-31' });
```

### Via `<script>` global

Se a sua aplicação não usa bundler ou import/export, use o bundle UMD/global.  Copie os arquivos `update/index.js` e `update/compat/legacy_aliases.js` para o seu projeto (ou gere um bundle usando uma ferramenta como esbuild).

```html
<script src="update/index.js"></script>
<script src="update/compat/legacy_aliases.js"></script>
<script>
  // chame Update.install() para inicializar
  Update.install({ storageKey: 'MEU_DB' });
  // funções compatíveis ainda estão em CoreDB, Ops, Reports, etc.
  const db = CoreDB.get();
</script>
```

Carregar `compat/legacy_aliases.js` é opcional: ele cria variáveis globais (`CoreDB`, `Ops`, `Reports`, etc.) para manter compatibilidade com códigos antigos.  Sem esse arquivo, use apenas a API do objeto `Update`.

## 2. Configuração de storage (localStorage)

Por padrão, o módulo usa a chave `MEU_DB` no `localStorage` para armazenar seu banco de dados.  Você pode mudar essa chave ao chamar `Update.install({ storageKey })`.  O schema e as migrações são aplicados automaticamente; versões antigas serão migradas e validadas na inicialização.

### Snapshots e backup

Sempre que você salva o DB via `Update.db.safeSave(db)`, o módulo cria snapshots automáticos em `localStorage.__snapshots__`.  Use `Update.db.backup.export()` para exportar um backup completo em JSON e `Update.db.backup.import(json, opts)` para importar.  Consulte `docs/API.md` para detalhes.

## 3. Uso das operações de loja

As operações do dia‑a‑dia ficam no espaço `Update.ops`.  Alguns exemplos:

| Ação                             | Função                                             | Observações |
|---------------------------------|----------------------------------------------------|-------------|
| Adicionar movimento de estoque  | `Update.ops.stock.addMovement({ productCode, delta, reason })` | Atualiza quantidade e cria registro de movimento. |
| Iniciar contagem de inventário  | `Update.ops.inventory.start(products)`             | Inicia estado interno para contagem. |
| Informar contagem de produto    | `Update.ops.inventory.setCount(idProduto, qtd)`    | Usa ID ou código do produto. |
| Aplicar ajustes de inventário   | `Update.ops.inventory.applyAdjustments()`          | Gera movimentos de ajuste e salva. |
| Cancelar/estornar venda         | `Update.ops.sales.cancelSale(saleId)`              | Repõe estoque e registra estorno. |
| Abrir/fechar caixa              | `Update.ops.cash.open(date, valorInicial)`, `Update.ops.cash.close()` | Mantém sessões de caixa. |

A API de operações se manteve compatível com os módulos antigos; se funções antigas tinham nomes diferentes, `compat/legacy_aliases.js` cria aliases.

## 4. Relatórios e exportação

Os relatórios estão em `Update.reports`.  Cada relatório possui métodos `rows(period, opts)` e `summary(period, opts)`.  Por exemplo:

```js
const periodo = { startIso: '2025-01-01', endIso: '2025-01-31' };
const linhasVendas = Update.reports.sales.rows(periodo);
const resumoVendas = Update.reports.sales.summary(periodo);
```

Para exportar um relatório em CSV ou gerar uma página imprimível:

```js
const csv = Update.reports.export.toCSV(linhasVendas);
Update.reports.export.downloadCSV(csv, 'relatorio_vendas.csv');

const html = Update.reports.export.buildPrintableReport({
  title: 'Relatório de Vendas',
  headers: ['Data', 'Cliente', 'Total'],
  rows: linhasVendas.map((l) => [l.date, l.client, Update.utils.money.centsToBR(l.total)]),
});
Update.reports.export.openPrintWindow(html);
```

## 5. Fiscal, impressão e Netlify

O módulo de emissão fiscal (`Update.fiscal.FiscalPrint`) simula ou integra com seu provedor fiscal.  Após registrar uma venda, chame `FiscalPrint.onSaleCompleted(sale, { db, save })` para emitir o documento fiscal.  Em modo offline, os eventos são enfileirados e podem ser reprocessados com `FiscalPrint.retryQueue()`.

Para imprimir recibos (não fiscais), use `Update.integrations.netlify.printRecibo(sale)`.  Esse método gera HTML e abre uma nova janela de impressão com CSS responsivo.  Você também pode compartilhar recibos e mensagens via WhatsApp com `Update.whatsapp.sendText()`.

O scanner de código de barras integrado utiliza a API `BarcodeDetector` quando disponível.  Invoque `Update.scanner.openCamera()` para abrir a câmera e `Update.scanner.init()` para escutar entradas de leitores USB.  Para catálogos offline, use `Update.catalog.*` para cadastrar e buscar produtos.

## 6. Compatibilidade retroativa

O objetivo deste módulo é **não quebrar** o código legado.  Se sua aplicação referenciava diretamente `CoreDB`, `Ops`, `Reports`, `UX`, `Catalog`, `Scanner`, `WhatsApp`, `PrintReceipt`, `FiscalPrint` ou `IntegracoesNetlify`, basta carregar `compat/legacy_aliases.js` depois do módulo principal.  Esses wrappers direcionam as chamadas antigas para as novas implementações.

Em caso de conflito de nomes ou alterações de comportamento, consulte a lista de funções em `docs/API.md` e as notas de migração no README.  Se algo precisar de adaptação manual, mantenha o wrapper antigo e adapte gradualmente para `Update.*`.

---

Para mais detalhes sobre cada API, consulte `docs/API.md`.  Para realizar testes manuais, utilize a lista em `docs/QA_CHECKLIST.md`.