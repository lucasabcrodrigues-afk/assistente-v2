# API do Módulo `update`

Este documento descreve as principais funções expostas pelo pacote `update`.  Para organizar o código, as APIs são agrupadas em namespaces (`db`, `ops`, `reports`, `fiscal`, `integrations`, `ux`, `utils`, etc.).  Use `Update.install()` para inicializar o pacote e, em seguida, acesse as funções conforme descrito abaixo.

## Inicialização

### `Update.install({ storageKey, mobile, ...opções })`

* Lê o banco de dados do `localStorage`, aplica migrações e normaliza valores.
* Armazena a chave `storageKey` para ser usada por todos os módulos; padrão: `'MEU_DB'`.
* Aceita configuração do modo mobile: `{ breakpointPx: number }`.
* Retorna `{ ok: true }` quando finalizado.

### `Update.config`

* `getStorageKey()` – retorna a chave atual configurada para o banco.
* `setStorageKey(key)` – altera a chave de armazenamento (em geral chamada por `install`).

## Banco de dados (namespace `db`)

| Função                                     | Descrição |
|--------------------------------------------|-----------|
| `Update.db.init({ storageKey? })`          | Inicializa o DB lendo do `localStorage`, aplicando validação e migrações. |
| `Update.db.get()`                          | Retorna uma cópia do DB em memória (já normalizado). |
| `Update.db.safeSave(db)`                   | Salva o DB no `localStorage` com validação, criando snapshot. Retorna `{ ok, warnings, snapshotCreated }`. |
| `Update.db.normalize(db)`                  | Normaliza objetos e arrays, fixando defaults e tipos.  Usado internamente. |
| `Update.db.backup.export({ pretty })`      | Retorna um JSON string contendo DB + metadados (checksums e versão). |
| `Update.db.backup.previewImport(jsonStr)`  | Analisa o JSON sem alterar dados; retorna sumário de diferenças. |
| `Update.db.backup.import(jsonStr, opts)`   | Importa um backup; aplica validação e migrações; opcionalmente mescla futuras versões. |
| `Update.db.backup.listSnapshots()`         | Lista snapshots automáticos existentes. |
| `Update.db.backup.restoreSnapshot(id)`     | Restaura um snapshot específico. |
| `Update.db.recovery.enable(reason, details?)` | Ativa o modo de recuperação para tratamento de falhas críticas. |
| `Update.db.schema.SCHEMA_VERSION`          | Número da versão atual do schema. |
| `Update.db.schema.migrate(oldDb)`          | Função de migração automática. |
| `Update.db.validate.normalizeDB(db)`       | Função de validação e normalização de baixo nível. |

## Operações de loja (namespace `ops`)

O namespace `ops` é dividido por tópicos: `stock`, `inventory`, `sales`, `cash`.  Cada submódulo mantém estado interno conforme necessário.

### `ops.stock`

* `addMovement({ productCode, delta, reason, dateIso? })` – adiciona um movimento de estoque (entrada/saída) para um produto existente.  Atualiza `qty` e cria registro de movimento.  Retorna `{ ok, newQty }`.
* `list({ startIso?, endIso? })` – retorna lista de movimentos no período especificado.

### `ops.inventory`

* `start(products)` – inicia um inventário para os produtos listados.  Cria estado interno `_state`.  Retorna `{ ok }`.
* `setCount(idOrCode, countedQty)` – informa a quantidade contada de um item.  Aceita ID ou código de barras. |
* `computeDiffs()` – calcula diferenças entre estoque e contado, retornando lista de ajustes propostos. |
* `applyAdjustments()` – aplica os ajustes calculados ao estoque via `addMovement` e reseta o estado. |

### `ops.sales`

* `cancelSale(saleId)` – cancela/estorna uma venda: repõe estoque, marca a venda cancelada e registra `saleVoids`.  Gera registro de caixa via `ops.cash.addVoid`. |

### `ops.cash`

* `open(dateIso, initialAmountCents)` – abre uma nova sessão de caixa.  Cria ou fecha sessões pendentes. |
* `close()` – fecha a sessão atual, registrando totais e diferenças.  Retorna relatório. |
* `addSale(amountCents)` – incrementa o total de vendas da sessão. |
* `addVoid(amountCents)` – registra estorno. |
* `withdraw(amountCents)` / `reinforce(amountCents)` – registra sangria ou reforço de caixa. |
* `getCurrent()` – retorna a sessão de caixa em andamento, se houver. |
* `listSessions()` – retorna todas as sessões de caixa. |

## Relatórios (namespace `reports`)

Cada relatório expõe três funções:

* `init(opts)` – inicializa internamente (normalmente chamada por `install`).
* `rows(period, opts?)` – retorna linhas detalhadas no período (`{ startIso, endIso }`).
* `summary(period, opts?)` – retorna resumo numérico (soma, média, contadores).  Alguns relatórios retornam campos extras.

### `reports.sales`
* Campos comuns: `date`, `client`, `total`, `paymentMethod`, `items[]`.

### `reports.stock`
* `movementsRows(period)` – lista movimentos; `summary(period)` – saldo inicial, entradas, saídas e saldo final.

### `reports.cash`
* `rows(period)` – linhas de sessões de caixa; `summary(period)` – valores totais de vendas, reforços, sangrias e diffs.

### `reports.debtors`
* Identifica clientes devedores ou créditos pendentes; retorna lista e totais.

### `reports.export`

* `toCSV(rows, delimiter=',', decimal=',')` – converte array de linhas em string CSV.
* `downloadCSV(csvString, filename)` – dispara download no navegador.
* `buildPrintableReport({ title, headers, rows })` – gera HTML completo para um relatório imprimível.
* `openPrintWindow(html)` – abre uma nova janela e imprime o HTML passado.

## Fiscal (namespace `fiscal`)

* `FiscalPrint.onSaleCompleted(sale, { db, save })` – gera documento fiscal ao concluir uma venda.  Usa provider configurado em `settings`.  Em caso de falha, coloca o evento na fila offline.
* `FiscalPrint.retryQueue({ db, save })` – reprocessa a fila fiscal quando online.  Notifica eventos impressos.
* `settings.getFiscalPrintSettings()` – retorna configurações padrão de emissão.  Você pode alterar esse objeto antes de chamar `onSaleCompleted`.
* `queueSummary(db)` – retorna sumário da fila offline.
* `providers.SimulatedProvider` e `providers.ApiProvider` – classes de provider utilizadas internamente.  Você pode criar um provider customizado seguindo a mesma interface (`async issue(sale)`).

## Impressão (namespace `print`)

* `renderer.renderReceiptHTML(sale, opts?)` – constrói HTML para o recibo a partir de uma venda.  Usa templates de `/update/templates/*.html`.
* `printEngine.printReceipt(sale, opts?)` – abre uma nova janela com o HTML e CSS, dispara `window.print()` e fecha a janela após impressão.

## Integrações (namespace `integrations`)

### `integrations.netlify`

* `shareWhatsApp(text)` – abre o app/WhatsApp Web com mensagem pré‑preenchida.
* `shareSystem(text)` – usa `navigator.share` (quando disponível) para compartilhar texto via Web Share API.
* `lookupInEstoque(codigo)` – procura produto por código de barras no estoque atual.
* `startCameraScan({ onScan, onError })` – inicia scanner via câmera usando `BarcodeDetector` se disponível; chama callback `onScan(code)` ao ler um código.
* `stopCameraScan()` – encerra o scanner de câmera.
* `buildReciboHTML(sale)` – monta HTML para um recibo simples (não fiscal).
* `printRecibo(sale)` – imprime o recibo simples em uma nova janela.
* `buildReciboTexto(sale)` – retorna uma string de texto formatada do recibo, útil para copiar/compartilhar.

### `whatsapp` (atalho)

* `normalizePhoneE164(phone)` – normaliza número brasileiro para formato `+5511999999999`.
* `buildLink({ phone, text })` – gera link `https://wa.me/5511999999999?text=...`.
* `sendText({ phone, text })` – abre uma nova aba com o link do WhatsApp para envio de mensagem.

### `scanner` (atalho)

* `init({ onScan })` – escuta entrada de leitores de código de barras USB; chama callback ao detectar código.
* `openCamera({ onScan, onError })` – equivalente a `startCameraScan` no módulo netlify; exibe overlay com vídeo.

### `catalog`

* `load()` – carrega catálogo do `localStorage` (chave `storageKey.catalog`).
* `save()` – salva o catálogo atual.
* `add({ code, desc, priceCents })` – adiciona ou atualiza um item.
* `remove(code)` – remove um item pelo código.
* `list()` – retorna array de produtos.
* `importCSV(csvString)` / `importJSON(jsonString)` – importa catálogo de CSV/JSON.
* `exportCSV()` / `exportJSON()` – exporta catálogo atual.

### `ux`

* `mobileMode.init({ breakpointPx })` – aplica/remover classe `mobile-mode` no `<html>` conforme largura da janela.
* `mobileMode.apply(isMobile)` – força modo mobile ou desktop.
* `onboarding.load()` / `save()` – lê/grava checklist de onboarding no `localStorage`.
* `onboarding.setDone(key, done)` – marca item como concluído.
* `onboarding.render(containerEl)` – renderiza checklist em um elemento DOM.

### `utils`

* `date.nowIso()` – retorna data/hora em ISO UTC.
* `date.parseDateAny(str)` – tenta converter string para objeto Date.
* `date.inPeriod(dateIso, { startIso, endIso })` – verifica se `dateIso` está entre início e fim (inclusive).
* `money.moneyToCentsBR(str)` – converte string `1.234,56` para centavos (`123456`).
* `money.centsToBR(cents)` – converte número de centavos para string no formato brasileiro.
* `ids.uid()` – gera identificador único curto.
* `log.info/warn/error()` – wrappers para `console`.
* `merge.mergeDB(oldDb, importedDb)` – mescla dois bancos de dados, resolvendo conflitos; usado por futuras versões de importação.  Consulte o código para detalhes.

---

Esta é uma visão geral da API pública.  Os módulos internos expõem outras funções usadas para compor o sistema, mas devem ser consideradas privadas.  Consulte o código fonte para comportamentos específicos e sinta‑se à vontade para estender as funções utilitárias conforme necessário.