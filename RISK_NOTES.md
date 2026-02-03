# Notas de Riscos e Pontos Sensíveis

Durante a fase final de compatibilidade e limpeza, algumas decisões foram
avaliadas para evitar regressões e preservar a estabilidade do sistema.  Esta
seção documenta os principais riscos identificados e como foram mitigados.

## Remoção de arquivos

**Risco:** Excluir checklists e relatórios antigos pode dificultar futuras
auditorias ou investigações de bugs, especialmente se alguma informação
importante estiver contida neles.

**Mitigação:** Todos os documentos removidos eram relativos a fases
anteriores e não impactam o funcionamento do código.  As informações
importantes foram consolidadas em novos arquivos (`COMPAT_TEST_CHECKLIST.md` e
`CHANGELOG_COMPAT.md`).  O repositório de origem permanece preservado em
commits anteriores se for necessário recuperar algum detalhe.

## Duplicidade Netlify vs. Cloudflare

**Risco:** Apagar ou mover a pasta `netlify` e o arquivo `netlify.toml`
poderia atrapalhar desenvolvedores que ainda utilizem Netlify como
provedor.  Entretanto, manter arquivos desnecessários aumenta o risco de
confusão sobre qual plataforma é suportada.

**Mitigação:** Decidiu‑se manter os arquivos de Netlify como legado, com a
nota de que a plataforma oficial para deploy é o Cloudflare Pages.  Esses
arquivos não interferem na build atual e podem ser removidos em versões
futuras após consenso.

## Configuração de Cache

**Risco:** Ajustar regras de cache em `_headers` incorretamente poderia
causar a distribuição de versões desatualizadas do aplicativo ou,
inversamente, aumentar o consumo de banda ao desabilitar o cache
totalmente.

**Mitigação:** Optou‑se por uma regra simples: `index.html` sem cache
(`no-store`) e demais ativos com cache imutável de 1 ano.  Essas regras
são recomendadas pelo Cloudflare para aplicativos SPA.  Qualquer ajuste
futuro deve ser testado em ambientes de preview antes de produção.

## Manutenção do SCAN

**Risco:** Qualquer alteração nos handlers do scanner poderia quebrar a
principal função de leitura de códigos, impactando diretamente as vendas
e o estoque.

**Mitigação:** Nenhuma modificação foi realizada em códigos de scanner.
Testes adicionais foram incluídos (`SCAN_REGRESSION_CHECKLIST.md`) para
garantir que o SCAN continue operando em todas as abas e modos.

## Validação de entrada e tratamento de erros

**Risco:** Alterar a lógica de validação de payload ou a forma como os
endpoints retornam erros poderia introduzir inconsistências ou
incompatibilidades com clientes existentes.

**Mitigação:** O módulo `_helpers.js` já centraliza a validação de
métodos, parsing de JSON e construção de respostas.  A revisão focou em
garantir que todas as rotas reutilizem essas funções sem alterar o
contrato das APIs.  Em caso de dúvida, preferimos não alterar a
funcionalidade.
