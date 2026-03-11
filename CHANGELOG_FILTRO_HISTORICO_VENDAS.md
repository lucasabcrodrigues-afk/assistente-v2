# CHANGELOG - Filtro de Histórico de Vendas

## Objetivo
Adicionar um filtro discreto na seção **Histórico de Vendas** sem alterar a lógica existente do ERP.

## Arquivos modificados
- `index.html`

## Arquivos adicionados
- `CHANGELOG_FILTRO_HISTORICO_VENDAS.md`
- `RELATORIO_TESTES_FILTRO_HISTORICO_VENDAS.md`

## Implementações realizadas

### 1. Interface do filtro
Na aba **Vendas**, dentro da seção **Histórico de Vendas**, foi adicionado um seletor compacto:
- Hoje
- Semana
- Mês
- Ano

O seletor foi posicionado ao lado do título do histórico, com layout discreto, `flex-wrap` e sem quebrar a responsividade.

### 2. Funções isoladas de período
Foram adicionadas as funções:
- `getRangeHoje()`
- `getRangeSemana()`
- `getRangeMes()`
- `getRangeAno()`

Todas retornam:

```js
{
  start: timestamp,
  end: timestamp
}
```

### 3. Normalização de datas
Foi adicionada a função `parseHistoricoVendaTimestamp(venda)` para ler, nesta ordem:
- `timestamp`
- `dataIso`
- `data`

Inclui fallback para datas no formato local `pt-BR`.

### 4. Filtro por vendedor
Foi adicionada a função `getVendaResponsavelHistorico(venda)` com fallback para o movimento correspondente no caixa via `groupId`.

Regras aplicadas:
- **Funcionário**: vê apenas vendas próprias e somente do dia.
- **Administrador**: pode alternar Hoje, Semana, Mês e Ano e vê todas as vendas.

### 5. Integração com renderização existente
A renderização do histórico **não foi reescrita**.
Foi aplicado somente o filtro antes da montagem da tabela:

```js
const vendasFiltradas = filtrarHistoricoVendas(vendasBase);
```

### 6. Coluna extra para admin
Foi adicionada a coluna **Vendedor** apenas para administrador.
Para funcionários, a coluna permanece oculta.

### 7. Tratamento de erro visível
Se ocorrer falha ao aplicar o filtro, o sistema mostra:
- `Erro ao aplicar filtro de histórico`

### 8. Compatibilidade com vendas novas
As novas vendas registradas passam a gravar também:
- `usuario`
- `vendedor`
- `responsavel`
- `timestamp`
- `dataIso`

Isso foi adicionado sem remover campos anteriores e sem alterar a lógica de venda já existente.

## Garantias preservadas
Nenhuma alteração foi feita em:
- login
- permissões existentes
- painel secreto
- caixa
- estoque
- scanner
- backup
- sincronização KV
- tema
- modo simples
- estrutura do banco existente
- lógica principal de vendas

## Observação
Os indicadores gerais (`faturamento`, `lucro`, `ticket`, `quantidade`) permanecem com o comportamento anterior, sem serem afetados pelo filtro visual do histórico.
