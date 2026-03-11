# CHANGELOG_SEGURANCA_PERMISSOES_USUARIOS

## Objetivo
Refinar o módulo de usuários adicionando pergunta de segurança, excluir usuário com confirmação e proteger menus de configuração para perfis não administradores.

## Arquivos modificados
- `index.html` (alterações na UI e lógica de gerenciamento de usuários e permissões)

## O que foi adicionado

1. **Pergunta de segurança no cadastro e edição de usuários**  
   - Novos campos `Pergunta de segurança` e `Resposta de segurança` foram incluídos nos formulários de criação e edição de usuários.  
   - Esses valores são salvos como `sq` e `sa` no objeto do usuário.  
   - Campos ficam em branco por padrão e são opcionais.

2. **Exclusão segura de usuários**  
   - Adicionada função isolada `deleteUser(username)` que exige permissão de **Gerenciar usuários**.  
   - Impede a exclusão do próprio usuário ou do último administrador ativo.  
   - Inclui dupla confirmação: diálogo de confirmação e, se existir, validação da pergunta de segurança.  
   - Registra a ação de auditoria e atualiza a lista de usuários.

3. **Botão "Excluir" na lista de usuários**  
   - Administradores agora podem excluir outros usuários diretamente da lista.  
   - O botão só aparece para usuários com permissão de gerenciamento e nunca é exibido para a própria conta.

4. **Edição de pergunta de segurança**  
   - O formulário de edição preenche automaticamente `Pergunta de segurança` e `Resposta de segurança` existentes.  
   - Salvar edições atualiza os campos `sq` e `sa` do usuário.

5. **Proteção da interface para não administradores**  
   - A função `aplicarRestricoesPorPerfil()` agora oculta itens sensíveis (Empresa, Preferências, Backup & Dados e Ferramentas) quando o usuário não é `admin`.  
   - Seções internas relacionadas (`perfil`, `ajusteTema`, `ajusteArquivo`, `ajusteExtras`, `ajustePreferencias`, `ajusteComercio` e `ajusteInterface`) também são ocultadas.  
   - O comando `salvarPerfil()` e `togglePreference()` verifica o papel do usuário e impede alterações caso não seja administrador.

## Regras preservadas
- Nenhuma alteração no sistema de login, vendas, estoque, caixa, scanner, backup, sincronização ou banco de dados.  
- Permissões originais (`editCost`, `editPrice`, `deleteProduct`, `cancelSale`, `closeBox`, `exportImportBackup`, `manageUsers`) permanecem intactas.  
- A adição de campos de segurança é opcional e não afeta usuários existentes.  
- O fluxo de vendas, histórico e impressão térmica continuam funcionando sem alterações.