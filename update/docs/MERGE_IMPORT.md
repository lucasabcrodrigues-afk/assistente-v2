# Merge Import — complementar dados sem substituir

## Objetivo
Quando você carrega um arquivo/backup, em vez de substituir o banco inteiro,
você pode **mesclar** (complementar) dados.

Exemplo:
- arquivo A: refrigerantes
- arquivo B: leite/açúcar
=> ao importar B com merge, seu estoque final fica com **A + B**.

## Regra do estoque
- Identificação do item por `cod` (ou `codigo`/`sku`).
- Conflito no mesmo `cod`:
  - por padrão mantém campos do banco atual (`prefer="current"`)
  - se `sumStockQty=true` soma `qtd` do atual + importado

## Relatório
O merge retorna um `report` com:
- `added.estoque` (itens novos)
- `updated.estoque` (itens mesclados)
- `conflicts[]` (campos divergentes, com escolha aplicada)
- `warnings[]` (ex.: item sem cod)

## Uso (programático)
```js
const cur = Update.storage.db_core.get();
const imported = JSON.parse(fileText);
const { db, report } = Update.integrations.serverSync.mergeImportedFile(cur, imported, {
  prefer: "current",
  sumStockQty: true
});
Update.storage.db_core.safeSave(db, { forceSnapshot: true });
console.log(report);
```
