# Checklist de Regressão – SCAN

O botão de scanner é considerado uma funcionalidade crítica do sistema,
utilizado para leitura de códigos de barras e QR codes nas abas de Vendas e
Estoque.  Nenhuma alteração foi feita no seu funcionamento durante a
atualização final, mas este checklist reafirma a validação de que o SCAN
continua operando conforme esperado em todos os modos e temas.

## Procedimentos de Teste

1. **Venda Rápida – Tema Escuro / Modo Normal**
   - Abrir a aba Vendas (Venda Rápida).
   - Clicar em **📷 Scanner**.
   - Apontar a câmera para um código de barras válido (ou utilizar o
     simulador de scanner do navegador se a câmera não estiver disponível).
   - Verificar que o campo de busca/código é preenchido automaticamente com
     o código lido e o produto correspondente é selecionado.
   - Ajustar quantidade, aplicar desconto, finalizar venda e confirmar que
     o item foi adicionado corretamente.
   - **Resultado:** PASS – Código capturado e venda finalizada.

2. **Venda com Carrinho – Tema Branco / Modo Simples**
   - Ativar o modo simples e o tema branco nas preferências.
   - Abrir a aba Vendas (Carrinho).
   - Clicar em **📷 Scanner**.
   - Ler um código de barras e verificar que o produto é selecionado na
     lista e a quantidade é incrementada no carrinho.
   - Repetir com vários produtos.
   - Finalizar a venda e confirmar que o troco e os totais estão corretos.
   - **Resultado:** PASS – Scanner funciona e carrinho atualiza.

3. **Estoque – Tema Escuro / Modo Normal**
   - Abrir a aba Estoque.
   - Selecionar “Adicionar produto”.
   - Clicar em **📷 Scanner**.
   - Ler um código de barras e verificar que o campo "Código/SKU" é
     preenchido automaticamente.
   - Completar o cadastro do produto e salvar.
   - **Resultado:** PASS – Produto adicionado com código lido.

4. **Estoque – Tema Branco / Modo Simples (Busca)**
   - Habilitar tema branco e modo simples.
   - Na aba Estoque, clicar no campo de busca e em seguida no botão
     **📷 Scanner**.
   - Ler um código e verificar que a busca preenche o campo e filtra a
     lista para o produto correspondente.
   - **Resultado:** PASS – Busca por scanner funciona.

5. **Falha de Permissão de Câmera**
   - Revogar as permissões de câmera no navegador.
   - Clicar em **📷 Scanner**.
   - Verificar que o sistema apresenta uma mensagem informando sobre a
     falta de permissão e oferece a opção de inserir o código manualmente.
   - **Resultado:** PASS – Fallback para digitar código funciona.

6. **Modo Responsivo / Mobile**
   - Usar as ferramentas de desenvolvedor para simular um dispositivo
     móvel.
   - Repetir os passos 1, 2, 3 e 4 nos modos responsivos.
   - **Resultado:** PASS – Scanner opera normalmente em telas menores.

## Observações

- Não foram detectados regressões ou bugs relacionados ao scanner.  Os
  handlers `onScannerQuickClick` e `onScannerEstoqueClick` permanecem
  intactos e são reusados por toda a aplicação.
- O módulo `update/integrations/scanner.js` continua fornecendo o
  fallback legacy para navegadores sem `BarcodeDetector`.
