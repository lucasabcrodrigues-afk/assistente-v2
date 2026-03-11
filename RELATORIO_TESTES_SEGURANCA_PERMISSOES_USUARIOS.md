# RELATORIO_TESTES_SEGURANCA_PERMISSOES_USUARIOS

## Objetivo
Validar a implementação da pergunta de segurança, exclusão de usuários e a blindagem de menus sensíveis para perfis não administradores.

## Cenários testados

### 1. Cadastro de usuário com pergunta de segurança
- **PASS** Criar usuário definindo pergunta e resposta de segurança armazena os campos `sq` e `sa` corretamente.
- **PASS** Campos de pergunta e resposta ficam em branco ao cadastrar sem fornecer valores.
- **PASS** Após criar, a lista de usuários é atualizada e as novas propriedades não afetam o login ou as permissões existentes.

### 2. Edição de usuário
- **PASS** Abrir o formulário de edição preenche a pergunta e resposta de segurança existentes.
- **PASS** Alterar a pergunta ou resposta e salvar reflete as alterações no objeto do usuário sem quebrar outras propriedades.
- **PASS** Cancelar a edição não altera os dados originais.

### 3. Exclusão de usuário
- **PASS** O botão **Excluir** aparece apenas para usuários com permissão de gerenciar usuários e não aparece na própria conta.
- **PASS** Tentar excluir o próprio usuário exibe mensagem de erro e não remove a conta.
- **PASS** Tentar excluir o último administrador mostra mensagem de erro e impede a exclusão.
- **PASS** Ao excluir um usuário sem pergunta de segurança, o sistema pede confirmação única e remove corretamente.
- **PASS** Ao excluir um usuário com pergunta de segurança, o sistema solicita a resposta correta antes de permitir a remoção; resposta incorreta cancela a ação.
- **PASS** A exclusão registra auditoria e atualiza imediatamente a lista de usuários.

### 4. Proteção de menus e seções
- **PASS** Logar como `operador` ou outro perfil não administrador oculta os botões **Empresa**, **Preferências**, **Backup & Dados** e **Ferramentas** dentro de Ajustes.
- **PASS** As seções internas de perfil da empresa, temas, backup, extras, preferências, comércio e interface permanecem inacessíveis para não administradores mesmo via URL/hash.
- **PASS** Tentar salvar perfil da empresa ou alterar preferências como não administrador mostra toast `Sem permissão.` e mantém os dados inalterados.
- **PASS** Logar como `admin` mantém acesso total a todos os menus e seções anteriores.

### 5. Regressão geral
- **PASS** A rotina de vendas continua funcional e não apresenta erros após os ajustes.
- **PASS** O histórico de vendas, filtros, impressão térmica e reset de campos continuam operando sem alterações.
- **PASS** Não foram detectados impactos na caixa, estoque, scanner, backup ou sincronização.

## Conclusão
A implementação cumpriu os requisitos de adicionar uma camada de segurança para usuários e reforçar as permissões sem quebrar o sistema existente.