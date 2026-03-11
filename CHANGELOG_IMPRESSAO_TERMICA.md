# CHANGELOG_IMPRESSAO_TERMICA

## Objetivo
Adicionar suporte opcional a impressora térmica com gatilho automático de impressão e corrigir o reset do campo de código/quantidade após conclusão da venda, sem alterar a lógica existente de login, permissões, estoque, caixa, scanner, backup, sincronização, painel secreto, modo simples ou estrutura do banco.

## Arquivos modificados
- `index.html`

## O que foi adicionado

### 1. Preferências de impressora
Na área **Ajustes → Preferências → Dispositivos** a opção **Impressora** passou a ter:
- `Nenhuma`
- `Impressora comum`
- `Impressora térmica`

Foi mantida compatibilidade com valor legado `default`, convertido de forma segura para `common`.

### 2. Impressão térmica opcional
Foram adicionadas funções isoladas:
- `normalizePrinterDevice(val)`
- `isThermalPrinterEnabled()`
- `isMobilePrintContext()`
- `updatePrintCupomButtonsVisibility()`
- `buildThermalReceiptHTML(venda)`
- `triggerThermalPrint(venda)`

### 3. Fluxo automático pós-venda
Após conclusão bem-sucedida da venda, o sistema agora pode executar:
- atualização normal do sistema
- reset dos inputs
- gatilho opcional da impressão térmica

Sem bloquear a venda caso a impressão falhe.

### 4. Reset seguro do campo de código
Foi adicionada a função isolada:
- `resetVendaInput(contexto)`

Aplicada nos fluxos:
- venda rápida
- venda completa (carrinho)
- venda via scanner

Comportamento:
- limpa campo de código/busca
- limpa quantidade relevante
- limpa campos auxiliares da venda
- devolve foco ao campo principal para novo lançamento/scan

### 5. Botão manual no mobile/tablet
Quando o ambiente é detectado como celular/tablet:
- a impressão térmica automática não dispara
- o sistema mantém o botão **Imprimir Cupom** disponível

## Regras preservadas
- nenhuma remoção de funções existentes
- sem refatoração estrutural da lógica de vendas
- sem alteração da estrutura do banco
- sem alteração de permissões
- venda continua concluindo normalmente mesmo com falha de impressão

## Observações técnicas
- cupom térmico em HTML/CSS com largura `72mm`, fonte `monospace` e tamanho `11px`
- ocultação de controles do sistema durante impressão
- vendedor incluído no cupom
- último comprovante também fica disponível para impressão manual
