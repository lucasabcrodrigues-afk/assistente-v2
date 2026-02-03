# Checklist de Testes – Módulo `update`

Utilize este checklist para validar manualmente as funcionalidades principais após integrar o módulo `update` ao seu ERP/loja.  Marque cada item conforme for testado.

## 1. Núcleo e banco de dados

☐ **Inicialização** – chamar `Update.install({ storageKey })` com um DB existente; verificar se migrou versões antigas sem erros e se aparece modo recovery em caso de DB corrompido.

☐ **Backup/Restore** – exportar backup (`Update.db.backup.export()`), importar o JSON em um ambiente limpo e comparar dados.  Restaurar snapshot gerado automaticamente e confirmar que o estado volta ao anterior.

☐ **Normalização** – inserir dados incorretos (strings em campos numéricos, datas inválidas), chamar `safeSave()` e verificar se são corrigidos ou rejeitados com warnings.

## 2. Operações de estoque

☐ **Movimentação de estoque** – criar produto com quantidade inicial.  Usar `Update.ops.stock.addMovement()` para entrada e saída.  Confirmar que `qty` é atualizado e que o movimento aparece em `reports.stock.movementsRows()`.

☐ **Inventário** – iniciar contagem (`ops.inventory.start()`), informar quantidades contadas (`setCount()`), gerar diferenças com `computeDiffs()`, aplicar com `applyAdjustments()` e conferir se o estoque foi ajustado.

## 3. Vendas, estornos e caixa

☐ **Cancelar venda** – registrar venda no seu sistema (fora do módulo).  Chamar `Update.ops.sales.cancelSale(id)` e verificar se o estoque é reposto, a venda marcada como cancelada e o estorno registrado em `db.saleVoids`.

☐ **Caixa** – abrir (`ops.cash.open()`) e fechar (`ops.cash.close()`) sessão com valores iniciais e finais; adicionar vendas e estornos via `addSale()`/`addVoid()`.  Verificar totalizações e diferenças no relatório de caixa (`reports.cash`).  Testar reforço (`reinforce()`) e sangria (`withdraw()`).

## 4. Relatórios e exportação

☐ **Relatório de vendas** – gerar linhas (`reports.sales.rows()`) e resumo (`reports.sales.summary()`) para um período.  Exportar CSV com `reports.export.toCSV()` e imprimir via `buildPrintableReport()` → `openPrintWindow()`.  Validar campos e somatórios.

☐ **Relatório de estoque** – verificar se entradas e saídas registradas aparecem corretamente e se o saldo final bate com o estoque.

☐ **Relatório de caixa e devedores** – conferir campos de reforço/sangria e valores pendentes.

## 5. Emissão fiscal e recibos

☐ **Emitir documento fiscal** – após registrar venda, chamar `Update.fiscal.FiscalPrint.onSaleCompleted(sale, { db, save })`; verificar se o provider simulado retorna um número e se a fila offline está vazia quando online.

☐ **Fila offline** – simular falha no provider (desconectando a internet ou retornando erro), chamar novamente e verificar se o evento entra em `Update.fiscal.queueSummary(db)`.  Depois, reprocessar com `retryQueue()` e conferir se imprime.

☐ **Recibo não fiscal** – gerar HTML de recibo com `Update.integrations.netlify.buildReciboHTML(sale)` e imprimir com `printRecibo()`.  Verificar layout e campos.

## 6. Integrações e UX

☐ **WhatsApp/Web Share** – usar `Update.integrations.netlify.shareWhatsApp('texto')` e `shareSystem()` para compartilhar; confirmar que abre app/WhatsApp Web e web share.

☐ **Scanner** – testar leitura de código de barras via leitor USB (`Update.scanner.init({ onScan })`) e via câmera (`Update.scanner.openCamera({ onScan })`).  Confirmar que o callback é chamado e que `stopCameraScan()` funciona.

☐ **Catálogo offline** – adicionar, listar e remover itens com `Update.catalog.add()`, `list()` e `remove()`.  Importar/exportar CSV e JSON e garantir persistência no `localStorage`.

☐ **Modo mobile** – redimensionar a janela para menor/larger que o breakpoint definido em `Update.install({ mobile: { breakpointPx } })` e verificar se a classe `mobile-mode` é aplicada ao `<html>`.

☐ **Onboarding** – renderizar checklist com `Update.ux.onboarding.render(el)`, marcar itens como concluídos e recarregar a página; confirmar que o estado foi salvo.

## 7. Compatibilidade retroativa

☐ **Wrappers** – se estiver usando `compat/legacy_aliases.js`, acessar as funções antigas (e.g., `CoreDB.init()`, `Ops.stock.addMovement()`, `Reports.sales.rows()`) e confirmar que funcionam corretamente.  Misture chamadas antigas e novas para garantir compatibilidade.

☐ **Sem erros no console** – abrir a aplicação em modos desktop e mobile, executar cenários acima e monitorar o console; não devem ocorrer exceções nem warnings inesperados.

---

Execute este checklist sempre que atualizar o módulo `update` ou mexer em integrações sensíveis.  Adapte os passos conforme customizações específicas do seu projeto.