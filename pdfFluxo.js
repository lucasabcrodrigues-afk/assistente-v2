/*
 * pdfFluxo.js
 *
 * Este módulo implementa a geração de relatórios de fluxo de caixa (entradas, saídas e vendas)
 * de forma isolada para o ERP. O fluxo de caixa pode ser gerado para períodos diários,
 * mensais ou anuais. O resultado é um PDF com um resumo financeiro e anexos detalhados
 * de movimentos de caixa e vendas. As funções expostas incluem:
 *  - updateFluxoDateInputs: alterna a interface de seleção de data conforme o período escolhido.
 *  - generateFluxoPdf: cria e exibe/baixa o PDF de fluxo de caixa conforme solicitado.
 *  - Funções auxiliares para cálculo de faixas de tempo e coleta dos dados de db.caixa e db.vendas.
 *
 * O módulo depende de jsPDF e autoTable (carregados via CDN em index.html). Se as bibliotecas
 * não estiverem disponíveis, um erro visível será apresentado ao usuário.
 */

(() => {
  /**
   * Retorna o intervalo de tempo para um dia específico. Recebe uma string no formato
   * yyyy-mm-dd e retorna um objeto com Date start (inclusivo) e end (exclusivo).
   * @param {string} dateStr
   */
  function getRangeDiario(dateStr){
    if(!dateStr){
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { type:'diario', start: d, end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), label: d.toLocaleDateString('pt-BR') };
    }
    try{
      const d = new Date(dateStr);
      if(isNaN(d.getTime())) throw new Error('Data inválida');
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      const label = start.toLocaleDateString('pt-BR');
      return { type:'diario', start, end, label };
    }catch(e){
      return null;
    }
  }

  /**
   * Retorna o intervalo de tempo para um mês específico. Recebe uma string no formato
   * yyyy-mm (value do input type="month"). Se nenhum valor for fornecido usa o mês atual.
   * @param {string} monthStr
   */
  function getRangeMensal(monthStr){
    let year, month;
    if(monthStr){
      const parts = String(monthStr).split('-');
      year = Number(parts[0]);
      month = Number(parts[1]) - 1;
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth();
    }
    if(!Number.isFinite(year) || !Number.isFinite(month)) return null;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 1);
    const label = start.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    return { type:'mensal', start, end, label };
  }

  /**
   * Retorna o intervalo de tempo para um ano específico. Recebe um número ou string de ano.
   * Se nenhum valor for fornecido usa o ano atual.
   * @param {string|number} yearVal
   */
  function getRangeAnual(yearVal){
    let year;
    if(yearVal){
      year = Number(yearVal);
    } else {
      year = new Date().getFullYear();
    }
    if(!Number.isFinite(year)) return null;
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const label = String(year);
    return { type:'anual', start, end, label };
  }

  /**
   * Filtra movimentos do caixa e vendas dentro do intervalo fornecido. Retorna um
   * objeto com listas detalhadas e totais para cada categoria. Usa as estruturas
   * existentes db.caixa e db.vendas.
   * @param {{start:Date, end:Date}} range
   */
  function collectFluxoData(range){
    const startTime = range.start.getTime();
    const endTime   = range.end.getTime();
    // Estruturas de retorno
    const movimentos = [];
    const vendasDetalhadas = [];
    let entradas_c = 0;
    let saidas_c   = 0;
    let totalVendas_c = 0;
    // 1) Movimentos de caixa (entradas e saídas)
    (Array.isArray(db?.caixa) ? db.caixa : []).forEach(rec => {
      if(!rec) return;
      // Data pode ser string ISO ou custom; usa parseDateStr se disponível
      let d;
      if(rec.dataIso){
        try{ d = new Date(rec.dataIso); }catch(_){ d = null; }
      }
      if(!d && rec.data){
        if(typeof parseDateStr === 'function'){
          d = parseDateStr(rec.data);
        } else {
          try{ d = new Date(rec.data); }catch(_){ d = null; }
        }
      }
      if(!d || isNaN(d.getTime())) return;
      const t = d.getTime();
      if(t < startTime || t >= endTime) return;
      const tipo = String(rec.tipo || '').toLowerCase();
      const val_c = Number(rec.valor_c) || 0;
      const desc = String(rec.desc || rec.categoria || '');
      const resp = String(rec.responsavel || '');
      // Armazena detalhes: Data/Hora, Tipo, Descrição, Valor, Responsável
      const dataStr = d.toLocaleString('pt-BR');
      const valorBR = (val_c < 0 ? '- R$ ' : 'R$ ') + (typeof centsToBR === 'function' ? centsToBR(Math.abs(val_c)) : (Math.abs(val_c)/100).toFixed(2));
      movimentos.push({ data: dataStr, tipo, descricao: desc, valor_c: val_c, valorBR, responsavel: resp });
      // Acumula
      if(val_c >= 0) entradas_c += val_c; else saidas_c += Math.abs(val_c);
    });
    // 2) Vendas
    const vendasPorGrupo = new Map();
    (Array.isArray(db?.vendas) ? db.vendas : []).forEach(v => {
      if(!v || v.cancelada) return;
      // Data
      let d;
      if(v.dataIso){ try{ d = new Date(v.dataIso); }catch(_){ d = null; } }
      if(!d && v.data){ try{ d = new Date(v.data); }catch(_){ d = null; } }
      if(!d || isNaN(d.getTime())) return;
      const t = d.getTime();
      if(t < startTime || t >= endTime) return;
      // Determinar grupo: se v.groupId existe usa como identificador da venda; caso contrário, usa v.id
      const groupKey = v.groupId || v.id || null;
      if(!groupKey) return;
      // Inicializa estrutura
      if(!vendasPorGrupo.has(groupKey)){
        vendasPorGrupo.set(groupKey, { data: d, id: groupKey, total_c: 0, desconto_c: 0, pagamento: '', vendedor: '' });
      }
      const ent = vendasPorGrupo.get(groupKey);
      // Somar total
      ent.total_c += Number(v.total_c) || 0;
      // Determinar forma de pagamento: pode existir v.pag ou array v.pagamentos
      if(!ent.pagamento){
        try{
          if(Array.isArray(v.pagamentos) && v.pagamentos.length > 0){
            ent.pagamento = v.pagamentos.map(p=>String(p.pag)).join(', ');
          } else if(v.pag){
            ent.pagamento = String(v.pag);
          }
        }catch(_){ /* ignore */ }
      }
      // Vendedor (não existe no modelo atual, mas incluímos placeholder)
      if(!ent.vendedor && v.vendedor){ ent.vendedor = String(v.vendedor); }
      // Desconto: tenta v.desconto_c ou se servico_c for negativo considera como desconto
      if(v.desconto_c){ ent.desconto_c += Number(v.desconto_c) || 0; }
      if(Number(v.servico_c) < 0){ ent.desconto_c += Math.abs(Number(v.servico_c)); }
    });
    // Construir lista detalhada de vendas e acumular totais
    vendasPorGrupo.forEach(ent => {
      const dataStr = ent.data.toLocaleString('pt-BR');
      const totalBR = typeof centsToBR === 'function' ? centsToBR(ent.total_c) : (ent.total_c/100).toFixed(2);
      const descontoBR = ent.desconto_c ? (typeof centsToBR === 'function' ? centsToBR(ent.desconto_c) : (ent.desconto_c/100).toFixed(2)) : '';
      vendasDetalhadas.push({ data: dataStr, id: String(ent.id), total_c: ent.total_c, totalBR, desconto_c: ent.desconto_c, descontoBR, pagamento: ent.pagamento || '', vendedor: ent.vendedor || '' });
      totalVendas_c += ent.total_c;
    });
    // Número de vendas para ticket médio
    const numVendas = vendasPorGrupo.size;
    const ticketMedio_c = numVendas > 0 ? Math.round(totalVendas_c / numVendas) : 0;
    return {
      movimentos,
      vendas: vendasDetalhadas,
      totalEntradas_c: entradas_c,
      totalSaidas_c: saidas_c,
      totalVendas_c: totalVendas_c,
      numVendas,
      ticketMedio_c
    };
  }

  /**
   * Monta o objeto de dados para o relatório de fluxo de caixa. Combina intervalo, dados filtrados e
   * totais calculados. Também prepara um título amigável baseado no tipo de período.
   * @param {{type:string, start:Date, end:Date, label:string}} range
   */
  function buildFluxoReportData(range){
    const dados = collectFluxoData(range);
    // Saldo = entradas + vendas - saídas
    const saldo_c = dados.totalEntradas_c + dados.totalVendas_c - dados.totalSaidas_c;
    // Texto para o título
    let periodoLabel = '';
    if(range.type === 'diario') periodoLabel = 'Diário';
    if(range.type === 'mensal') periodoLabel = 'Mensal';
    if(range.type === 'anual') periodoLabel = 'Anual';
    const title = 'Fluxo de Caixa — ' + periodoLabel;
    return {
      range,
      movimentos: dados.movimentos,
      vendas: dados.vendas,
      totalEntradas_c: dados.totalEntradas_c,
      totalSaidas_c: dados.totalSaidas_c,
      totalVendas_c: dados.totalVendas_c,
      numVendas: dados.numVendas,
      ticketMedio_c: dados.ticketMedio_c,
      saldo_c,
      title
    };
  }

  /**
   * Gera um PDF a partir dos dados do relatório utilizando jsPDF e autoTable. Retorna uma Promise
   * que resolve em um Blob. O PDF contém uma página de resumo com totalizadores e páginas
   * seguintes com tabelas detalhadas de movimentos de caixa e vendas.
   * @param {Object} report
   */
  async function renderFluxoPdf(report){
    if(!window.jspdf || !window.jspdf.jsPDF){
      throw new Error('Biblioteca de PDF não carregada');
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    // Página 1: Cabeçalho e resumo
    doc.setFontSize(16);
    doc.text(report.title, 10, 14);
    doc.setFontSize(10);
    doc.text('Período: ' + report.range.label, 10, 20);
    doc.text('Data de geração: ' + new Date().toLocaleString('pt-BR'), 10, 24);
    // Totais
    doc.setFontSize(12);
    doc.text('Resumo', 10, 32);
    const totRows = [
      ['Entradas', 'R$ ' + (typeof centsToBR === 'function' ? centsToBR(report.totalEntradas_c) : (report.totalEntradas_c/100).toFixed(2))],
      ['Saídas', 'R$ ' + (typeof centsToBR === 'function' ? centsToBR(report.totalSaidas_c) : (report.totalSaidas_c/100).toFixed(2))],
      ['Vendas', 'R$ ' + (typeof centsToBR === 'function' ? centsToBR(report.totalVendas_c) : (report.totalVendas_c/100).toFixed(2))],
      ['Saldo', 'R$ ' + (typeof centsToBR === 'function' ? centsToBR(report.saldo_c) : (report.saldo_c/100).toFixed(2))],
      ['Nº de Vendas', String(report.numVendas)],
      ['Ticket Médio', 'R$ ' + (typeof centsToBR === 'function' ? centsToBR(report.ticketMedio_c) : (report.ticketMedio_c/100).toFixed(2))]
    ];
    doc.autoTable({
      head: [['Item','Valor']],
      body: totRows,
      startY: 36,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [240,240,240] }
    });
    // Movimentos do caixa detalhados
    let y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 80;
    doc.setFontSize(12);
    doc.text('Movimentos de Caixa', 10, y);
    y += 4;
    const movRows = report.movimentos.map(m => [m.data, m.tipo, m.descricao, m.valorBR, m.responsavel]);
    doc.autoTable({
      head: [['Data/Hora','Tipo','Descrição','Valor','Responsável']],
      body: movRows.length > 0 ? movRows : [['Sem movimentações no período','','','','']],
      startY: y,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [240,240,240] }
    });
    y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : y + 20;
    // Verifica se ultrapassou a página
    if(y > 250){ doc.addPage(); y = 20; }
    // Vendas detalhadas
    doc.setFontSize(12);
    doc.text('Vendas', 10, y);
    y += 4;
    const vendasRows = report.vendas.map(v => [v.data, v.id, 'R$ ' + (typeof centsToBR === 'function' ? centsToBR(v.total_c) : (v.total_c/100).toFixed(2)), v.descontoBR || '', v.pagamento || '', v.vendedor || '']);
    const vendaHead = ['Data/Hora','ID','Total','Desconto','Pagamento','Vendedor'];
    doc.autoTable({
      head: [vendaHead],
      body: vendasRows.length > 0 ? vendasRows : [['Sem vendas no período','','','','','']],
      startY: y,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [240,240,240] },
      columnStyles: {
        0: { cellWidth: 32 }, // Data
        1: { cellWidth: 24 }, // ID
        2: { cellWidth: 28 }, // Total
        3: { cellWidth: 28 }, // Desconto
        4: { cellWidth: 32 }, // Pagamento
        5: { cellWidth: 28 }  // Vendedor
      }
    });
    // Rodapé com numeração de páginas
    const pageCount = doc.internal.getNumberOfPages();
    for(let i=1; i<=pageCount; i++){
      doc.setPage(i);
      doc.setFontSize(8);
      const pageText = 'Página ' + i + '/' + pageCount;
      doc.text(pageText, 105, 290, { align:'center' });
    }
    const blob = doc.output('blob');
    return blob;
  }

  /**
   * Atualiza a visibilidade dos campos de data/mês/ano conforme a opção selecionada.
   * Exposta globalmente para ser chamada a partir de onchange inline no HTML.
   */
  function updateFluxoDateInputs(){
    const periodSelect = document.getElementById('fluxo_periodo');
    const diario = document.getElementById('fluxo_diario');
    const mensal = document.getElementById('fluxo_mensal');
    const anual  = document.getElementById('fluxo_anual');
    if(!periodSelect || !diario || !mensal || !anual) return;
    const v = periodSelect.value;
    diario.style.display = v === 'diario' ? '' : 'none';
    mensal.style.display = v === 'mensal' ? '' : 'none';
    anual.style.display  = v === 'anual'  ? '' : 'none';
  }

  /**
   * Lê os valores do formulário de fluxo de caixa e constrói o relatório, em seguida
   * gera o PDF e o abre ou baixa de acordo com o parâmetro abrir (true para abrir,
   * false para baixar). Também lida com estados de UI e exibe mensagens de
   * progresso/erro ao usuário.
   * @param {boolean} abrir
   */
  async function generateFluxoPdf(abrir){
    try{
      const statusEl = document.getElementById('fluxo_status');
      if(statusEl) statusEl.textContent = '';
      // Desabilita botões durante a geração
      const btnAbrir = document.getElementById('btnFluxoAbrir');
      const btnBaixar = document.getElementById('btnFluxoBaixar');
      if(btnAbrir) btnAbrir.disabled = true;
      if(btnBaixar) btnBaixar.disabled = true;
      if(typeof toast === 'function') toast('Gerando PDF…', 'ok');
      // Determina o intervalo
      const periodSelect = document.getElementById('fluxo_periodo');
      let range;
      if(!periodSelect){ throw new Error('Seleção de período não encontrada'); }
      const tipo = periodSelect.value;
      if(tipo === 'diario'){
        const val = document.getElementById('fluxo_diario')?.value;
        range = getRangeDiario(val);
        if(!range) throw new Error('Data inválida');
      } else if(tipo === 'mensal'){
        const val = document.getElementById('fluxo_mensal')?.value;
        range = getRangeMensal(val);
        if(!range) throw new Error('Mês inválido');
      } else if(tipo === 'anual'){
        const val = document.getElementById('fluxo_anual')?.value;
        range = getRangeAnual(val);
        if(!range) throw new Error('Ano inválido');
      } else {
        throw new Error('Tipo de período inválido');
      }
      // Ajusta label de período: para diário, exibe data; para mensal, exibe mês/ano; anual, apenas ano
      // A label já foi definida por getRange*.
      const reportData = buildFluxoReportData(range);
      const blob = await renderFluxoPdf(reportData);
      const url = URL.createObjectURL(blob);
      let opened = false;
      if(abrir){
        try{
          const w = window.open(url, '_blank');
          if(w) opened = true;
        }catch(_){ opened = false; }
      }
      if(!abrir || !opened){
        // Force download
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fluxo-caixa.pdf';
        a.click();
      }
      if(statusEl){ statusEl.textContent = 'PDF pronto'; }
      if(typeof toast === 'function') toast('PDF pronto', 'ok');
      setTimeout(() => { URL.revokeObjectURL(url); }, 20000);
    }catch(e){
      if(typeof toast === 'function') toast('Erro ao gerar PDF: ' + (e && e.message ? e.message : 'Erro desconhecido'), 'warn');
      const statusEl = document.getElementById('fluxo_status');
      if(statusEl) statusEl.textContent = 'Erro: ' + (e && e.message ? e.message : 'Falha desconhecida');
      console.error('generateFluxoPdf error', e);
    } finally {
      // Reabilita botões
      const btnAbrir = document.getElementById('btnFluxoAbrir');
      const btnBaixar = document.getElementById('btnFluxoBaixar');
      if(btnAbrir) btnAbrir.disabled = false;
      if(btnBaixar) btnBaixar.disabled = false;
    }
  }

  /**
   * Inicializa o módulo de fluxo de caixa: define valores padrão, aplica máscaras e conecta
   * handlers aos botões. Executado quando o DOM estiver pronto.
   */
  function initFluxoModule(){
    // Valores padrão nos inputs
    const diario = document.getElementById('fluxo_diario');
    const mensal = document.getElementById('fluxo_mensal');
    const anual  = document.getElementById('fluxo_anual');
    const periodSelect = document.getElementById('fluxo_periodo');
    try{
      const now = new Date();
      if(diario){ diario.valueAsDate = now; }
      if(mensal){
        const ym = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
        mensal.value = ym;
      }
      if(anual){ anual.value = String(now.getFullYear()); }
    }catch(_){ /* ignore */ }
    updateFluxoDateInputs();
    // Handlers
    const btnAbrir = document.getElementById('btnFluxoAbrir');
    const btnBaixar = document.getElementById('btnFluxoBaixar');
    if(btnAbrir){ btnAbrir.addEventListener('click', () => generateFluxoPdf(true)); }
    if(btnBaixar){ btnBaixar.addEventListener('click', () => generateFluxoPdf(false)); }
  }

  // Expor funções no escopo global
  window.updateFluxoDateInputs = updateFluxoDateInputs;
  // Nenhuma função de geração precisa ser global; é vinculada via evento

  // Inicializar quando DOM estiver pronto
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initFluxoModule);
  } else {
    initFluxoModule();
  }
})();