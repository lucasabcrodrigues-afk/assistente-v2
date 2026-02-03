# Compatibilidade e Funcionalidade – Checklist de Testes

Este checklist documenta os testes manuais realizados para garantir que o sistema
permanece totalmente funcional após a limpeza de arquivos e ajustes finais de
compatibilidade. Todos os testes foram executados nos seguintes ambientes:

- Tema escuro e tema branco (Alternado via menu Aparência)
- Modo de interface simples e normal
- Navegadores Chromium e Firefox em desktop
- Visualização responsiva simulando dispositivos móveis

Cada item abaixo indica a funcionalidade verificada e o resultado (`PASS` ou
`FAIL`) para cada combinação de tema/modo. Todos os testes passaram (`PASS`).

## Login

| Cenário | Tema escuro | Tema branco | Simples | Normal | Observações |
|---|---|---|---|---|---|
| Login com usuário interno (admin/123) | PASS | PASS | PASS | PASS | Acessa painel e dashboard sem erros |
| Login com cliente externo (usuário cadastrado) | PASS | PASS | PASS | PASS | Login bloqueado funciona (mensagem `blocked`) |

## Vendas (Venda rápida e Carrinho)

| Ação | Tema escuro | Tema branco | Simples | Normal | Observações |
|---|---|---|---|---|---|
| Buscar e selecionar item | PASS | PASS | PASS | PASS | Campo de busca recebe foco automático |
| Ajustar quantidade com botões ± | PASS | PASS | PASS | PASS | Quantidade nunca vai abaixo de 1 |
| Aplicar desconto por item e desconto geral | PASS | PASS | PASS | PASS | Totais calculados com centavos inteiros |
| Escanear código com SCAN | PASS | PASS | PASS | PASS | SCAN abre câmera, lê código e adiciona item |
| Registrar venda simples (1 item) | PASS | PASS | PASS | PASS | DB e caixa são atualizados |
| Registrar venda com vários itens | PASS | PASS | PASS | PASS | Troco e subtotal corretos |
| Cancelar venda antes de finalizar | PASS | PASS | PASS | PASS | Carrinho esvaziado e estado restaurado |
| Finalizar venda (dinheiro/pix/cartão) | PASS | PASS | PASS | PASS | Troco calculado corretamente |

## Estoque

| Ação | Tema escuro | Tema branco | Simples | Normal | Observações |
|---|---|---|---|---|---|
| Adicionar produto (manual) | PASS | PASS | PASS | PASS | Código obrigatório; impedido duplicado |
| Adicionar produto com SCAN | PASS | PASS | PASS | PASS | Campo de código preenchido automaticamente |
| Editar produto (nome, preço, código) | PASS | PASS | PASS | PASS | Atualiza tabela e persiste |
| Ajustar quantidade (entrada/saída) | PASS | PASS | PASS | PASS | Quantidades atualizadas sem negativos |
| Remover produto | PASS | PASS | PASS | PASS | Confirmação antes de excluir |
| Buscar por código/nome e filtrar | PASS | PASS | PASS | PASS | Lista atualiza instantaneamente |

## Caixa

| Ação | Tema escuro | Tema branco | Simples | Normal | Observações |
|---|---|---|---|---|---|
| Abrir caixa com valor inicial | PASS | PASS | PASS | PASS | Saldo inicial refletido |
| Registrar entrada manual | PASS | PASS | PASS | PASS | Campo valor valida centavos |
| Registrar saída manual | PASS | PASS | PASS | PASS | Saldo diminui corretamente |
| Registrar venda gera entrada automática | PASS | PASS | PASS | PASS | Valores somados ao caixa |
| Fechar caixa e gerar relatório | PASS | PASS | PASS | PASS | Mostra resumo e quebra de pagamento |
| Imprimir fluxo diário e mensal | PASS | PASS | PASS | PASS | Página de impressão abre com tabela completa |

## Dashboard

| Elemento | Tema escuro | Tema branco | Simples | Normal | Observações |
|---|---|---|---|---|---|
| Resumos (faturamento, lucro, vendas, ticket, caixa) | PASS | PASS | PASS | PASS | Totais consistem com vendas e caixa |
| Tabelas de top produtos e estoque baixo | PASS | PASS | PASS | PASS | Links levam ao estoque |
| Gráficos de evolução e comparativos | PASS | PASS | PASS | PASS | Dados corretos e escalas adequadas |

## Ajustes e Backup

| Ação | Tema escuro | Tema branco | Simples | Normal | Observações |
|---|---|---|---|---|---|
| Exportar backup (Arquivo) | PASS | PASS | PASS | PASS | Gera JSON com metadados e db |
| Importar backup (substituir) | PASS | PASS | PASS | PASS | Configurações e DB restaurados |
| Importar backup (mesclar) | PASS | PASS | PASS | PASS | Itens e preferências mesclados corretamente |
| Salvar no servidor (API) | PASS | PASS | PASS | PASS | Persistência em KV confirmada |
| Carregar do servidor (API) | PASS | PASS | PASS | PASS | Dados carregados e UI atualizada |
| Auto Sync (Polling) | PASS | PASS | PASS | PASS | Detecta alterações remotas e atualiza DB |

## Admin / Painel Secreto

| Ação | Tema escuro | Tema branco | Simples | Normal | Observações |
|---|---|---|---|---|---|
| Listar clientes, incluindo interno | PASS | PASS | PASS | PASS | Cliente interno marcado como ADMIN |
| Criar cliente | PASS | PASS | PASS | PASS | Exige usuário, senha, token único |
| Bloquear e desbloquear cliente | PASS | PASS | PASS | PASS | Login impedido quando bloqueado |
| Excluir cliente e rebuild index | PASS | PASS | PASS | PASS | KV index reconstruído sem inconsistência |

## Observações gerais

- Nenhuma funcionalidade foi removida ou quebrada. Todos os fluxos de venda,
  estoque, caixa, dashboard, ajustes e painel secreto continuam intactos.
- O SCAN foi testado em Vendas (rápida e carrinho) e Estoque, funcionando
  corretamente com BarcodeDetector e fallback manual.
- Todas as APIs respondem com objetos JSON consistentes e retornam códigos
  HTTP apropriados (200 para sucesso, 4xx/5xx para erros), conforme verificado
  via `curl` e nas interfaces.
- O sistema é responsivo e opera sem problemas em desktop e em dispositivos
  móveis simulados pelo modo responsivo do navegador.
