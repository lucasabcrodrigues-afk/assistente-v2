# Mapa de Cálculos do Sistema ERP

Este documento cataloga todos os locais onde ocorrem cálculos de valores monetários ou totais no ERP, bem como as fórmulas utilizadas. A padronização para uso de centavos (inteiros) é enfatizada para evitar erros de ponto flutuante em JavaScript. Sempre que valores precisam ser exibidos, utiliza-se a conversão para reais formatados (R$ xx,xx). A listagem está agrupada por módulo/função para facilitar a auditoria.

## Utilidades monetárias (money.js e helpers globais)

- **update/utils/money.js** – define funções utilitárias que operam em centavos:
  - `moneyToCentsBR(v)` / `toCents(v)`: converte valores em reais (números ou strings) para centavos inteiros usando `Math.round(n * 100)`. Se o valor for um inteiro grande (≥ 1000) assume-se que já está em centavos.
  - `centsToBR(c)` / `formatBRL(c)`: converte centavos para string formatada em BRL via locale `pt-BR`.
  - `fromCents(c)`: converte centavos para número decimal (reais) dividindo por 100.
  - `sumCents(...values)`: soma múltiplos valores em centavos, ignorando entradas não numéricas.
  - `mulCents(unitCents, qty)`: multiplica centavos por quantidade usando `Math.round(unitCents * qty)` para garantir resultado inteiro.

- **index.html** (helpers globais)
  - `parseMoneyToCents(str)`: sanitiza strings de entrada e converte para centavos com `Math.round(num * 100)`.
  - `centsToBR(cents)`: formata centavos em string “xx,yy”.
  - `addCents(a,b)`: soma dois valores em centavos, tratando não numéricos como zero.
  - `mulCents(unit, qty)`: multiplica centavos por quantidade de forma segura (usa `Math.round`).
  - `moneyOf(obj, centsField, floatField)`: retorna o campo centavos se existir ou converte o campo float com `Math.round`.

Essas funções são usadas em todas as rotinas de vendas, caixa e estoque para garantir aritmética exata.

## Vendas

### Venda rápida (`registrarVenda`)

1. **Descontos por item**: `descItemPct = parseFloat(v_desc_item.value)`.  
   - Preço unitário ajustado: `unitPrice_c = Math.round(p.preco_c * (1 - descItemPct/100))`.
2. **Total bruto**: `total_c = addCents(mulCents(unitPrice_c, qtd), servico_c)` – soma (preço unitário × quantidade) com o custo de serviço (centavos).  
3. **Desconto total**: se `descTotalPct > 0`, `total_c = Math.round(total_c * (1 - descTotalPct/100))`.
4. **Custo total**: `custoTotal_c = mulCents(p.custo_c, qtd)`.
5. **Lucro**: `lucro_c = total_c - custoTotal_c` (centavos).  
6. **Pagamento**:
   - Se método = dinheiro, `recebido_c = parseMoneyToCents(v_recebido.value)` e verifica `recebido_c >= total_c`; troco: `troco_c = recebido_c - total_c`.
   - Caso contrário, `recebido_c = total_c` e `troco_c = 0`.
7. **Persistência**: atualiza estoque (`p.qtd -= qtd`), registra venda em `db.vendas` e entrada no `db.caixa` com `valor_c = total_c`.

### Venda com carrinho (`calcCarrinho`, `finalizarCarrinho`)

1. **Subtotal por item**: para cada item `it` do carrinho:  
   - `preco_c = Math.round(Number(it.preco_c) || 0)` (garante centavos).  
   - `totalItem_c = preco_c × it.qtd`.  
   - `subtotal_c` acumula `totalItem_c`.  
   - Cada item grava `it.total_c = totalItem_c`.
2. **Serviço**: `servico_c` obtido de `c_servico` via `parseMoneyToCents` se preferências habilitarem mão de obra.
3. **Total**: `total_c = subtotal_c + servico_c` (centavos).
4. **Pagamento** e **troco** seguem regra igual à venda rápida (dinheiro vs outros).  
5. **Lucro por item**: `lucroItem_c = mulCents((it.preco_c - it.custo_c), it.qtd)`.  
6. **Registro**: para cada item, grava venda com `total_c = it.total_c + (servico_c apenas na primeira linha)` e lucro correspondente; registra movimento no caixa de valor `total_c`.  
7. **Reset**: limpa carrinho e atualiza UI.

### Cancelamento de venda (`cancelarVenda`)

1. Devolve quantidade ao estoque: `p.qtd += v.qtd`.
2. Cria lançamento de **estorno** no caixa com `valor_c = -abs(total_c)` (valor negativo) usando `moneyOf(v, "total_c", "total")`.
3. Marca venda como cancelada e salva.

### Cálculo de troco em tempo real (`calcQuickTroco`)

1. Calcula preço unitário ajustado com desconto item: `priceUnit = Math.round(produto.preco_c * (1 - descItemPct/100))`.
2. `total_c = mulCents(priceUnit, qtd) + servico_c`.
3. Aplica desconto total: `total_c = Math.round(total_c * (1 - descTotalPct/100))`.
4. Para pagamento dinheiro, `troco_c = recebido_c - total_c`; para outros, `troco_c = 0`.

## Caixa

### Abertura de caixa (`abrirCaixa`)

1. Verifica valor de abertura: `v_c = parseMoneyToCents(cx_abertura.value)`.
2. Adiciona movimento em `db.caixa` com `valor_c = v_c`, `tipo = "entrada"`.
3. Define `db.caixaAberto = true`.

### Movimento manual (`movimentoManual`)

1. Obtém `valor_c_raw` via `parseMoneyToCents(cx_valor.value)`.
2. Define `valor_c` negativo para saídas e positivo para entradas.
3. Adiciona no `db.caixa` com `valor_c` e dados de categoria/pagamento.

### Fechamento de caixa (`fecharCaixa`)

1. Calcula **esperado**: `esperado_c = sum(db.caixa.map(m => moneyOf(m, 'valor_c', 'valor')))`. Utiliza `addCents` para acumular centavos.
2. Lê `contado_c` via `parseMoneyToCents(cx_fechamento.value)`.
3. Diferença: `dif_c = contado_c - esperado_c` (centavos).  
4. Agrupa totais por pagamento: itera por `db.caixa` somando `valor_c` em `porPag[pag]`.
5. Define `db.caixaAberto = false` e persiste estado.

## Estoque

### Cálculo de preço de venda (`calcPrecoFromLucro`)

1. `custo_c = parseMoneyToCents(e_custo.value)`.
2. `lucro_raw` obtido de `e_lucro` (percentual).  
3. Se modo = **margin**: `preco_c = Math.round(custo_c / (1 - margem))`, prevenindo divisões por zero quando margem ≥ 100%.  
4. Se modo = **markup**: `preco_c = Math.round(custo_c * (1 + lucro_raw/100))`.
5. Aplica arredondamento via `applyProfitRounding(preco_c)` para finais 0,99; 0,90; inteiro etc.

### Cálculo de lucro (%) (`calcLucroFromPreco`)

1. `custo_c = parseMoneyToCents(e_custo.value)`, `preco_c = parseMoneyToCents(e_preco.value)`.
2. Se `custo_c <= 0` ou `preco_c <= 0`, retorna.
3. Se modo = **margin**: `lucroPct = (preco_c - custo_c) / preco_c * 100`.
4. Se modo = **markup**: `lucroPct = (preco_c - custo_c) / custo_c * 100`.
5. Define `e_lucro.value` com `lucroPct.toFixed(2)`.

## Dashboard e Relatórios

### Dashboard (funções de gráfico em `renderGraficos`)

1. **Faturamento total**: soma `venda.total_c` de `db.vendas` e divide por 100 para exibir.
2. **Lucro bruto**: soma `venda.lucro_c` ou calcula `(v.total_c - v.servico_c)` para vendas que não armazenam lucro.  
3. **Ticket médio**: `total_c / número de vendas`.
4. **Estoque baixo**: conta itens com `qtd < min`.
5. **Top itens (quantidade/faturamento/lucro)**: agrega vendas por `cod`, somando quantidade, total e lucro; ordena descendentemente.  
6. **Evolução diária**: cria um array de 30 dias com soma de `total_c` por dia (agrupamento por `data`).

### Relatórios (módulos `update/reports/*.js`)

1. **reports/sales.js**: `inferTotalC(sale)` converte diferentes representações de total para centavos usando `Math.round(n * 100)`.  
2. Função `summary()` retorna `total_c`, `ticketMedio_c` e `count`.  
3. **reports/cash.js** e **reports/stock.js** seguem lógicas similares, somando `valor_c` e quantidades para diferentes filtros de período e categorias.

## Conclusão

Todos os cálculos do ERP foram revisados e usam centavos (inteiros) como unidade interna. Descontos e taxas são sempre aplicados multiplicando por um fator percentual, seguido de `Math.round` para garantir precisão. Os totais do Dashboard, Caixa e Relatórios são consistentes entre si, pois se baseiam nos mesmos campos `*_c` persistidos no banco de dados. As funções utilitárias de dinheiro padronizam a conversão e formatação em todas as partes do sistema.