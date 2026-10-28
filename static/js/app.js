/**
 * MQ Professional — Diretoria de E-commerce
 * Controle Executivo de Metas & Realizado Diário (Faturamento Líquido)
 */

// ==========================================================================
// Helper de formatação monetária limpa para eixos de gráficos
// ==========================================================================
function fmtEixoMoeda(v) {
    if (v === null || v === undefined) return '';
    if (v === 0) return 'R$ 0';
    const abs = Math.abs(v);
    if (abs >= 1000000) {
        const m = v / 1000000;
        return 'R$ ' + (m % 1 === 0 ? m.toFixed(0) : m.toFixed(1).replace('.', ',')) + 'M';
    }
    if (abs >= 1000) {
        const k = v / 1000;
        return 'R$ ' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1).replace('.', ',')) + 'k';
    }
    return 'R$ ' + v;
}
if (typeof window !== 'undefined') {
    window.fmtEixoMoeda = fmtEixoMoeda;
}

let chartInstances = {};
let currentMatrizData = null;
let currentParams = null;
let currentViewMode = 'ranking'; // 'ranking' ou 'categoria'
let currentRankingSort = { col: 'fat', dir: 'desc' };
let currentVendSort = { col: 'fat', dir: 'desc' };
let collapsedNodes = new Set();
let currentMatrizVendData = null;
let collapsedVendNodes = new Set();
let currentPagamentosCanalData = null;
let collapsedPaymentNodes = new Set();
let currentPaymentSort = { col: 'total_valor', dir: 'desc' };
let currentPagamentosGraficoData = null;
let chartPagamentosPizzaInstance = null;
let currentCanaisData = [];
let currentCanaisSort = {
    col: 'faturamento_liquido',
    dir: 'desc'
};

// Variáveis de Estado para E-commerce Analytics & Cupons
let currentCuponsData = null;
let expandedCupons = new Set();
let currentCuponsSort = { col: 'valor', dir: 'desc' };
let currentConversaoData = null;
let currentConversaoSort = { col: 'mes_abrev', dir: 'asc' };
let chartConversaoInstance = null;

// Variáveis de Estado para Gráficos Diários e Modal de Zoom
let currentGraficosData = null;
let chartModalInstance = null;
let currentModalCanal = null;
let currentModalModo = 'acumulado';

// Utilitários de formatação BRL
const fmtMoeda = (val) => {
    return (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtMoedaZero = (val) => {
    return (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const fmtPct = (val) => {
    return (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
};

const fmtInt = (val) => {
    return (val || 0).toLocaleString('pt-BR');
};

const NOMES_MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function getAnosSelecionados() {
    const chks = Array.from(document.querySelectorAll('.chk-ano:checked')).map(el => parseInt(el.value));
    return chks.length > 0 ? chks : [2026];
}

function getMesesSelecionados() {
    const chks = Array.from(document.querySelectorAll('.chk-mes:checked')).map(el => parseInt(el.value));
    return chks.length > 0 ? chks : [new Date().getMonth() + 1];
}

function atualizarLabelsDropdowns() {
    const labelAnos = document.getElementById('label-selected-anos');
    const labelMeses = document.getElementById('label-selected-meses');
    const anos = getAnosSelecionados();
    const meses = getMesesSelecionados();

    if (labelAnos) {
        if (anos.length === 1) {
            labelAnos.textContent = anos[0];
        } else if (anos.length === 2) {
            labelAnos.textContent = anos.join(', ');
        } else {
            labelAnos.textContent = `${anos.length} anos`;
        }
    }

    if (labelMeses) {
        if (meses.length === 1) {
            labelMeses.textContent = NOMES_MESES_ABREV[meses[0] - 1];
        } else if (meses.length <= 3) {
            labelMeses.textContent = meses.map(m => NOMES_MESES_ABREV[m - 1]).join(', ');
        } else if (meses.length === 12) {
            labelMeses.textContent = 'Todos (12)';
        } else {
            labelMeses.textContent = `${meses.length} meses`;
        }
    }
}

function fecharTodosDropdowns() {
    document.querySelectorAll('.multiselect-dropdown').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.multiselect-trigger').forEach(el => el.classList.remove('active'));
}

function ajustarLimitesDias(forcarDiaAtual = false) {
    const anos = getAnosSelecionados();
    const meses = getMesesSelecionados();
    const sliderDias = document.getElementById('slider-dias');
    const labelDiaFim = document.getElementById('label-dia-fim');

    if (!sliderDias || !labelDiaFim) return;

    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;
    const ehMesAtual = anos.includes(anoAtual) && meses.includes(mesAtual);

    let maxDias = 31;
    if (meses.length === 1 && anos.length === 1) {
        maxDias = new Date(anos[0], meses[0], 0).getDate();
    } else {
        const diasArr = [];
        anos.forEach(a => meses.forEach(m => diasArr.push(new Date(a, m, 0).getDate())));
        maxDias = Math.max(...diasArr);
    }

    sliderDias.max = maxDias;

    if (forcarDiaAtual || ehMesAtual) {
        const diaAtual = Math.min(hoje.getDate(), maxDias);
        sliderDias.value = diaAtual;
    } else {
        sliderDias.value = maxDias;
    }
    labelDiaFim.textContent = sliderDias.value;
}

document.addEventListener('DOMContentLoaded', () => {
    initSyncButton();
    atualizarLabelsDropdowns();
    ajustarLimitesDias(true);
    setupEventListeners();
    iniciarCicloAtualizacao();
    carregarDados();
});

function setupEventListeners() {
    const sliderDias = document.getElementById('slider-dias');
    const labelDiaFim = document.getElementById('label-dia-fim');
    const selectMarca = document.getElementById('select-marca');

    // Multi-Select Ano Dropdown Toggle
    const triggerAno = document.getElementById('trigger-ano');
    const dropdownAno = document.getElementById('dropdown-ano');
    const containerAno = document.getElementById('ms-container-ano');
    if (triggerAno && dropdownAno) {
        const toggleAno = (e) => {
            e.stopPropagation();
            const isOpen = !dropdownAno.classList.contains('hidden');
            fecharTodosDropdowns();
            if (!isOpen) {
                dropdownAno.classList.remove('hidden');
                triggerAno.classList.add('active');
            }
        };
        triggerAno.addEventListener('click', toggleAno);
        const lblAno = containerAno ? containerAno.querySelector('.filter-label') : null;
        if (lblAno) lblAno.addEventListener('click', toggleAno);
    }

    // Multi-Select Mês Dropdown Toggle (abre no clique do trigger e do rótulo)
    const triggerMes = document.getElementById('trigger-mes');
    const dropdownMes = document.getElementById('dropdown-mes');
    const containerMes = document.getElementById('ms-container-mes');
    if (triggerMes && dropdownMes) {
        const toggleMes = (e) => {
            e.stopPropagation();
            const isOpen = !dropdownMes.classList.contains('hidden');
            fecharTodosDropdowns();
            if (!isOpen) {
                dropdownMes.classList.remove('hidden');
                triggerMes.classList.add('active');
            }
        };
        triggerMes.addEventListener('click', toggleMes);
        const lblMes = containerMes ? containerMes.querySelector('.filter-label') : null;
        if (lblMes) lblMes.addEventListener('click', toggleMes);
    }

    // Impedir que cliques dentro dos dropdowns fechem o popover
    if (dropdownAno) dropdownAno.addEventListener('click', (e) => e.stopPropagation());
    if (dropdownMes) dropdownMes.addEventListener('click', (e) => e.stopPropagation());

    // Fechar ao clicar fora
    document.addEventListener('click', () => {
        fecharTodosDropdowns();
    });

    // Checkboxes Ano
    document.querySelectorAll('.chk-ano').forEach(chk => {
        chk.addEventListener('change', () => {
            atualizarLabelsDropdowns();
            ajustarLimitesDias(false);
            carregarDadosDebounced(150);
        });
    });

    // Clique direto no nome do mês (.chk-label): seleciona exclusivamente aquele mês e fecha o menu imediatamente!
    document.querySelectorAll('.dropdown-mes-grid .checkbox-item').forEach(item => {
        const chk = item.querySelector('.chk-mes');
        const lbl = item.querySelector('.chk-label');
        if (lbl && chk) {
            lbl.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.chk-mes').forEach(c => c.checked = (c === chk));
                atualizarLabelsDropdowns();
                ajustarLimitesDias(false);
                fecharTodosDropdowns();
                carregarDados(false);
            });
        }
    });

    // Checkboxes Mês (para alternar meses com debounce suave)
    document.querySelectorAll('.chk-mes').forEach(chk => {
        chk.addEventListener('change', () => {
            atualizarLabelsDropdowns();
            ajustarLimitesDias(false);
            carregarDadosDebounced(150);
        });
    });

    // Ações rápidas Mês
    const btnTodos = document.getElementById('btn-quick-mes-todos');
    const btnAtual = document.getElementById('btn-quick-mes-atual');
    const btnLimpar = document.getElementById('btn-quick-mes-limpar');
    if (btnTodos) {
        btnTodos.addEventListener('click', () => {
            document.querySelectorAll('.chk-mes').forEach(chk => chk.checked = true);
            atualizarLabelsDropdowns();
            ajustarLimitesDias(false);
            carregarDados(false);
        });
    }
    if (btnAtual) {
        btnAtual.addEventListener('click', () => {
            const mAtual = new Date().getMonth() + 1;
            document.querySelectorAll('.chk-mes').forEach(chk => {
                chk.checked = (parseInt(chk.value) === mAtual);
            });
            atualizarLabelsDropdowns();
            ajustarLimitesDias(true);
            carregarDados(false);
        });
    }
    if (btnLimpar) {
        btnLimpar.addEventListener('click', () => {
            const mAtual = new Date().getMonth() + 1;
            document.querySelectorAll('.chk-mes').forEach(chk => {
                chk.checked = (parseInt(chk.value) === mAtual);
            });
            atualizarLabelsDropdowns();
            ajustarLimitesDias(true);
            carregarDados(false);
        });
    }

    sliderDias.addEventListener('input', (e) => {
        const dia = parseInt(e.target.value);
        if (labelDiaFim) labelDiaFim.textContent = dia;
        atualizarVisualizacaoPeriodoInstantaneo(dia);
    });

    sliderDias.addEventListener('change', () => {
        carregarDadosDebounced(150);
    });
    selectMarca.addEventListener('change', () => carregarDados(false));

    const btnSync = document.getElementById('btn-manual-sync');
    if (btnSync) {
        btnSync.addEventListener('click', () => {
            carregarDados(true);
        });
    }

    setupGridToggle();

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') fecharModalCanal();
    });

    // Ordenação Interativa do Quadro de Resultados por Canal
    document.querySelectorAll('.channel-table:not(.cupons-table):not(.conversao-table) th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-col');
            if (!col) return;

            if (currentCanaisSort.col === col) {
                currentCanaisSort.dir = currentCanaisSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                currentCanaisSort.col = col;
                currentCanaisSort.dir = col === 'canal' ? 'asc' : 'desc';
            }
            renderizarTabelaCanais();
        });
    });

    // Ordenação Interativa da Tabela de Cupons
    document.querySelectorAll('#table-cupons th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-col');
            if (!col) return;

            if (currentCuponsSort.col === col) {
                currentCuponsSort.dir = currentCuponsSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                currentCuponsSort.col = col;
                currentCuponsSort.dir = col === 'coupon' ? 'asc' : 'desc';
            }
            renderizarTabelaCupons();
        });
    });

    // Ordenação Interativa da Tabela de Conversão GA4
    document.querySelectorAll('#table-conversao th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-col');
            if (!col) return;

            if (currentConversaoSort.col === col) {
                currentConversaoSort.dir = currentConversaoSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                currentConversaoSort.col = col;
                currentConversaoSort.dir = col === 'mes_abrev' ? 'asc' : 'desc';
            }
            renderizarTabelaConversao();
        });
    });

    // Controles da Matriz 1: Produtos Mais Vendidos no Geral
    const btnRanking = document.getElementById('btn-view-ranking');
    const btnCanal = document.getElementById('btn-view-canal');
    const btnCategoria = document.getElementById('btn-view-categoria');
    const actionBtns = document.getElementById('matrix-prods-action-btns');

    function resetViewBtns() {
        if (btnRanking) btnRanking.classList.remove('active');
        if (btnCanal) btnCanal.classList.remove('active');
        if (btnCategoria) btnCategoria.classList.remove('active');
    }

    if (btnRanking) {
        btnRanking.addEventListener('click', () => {
            resetViewBtns();
            btnRanking.classList.add('active');
            currentViewMode = 'ranking';
            if (actionBtns) actionBtns.style.display = 'none';
            const thLbl = document.getElementById('th-matrix1-label');
            if (thLbl) thLbl.innerHTML = 'PRODUTO <i class="sort-icon"></i>';
            renderizarMatriz();
        });
    }

    if (btnCanal) {
        btnCanal.addEventListener('click', () => {
            resetViewBtns();
            btnCanal.classList.add('active');
            currentViewMode = 'canal';
            if (actionBtns) actionBtns.style.display = 'flex';
            const thLbl = document.getElementById('th-matrix1-label');
            if (thLbl) thLbl.innerHTML = 'CANAL / PRODUTO <i class="sort-icon"></i>';
            renderizarMatriz();
        });
    }

    if (btnCategoria) {
        btnCategoria.addEventListener('click', () => {
            resetViewBtns();
            btnCategoria.classList.add('active');
            currentViewMode = 'categoria';
            if (actionBtns) actionBtns.style.display = 'flex';
            const thLbl = document.getElementById('th-matrix1-label');
            if (thLbl) thLbl.innerHTML = 'CATEGORIA / PRODUTO <i class="sort-icon"></i>';
            renderizarMatriz();
        });
    }

    const btnExpand = document.getElementById('btn-expand-all');
    const btnCollapse = document.getElementById('btn-collapse-all');
    if (btnExpand) {
        btnExpand.addEventListener('click', () => {
            collapsedNodes.clear();
            renderizarMatriz();
        });
    }
    if (btnCollapse) {
        btnCollapse.addEventListener('click', () => {
            if (currentMatrizData) {
                if (currentViewMode === 'canal' && currentMatrizData.canais) {
                    currentMatrizData.canais.forEach(cn => collapsedNodes.add(cn.id));
                } else if (currentMatrizData.categorias) {
                    currentMatrizData.categorias.forEach(cat => collapsedNodes.add(cat.id));
                }
            }
            renderizarMatriz();
        });
    }

        // Ordenação interativa da Matriz 1 (Categoria & Produto / Ranking Geral)
    document.querySelectorAll('#matrix-sales-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-col');
            if (!col) return;
            if (currentRankingSort.col === col) {
                currentRankingSort.dir = currentRankingSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                currentRankingSort.col = col;
                currentRankingSort.dir = (col === 'nome' || col === 'rank') ? 'asc' : 'desc';
            }
            renderizarMatriz();
        });
    });

    // Ordenação interativa da Matriz 2 (Conta / Vendedor & Produto)
    document.querySelectorAll('#matrix-vend-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-col');
            if (!col) return;
            if (currentVendSort.col === col) {
                currentVendSort.dir = currentVendSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                currentVendSort.col = col;
                currentVendSort.dir = (col === 'nome' || col === 'rank') ? 'asc' : 'desc';
            }
            renderizarMatrizVendedores();
        });
    });

    const inputSearch = document.getElementById('input-search-matriz');
    if (inputSearch) {
        inputSearch.addEventListener('input', (e) => {
            filtrarMatriz(e.target.value.toLowerCase().trim());
        });
    }

    // Controles da Matriz 2 (Vendedor / Produto)
    const btnExpandVend = document.getElementById('btn-expand-all-vend');
    const btnCollapseVend = document.getElementById('btn-collapse-all-vend');
    if (btnExpandVend) {
        btnExpandVend.addEventListener('click', () => {
            collapsedVendNodes.clear();
            renderizarMatrizVendedores();
        });
    }
    if (btnCollapseVend) {
        btnCollapseVend.addEventListener('click', () => {
            if (currentMatrizVendData) {
                currentMatrizVendData.vendedores.forEach(v => collapsedVendNodes.add(v.id));
            }
            renderizarMatrizVendedores();
        });
    }

    const inputSearchVend = document.getElementById('input-search-vend');
    if (inputSearchVend) {
        inputSearchVend.addEventListener('input', (e) => {
            filtrarMatrizVend(e.target.value.toLowerCase().trim());
        });
    }

    // Controles da Seção: Formas de Pagamento por Canal
    const btnPayExpand = document.getElementById('btn-pay-expand-all');
    const btnPayCollapse = document.getElementById('btn-pay-collapse-all');
    if (btnPayExpand) {
        btnPayExpand.addEventListener('click', () => {
            collapsedPaymentNodes.clear();
            renderizarPagamentosPorCanal();
        });
    }
    if (btnPayCollapse) {
        btnPayCollapse.addEventListener('click', () => {
            if (currentPagamentosCanalData) {
                currentPagamentosCanalData.forEach(c => collapsedPaymentNodes.add(c.id));
            }
            renderizarPagamentosPorCanal();
        });
    }

    const inputSearchPay = document.getElementById('input-search-pagamento');
    if (inputSearchPay) {
        inputSearchPay.addEventListener('input', (e) => {
            filtrarPagamentos(e.target.value.toLowerCase().trim());
        });
    }

    // Ordenação da Tabela de Pagamentos por Canal
    document.querySelectorAll('#table-pagamentos-canal th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-col');
            if (!col) return;
            if (currentPaymentSort.col === col) {
                currentPaymentSort.dir = currentPaymentSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                currentPaymentSort.col = col;
                currentPaymentSort.dir = (col === 'nome') ? 'asc' : 'desc';
            }
            renderizarPagamentosPorCanal();
        });
    });

    // ============================================================
    // GERENCIADOR AVANÇADO DE MODO TELA CHEIA & ADAPTABILIDADE
    // ============================================================
    initFullscreenMode();
}

function redimensionarTodosGraficos() {
    // 1. Gráficos de Linha dos Canais e Histórico Mensal
    if (chartInstances && typeof chartInstances === 'object') {
        Object.values(chartInstances).forEach(inst => {
            if (inst && typeof inst.resize === 'function') {
                try { inst.resize(); } catch(e) {}
            }
        });
    }
    // 2. Gráfico Donut de Pagamentos
    if (chartPagamentosPizzaInstance && typeof chartPagamentosPizzaInstance.resize === 'function') {
        try { chartPagamentosPizzaInstance.resize(); } catch(e) {}
    }
    // 3. Gráfico de Conversão / Funil VTEX
    if (chartConversaoInstance && typeof chartConversaoInstance.resize === 'function') {
        try { chartConversaoInstance.resize(); } catch(e) {}
    }
    // 4. Gráfico do Modal Zoom se ativo
    if (chartModalInstance && typeof chartModalInstance.resize === 'function') {
        try { chartModalInstance.resize(); } catch(e) {}
    }
}

let resizeDebounceTimer = null;
function redimensionarTodosGraficosDebounced(delay = 80) {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(redimensionarTodosGraficos, delay);
}

function initFullscreenMode() {
    const btnFullscreen = document.getElementById('btn-toggle-fullscreen') || document.getElementById('btn-toggle-tv');
    const iconFullscreen = document.getElementById('icon-fullscreen');
    const textFullscreen = document.getElementById('text-fullscreen') || document.getElementById('btn-tv-text');

    function isFullscreenActive() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    }

    function toggleFullscreen() {
        if (!isFullscreenActive()) {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(() => {});
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    function updateFullscreenUI() {
        const isFs = isFullscreenActive();
        document.body.classList.toggle('fullscreen-active', isFs);
        if (btnFullscreen) {
            btnFullscreen.classList.toggle('active', isFs);
            btnFullscreen.title = isFs ? 'Sair do Modo Tela Cheia [Esc ou F11]' : 'Ativar Modo Tela Cheia [F11 ou tecla F]';
        }
        if (textFullscreen) {
            textFullscreen.textContent = isFs ? 'Sair Tela Cheia' : 'Modo Tela Cheia';
        }
        if (iconFullscreen) {
            iconFullscreen.setAttribute('data-lucide', isFs ? 'minimize-2' : 'maximize-2');
            if (window.lucide) lucide.createIcons();
        }

        // Força readaptação de todos os gráficos
        redimensionarTodosGraficosDebounced(50);
        setTimeout(redimensionarTodosGraficos, 200);
        setTimeout(redimensionarTodosGraficos, 450);
    }

    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', toggleFullscreen);
    }

    // Ouvintes de eventos nativos para sincronizar com F11, Esc e atalhos do SO
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
        document.addEventListener(evt, updateFullscreenUI);
    });

    // Tecla de atalho: 'f' ou 'F' ativa/desativa modo tela cheia (quando fora de inputs)
    document.addEventListener('keydown', (e) => {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            toggleFullscreen();
        }
    });

    // Listener global de resize da janela com debouncing
    window.addEventListener('resize', () => {
        redimensionarTodosGraficosDebounced(80);
    });

    // ResizeObserver universal na página para capturar qualquer mudança de tela/monitor
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            redimensionarTodosGraficosDebounced(80);
        });
        ro.observe(document.body);
    }
}

// Controle de concorrência e cache ultra-rápido no navegador
let currentAbortController = null;
const clientDataCache = new Map();
let carregarDadosTimer = null;

function carregarDadosDebounced(delay = 150) {
    clearTimeout(carregarDadosTimer);
    carregarDadosTimer = setTimeout(() => {
        carregarDados(false);
    }, delay);
}


// ==========================================================================
// ATUALIZAÇÃO ULTRA-RÁPIDA DO PERÍODO NO CLIENTE (0ms - 60 FPS)
// Permite arrastar o slider de dias com resposta instantânea e suave
// ==========================================================================
function atualizarVisualizacaoPeriodoInstantaneo(diaNum) {
    if (!currentGraficosData) return;
    diaNum = Math.max(1, parseInt(diaNum) || 1);

    const mapaCanais = [
        { key: 'GERAL', canvasId: 'chart-geral', suffix: 'geral', footFat: 'foot-geral-fat', footMeta: 'foot-geral-meta', footAnt: 'foot-geral-ant' },
        { key: 'MERCADO LIVRE', canvasId: 'chart-ml', suffix: 'ml', footFat: 'foot-ml-fat', footMeta: 'foot-ml-meta', footAnt: 'foot-ml-ant' },
        { key: 'VTEX', canvasId: 'chart-vtex', suffix: 'vtex', footFat: 'foot-vtex-fat', footMeta: 'foot-vtex-meta', footAnt: 'foot-vtex-ant' },
        { key: 'SHOPEE', canvasId: 'chart-shopee', suffix: 'shopee', footFat: 'foot-shopee-fat', footMeta: 'foot-shopee-meta', footAnt: 'foot-shopee-ant' },
        { key: 'MAGALU', canvasId: 'chart-magalu', suffix: 'magalu', footFat: 'foot-magalu-fat', footMeta: 'foot-magalu-meta', footAnt: 'foot-magalu-ant' },
        { key: 'PARLUX', canvasId: 'chart-parlux', suffix: 'parlux', footFat: 'foot-parlux-fat', footMeta: 'foot-parlux-meta', footAnt: 'foot-parlux-ant' }
    ];

    let totalDiasMes = 31;
    if (currentParams && currentParams.total_dias_mes) {
        totalDiasMes = currentParams.total_dias_mes;
    } else {
        const sliderEl = document.getElementById('slider-dias');
        if (sliderEl && sliderEl.max) totalDiasMes = parseInt(sliderEl.max) || 31;
    }

    mapaCanais.forEach(c => {
        const info = currentGraficosData[c.key];
        if (!info) return;

        const fm = info.full_month || {
            labels: info.labels || [],
            acumulado_fat: info.acumulado_fat || [],
            acumulado_meta: info.acumulado_meta || [],
            acumulado_fat_ant: info.acumulado_fat_ant || [],
            meta_mes: info.meta_mes || 0,
            meta_dia: info.meta_dia || 0
        };

        const sliceEnd = Math.min(diaNum, (fm.labels && fm.labels.length) ? fm.labels.length : diaNum);
        const slicedLabels = (fm.labels || []).slice(0, sliceEnd);
        const slicedFat = (fm.acumulado_fat || []).slice(0, sliceEnd);
        const slicedMeta = (fm.acumulado_meta || []).slice(0, sliceEnd);
        const slicedAnt = (fm.acumulado_fat_ant || []).slice(0, sliceEnd);

        const fatAtual = slicedFat.length > 0 ? (slicedFat[slicedFat.length - 1] || 0) : 0;
        const metaAcum = slicedMeta.length > 0 ? (slicedMeta[slicedMeta.length - 1] || 0) : 0;
        const fatAntAcum = slicedAnt.length > 0 ? (slicedAnt[slicedAnt.length - 1] || 0) : 0;

        const diffMetaVal = fatAtual - metaAcum;
        const diffMetaPct = metaAcum > 0 ? (diffMetaVal / metaAcum * 100) : (fatAtual > 0 ? 100 : 0);
        const isPosMeta = diffMetaVal >= 0;
        const signMeta = isPosMeta ? '+' : '';
        const colorMeta = isPosMeta ? '#00E676' : '#FF5252';

        const atingPct = metaAcum > 0 ? (fatAtual / metaAcum * 100) : 0;
        const vendaDia = diaNum > 0 ? (fatAtual / diaNum) : 0;
        const projecao = vendaDia * totalDiasMes;
        const metaMes = fm.meta_mes || info.meta_mes || 0;
        const gapProj = projecao - metaMes;
        const atingProj = metaMes > 0 ? (projecao / metaMes * 100) : 0;

        const s = c.suffix;

        // Faturamento Atual (#FF5252)
        const perfFatVal = document.getElementById(`perf-fat-val-${s}`);
        if (perfFatVal) {
            perfFatVal.textContent = `R$ ${fmtMoedaZero(fatAtual)}`;
            perfFatVal.style.setProperty('color', '#FF5252', 'important');
        }

        // Atingimento %
        const perfAtingVal = document.getElementById(`perf-ating-val-${s}`);
        if (perfAtingVal) {
            perfAtingVal.textContent = `${fmtPct(atingPct)}`;
            perfAtingVal.style.setProperty('color', colorMeta, 'important');
        }
        const perfAting = document.getElementById(`perf-ating-${s}`);
        if (perfAting) {
            perfAting.textContent = `${fmtPct(atingPct)}`;
            const statusClass = atingPct >= 100 ? 'superou' : (atingPct >= 75 ? 'atencao' : 'critico');
            perfAting.className = `perf-pct-main status-badge ${statusClass}`;
        }

        // Venda/dia
        const perfVendaDia = document.getElementById(`perf-venda-dia-${s}`);
        if (perfVendaDia) {
            perfVendaDia.innerHTML = `Venda/dia: <strong style="color: #FF5252 !important;">R$ ${fmtMoedaZero(vendaDia)}</strong>`;
            perfVendaDia.style.setProperty('color', '#8E8E93', 'important');
        }

        // Status Badge DENTRO/FORA DA META
        const perfBadge = document.getElementById(`perf-badge-${s}`);
        if (perfBadge) {
            const dentro = atingPct >= 100;
            perfBadge.textContent = dentro ? 'DENTRO DA META' : 'FORA DA META';
            perfBadge.className = `perf-status-pill ${dentro ? 'dentro' : 'fora'}`;
        }

        // Meta do Período Acumulado e Diferença
        const perfMetaVal = document.getElementById(`perf-meta-acum-val-${s}`) || document.getElementById(`perf-ant-val-${s}`);
        const perfMetaDiffVal = document.getElementById(`perf-meta-diff-val-${s}`) || document.getElementById(`perf-ant-diff-val-${s}`);
        const perfMetaDiffPct = document.getElementById(`perf-meta-diff-pct-${s}`) || document.getElementById(`perf-ant-diff-pct-${s}`);
        if (perfMetaVal) {
            perfMetaVal.textContent = `R$ ${fmtMoedaZero(metaAcum)}`;
            perfMetaVal.style.setProperty('color', '#00E676', 'important');
        }
        if (perfMetaDiffVal) {
            perfMetaDiffVal.textContent = `${signMeta}R$ ${fmtMoedaZero(diffMetaVal)}`;
            perfMetaDiffVal.style.setProperty('color', '#00E676', 'important');
        }
        if (perfMetaDiffPct) {
            perfMetaDiffPct.textContent = `${signMeta}${diffMetaPct.toFixed(1)}%`;
            perfMetaDiffPct.style.setProperty('color', '#00E676', 'important');
        }

        // Projeção
        const perfProjVal = document.getElementById(`perf-proj-val-${s}`);
        if (perfProjVal) {
            perfProjVal.textContent = `R$ ${fmtMoedaZero(projecao)}`;
            perfProjVal.style.setProperty('color', '#FFB300', 'important');
        }
        const perfProjPct = document.getElementById(`perf-proj-pct-${s}`);
        if (perfProjPct) perfProjPct.textContent = `${fmtPct(atingProj)} da Meta Mês`;

        const perfGapProj = document.getElementById(`perf-gap-proj-${s}`);
        if (perfGapProj) {
            const isPosGap = gapProj >= 0;
            const gapSign = isPosGap ? '+' : '';
            perfGapProj.innerHTML = `Gap: <strong style="color: #FFB300 !important;">${gapSign}R$ ${fmtMoedaZero(gapProj)}</strong>`;
            perfGapProj.style.setProperty('color', '#8E8E93', 'important');
        }

        // Rodapé do Card
        const footAnt = document.getElementById(c.footAnt);
        if (footAnt) footAnt.textContent = `Fat. Acum Mês ant.: R$ ${fmtMoedaZero(fatAntAcum)}`;
        const footFat = document.getElementById(c.footFat);
        if (footFat) footFat.textContent = `Fat: R$ ${fmtMoedaZero(fatAtual)}`;
        const footMeta = document.getElementById(c.footMeta);
        if (footMeta) footMeta.textContent = `Meta: R$ ${fmtMoedaZero(metaAcum)}`;

        // Encontrar o maior dia dentro do intervalo 1..diaNum
        let maxFatVal = 0;
        let maxFatDiaIdx = -1;
        for (let i = 0; i < slicedFat.length; i++) {
            const dFat = i === 0 ? slicedFat[0] : (slicedFat[i] - slicedFat[i - 1]);
            if (dFat > maxFatVal) {
                maxFatVal = dFat;
                maxFatDiaIdx = i;
            }
        }
        const recDiaEl = document.getElementById(`perf-record-dia-${s}`);
        const recFatEl = document.getElementById(`perf-record-fat-${s}`);
        if (recDiaEl && maxFatDiaIdx >= 0) {
            const mStr = (currentParams && currentParams.meses && currentParams.meses[0]) ? String(currentParams.meses[0]).padStart(2, '0') : '10';
            recDiaEl.textContent = `${String(maxFatDiaIdx + 1).padStart(2, '0')}/${mStr}`;
        }
        if (recFatEl) {
            recFatEl.textContent = maxFatVal > 0 ? `(R$ ${fmtMoedaZero(maxFatVal)})` : '';
        }

        // Atualizar o gráfico Chart.js
        const ch = chartInstances[c.canvasId];
        if (ch) {
            ch.data.labels = slicedLabels;
            ch.data.datasets[0].data = slicedMeta;
            ch.data.datasets[1].data = slicedAnt;
            ch.data.datasets[2].data = slicedFat;

            // Ajustar raios e destaques do maior dia
            const totalPontos = slicedLabels.length;
            const pRadiusFat = totalPontos > 25 ? 3 : 4.5;
            const fatPointRadii = [];
            const fatPointBg = [];
            const fatPointBorder = [];
            const fatPointBorderW = [];

            for (let idxPt = 0; idxPt < totalPontos; idxPt++) {
                if (idxPt === maxFatDiaIdx && maxFatVal > 0) {
                    fatPointRadii.push(pRadiusFat + 3.5);
                    fatPointBg.push('#FFB300');
                    fatPointBorder.push('#FFFFFF');
                    fatPointBorderW.push(2.5);
                } else {
                    fatPointRadii.push(pRadiusFat);
                    fatPointBg.push('#FFFFFF');
                    fatPointBorder.push('#FF5252');
                    fatPointBorderW.push(2.2);
                }
            }

            if (ch.data.datasets[2]) {
                ch.data.datasets[2].pointRadius = fatPointRadii;
                ch.data.datasets[2].pointBackgroundColor = fatPointBg;
                ch.data.datasets[2].pointBorderColor = fatPointBorder;
                ch.data.datasets[2].pointBorderWidth = fatPointBorderW;
            }

            ch.update('none'); // Update ultra-rápido sem animação travando
        }
    });

    // Top Header KPIs
    const infoGeral = currentGraficosData['GERAL'];
    if (infoGeral) {
        const fg = infoGeral.full_month || {
            acumulado_fat: infoGeral.acumulado_fat || [],
            meta_mes: infoGeral.meta_mes || 0
        };
        const sliceEnd = Math.min(diaNum, (fg.acumulado_fat || []).length);
        const fatGeral = fg.acumulado_fat && fg.acumulado_fat.length > 0 ? (fg.acumulado_fat[sliceEnd - 1] || 0) : 0;
        const metaMesGeral = fg.meta_mes || 0;
        const projGeral = diaNum > 0 ? (fatGeral / diaNum) * totalDiasMes : 0;
        const projPctGeral = metaMesGeral > 0 ? (projGeral / metaMesGeral * 100) : 0;

        const projEl = document.getElementById('kpi-projecao');
        if (projEl) projEl.textContent = fmtMoeda(projGeral);
        const projPctEl = document.getElementById('kpi-projecao-pct');
        if (projPctEl) {
            projPctEl.textContent = `${fmtPct(projPctGeral)} da Meta Total`;
            projPctEl.className = 'badge-pill ' + (projPctGeral >= 100 ? 'pill-green' : (projPctGeral >= 80 ? 'pill-blue' : 'pill-red'));
        }
    }

    // Atualizar Tabela de Canais
    if (currentCanaisData && Array.isArray(currentCanaisData)) {
        currentCanaisData.forEach(row => {
            const chInfo = currentGraficosData[row.canal];
            if (chInfo) {
                const fm = chInfo.full_month || {
                    acumulado_fat: chInfo.acumulado_fat || [],
                    acumulado_meta: chInfo.acumulado_meta || [],
                    meta_mes: chInfo.meta_mes || 0
                };
                const endIdx = Math.min(diaNum, (fm.acumulado_fat || []).length) - 1;
                if (endIdx >= 0) {
                    const rFat = fm.acumulado_fat[endIdx] || 0;
                    const rMeta = fm.acumulado_meta[endIdx] || 0;
                    const rVd = diaNum > 0 ? rFat / diaNum : 0;
                    row.faturamento_liquido = rFat;
                    row.meta_periodo = rMeta;
                    row.projecao_mes = rVd * totalDiasMes;
                    row.atingimento_periodo_pct = rMeta > 0 ? (rFat / rMeta * 100) : 0;
                    row.status = row.atingimento_periodo_pct >= 100 ? 'superou' : (row.atingimento_periodo_pct >= 75 ? 'atencao' : 'critico');
                }
            }
        });
        renderizarTabelaCanais();
    }
}

function aplicarDadosDashboard(data) {
    if (!data) return;
    window.dashboardInicializado = true;
    currentParams = data.parametros;
    currentGraficosData = data.graficos_canais;
    atualizarKPIs(data.kpis);
    renderizarSeisGraficos(data.graficos_canais);
    atualizarTabelaCanais(data.canais_tabela);
    renderizarHistoricoMensal(data.historico_mensal);
    if (data.matriz_produtos) {
        currentMatrizData = data.matriz_produtos;
        currentParams = data.parametros;
        renderizarMatriz();
    }
    if (data.matriz_vendedores) {
        currentMatrizVendData = data.matriz_vendedores;
        renderizarMatrizVendedores();
    }
    if (data.pagamentos_por_canal) {
        renderizarPagamentosPorCanal(data.pagamentos_por_canal);
    }
    if (data.grafico_pizza_pagamento) {
        renderizarGraficoPagamentos(data.grafico_pizza_pagamento);
    }
    if (data.cupons_resumo) {
        currentCuponsData = data.cupons_resumo;
        renderizarCupons();
    }
    if (data.analytics_conversao) {
        currentConversaoData = data.analytics_conversao;
        renderizarConversao();
        renderizarGraficoConversao();
    }
    registrarUltimaAtualizacao();
}

// ============================================================
// CICLO AUTOMÁTICO DE ATUALIZAÇÃO (30 MINUTOS = 1800 SEGUNDOS)
// ============================================================
const REFRESH_INTERVAL_SECONDS = 30 * 60; // 30 minutos
let nextUpdateSeconds = REFRESH_INTERVAL_SECONDS;
let refreshTimerInterval = null;

function iniciarCicloAtualizacao() {
    if (refreshTimerInterval) {
        clearInterval(refreshTimerInterval);
    }
    atualizarDisplayTemporizador();
    refreshTimerInterval = setInterval(() => {
        nextUpdateSeconds--;
        if (nextUpdateSeconds <= 0) {
            console.log('[Auto-Refresh 30m] Ciclo de 30 minutos atingido. Atualizando dados com Sankhya...');
            nextUpdateSeconds = REFRESH_INTERVAL_SECONDS;
            carregarDados(true);
        }
        atualizarDisplayTemporizador();
    }, 1000);
}

function atualizarDisplayTemporizador() {
    const nextUpdateEl = document.getElementById('next-update');
    if (nextUpdateEl) {
        const segRestantes = Math.max(0, nextUpdateSeconds);
        const min = Math.floor(segRestantes / 60);
        const sec = segRestantes % 60;
        nextUpdateEl.textContent = `Próxima atualização em: ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
}

function registrarUltimaAtualizacao(metaETL = null) {
    const lastUpdateEls = document.querySelectorAll('.last-update, #last-update');
    const agora = new Date();
    const texto = (metaETL && metaETL.timestamp) 
        ? `Atualizado: ${metaETL.timestamp}` 
        : `Atualizado: ${agora.toLocaleTimeString('pt-BR')}`;
    
    lastUpdateEls.forEach(el => {
        el.textContent = texto;
        if (metaETL && metaETL.linhas_vendas) {
            el.title = `Dados sincronizados via MariaDB (${metaETL.linhas_vendas.toLocaleString('pt-BR')} vendas)`;
        }
    });
    nextUpdateSeconds = REFRESH_INTERVAL_SECONDS;
    atualizarDisplayTemporizador();
}

async function carregarDados(forceRefresh = false) {
    const anos = getAnosSelecionados();
    const meses = getMesesSelecionados();
    const diaFim = document.getElementById('slider-dias').value;
    const marca = document.getElementById('select-marca').value;

    const cacheKey = `${anos.join(',')}_${meses.join(',')}_${diaFim}_${marca}`;

    // 1. FAST PATH DO NAVEGADOR: Se já foi consultado e não é forceRefresh, aplica instantaneamente (0ms)
    if (!forceRefresh && clientDataCache.has(cacheKey)) {
        const cached = clientDataCache.get(cacheKey);
        aplicarDadosDashboard(cached);
        return;
    }

    const overlay = document.getElementById('loading-overlay');
    const iconRefresh = document.getElementById('icon-refresh');

    // Cancela requisição anterior para não congestionar servidor
    if (currentAbortController) {
        currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    try {
        // Se já temos algo na tela, não precisa travar tudo com spinner pesado, apenas suave
        if (!window.dashboardInicializado) {
            overlay.classList.remove('hidden');
        }
        if (iconRefresh) iconRefresh.classList.add('spinning');

        const url = `/api/resumo?anos=${anos.join(',')}&meses=${meses.join(',')}&dia_ini=1&dia_fim=${diaFim}&marca=${encodeURIComponent(marca)}&force=${forceRefresh}`;
        const res = await fetch(url, { signal: currentAbortController.signal });
        const data = await res.json();

        if (data.status === 'success') {
            // Salva no cache do cliente (até 50 consultas na memória)
            if (clientDataCache.size > 50) {
                const primeirachave = clientDataCache.keys().next().value;
                clientDataCache.delete(primeirachave);
            }
            clientDataCache.set(cacheKey, data);

            aplicarDadosDashboard(data);
        } else {
            console.error('Erro na resposta:', data.message);
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            return; // Requisição abortada porque o usuário trocou de filtro rapidamente
        }
        console.error('Erro na requisição:', err);
    } finally {
        overlay.classList.add('hidden');
        if (iconRefresh) iconRefresh.classList.remove('spinning');
        window.dashboardInicializado = true;
    }
}

// 1. Atualizar KPIs Nível Diretoria: Projeção Consolidada, Projeção por Canal e Devoluções
function atualizarKPIs(kpis) {
    // 1. Projeção do Mês (Consolidado E-commerce)
    const projEl = document.getElementById('kpi-projecao');
    if (projEl) projEl.textContent = fmtMoeda(kpis.projecao_mes);

    const projPctEl = document.getElementById('kpi-projecao-pct');
    if (projPctEl) {
        projPctEl.textContent = `${fmtPct(kpis.projecao_pct)} da Meta Total`;
        projPctEl.className = 'badge-pill ' + (kpis.projecao_pct >= 100 ? 'pill-green' : (kpis.projecao_pct >= 80 ? 'pill-blue' : 'pill-red'));
    }

    const metaMesEl = document.getElementById('kpi-meta-mes');
    if (metaMesEl) {
        metaMesEl.textContent = `Meta Mês: R$ ${fmtMoeda(kpis.meta_mes_geral)}`;
        metaMesEl.style.color = '#00E676';
        metaMesEl.style.fontWeight = '700';
    }

    // MoM & YTD Projeção Consolidada
    const projMomVal = document.getElementById('kpi-proj-mom-val');
    if (projMomVal) projMomVal.textContent = `R$ ${fmtMoedaZero(kpis.fat_ant_mes_cheio)}`;
    const projMomBadge = document.getElementById('kpi-proj-mom-badge');
    if (projMomBadge) {
        const sign = kpis.diff_proj_mom_pct > 0 ? '+' : '';
        projMomBadge.textContent = `${sign}${fmtPct(kpis.diff_proj_mom_pct)} vs M-1`;
        projMomBadge.className = 'comp-badge ' + (kpis.diff_proj_mom_pct > 0 ? 'positive' : (kpis.diff_proj_mom_pct < 0 ? 'negative' : 'neutral'));
    }
    const projYtdVal = document.getElementById('kpi-proj-ytd-val');
    if (projYtdVal) projYtdVal.textContent = `R$ ${fmtMoedaZero(kpis.meta_ytd_total)}`;
    const projYtdBadge = document.getElementById('kpi-proj-ytd-badge');
    if (projYtdBadge) {
        projYtdBadge.textContent = `${fmtPct(kpis.ating_meta_ytd_pct)} Meta`;
        projYtdBadge.className = 'comp-badge ' + (kpis.ating_meta_ytd_pct >= 100 ? 'positive' : (kpis.ating_meta_ytd_pct >= 80 ? 'neutral' : 'negative'));
    }

    // 2. Cards Executivos de Projeção por Canal (Mercado Livre, Shopee, VTEX, Magalu, Parlux)
    const canaisKeys = ['ml', 'shopee', 'vtex', 'magalu', 'parlux'];
    if (kpis.projecoes_canais) {
        canaisKeys.forEach(key => {
            const c = kpis.projecoes_canais[key];
            if (!c) return;

            const valEl = document.getElementById(`kpi-proj-${key}`);
            if (valEl) valEl.textContent = fmtMoeda(c.projecao_mes);

            const pctEl = document.getElementById(`kpi-proj-pct-${key}`);
            if (pctEl) {
                pctEl.textContent = `${fmtPct(c.projecao_pct)} da Meta`;
                pctEl.className = 'badge-pill ' + (c.projecao_pct >= 100 ? 'pill-green' : (c.projecao_pct >= 80 ? 'pill-blue' : 'pill-red'));
            }

            const metaEl = document.getElementById(`kpi-meta-${key}`);
            if (metaEl) {
                metaEl.textContent = `Meta Mês: R$ ${fmtMoeda(c.meta_mes)}`;
                metaEl.style.color = '#00E676';
                metaEl.style.fontWeight = '700';
            }

            const momVal = document.getElementById(`kpi-proj-mom-val-${key}`);
            if (momVal) momVal.textContent = `R$ ${fmtMoedaZero(c.fat_ant_mes_cheio)}`;

            const momBadge = document.getElementById(`kpi-proj-mom-badge-${key}`);
            if (momBadge) {
                const sign = c.diff_proj_mom_pct > 0 ? '+' : '';
                momBadge.textContent = `${sign}${fmtPct(c.diff_proj_mom_pct)} vs M-1`;
                momBadge.className = 'comp-badge ' + (c.diff_proj_mom_pct > 0 ? 'positive' : (c.diff_proj_mom_pct < 0 ? 'negative' : 'neutral'));
            }

            const ytdVal = document.getElementById(`kpi-proj-ytd-val-${key}`);
            if (ytdVal) ytdVal.textContent = `R$ ${fmtMoedaZero(c.meta_ytd)}`;

            const ytdBadge = document.getElementById(`kpi-proj-ytd-badge-${key}`);
            if (ytdBadge) {
                ytdBadge.textContent = `${fmtPct(c.ating_meta_ytd_pct)} Meta`;
                ytdBadge.className = 'comp-badge ' + (c.ating_meta_ytd_pct >= 100 ? 'positive' : (c.ating_meta_ytd_pct >= 80 ? 'neutral' : 'negative'));
            }
        });
    }

    // 3. Devoluções
    const devPctEl = document.getElementById('kpi-devolucao-pct');
    if (devPctEl) devPctEl.textContent = fmtPct(kpis.pct_devolucao);

    const devVlrEl = document.getElementById('kpi-devolucao-vlr');
    if (devVlrEl) devVlrEl.textContent = `R$ ${fmtMoeda(kpis.devolucao_total)}`;

    // MoM & YTD Devoluções
    const devMomVal = document.getElementById('kpi-dev-mom-val');
    if (devMomVal) devMomVal.textContent = `${fmtPct(kpis.dev_pct_ant_periodo)} (R$ ${fmtMoedaZero(kpis.dev_vlr_ant_periodo)})`;
    const devMomBadge = document.getElementById('kpi-dev-mom-badge');
    if (devMomBadge) {
        const sign = kpis.diff_dev_mom_pp > 0 ? '+' : '';
        devMomBadge.textContent = `${sign}${kpis.diff_dev_mom_pp.toFixed(2)} p.p.`;
        devMomBadge.className = 'comp-badge ' + (kpis.diff_dev_mom_pp < 0 ? 'positive' : (kpis.diff_dev_mom_pp > 0 ? 'negative' : 'neutral'));
    }
    const devYtdVal = document.getElementById('kpi-dev-ytd-val');
    if (devYtdVal) devYtdVal.textContent = `${fmtPct(kpis.dev_pct_ytd)} (R$ ${fmtMoedaZero(kpis.dev_vlr_ytd)})`;
    const devYtdBadge = document.getElementById('kpi-dev-ytd-badge');
    if (devYtdBadge) {
        const sign = kpis.diff_dev_ytd_pp > 0 ? '+' : '';
        devYtdBadge.textContent = `${sign}${kpis.diff_dev_ytd_pp.toFixed(2)} p.p. YoY`;
        devYtdBadge.className = 'comp-badge ' + (kpis.diff_dev_ytd_pp < 0 ? 'positive' : (kpis.diff_dev_ytd_pp > 0 ? 'negative' : 'neutral'));
    }

    // Atualiza tags de dia / ano nos rótulos comparativos
    const diaFimAtual = document.getElementById('slider-dias') ? document.getElementById('slider-dias').value : (currentParams ? currentParams.dia_fim : '');
    document.querySelectorAll('.comp-dias').forEach(el => {
        el.textContent = `dias 1-${diaFimAtual}`;
    });
    document.querySelectorAll('.comp-ano').forEach(el => {
        el.textContent = `${kpis.ano_atual || 2026}`;
    });
}

// 2. Renderizar os 6 Gráficos Diários Acumulados (Linha Verde: Meta / Linha Vermelha: Fat / Linha Azul: Mês Ant)
function renderizarSeisGraficos(graficos) {
    if (!graficos) return;
    currentGraficosData = graficos;

    document.querySelectorAll('.canal-chart-card [title]').forEach(el => { if (!el.classList.contains('btn-zoom-chart')) el.removeAttribute('title'); });
    const mapaCanais = [
        { key: 'GERAL', canvasId: 'chart-geral', badgeId: 'badge-geral', suffix: 'geral', footFat: 'foot-geral-fat', footMeta: 'foot-geral-meta', footMetaMes: 'foot-geral-metames', footAnt: 'foot-geral-ant' },
        { key: 'MERCADO LIVRE', canvasId: 'chart-ml', badgeId: 'badge-ml', suffix: 'ml', footFat: 'foot-ml-fat', footMeta: 'foot-ml-meta', footMetaMes: 'foot-ml-metames', footAnt: 'foot-ml-ant' },
        { key: 'VTEX', canvasId: 'chart-vtex', badgeId: 'badge-vtex', suffix: 'vtex', footFat: 'foot-vtex-fat', footMeta: 'foot-vtex-meta', footMetaMes: 'foot-vtex-metames', footAnt: 'foot-vtex-ant' },
        { key: 'SHOPEE', canvasId: 'chart-shopee', badgeId: 'badge-shopee', suffix: 'shopee', footFat: 'foot-shopee-fat', footMeta: 'foot-shopee-meta', footMetaMes: 'foot-shopee-metames', footAnt: 'foot-shopee-ant' },
        { key: 'MAGALU', canvasId: 'chart-magalu', badgeId: 'badge-magalu', suffix: 'magalu', footFat: 'foot-magalu-fat', footMeta: 'foot-magalu-meta', footMetaMes: 'foot-magalu-metames', footAnt: 'foot-magalu-ant' },
        { key: 'PARLUX', canvasId: 'chart-parlux', badgeId: 'badge-parlux', suffix: 'parlux', footFat: 'foot-parlux-fat', footMeta: 'foot-parlux-meta', footMetaMes: 'foot-parlux-metames', footAnt: 'foot-parlux-ant' }
    ];

    mapaCanais.forEach(c => {
        const info = graficos[c.key];
        if (!info) return;

        const s = c.suffix;

        // 1. Atualizar Performance do Período Trabalhado (Faturamento Atual + Meta Período + Venda/dia)
        const perfBadge = document.getElementById(`perf-badge-${s}`);
        const perfAting = document.getElementById(`perf-ating-${s}`);
        const perfAtingVal = document.getElementById(`perf-ating-val-${s}`);
        const perfVendaDia = document.getElementById(`perf-venda-dia-${s}`);
        const perfMetaDia = document.getElementById(`perf-meta-dia-${s}`);
        
        const fatAtual = Number(info.total_fat_periodo) || 0;
        const metaAcum = Number(info.total_meta_periodo) || 0;
        const diffMetaVal = fatAtual - metaAcum;
        const diffMetaPct = metaAcum > 0 ? (diffMetaVal / metaAcum * 100) : (fatAtual > 0 ? 100 : 0);
        const isPosMeta = diffMetaVal >= 0;
        const signMeta = isPosMeta ? '+' : '';
        const colorMeta = isPosMeta ? '#00E676' : '#FF5252';

        // Faturamento Atual em destaque (#FF5252):
        const perfFatVal = document.getElementById(`perf-fat-val-${s}`);
        if (perfFatVal) {
            perfFatVal.textContent = `R$ ${fmtMoedaZero(fatAtual)}`;
            perfFatVal.style.setProperty('color', '#FF5252', 'important');
        }
        // Meta do Período Trabalhado (compatibilidade):
        const perfMetaPeriodo = document.getElementById(`perf-meta-periodo-${s}`);
        if (perfMetaPeriodo) {
            perfMetaPeriodo.textContent = `R$ ${fmtMoedaZero(metaAcum)}`;
        }
        
        // Atingimento % em Coluna 1
        if (perfAtingVal) {
            perfAtingVal.textContent = `${fmtPct(info.atingimento_pct)}`;
            perfAtingVal.style.setProperty('color', colorMeta, 'important');
        }
        if (perfAting) {
            perfAting.textContent = `${fmtPct(info.atingimento_pct)}`;
            const statusClass = info.atingimento_pct >= 100 ? 'superou' : (info.atingimento_pct >= 75 ? 'atencao' : 'critico');
            perfAting.className = `perf-pct-main status-badge ${statusClass}`;
        }
        if (perfVendaDia) {
            perfVendaDia.innerHTML = `Venda/dia: <strong style="color: #FF5252 !important;">R$ ${fmtMoedaZero(info.venda_dia)}</strong>`;
            perfVendaDia.style.setProperty('color', '#8E8E93', 'important');
        }
        if (perfMetaDia) perfMetaDia.innerHTML = `Meta/dia: <strong>R$ ${fmtMoedaZero(info.meta_dia)}</strong>`;
        
        if (perfBadge) {
            const dentro = (info.atingimento_pct || 0) >= 100;
            perfBadge.textContent = dentro ? 'DENTRO DA META' : 'FORA DA META';
            perfBadge.className = `perf-status-pill ${dentro ? 'dentro' : 'fora'}`;
        }
        
        // 1.5. Meta do Período Acumulado e % de Evolução acima ou abaixo da Meta Acumulada (Padrão Verde #00E676)
        const perfMetaVal = document.getElementById(`perf-meta-acum-val-${s}`) || document.getElementById(`perf-ant-val-${s}`);
        const perfMetaDiffVal = document.getElementById(`perf-meta-diff-val-${s}`) || document.getElementById(`perf-ant-diff-val-${s}`);
        const perfMetaDiffPct = document.getElementById(`perf-meta-diff-pct-${s}`) || document.getElementById(`perf-ant-diff-pct-${s}`);
        
        if (perfMetaVal) {
            perfMetaVal.textContent = `R$ ${fmtMoedaZero(metaAcum)}`;
            perfMetaVal.style.setProperty('color', '#00E676', 'important');
            // perfMetaVal.title removido
        }
        if (perfMetaDiffVal) {
            perfMetaDiffVal.textContent = `${signMeta}R$ ${fmtMoedaZero(diffMetaVal)}`;
            perfMetaDiffVal.style.setProperty('color', '#00E676', 'important');
            // perfMetaDiffVal.title removido
        }
        if (perfMetaDiffPct) {
            perfMetaDiffPct.textContent = `${signMeta}${diffMetaPct.toFixed(1)}%`;
            perfMetaDiffPct.style.setProperty('color', '#00E676', 'important');
            // perfMetaDiffPct.title removido
        }

        // 2. Atualizar Projeção de Fechamento do Mês (Padrão Amarelo #FFB300)
        const perfProjBadge = document.getElementById(`perf-proj-badge-${s}`);
        const perfProjVal = document.getElementById(`perf-proj-val-${s}`);
        const perfProjPct = document.getElementById(`perf-proj-pct-${s}`);
        const perfMetaMes = document.getElementById(`perf-meta-mes-${s}`);
        const perfGapProj = document.getElementById(`perf-gap-proj-${s}`);
        
        if (perfProjVal) {
            perfProjVal.textContent = `R$ ${fmtMoedaZero(info.projecao_mes)}`;
            perfProjVal.style.setProperty('color', '#FFB300', 'important');
        }
        if (perfProjPct) perfProjPct.textContent = `${fmtPct(info.projecao_pct)} da Meta Mês`;
        if (perfMetaMes) {
            perfMetaMes.innerHTML = `Meta Mês: <strong style="color: #FFB300 !important;">R$ ${fmtMoedaZero(info.meta_mes)}</strong>`;
            perfMetaMes.style.setProperty('color', '#8E8E93', 'important');
        }
        if (perfGapProj) {
            const isPosGap = (info.gap_projecao || 0) >= 0;
            const gapSign = isPosGap ? '+' : '';
            perfGapProj.innerHTML = `Gap: <strong style="color: #FFB300 !important;">${gapSign}R$ ${fmtMoedaZero(info.gap_projecao)}</strong>`;
            perfGapProj.className = `daily-item`;
            perfGapProj.style.setProperty('color', '#8E8E93', 'important');
        }
        if (perfProjBadge) {
            const atingProj = (info.projecao_pct || 0) >= 100;
            perfProjBadge.textContent = `Fecha em ${fmtPct(info.projecao_pct)}`;
            perfProjBadge.className = `perf-status-pill ${atingProj ? 'dentro' : 'fora'}`;
        }

        // 2.5. Atualizar Maior Dia de Venda e Top Produto
        const rec = info.recorde_dia || {};
        const recDiaEl = document.getElementById(`perf-record-dia-${s}`);
        const recFatEl = document.getElementById(`perf-record-fat-${s}`);
        const recProdEl = document.getElementById(`perf-record-prod-${s}`);
        const recQtdEl = document.getElementById(`perf-record-qtd-${s}`);

        if (recDiaEl) recDiaEl.textContent = rec.data_formatada || '—';
        if (recFatEl) recFatEl.textContent = rec.faturamento > 0 ? `(R$ ${fmtMoedaZero(rec.faturamento)})` : '';
        if (recProdEl) {
            recProdEl.textContent = rec.top_produto || '—';
            // recProdEl.title removido
        }
        if (recQtdEl) {
            recQtdEl.textContent = rec.top_produto_qtd > 0 ? `(${rec.top_produto_qtd} un)` : '';
        }

        // Atualizar Valores do Rodapé do Card:
        const footAnt = document.getElementById(c.footAnt);
        if (footAnt) footAnt.textContent = `Fat. Acum Mês ant.: R$ ${fmtMoedaZero(info.total_fat_ant_periodo)}`;

        const footFat = document.getElementById(c.footFat);
        if (footFat) footFat.textContent = `Fat: R$ ${fmtMoedaZero(info.total_fat_periodo)}`;

        const footMeta = document.getElementById(c.footMeta);
        if (footMeta) footMeta.textContent = `Meta: R$ ${fmtMoedaZero(info.total_meta_periodo)}`;

        // Renderizar ou atualizar gráfico Chart.js
        const canvas = document.getElementById(c.canvasId);
        if (!canvas) return;

        if (chartInstances[c.canvasId]) {
            chartInstances[c.canvasId].destroy();
        }

        const totalPontos = info.labels ? info.labels.length : 0;
        // Marcadores executivos refinados (estilo anel com núcleo de alto contraste e borda na cor da métrica)
        const pRadius = totalPontos > 25 ? 2.5 : 3.5;
        const pRadiusFat = totalPontos > 25 ? 3 : 4.5;

        // Destaque do Maior Dia de Venda no Gráfico
        const diaRecIdx = (rec && rec.dia > 0) ? (rec.dia - 1) : -1;
        const fatPointRadii = [];
        const fatPointBg = [];
        const fatPointBorder = [];
        const fatPointBorderW = [];

        for (let idxPt = 0; idxPt < totalPontos; idxPt++) {
            if (idxPt === diaRecIdx && rec.faturamento > 0) {
                fatPointRadii.push(pRadiusFat + 3.5);
                fatPointBg.push('#FFB300');
                fatPointBorder.push('#FFFFFF');
                fatPointBorderW.push(2.5);
            } else {
                fatPointRadii.push(pRadiusFat);
                fatPointBg.push('#FFFFFF');
                fatPointBorder.push('#FF5252');
                fatPointBorderW.push(2.2);
            }
        }

        const ctx = canvas.getContext('2d');
        chartInstances[c.canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: info.labels,
                datasets: [
                    {
                        label: 'Meta Acumulada',
                        data: info.acumulado_meta,
                        borderColor: '#00E676',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointStyle: 'circle',
                        pointBackgroundColor: '#FFFFFF',
                        pointBorderColor: '#00E676',
                        pointBorderWidth: 2,
                        pointRadius: pRadius,
                        pointHoverRadius: 7,
                        pointHoverBackgroundColor: '#00E676',
                        pointHoverBorderColor: '#FFFFFF',
                        pointHoverBorderWidth: 2,
                        tension: 0.1
                    },
                    {
                        label: 'Fat. Acum Mês ant.',
                        data: info.acumulado_fat_ant || [],
                        borderColor: '#2979FF',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointStyle: 'circle',
                        pointBackgroundColor: '#0F1117',
                        pointBorderColor: '#2979FF',
                        pointBorderWidth: 2,
                        pointRadius: pRadius,
                        pointHoverRadius: 7,
                        pointHoverBackgroundColor: '#2979FF',
                        pointHoverBorderColor: '#FFFFFF',
                        pointHoverBorderWidth: 2,
                        borderDash: [4, 4],
                        tension: 0.1
                    },
                    {
                        label: 'Fat. Acumulado',
                        data: info.acumulado_fat,
                        borderColor: '#FF5252',
                        backgroundColor: 'rgba(255, 82, 82, 0.08)',
                        borderWidth: 2.5,
                        pointStyle: 'circle',
                        pointBackgroundColor: fatPointBg,
                        pointBorderColor: fatPointBorder,
                        pointBorderWidth: fatPointBorderW,
                        pointRadius: fatPointRadii,
                        pointHoverRadius: 9,
                        pointHoverBackgroundColor: '#FFB300',
                        pointHoverBorderColor: '#FFFFFF',
                        pointHoverBorderWidth: 2.5,
                        fill: true,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: false
                    }
                },
                layout: {
                    padding: {
                        left: 4,
                        right: 12,
                        top: 10,
                        bottom: 6
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: (context) => {
                                if (context.index !== undefined && (context.index + 1) % 5 === 0) {
                                    return 'rgba(255, 255, 255, 0.08)';
                                }
                                return 'rgba(255, 255, 255, 0.025)';
                            },
                            drawTicks: false
                        },
                        ticks: {
                            autoSkip: false,
                            maxRotation: 0,
                            minRotation: 0,
                            color: '#94A3B8',
                            font: {
                                family: 'Montserrat',
                                size: totalPontos > 20 ? 7.5 : 9,
                                weight: '600'
                            },
                            padding: 6,
                            callback: function(val, index, ticks) {
                                const lbl = this.getLabelForValue(val);
                                return lbl ? String(lbl).replace(/^D/i, '') : String(val);
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.04)',
                            drawTicks: false
                        },
                        ticks: {
                            maxTicksLimit: 5,
                            color: '#94A3B8',
                            font: { family: 'Montserrat', size: 9.5, weight: '600' },
                            padding: 8,
                            callback: (v) => fmtEixoMoeda(v)
                        }
                    }
                }
            }
        });
    });

    // Se o modal estiver aberto, atualiza também
    if (currentModalCanal && document.getElementById('modal-canal-zoom') && !document.getElementById('modal-canal-zoom').classList.contains('hidden')) {
        renderizarModalCanal(currentModalCanal, currentModalModo);
    }
}

// Controle do Layout do Grid (3 Colunas Compacto vs 2 Colunas Expandido)
function setupGridToggle() {
    const btn3 = document.getElementById('btn-toggle-grid-3');
    const btn2 = document.getElementById('btn-toggle-grid-2');
    const grid = document.getElementById('channels-charts-grid');
    if (!btn3 || !btn2 || !grid) return;

    btn3.addEventListener('click', () => {
        btn3.classList.add('active');
        btn2.classList.remove('active');
        grid.classList.remove('grid-2col');
        setTimeout(() => {
            Object.values(chartInstances).forEach(ch => {
                if (ch && typeof ch.resize === 'function') ch.resize();
            });
        }, 150);
    });

    btn2.addEventListener('click', () => {
        btn2.classList.add('active');
        btn3.classList.remove('active');
        grid.classList.add('grid-2col');
        setTimeout(() => {
            Object.values(chartInstances).forEach(ch => {
                if (ch && typeof ch.resize === 'function') ch.resize();
            });
        }, 150);
    });
}

// Alterna visibilidade da linha selecionada na legenda inferior do canal
function toggleCanalDataset(canvasId, datasetIdx) {
    const chart = chartInstances[canvasId];
    if (!chart) return;
    const isVisible = chart.isDatasetVisible(datasetIdx);
    chart.setDatasetVisibility(datasetIdx, !isVisible);
    chart.update();

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const card = canvas.closest('.canal-chart-card');
    if (card) {
        const targetClass = datasetIdx === 0 ? 'legend-meta' : (datasetIdx === 2 ? 'legend-fat' : 'legend-ant');
        const item = card.querySelector(`.${targetClass}`);
        if (item) {
            if (isVisible) {
                item.classList.add('legend-dimmed');
            } else {
                item.classList.remove('legend-dimmed');
            }
        }
    }
}

// Funções do Modal de Zoom / Detalhe do Canal
function abrirModalCanal(canalKey) {
    if (!currentGraficosData || !currentGraficosData[canalKey]) return;
    currentModalCanal = canalKey;
    const modal = document.getElementById('modal-canal-zoom');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderizarModalCanal(canalKey, currentModalModo);
    if (window.lucide) lucide.createIcons();
}

function fecharModalCanal() {
    const modal = document.getElementById('modal-canal-zoom');
    if (modal) modal.classList.add('hidden');
    if (chartModalInstance) {
        chartModalInstance.destroy();
        chartModalInstance = null;
    }
    currentModalCanal = null;
}

function trocarModoModal(modo) {
    currentModalModo = modo;
    document.querySelectorAll('.btn-modal-tab').forEach(b => b.classList.remove('active'));
    const btnAtivo = document.getElementById(modo === 'acumulado' ? 'tab-modal-acumulado' : 'tab-modal-diario');
    if (btnAtivo) btnAtivo.classList.add('active');
    if (currentModalCanal) {
        renderizarModalCanal(currentModalCanal, modo);
    }
}

function renderizarModalCanal(canalKey, modo) {
    const info = currentGraficosData ? currentGraficosData[canalKey] : null;
    if (!info) return;

    const titleEl = document.getElementById('modal-canal-title');
    const badgeEl = document.getElementById('modal-canal-badge');
    const subtitleEl = document.getElementById('modal-canal-subtitle');
    if (titleEl) titleEl.textContent = canalKey === 'GERAL' ? 'TOTAL E-COMMERCE CONSOLIDADO' : canalKey;
    if (badgeEl) {
        badgeEl.textContent = `${fmtPct(info.atingimento_pct)}`;
        badgeEl.className = 'status-badge ' + (info.atingimento_pct >= 100 ? 'superou' : (info.atingimento_pct >= 75 ? 'atencao' : 'critico'));
    }
    if (subtitleEl) {
        subtitleEl.textContent = `Acompanhamento diário com visualização expandida de todos os dias do período`;
    }

    const kpisContainer = document.getElementById('modal-canal-kpis');
    if (kpisContainer) {
        const gap = info.total_fat_periodo - info.total_meta_periodo;
        const sinal = gap >= 0 ? '+' : '';
        const dentro = info.atingimento_pct >= 100;
        const diffPct = (info.atingimento_pct - 100).toFixed(1);
        const diffSign = diffPct > 0 ? '+' : '';
        kpisContainer.innerHTML = `
            <div class="modal-kpi-item">
                <span class="modal-kpi-lbl">Dias Trabalhados</span>
                <span class="modal-kpi-val ${dentro ? 'green-text' : 'red-text'}">${fmtPct(info.atingimento_pct)} (${dentro ? 'Dentro' : 'Fora'} ${diffSign}${diffPct}%)</span>
            </div>
            <div class="modal-kpi-item">
                <span class="modal-kpi-lbl">Venda/dia vs Meta/dia</span>
                <span class="modal-kpi-val"><strong class="red-text">R$ ${fmtMoedaZero(info.venda_dia)}</strong> / <strong class="green-text">R$ ${fmtMoedaZero(info.meta_dia)}</strong></span>
            </div>
            <div class="modal-kpi-item">
                <span class="modal-kpi-lbl">Projeção Fechamento</span>
                <span class="modal-kpi-val gold-text">R$ ${fmtMoedaZero(info.projecao_mes)} (${fmtPct(info.projecao_pct)} da Meta)</span>
            </div>
            <div class="modal-kpi-item">
                <span class="modal-kpi-lbl">Fat. Período</span>
                <span class="modal-kpi-val red-text">R$ ${fmtMoeda(info.total_fat_periodo)}</span>
            </div>
            <div class="modal-kpi-item">
                <span class="modal-kpi-lbl">Meta Período</span>
                <span class="modal-kpi-val green-text">R$ ${fmtMoeda(info.total_meta_periodo)}</span>
            </div>
            <div class="modal-kpi-item">
                <span class="modal-kpi-lbl">Meta Total Mês</span>
                <span class="modal-kpi-val gold-text">R$ ${fmtMoeda(info.meta_mes)}</span>
            </div>
            <div class="modal-kpi-item">
                <span class="modal-kpi-lbl">Evolução vs Meta Acum.</span>
                <span class="modal-kpi-val ${dentro ? 'green-text' : 'red-text'}">${diffSign}${diffPct}% (${sinal}R$ ${fmtMoedaZero(gap)})</span>
            </div>
            <div class="modal-kpi-item modal-record-box">
                <span class="modal-kpi-lbl">🏆 Recorde Diário</span>
                <span class="modal-kpi-val gold-text">Dia ${info.recorde_dia ? info.recorde_dia.data_formatada : '—'} (R$ ${fmtMoedaZero(info.recorde_dia ? info.recorde_dia.faturamento : 0)})</span>
            </div>
            <div class="modal-kpi-item modal-record-box">
                <span class="modal-kpi-lbl">🔥 Top Produto</span>
                <span class="modal-kpi-val" style="color: #FFD54F;" >
                    ${info.recorde_dia ? info.recorde_dia.top_produto : '—'} <span style="font-size:0.75rem; color:#A0A0AA;">(${info.recorde_dia ? info.recorde_dia.top_produto_qtd : 0} un)</span>
                </span>
            </div>
        `;
    }

    const canvas = document.getElementById('chart-modal-canvas');
    if (!canvas) return;

    if (chartModalInstance) {
        chartModalInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    const totalPontos = info.labels ? info.labels.length : 0;

    if (modo === 'acumulado') {
        chartModalInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: info.labels,
                datasets: [
                    {
                        label: 'Meta Acumulada',
                        data: info.acumulado_meta,
                        borderColor: '#00E676',
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        pointStyle: 'circle',
                        pointBackgroundColor: '#FFFFFF',
                        pointBorderColor: '#00E676',
                        pointBorderWidth: 2,
                        pointRadius: totalPontos > 20 ? 2.5 : 4,
                        pointHoverRadius: 7.5,
                        tension: 0.1
                    },
                    {
                        label: 'Fat. Acum Mês ant.',
                        data: info.acumulado_fat_ant || [],
                        borderColor: '#2979FF',
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        pointStyle: 'circle',
                        pointBackgroundColor: '#0F1117',
                        pointBorderColor: '#2979FF',
                        pointBorderWidth: 2,
                        pointRadius: totalPontos > 20 ? 2.5 : 4,
                        pointHoverRadius: 7.5,
                        borderDash: [5, 5],
                        tension: 0.1
                    },
                    {
                        label: 'Fat. Acumulado',
                        data: info.acumulado_fat,
                        borderColor: '#FF5252',
                        backgroundColor: 'rgba(255, 82, 82, 0.12)',
                        borderWidth: 3,
                        pointStyle: 'circle',
                        pointBackgroundColor: '#FFFFFF',
                        pointBorderColor: '#FF5252',
                        pointBorderWidth: 2.5,
                        pointRadius: totalPontos > 20 ? 3.5 : 5,
                        pointHoverRadius: 8.5,
                        fill: true,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#C0C0D0',
                            font: { family: 'Montserrat', size: 11, weight: '600' },
                            usePointStyle: true,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        enabled: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: (context) => (context.index !== undefined && (context.index + 1) % 5 === 0) ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                            drawTicks: false
                        },
                        ticks: {
                            autoSkip: false,
                            maxRotation: 0,
                            minRotation: 0,
                            color: '#94A3B8',
                            padding: 8,
                            font: { family: 'Montserrat', size: 10, weight: '600' },
                            callback: function(val, index, ticks) {
                                const lbl = this.getLabelForValue(val);
                                return lbl ? String(lbl).replace(/^D/i, '') : String(val);
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)', drawTicks: false },
                        ticks: {
                            maxTicksLimit: 6,
                            color: '#94A3B8',
                            font: { family: 'Montserrat', size: 10, weight: '600' },
                            padding: 10,
                            callback: (v) => fmtEixoMoeda(v)
                        }
                    }
                }
            }
        });
    } else {
        // Modo Faturamento Diário (Barras por dia com linha da Meta Diária)
        const faturamentosDiarios = [];
        for (let i = 0; i < info.acumulado_fat.length; i++) {
            const ant = i === 0 ? 0 : info.acumulado_fat[i - 1];
            faturamentosDiarios.push(Math.round((info.acumulado_fat[i] - ant) * 100) / 100);
        }

        const metaDiariaConstante = info.acumulado_meta.length > 0
            ? Math.round((info.acumulado_meta[0]) * 100) / 100
            : 0;
        const metasDiarias = info.labels.map(() => metaDiariaConstante);

        chartModalInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: info.labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Meta Diária',
                        data: metasDiarias,
                        borderColor: '#00E676',
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        borderDash: [4, 4]
                    },
                    {
                        type: 'bar',
                        label: 'Fat. do Dia',
                        data: faturamentosDiarios,
                        backgroundColor: faturamentosDiarios.map(v => v >= metaDiariaConstante ? '#00E676' : '#FF5252'),
                        borderRadius: 4,
                        barPercentage: 0.65
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#C0C0D0',
                            font: { family: 'Montserrat', size: 11, weight: '600' }
                        }
                    },
                    tooltip: {
                        enabled: false
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            autoSkip: false,
                            color: '#A0A0B0',
                            font: { family: 'Montserrat', size: 10, weight: '600' },
                            callback: function(val, index, ticks) {
                                const lbl = this.getLabelForValue(val);
                                return lbl ? String(lbl).replace(/^D/i, '') : String(val);
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)', drawTicks: false },
                        ticks: {
                            maxTicksLimit: 6,
                            color: '#94A3B8',
                            font: { family: 'Montserrat', size: 10, weight: '600' },
                            padding: 10,
                            callback: (v) => fmtEixoMoeda(v)
                        }
                    }
                }
            }
        });
    }
}

// 3. Atualizar Tabela Detalhada de Canais com Ordenação Interativa
function atualizarTabelaCanais(canais) {
    if (canais && Array.isArray(canais)) {
        currentCanaisData = [...canais];
    }
    renderizarTabelaCanais();
}

function renderizarTabelaCanais() {
    if (!currentCanaisData || currentCanaisData.length === 0) return;

    const { col, dir } = currentCanaisSort;

    // Filtra para não exibir PARLUX na tabela geral (conforme diretriz da Diretoria)
    const dadosBase = currentCanaisData.filter(c => c.canal.toUpperCase() !== 'PARLUX');

    // Ordenação dos dados
    const listaOrdenada = [...dadosBase].sort((a, b) => {
        let valA = a[col];
        let valB = b[col];

        if (typeof valA === 'string') {
            const comp = (valA || '').localeCompare(valB || '', 'pt-BR', { sensitivity: 'base' });
            return dir === 'asc' ? comp : -comp;
        }

        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
        return dir === 'asc' ? valA - valB : valB - valA;
    });

    // Atualiza classes visuais nos cabeçalhos da tabela
    document.querySelectorAll('.channel-table:not(.cupons-table):not(.conversao-table) th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.getAttribute('data-col') === col) {
            th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    const tbody = document.getElementById('canais-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let totVendaBruta = 0;
    let totDevolucao = 0;
    let totFatLiquido = 0;
    let totMetaPeriodo = 0;
    let totMetaMes = 0;
    let totProjecao = 0;
    let totItens = 0;

    listaOrdenada.forEach(c => {
        totVendaBruta += (Number(c.venda_bruta) || 0);
        totDevolucao += (Number(c.devolucao) || 0);
        totFatLiquido += (Number(c.faturamento_liquido) || 0);
        totMetaPeriodo += (Number(c.meta_periodo) || 0);
        totMetaMes += (Number(c.meta_mes) || 0);
        totProjecao += (Number(c.projecao_mes) || 0);
        totItens += (Number(c.itens) || 0);

        const barWidth = Math.min(100, Math.max(0, c.atingimento_periodo_pct));
        const barClass = c.status === 'superou' ? 'fill-superou' : (c.status === 'atencao' ? 'fill-atencao' : 'fill-critico');

        // Diferença de Share vs Mês Anterior (MoM)
        const diffMom = c.diff_share_mom !== undefined ? Number(c.diff_share_mom) : ((Number(c.share_pct) || 0) - (Number(c.share_ant_pct) || 0));
        const diffColorMom = diffMom > 0 ? '#00E676' : (diffMom < 0 ? '#EF5350' : '#94A3B8');
        const diffIconMom = diffMom > 0 ? '▲ +' : (diffMom < 0 ? '▼ ' : '');
        const diffTextMom = Math.abs(diffMom) < 0.001 ? '0,00 p.p.' : `${diffIconMom}${diffMom.toFixed(2).replace('.', ',')} p.p.`;

        // Diferença de Share vs Mesmo Período Ano Anterior (YoY)
        const diffYoY = c.diff_share_ano_ant !== undefined ? Number(c.diff_share_ano_ant) : ((Number(c.share_pct) || 0) - (Number(c.share_ano_ant_pct) || 0));
        const diffColorYoY = diffYoY > 0 ? '#00E676' : (diffYoY < 0 ? '#EF5350' : '#94A3B8');
        const diffIconYoY = diffYoY > 0 ? '▲ +' : (diffYoY < 0 ? '▼ ' : '');
        const diffTextYoY = Math.abs(diffYoY) < 0.001 ? '0,00 p.p.' : `${diffIconYoY}${diffYoY.toFixed(2).replace('.', ',')} p.p.`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="channel-name">${c.canal}</td>
            <td class="text-right" style="color: #EF5350;">R$ ${fmtMoeda(c.devolucao)} (${fmtPct(c.pct_devolucao)})</td>
            <td class="text-right">${fmtInt(c.itens)}</td>
            <td class="text-right">R$ ${fmtMoeda(c.ticket_medio)}</td>
            <td class="text-right" style="font-weight: 700; color: var(--mq-gold, #FFD700);">${fmtPct(c.share_pct)}</td>
            <td class="text-right" style="font-weight: 600; color: #94A3B8;">${fmtPct(c.share_ant_pct)}</td>
            <td class="text-right" style="font-weight: 700; color: ${diffColorMom};">${diffTextMom}</td>
            <td class="text-right" style="font-weight: 600; color: #CBD5E1;">${fmtPct(c.share_ano_ant_pct)}</td>
            <td class="text-right" style="font-weight: 700; color: ${diffColorYoY};">${diffTextYoY}</td>
        `;
        tbody.appendChild(tr);
    });

    // Renderiza linha de TOTAL no tfoot
    const tfoot = document.getElementById('canais-table-foot');
    if (tfoot) {
        const totPctDevolucao = totVendaBruta > 0 ? (totDevolucao / totVendaBruta * 100) : 0;
        const totAtingPeriodoPct = totMetaPeriodo > 0 ? (totFatLiquido / totMetaPeriodo * 100) : 0;
        const totTicketMedio = totItens > 0 ? (totFatLiquido / totItens) : 0;

        const barWidthTot = Math.min(100, Math.max(0, totAtingPeriodoPct));
        const barClassTot = totAtingPeriodoPct >= 100 ? 'fill-superou' : (totAtingPeriodoPct >= 75 ? 'fill-atencao' : 'fill-critico');

        tfoot.innerHTML = `
            <tr class="tfoot-total-row">
                <td class="total-title">TOTAL</td>
                <td class="text-right" style="color: #EF5350;">R$ ${fmtMoeda(totDevolucao)} (${fmtPct(totPctDevolucao)})</td>
                <td class="text-right" style="font-weight: 700;">${fmtInt(totItens)}</td>
                <td class="text-right" style="font-weight: 700;">R$ ${fmtMoeda(totTicketMedio)}</td>
                <td class="text-right" style="font-weight: 800; color: var(--mq-gold, #CB9727);">100,00%</td>
                <td class="text-right" style="font-weight: 800; color: #94A3B8;">100,00%</td>
                <td class="text-right" style="font-weight: 800; color: #94A3B8;">0,00 p.p.</td>
                <td class="text-right" style="font-weight: 800; color: #CBD5E1;">100,00%</td>
                <td class="text-right" style="font-weight: 800; color: #94A3B8;">0,00 p.p.</td>
            </tr>
        `;
    }
}

// 4. Renderizar os 4 Gráficos do Histórico Mensal 2026 (Sem comparação com mês anterior)
function renderizarHistoricoMensal(hist) {
    if (!hist || hist.length === 0) return;

    const labels = hist.map(h => h.mes_abrev);
    const last = hist[hist.length - 1]; // Mês corrente selecionado

    // 1. Quantidade de Itens Vendidos (Linha 1, Coluna 1)
    const itensDados26 = hist.map(h => h.itens);
    const itensDados25 = hist.map(h => h.itens_2025 !== undefined ? h.itens_2025 : null);
    const totalItens26 = itensDados26.reduce((a, b) => a + (Number(b) || 0), 0);
    const totalItens25 = itensDados25.reduce((a, b) => a + (Number(b) || 0), 0);
    const varItensYoY = totalItens25 > 0 ? ((totalItens26 - totalItens25) / totalItens25 * 100).toFixed(1) : '0.0';

    criarGraficoLinhaArea(
        'chart-hist-itens', labels, itensDados26, itensDados25,
        '#00E676', 'rgba(0, 230, 118, 0.12)', false, 'Itens Vendidos', 'itens', hist
    );
    const footItensTotal = document.getElementById('foot-hist-itens-total');
    const footItensAtual = document.getElementById('foot-hist-itens-atual');
    if (footItensTotal) footItensTotal.innerHTML = `Acum. 26: <strong>${fmtInt(totalItens26)}</strong> <span style="color:#94A3B8;font-weight:500;">(25: ${fmtInt(totalItens25)} | ${varItensYoY >= 0 ? '+' : ''}${varItensYoY}%)</span>`;
    if (footItensAtual) footItensAtual.innerHTML = `Mês Atual: <strong>${fmtInt(last.itens)}</strong> <span style="color:${(last.itens_diff_2025_pct || 0) >= 0 ? '#00E676' : '#FF5252'};font-weight:600;">(YoY ${(last.itens_diff_2025_pct || 0) >= 0 ? '+' : ''}${(last.itens_diff_2025_pct || 0).toFixed(1)}%)</span>`;

    // 2. Faturamento Líquido (R$) (Linha 1, Coluna 2)
    const fatDados26 = hist.map(h => h.faturamento);
    const fatDados25 = hist.map(h => h.faturamento_2025 !== undefined ? h.faturamento_2025 : null);
    const totalFat26 = fatDados26.reduce((a, b) => a + (Number(b) || 0), 0);
    const totalFat25 = fatDados25.reduce((a, b) => a + (Number(b) || 0), 0);
    const varFatYoY = totalFat25 > 0 ? ((totalFat26 - totalFat25) / totalFat25 * 100).toFixed(1) : '0.0';

    criarGraficoLinhaArea(
        'chart-hist-fat', labels, fatDados26, fatDados25,
        '#CB9727', 'rgba(203, 151, 39, 0.12)', true, 'Faturamento', 'fat', hist
    );
    const footFatTotal = document.getElementById('foot-hist-fat-total');
    const footFatAtual = document.getElementById('foot-hist-fat-atual');
    if (footFatTotal) footFatTotal.innerHTML = `Acum. 26: <strong>R$ ${fmtMoedaZero(totalFat26)}</strong> <span style="color:#94A3B8;font-weight:500;">(25: R$ ${fmtMoedaZero(totalFat25)} | ${varFatYoY >= 0 ? '+' : ''}${varFatYoY}%)</span>`;
    if (footFatAtual) footFatAtual.innerHTML = `Mês Atual: <strong>R$ ${fmtMoedaZero(last.faturamento)}</strong> <span style="color:${(last.faturamento_diff_2025_pct || 0) >= 0 ? '#00E676' : '#FF5252'};font-weight:600;">(YoY ${(last.faturamento_diff_2025_pct || 0) >= 0 ? '+' : ''}${(last.faturamento_diff_2025_pct || 0).toFixed(1)}%)</span>`;

    // 3. Ticket Médio Líquido (R$) (Linha 2, Coluna 1)
    const ticketDados26 = hist.map(h => h.ticket_medio);
    const ticketDados25 = hist.map(h => h.ticket_medio_2025 !== undefined ? h.ticket_medio_2025 : null);
    const mediaTicket26 = totalItens26 > 0 ? (totalFat26 / totalItens26) : 0;
    const mediaTicket25 = totalItens25 > 0 ? (totalFat25 / totalItens25) : 0;
    const varTicketYoY = mediaTicket25 > 0 ? ((mediaTicket26 - mediaTicket25) / mediaTicket25 * 100).toFixed(1) : '0.0';

    criarGraficoLinhaArea(
        'chart-hist-ticket', labels, ticketDados26, ticketDados25,
        '#64B5F6', 'rgba(100, 181, 246, 0.12)', true, 'Ticket Médio', 'ticket', hist
    );
    const footTicketTotal = document.getElementById('foot-hist-ticket-total');
    const footTicketAtual = document.getElementById('foot-hist-ticket-atual');
    if (footTicketTotal) footTicketTotal.innerHTML = `Médio 26: <strong>R$ ${fmtMoeda(mediaTicket26)}</strong> <span style="color:#94A3B8;font-weight:500;">(25: R$ ${fmtMoeda(mediaTicket25)} | ${varTicketYoY >= 0 ? '+' : ''}${varTicketYoY}%)</span>`;
    if (footTicketAtual) footTicketAtual.innerHTML = `Mês Atual: <strong>R$ ${fmtMoeda(last.ticket_medio)}</strong> <span style="color:${(last.ticket_medio_diff_2025_pct || 0) >= 0 ? '#00E676' : '#FF5252'};font-weight:600;">(YoY ${(last.ticket_medio_diff_2025_pct || 0) >= 0 ? '+' : ''}${(last.ticket_medio_diff_2025_pct || 0).toFixed(1)}%)</span>`;

    // 4. Devoluções Mensais (R$) (Linha 2, Coluna 2)
    const devDados26 = hist.map(h => h.devolucoes);
    const devDados25 = hist.map(h => h.devolucoes_2025 !== undefined ? h.devolucoes_2025 : null);
    const totalDev26 = devDados26.reduce((a, b) => a + (Number(b) || 0), 0);
    const totalDev25 = devDados25.reduce((a, b) => a + (Number(b) || 0), 0);
    const varDevYoY = totalDev25 > 0 ? ((totalDev26 - totalDev25) / totalDev25 * 100).toFixed(1) : '0.0';

    criarGraficoLinhaArea(
        'chart-hist-dev', labels, devDados26, devDados25,
        '#FF5252', 'rgba(255, 82, 82, 0.12)', true, 'Devoluções', 'dev', hist
    );
    const footDevTotal = document.getElementById('foot-hist-dev-total');
    const footDevAtual = document.getElementById('foot-hist-dev-atual');
    if (footDevTotal) footDevTotal.innerHTML = `Acum. 26: <strong>R$ ${fmtMoedaZero(totalDev26)}</strong> <span style="color:#94A3B8;font-weight:500;">(25: R$ ${fmtMoedaZero(totalDev25)} | ${varDevYoY >= 0 ? '+' : ''}${varDevYoY}%)</span>`;
    if (footDevAtual) footDevAtual.innerHTML = `Mês Atual: <strong>R$ ${fmtMoedaZero(last.devolucoes)}</strong> <span style="color:${(last.devolucoes_diff_2025_pct || 0) <= 0 ? '#00E676' : '#FF5252'};font-weight:600;">(YoY ${(last.devolucoes_diff_2025_pct || 0) >= 0 ? '+' : ''}${(last.devolucoes_diff_2025_pct || 0).toFixed(1)}%)</span>`;
}

function criarGraficoLinhaArea(canvasId, labels, dataVals2026, dataVals2025, color, bgColor, isMoeda, metricName, metricType, rawHist) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    // Configuração de escala específica por métrica
    let yScaleConfig = {
        grid: { color: 'rgba(255, 255, 255, 0.04)', drawTicks: false },
        ticks: {
            maxTicksLimit: 5,
            color: '#94A3B8',
            font: { family: 'Montserrat', size: 9.5, weight: '600' },
            padding: 8,
            callback: (v) => isMoeda ? fmtEixoMoeda(v) : (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)
        }
    };

    if (metricType === 'ticket') {
        // Escala dinâmica para Ticket Médio considerando ambos os anos 2026 e 2025
        const allVals = [...(dataVals2026 || []), ...(dataVals2025 || [])].filter(v => v !== null && v !== undefined && !isNaN(v) && v > 0);
        const minVal = allVals.length ? Math.min(...allVals) : 300;
        const maxVal = allVals.length ? Math.max(...allVals) : 400;
        
        yScaleConfig.beginAtZero = false;
        yScaleConfig.min = Math.max(0, Math.floor((minVal - 18) / 10) * 10);
        yScaleConfig.max = Math.ceil((maxVal + 22) / 10) * 10;
        yScaleConfig.ticks.stepSize = 15;
        yScaleConfig.ticks.callback = (v) => 'R$ ' + Math.round(v);
    } else {
        yScaleConfig.beginAtZero = true;
        yScaleConfig.grace = '22%';
    }

    // Plugin inline para desenhar valores numéricos sobre cada ponto do dataset 2026 (Ano Atual)
    // Mantém o design limpo e sem sobreposição de badges
    const pointLabelsPlugin = {
        id: 'pointLabels_' + canvasId,
        afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            const chartArea = chart.chartArea;
            if (!chartArea) return;

            // Renderiza apenas para o dataset 0 (2026)
            const dataset = chart.data.datasets[0];
            const meta = chart.getDatasetMeta(0);
            if (!meta || meta.hidden) return;

            meta.data.forEach((element, idx) => {
                const val = dataset.data[idx];
                if (val === null || val === undefined || isNaN(val)) return;

                let txt = (metricType === 'ticket' || canvasId === 'chart-hist-ticket') ? fmtMoeda(Number(val)) : fmtInt(Math.round(val));

                ctx.save();
                ctx.font = '700 9.5px Montserrat, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const textMetrics = ctx.measureText(txt);
                const textWidth = textMetrics.width;
                const pillPadX = 5;
                const pillWidth = textWidth + (pillPadX * 2);
                const pillHeight = 17;

                // Posiciona o pill acima do ponto com respiro elegante
                let pillY = element.y - 19 - (pillHeight / 2);
                let textY = element.y - 19;
                if (element.y < 38) {
                    pillY = element.y + 19 - (pillHeight / 2);
                    textY = element.y + 19;
                }

                // Clamping horizontal estrito
                const minX = chartArea.left + 2;
                const maxX = chartArea.right - pillWidth - 2;
                let pillX = element.x - (pillWidth / 2);
                if (pillX < minX) pillX = minX;
                if (pillX > maxX) pillX = maxX;
                const centerX = pillX + (pillWidth / 2);

                // Badge de fundo dark com contorno fino na cor da linha 2026
                ctx.fillStyle = 'rgba(15, 17, 23, 0.92)';
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 4);
                } else {
                    ctx.rect(pillX, pillY, pillWidth, pillHeight);
                }
                ctx.fill();
                ctx.stroke();

                // Texto em branco puro com nitidez máxima
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(txt, centerX, textY);
                ctx.restore();
            });
        }
    };

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '2026 (Atual)',
                    data: dataVals2026,
                    borderColor: color,
                    backgroundColor: bgColor,
                    borderWidth: 2.8,
                    pointStyle: 'circle',
                    pointBackgroundColor: '#FFFFFF',
                    pointBorderColor: color,
                    pointBorderWidth: 2.5,
                    pointRadius: 5.5,
                    pointHoverRadius: 8.5,
                    pointHoverBackgroundColor: color,
                    pointHoverBorderColor: '#FFFFFF',
                    pointHoverBorderWidth: 2.5,
                    fill: true,
                    tension: 0.25,
                    order: 1
                },
                {
                    label: '2025 (Anterior)',
                    data: dataVals2025,
                    borderColor: '#94A3B8',
                    backgroundColor: 'transparent',
                    borderWidth: 2.0,
                    borderDash: [5, 4],
                    pointStyle: 'circle',
                    pointBackgroundColor: '#0F1117',
                    pointBorderColor: '#94A3B8',
                    pointBorderWidth: 2.0,
                    pointRadius: 4.5,
                    pointHoverRadius: 7.5,
                    pointHoverBackgroundColor: '#94A3B8',
                    pointHoverBorderColor: '#FFFFFF',
                    pointHoverBorderWidth: 2.0,
                    fill: false,
                    tension: 0.25,
                    order: 2
                }
            ]
        },
        plugins: [pointLabelsPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1E1E24',
                    titleColor: '#CB9727',
                    bodyColor: '#FFFFFF',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 10,
                    boxPadding: 4,
                    usePointStyle: true,
                    callbacks: {
                        title: (items) => {
                            const idx = items[0].dataIndex;
                            const mesNome = rawHist && rawHist[idx] ? rawHist[idx].mes_nome : labels[idx].toUpperCase();
                            return `${mesNome} — Comparativo Anual`;
                        },
                        label: (ctx) => {
                            const val = ctx.raw || 0;
                            const is2026 = ctx.datasetIndex === 0;
                            const anoLbl = is2026 ? '2026' : '2025';
                            const formatted = isMoeda ? `R$ ${fmtMoeda(val)}` : `${fmtInt(val)} itens`;
                            return ` ${anoLbl}: ${formatted}`;
                        },
                        afterBody: (items) => {
                            const idx = items[0].dataIndex;
                            const v26 = dataVals2026[idx] || 0;
                            const v25 = (dataVals2025 && dataVals2025[idx]) || 0;
                            if (v25 > 0) {
                                const diff = ((v26 - v25) / v25 * 100).toFixed(1);
                                const sign = diff >= 0 ? '+' : '';
                                const icon = diff >= 0 ? '▲' : '▼';
                                const indicator = metricType === 'dev'
                                    ? (diff <= 0 ? ' (Melhoria)' : ' (Atenção)')
                                    : (diff >= 0 ? ' (Crescimento)' : ' (Queda)');
                                return [`───────────────────────────`, `${icon} Variação YoY: ${sign}${diff}%${indicator}`];
                            }
                            return [];
                        }
                    }
                }
            },
            layout: {
                padding: { left: 16, right: 28, top: 28, bottom: 8 }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#94A3B8',
                        font: { family: 'Montserrat', size: 10, weight: '700' },
                        padding: 6
                    }
                },
                y: yScaleConfig
            }
        }
    });
}

function getRankBadge(rank, diff) {
    if (rank === null || rank === undefined) return '<span class="text-muted" style="font-size: 10px;">-</span>';
    
    let posClass = 'rank-pos-other';
    if (rank === 1) posClass = 'rank-pos-1';
    else if (rank === 2) posClass = 'rank-pos-2';
    else if (rank === 3) posClass = 'rank-pos-3';

    let diffHtml = '';
    if (diff === null || diff === undefined) {
        diffHtml = '<span class="rank-diff new" title="Novo no ranking este mês">NOVO</span>';
    } else if (diff > 0) {
        diffHtml = `<span class="rank-diff up" title="Subiu ${diff} posição(ões) vs mês anterior">▲ +${diff}</span>`;
    } else if (diff < 0) {
        diffHtml = `<span class="rank-diff down" title="Caiu ${Math.abs(diff)} posição(ões) vs mês anterior">▼ ${diff}</span>`;
    } else {
        diffHtml = '<span class="rank-diff same" title="Manteve a posição">= 0</span>';
    }

    return `
        <div class="rank-cell-wrapper">
            <span class="rank-pos-badge ${posClass}">${rank}º</span>
            ${diffHtml}
        </div>
    `;
}

// 5. Renderizar a Matriz Executiva: Categoria & Produto (Sem Canal de Vendas)
function renderizarMatriz() {
    const tbody = document.getElementById('matrix-table-body');
    const tfoot = document.getElementById('matrix-table-foot');
    const thMesNome = document.getElementById('th-mes-nome');
    if (!tbody || !currentMatrizData) return;

    if (thMesNome && currentParams) {
        thMesNome.textContent = `${currentParams.mes_nome.toUpperCase()} (D1 ATÉ D${currentParams.dia_fim})`;
    }

    tbody.innerHTML = '';

    // Atualiza cabeçalhos da tabela com indicador visual de ordenação
    document.querySelectorAll('#matrix-sales-table th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.getAttribute('data-col') === currentRankingSort.col) {
            th.classList.add(currentRankingSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    if (currentViewMode === 'ranking') {
        const ranking = currentMatrizData.ranking_produtos;
        if (!ranking || ranking.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center kpi-subtext" style="padding: 24px;">Nenhum produto encontrado para o filtro selecionado</td></tr>';
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        // Ordenação dos produtos
        const { col, dir } = currentRankingSort;
        const listaOrdenada = [...ranking].sort((a, b) => {
            let valA = a[col];
            let valB = b[col];

            if (typeof valA === 'string') {
                const comp = (valA || '').localeCompare(valB || '', 'pt-BR', { sensitivity: 'base' });
                return dir === 'asc' ? comp : -comp;
            }

            valA = Number(valA) || 0;
            valB = Number(valB) || 0;
            return dir === 'asc' ? valA - valB : valB - valA;
        });

        listaOrdenada.forEach((p, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'matrix-row matrix-row-prod';
            tr.dataset.type = 'prod';
            tr.dataset.search = `${p.nome} ${p.sku} ${p.categoria}`.toLowerCase();

            const displayRank = (currentRankingSort.col === 'fat' && currentRankingSort.dir === 'desc') ? (idx + 1) : (p.rank || (idx + 1));
            const rankDiff = p.rank_diff;

            tr.innerHTML = `
                <td class="text-center" style="padding: 4px 3px;">
                    ${getRankBadge(displayRank, rankDiff)}
                </td>
                <td class="cell-tree" style="padding-left: 8px;">
                    <div class="prod-info-cell">
                        <span class="prod-name-title" title="${p.nome}">${p.nome}</span>
                    </div>
                </td>
                <td class="text-right" style="font-weight: 600; color: #FFFFFF;">${fmtInt(p.qtd)}</td>
                <td class="text-right" style="font-weight: 800; color: #FFFFFF;">R$ ${fmtMoedaZero(p.fat)}</td>
                <td class="text-right">
                    <div class="share-progress-wrapper" title="Participação em peças no canal (${p.canal || ''}) (% QTD)">
                        <span style="font-weight: 700; color: #E2E8F0;">${fmtPct(p.pct)}</span>
                        <div class="share-bar-mini">
                            <div class="share-bar-fill" style="width: ${Math.min(100, p.pct)}%; background: var(--mq-gold);"></div>
                        </div>
                    </div>
                </td>
                <td class="text-right" style="color: #CBD5E1;">R$ ${fmtMoeda(p.vlr_medio)}</td>
                <td class="text-center">${getEvolBadge(p.evolucao_pct)}</td>
            `;
            tbody.appendChild(tr);
        });

    } else if (currentViewMode === 'canal') {
        // Modo 'canal' (agrupado por Canal Oficial: MERCADO LIVRE, SHOPEE, VTEX, MAGALU)
        const canaisRaw = currentMatrizData.canais;
        if (!canaisRaw || canaisRaw.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center kpi-subtext" style="padding: 24px;">Nenhum canal encontrado</td></tr>';
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        const { col, dir } = currentRankingSort;
        const canais = [...canaisRaw].sort((a, b) => {
            let valA = a[col];
            let valB = b[col];
            if (col === 'nome') return dir === 'asc' ? (valA || '').localeCompare(valB || '', 'pt-BR') : -(valA || '').localeCompare(valB || '', 'pt-BR');
            return dir === 'asc' ? (Number(valA) || 0) - (Number(valB) || 0) : (Number(valB) || 0) - (Number(valA) || 0);
        });

        canais.forEach(cn => {
            const produtosCn = [...(cn.produtos || [])].sort((a, b) => {
                let valA = a[col];
                let valB = b[col];
                if (col === 'nome') return dir === 'asc' ? (valA || '').localeCompare(valB || '', 'pt-BR') : -(valA || '').localeCompare(valB || '', 'pt-BR');
                return dir === 'asc' ? (Number(valA) || 0) - (Number(valB) || 0) : (Number(valB) || 0) - (Number(valA) || 0);
            });
            const isCnCollapsed = collapsedNodes.has(cn.id);
            const iconCn = isCnCollapsed ? '+' : '−';

            // Linha Nível 1: Canal
            const trCn = document.createElement('tr');
            trCn.className = 'matrix-row matrix-row-n1';
            trCn.dataset.id = cn.id;
            trCn.dataset.type = 'canal';
            trCn.dataset.search = cn.nome.toLowerCase();

            trCn.innerHTML = `
                <td class="text-center" style="padding: 4px 3px;">
                    ${getRankBadge(cn.rank, null)}
                </td>
                <td class="cell-tree" style="padding-left: 8px;">
                    <span class="btn-toggle-tree" onclick="toggleNode('${cn.id}', event)">${iconCn}</span>
                    <strong style="color: #FFFFFF; font-size: 11px;">${cn.nome}</strong>
                </td>
                <td class="text-right" style="font-weight: 700;">${fmtInt(cn.qtd)}</td>
                <td class="text-right" style="font-weight: 800; color: var(--mq-gold);">R$ ${fmtMoedaZero(cn.fat)}</td>
                <td class="text-right" style="font-weight: 700;" title="Participação do canal no volume total de peças vendidas (% QTD)">${fmtPct(cn.pct)}</td>
                <td class="text-right">R$ ${fmtMoeda(cn.vlr_medio)}</td>
                <td class="text-center">${getEvolBadge(cn.evolucao_pct)}</td>
            `;
            tbody.appendChild(trCn);

            // Linha Nível 2: Produtos do Canal
            produtosCn.forEach(p => {
                const trP = document.createElement('tr');
                trP.className = 'matrix-row matrix-row-n2';
                trP.dataset.parentCat = cn.id;
                trP.dataset.type = 'prod';
                trP.dataset.search = `${cn.nome} ${p.nome} ${p.sku}`.toLowerCase();
                if (isCnCollapsed) trP.style.display = 'none';

                trP.innerHTML = `
                    <td class="text-center" style="padding: 4px 2px;">
                        ${getRankBadge(p.rank, null)}
                    </td>
                    <td class="cell-tree" style="padding-left: 18px;">
                        <span class="tree-leaf-bullet"></span>
                        <div class="prod-info-cell" style="display: inline-flex; vertical-align: middle;">
                            <span class="prod-name-title" title="${p.nome}">${p.nome}</span>
                        </div>
                    </td>
                    <td class="text-right">${fmtInt(p.qtd)}</td>
                    <td class="text-right" style="font-weight: 700;">R$ ${fmtMoedaZero(p.fat)}</td>
                    <td class="text-right" style="font-weight: 700; color: var(--mq-gold);" title="Participação no canal">${fmtPct(p.pct)}</td>
                    <td class="text-right">R$ ${fmtMoeda(p.vlr_medio)}</td>
                    <td class="text-center">${getEvolBadge(p.evolucao_pct)}</td>
                `;
                tbody.appendChild(trP);
            });
        });

    } else {
        // Modo 'categoria' (agrupado por Categoria: PRANCHA, SECADOR... sem canal)
        const categoriasRaw = currentMatrizData.categorias;
        if (!categoriasRaw || categoriasRaw.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center kpi-subtext" style="padding: 24px;">Nenhuma categoria encontrada para o filtro selecionado</td></tr>';
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        const { col, dir } = currentRankingSort;
        const categorias = [...categoriasRaw].sort((a, b) => {
            let valA = a[col];
            let valB = b[col];
            if (col === 'nome') return dir === 'asc' ? (valA || '').localeCompare(valB || '', 'pt-BR') : -(valA || '').localeCompare(valB || '', 'pt-BR');
            return dir === 'asc' ? (Number(valA) || 0) - (Number(valB) || 0) : (Number(valB) || 0) - (Number(valA) || 0);
        });

        categorias.forEach(cat => {
            const produtosCat = [...(cat.produtos || [])].sort((a, b) => {
                let valA = a[col];
                let valB = b[col];
                if (col === 'nome') return dir === 'asc' ? (valA || '').localeCompare(valB || '', 'pt-BR') : -(valA || '').localeCompare(valB || '', 'pt-BR');
                return dir === 'asc' ? (Number(valA) || 0) - (Number(valB) || 0) : (Number(valB) || 0) - (Number(valA) || 0);
            });
            const isCatCollapsed = collapsedNodes.has(cat.id);
            const iconCat = isCatCollapsed ? '+' : '−';

            // Linha Nível 1: Categoria
            const trCat = document.createElement('tr');
            trCat.className = 'matrix-row matrix-row-n1';
            trCat.dataset.id = cat.id;
            trCat.dataset.type = 'cat';
            trCat.dataset.search = cat.nome.toLowerCase();

            trCat.innerHTML = `
                <td class="text-center" style="padding: 4px 3px;">
                    ${getRankBadge(cat.rank, cat.rank_diff)}
                </td>
                <td class="cell-tree" style="padding-left: 8px;">
                    <span class="btn-toggle-tree" onclick="toggleNode('${cat.id}', event)">${iconCat}</span>
                    <strong style="color: #FFFFFF; font-size: 11px;">${cat.nome}</strong>
                </td>
                <td class="text-right" style="font-weight: 700;">${fmtInt(cat.qtd)}</td>
                <td class="text-right" style="font-weight: 800; color: var(--mq-gold);">R$ ${fmtMoedaZero(cat.fat)}</td>
                <td class="text-right" style="font-weight: 700;">${fmtPct(cat.pct)}</td>
                <td class="text-right">R$ ${fmtMoeda(cat.vlr_medio)}</td>
                <td class="text-center">${getEvolBadge(cat.evolucao_pct)}</td>
            `;
            tbody.appendChild(trCat);

            // Linha Nível 2: Produtos da Categoria
            produtosCat.forEach(p => {
                const trP = document.createElement('tr');
                trP.className = 'matrix-row matrix-row-n2';
                trP.dataset.parentCat = cat.id;
                trP.dataset.type = 'prod';
                trP.dataset.search = `${cat.nome} ${p.nome} ${p.sku}`.toLowerCase();
                if (isCatCollapsed) trP.style.display = 'none';

                trP.innerHTML = `
                    <td class="text-center" style="padding: 4px 2px;">
                        ${getRankBadge(p.rank, p.rank_diff)}
                    </td>
                    <td class="cell-tree" style="padding-left: 18px;">
                        <span class="tree-leaf-bullet"></span>
                        <div class="prod-info-cell" style="display: inline-flex; vertical-align: middle;">
                            <span class="prod-name-title" title="${p.nome}">${p.nome}</span>
                        </div>
                    </td>
                    <td class="text-right">${fmtInt(p.qtd)}</td>
                    <td class="text-right" style="font-weight: 700;">R$ ${fmtMoedaZero(p.fat)}</td>
                    <td class="text-right">${fmtPct(p.pct)}</td>
                    <td class="text-right">R$ ${fmtMoeda(p.vlr_medio)}</td>
                    <td class="text-center">${getEvolBadge(p.evolucao_pct)}</td>
                `;
                tbody.appendChild(trP);
            });
        });
    }

    // Total Geral no Rodapé da Matriz 1
    if (tfoot && currentMatrizData.totais) {
        const t = currentMatrizData.totais;
        tfoot.innerHTML = `
            <tr class="tfoot-total-row">
                <td class="text-center" style="color: var(--text-muted); font-size: 10px;">-</td>
                <td class="total-title" style="padding-left: 10px;">TOTAL CONSOLIDADO</td>
                <td class="text-right" style="font-weight: 800;">${fmtInt(t.qtd)}</td>
                <td class="text-right" style="color: var(--mq-gold); font-weight: 800;">R$ ${fmtMoedaZero(t.fat)}</td>
                <td class="text-right" style="font-weight: 800;">100,0%</td>
                <td class="text-right" style="color: var(--mq-gold); font-weight: 800;">R$ ${fmtMoeda(t.vlr_medio)}</td>
                <td class="text-center">${getEvolBadge(t.evolucao_pct)}</td>
            </tr>
        `;
    }
}

// Helper para badge de evolução com setas coloridas
function getEvolBadge(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return '<span class="evol-badge neutral">-</span>';
    if (pct < 0) {
        return `<span class="evol-badge down">▼ ${Math.abs(pct).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%</span>`;
    } else if (pct > 0) {
        return `<span class="evol-badge up">▲ ${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%</span>`;
    } else {
        return `<span class="evol-badge neutral">0,0%</span>`;
    }
}

// Toggle interativo de expansão/recolhimento
function toggleNode(nodeId, event) {
    if (event) event.stopPropagation();

    if (collapsedNodes.has(nodeId)) {
        collapsedNodes.delete(nodeId);
    } else {
        collapsedNodes.add(nodeId);
    }
    renderizarMatriz();
}

// Filtro de busca na matriz
function filtrarMatriz(termo) {
    const rows = document.querySelectorAll('#matrix-table-body tr');
    if (!termo) {
        rows.forEach(r => {
            if (currentViewMode === 'categoria' && r.dataset.type === 'prod') {
                const parentCatId = r.dataset.parentCat;
                r.style.display = collapsedNodes.has(parentCatId) ? 'none' : '';
            } else {
                r.style.display = '';
            }
        });
        return;
    }

    // Se estiver buscando, mostra as linhas que correspondem ao termo
    rows.forEach(r => {
        const matches = (r.dataset.search || r.textContent.toLowerCase()).includes(termo);
        r.style.display = matches ? '' : 'none';
    });
}

// 6. Renderizar Matriz 2: Vendas por Conta / Vendedor & Produto (Estilo Power BI)
function renderizarMatrizVendedores() {
    const tbody = document.getElementById('matrix-vend-body');
    const tfoot = document.getElementById('matrix-vend-foot');
    const thMesNome = document.getElementById('th-mes-nome-vend');
    if (!tbody || !currentMatrizVendData) return;

    if (thMesNome && currentParams) {
        thMesNome.textContent = `${currentParams.mes_nome.toUpperCase()} (D1 ATÉ D${currentParams.dia_fim})`;
    }

    // 1. Atualiza indicadores visuais de ordenação nos cabeçalhos da Matriz 2
    document.querySelectorAll('#matrix-vend-table th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.getAttribute('data-col') === currentVendSort.col) {
            th.classList.add(currentVendSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    const lista = currentMatrizVendData.vendedores;
    tbody.innerHTML = '';

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center kpi-subtext" style="padding: 24px;">Nenhum dado de vendedor encontrado</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    // 2. Ordenação dos Vendedores / Contas
    const { col, dir } = currentVendSort;
    const vendedoresOrdenados = [...lista].sort((a, b) => {
        let valA = a[col];
        let valB = b[col];

        if (col === 'nome') {
            const comp = (valA || '').localeCompare(valB || '', 'pt-BR', { sensitivity: 'base' });
            return dir === 'asc' ? comp : -comp;
        }

        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
        return dir === 'asc' ? valA - valB : valB - valA;
    });

    vendedoresOrdenados.forEach((v, vIdx) => {
        const isCollapsed = collapsedVendNodes.has(v.id);
        const iconToggle = isCollapsed ? '+' : '−';

        // Linha Nível 1: Vendedor / Conta
        const trV = document.createElement('tr');
        trV.className = 'matrix-row matrix-row-n1';
        trV.dataset.id = v.id;
        trV.dataset.type = 'v1';
        trV.dataset.search = v.nome.toLowerCase();

        const displayVendRank = (col === 'fat' && dir === 'desc') ? (v.rank || (vIdx + 1)) : (v.rank || (vIdx + 1));

        trV.innerHTML = `
            <td class="text-center" style="padding: 4px 2px;">
                ${getRankBadge(displayVendRank, v.rank_diff)}
            </td>
            <td class="cell-tree" style="padding-left: 8px;">
                <span class="btn-toggle-tree" onclick="toggleVendNode('${v.id}', event)">${iconToggle}</span>
                <strong style="color: #FFFFFF; font-size: 11px;">${v.nome}</strong>
            </td>
            <td class="text-right" style="font-weight: 700;">${v.qtd > 0 ? fmtInt(v.qtd) : ''}</td>
            <td class="text-right" style="font-weight: 800; color: var(--mq-gold);">R$ ${fmtMoedaZero(v.fat)}</td>
            <td class="text-right" style="font-weight: 700;" title="Participação da conta no volume total de peças vendidas (% QTD)">${fmtPct(v.pct)}</td>
            <td class="text-right">${v.vlr_medio > 0 ? 'R$ ' + fmtMoeda(v.vlr_medio) : ''}</td>
            <td class="text-center">${getEvolBadge(v.evolucao_pct)}</td>
        `;
        tbody.appendChild(trV);

        // 3. Ordenação dos Produtos dentro de cada Vendedor / Conta
        const produtosOrdenados = [...(v.produtos || [])].sort((a, b) => {
            let valA = a[col];
            let valB = b[col];

            if (col === 'nome') {
                const comp = (valA || '').localeCompare(valB || '', 'pt-BR', { sensitivity: 'base' });
                return dir === 'asc' ? comp : -comp;
            }

            valA = Number(valA) || 0;
            valB = Number(valB) || 0;
            return dir === 'asc' ? valA - valB : valB - valA;
        });

        // Linha Nível 2: Produtos do Vendedor
        produtosOrdenados.forEach((p, pIdx) => {
            const trP = document.createElement('tr');
            trP.className = 'matrix-row matrix-row-n2';
            trP.dataset.parentV = v.id;
            trP.dataset.type = 'v2';
            trP.dataset.search = `${v.nome} ${p.nome} ${p.sku}`.toLowerCase();
            if (isCollapsed) trP.style.display = 'none';

            const displayProdRank = (col === 'fat' && dir === 'desc') ? (p.rank || (pIdx + 1)) : (p.rank || (pIdx + 1));

            trP.innerHTML = `
                <td class="text-center" style="padding: 4px 2px;">
                    ${getRankBadge(displayProdRank, p.rank_diff)}
                </td>
                <td class="cell-tree" style="padding-left: 18px;">
                    <span class="tree-leaf-bullet"></span>
                    <div class="prod-info-cell" style="display: inline-flex; vertical-align: middle;">
                        <span class="prod-name-title" title="${p.nome}">${p.nome}</span>
                    </div>
                </td>
                <td class="text-right" style="font-weight: 600;">${p.qtd > 0 ? fmtInt(p.qtd) : '-'}</td>
                <td class="text-right" style="font-weight: 700;">${p.fat > 0 ? 'R$ ' + fmtMoedaZero(p.fat) : '-'}</td>
                <td class="text-right" style="font-weight: 700; color: var(--mq-gold);" title="Participação em peças na conta comercial (% QTD)">${p.pct > 0 ? fmtPct(p.pct) : '-'}</td>
                <td class="text-right">${p.vlr_medio > 0 ? 'R$ ' + fmtMoeda(p.vlr_medio) : '-'}</td>
                <td class="text-center">${getEvolBadge(p.evolucao_pct)}</td>
            `;
            tbody.appendChild(trP);
        });
    });

    // Total Geral no Rodapé da Matriz 2
    if (tfoot && currentMatrizVendData.totais) {
        const t = currentMatrizVendData.totais;
        tfoot.innerHTML = `
            <tr class="tfoot-total-row">
                <td class="text-center" style="color: var(--text-muted); font-size: 10px;">-</td>
                <td class="total-title" style="padding-left: 10px;">Total</td>
                <td class="text-right">${fmtInt(t.qtd)}</td>
                <td class="text-right" style="color: var(--mq-gold); font-weight: 800;">R$ ${fmtMoedaZero(t.fat)}</td>
                <td class="text-right">${fmtPct(t.pct)}</td>
                <td class="text-right">R$ ${fmtMoeda(t.vlr_medio)}</td>
                <td class="text-center">${getEvolBadge(t.evolucao_pct)}</td>
            </tr>
        `;
    }
}

// Toggle para nós de vendedores
function toggleVendNode(nodeId, event) {
    if (event) event.stopPropagation();

    if (collapsedVendNodes.has(nodeId)) {
        collapsedVendNodes.delete(nodeId);
    } else {
        collapsedVendNodes.add(nodeId);
    }
    renderizarMatrizVendedores();
}

// Filtro de busca na matriz de vendedores
function filtrarMatrizVend(termo) {
    const rows = document.querySelectorAll('#matrix-vend-body tr');
    if (!termo) {
        renderizarMatrizVendedores();
        return;
    }

    collapsedVendNodes.clear();
    rows.forEach(r => {
        if (r.dataset.type === 'v2') {
            const matches = (r.dataset.search || '').includes(termo);
            r.style.display = matches ? '' : 'none';
        } else {
            r.style.display = '';
        }
    });
}


// ==========================================================================
// 7. Quadro Executivo: Formas de Pagamento por Canal de Venda
// ==========================================================================

// ==========================================================================
// 8. Tabela de Formas de Pagamento por Canal de Venda (Sem Coluna Modalidade/Gateway)
// ==========================================================================
function togglePaymentNode(nodeId) {
    if (collapsedPaymentNodes.has(nodeId)) {
        collapsedPaymentNodes.delete(nodeId);
    } else {
        collapsedPaymentNodes.add(nodeId);
    }
    renderizarPagamentosPorCanal();
}

function filtrarPagamentos(termo) {
    const rows = document.querySelectorAll('#pagamentos-canal-tbody tr');
    if (!termo) {
        rows.forEach(r => {
            if (r.classList.contains('matrix-row-n2')) {
                const parentId = r.getAttribute('data-parent');
                r.style.display = collapsedPaymentNodes.has(parentId) ? 'none' : '';
            } else {
                r.style.display = '';
            }
        });
        return;
    }
    
    rows.forEach(r => {
        const txt = (r.textContent || '').toLowerCase();
        r.style.display = txt.includes(termo) ? '' : 'none';
    });
}

function renderizarPagamentosPorCanal(data) {
    if (data) {
        currentPagamentosCanalData = [...data];
        // Preset inicial: expande apenas VTEX e mantém todos os outros canais recolhidos por padrão
        collapsedPaymentNodes.clear();
        currentPagamentosCanalData.forEach(c => {
            const isVtex = (c.id === 'pay_canal_vtex') || (c.canal && c.canal.toUpperCase().includes('VTEX'));
            if (!isVtex) {
                collapsedPaymentNodes.add(c.id);
            }
        });
    }
    if (!currentPagamentosCanalData) return;

    const tbody = document.getElementById('pagamentos-canal-tbody');
    const tfoot = document.getElementById('pagamentos-canal-tfoot');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Ordenação dos canais
    const { col, dir } = currentPaymentSort;
    const listaCanais = [...currentPagamentosCanalData].sort((a, b) => {
        let valA = a[col] !== undefined ? a[col] : a.total_valor;
        let valB = b[col] !== undefined ? b[col] : b.total_valor;

        if (col === 'nome') {
            valA = a.canal;
            valB = b.canal;
        }

        if (typeof valA === 'string') {
            const comp = (valA || '').localeCompare(valB || '', 'pt-BR', { sensitivity: 'base' });
            return dir === 'asc' ? comp : -comp;
        }

        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
        return dir === 'asc' ? valA - valB : valB - valA;
    });

    // Atualiza classes nos cabeçalhos da tabela
    document.querySelectorAll('#table-pagamentos-canal th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.getAttribute('data-col') === col) {
            th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    let totalGeralValor = 0;
    let totalGeralPedidos = 0;

    listaCanais.forEach(c => {
        totalGeralValor += (Number(c.total_valor) || 0);
        totalGeralPedidos += (Number(c.total_pedidos) || 0);
    });

    const ticketMedioGeral = totalGeralPedidos > 0 ? (totalGeralValor / totalGeralPedidos) : 0;

    const iconesCanais = {
        'MERCADO LIVRE': '🛍️',
        'VTEX (LOJA PRÓPRIA)': '🌐',
        'SHOPEE': '🛒',
        'MAGALU': '🏬',
        'PARLUX': '⚡'
    };

    listaCanais.forEach(c => {
        const isCollapsed = collapsedPaymentNodes.has(c.id);
        const trCanal = document.createElement('tr');
        trCanal.className = 'matrix-row matrix-row-n1';
        trCanal.setAttribute('data-id', c.id);

        const icone = iconesCanais[c.canal] || '🏪';

        // Linha Nível 1: Canal (EXCLUÍDA A COLUNA MODALIDADE / GATEWAY)
        trCanal.innerHTML = `
            <td class="cell-tree" style="padding-left: 14px; font-weight: 800; color: #FFFFFF;">
                <button class="btn-toggle-tree" onclick="togglePaymentNode('${c.id}')" title="${isCollapsed ? 'Expandir' : 'Recolher'}">
                    ${isCollapsed ? '+' : '−'}
                </button>
                <span>${icone} ${c.canal}</span>
                <span class="subcard-tag" style="margin-left: 8px; font-size: 9.5px; background: rgba(203, 151, 39, 0.12); color: var(--mq-gold-light); border: 1px solid rgba(203, 151, 39, 0.3);">
                    ${c.modalidades ? c.modalidades.length : 1} forma(s)
                </span>
            </td>
            <td class="text-right" style="font-weight: 700; color: #FFFFFF;">
                ${fmtInt(c.total_pedidos)}
            </td>
            <td class="text-right" style="font-weight: 800; color: #FFFFFF;">
                R$ ${fmtMoeda(c.total_valor)}
            </td>
            <td class="text-right" style="font-weight: 700; color: var(--mq-gold);">
                R$ ${fmtMoeda(c.ticket_medio)}
            </td>
            <td class="text-right" style="font-weight: 800; color: #00E676;">
                100,0%
            </td>
            <td class="text-right" style="font-weight: 800; color: var(--mq-gold-light);">
                ${fmtPct(c.share_pct)}
            </td>
        `;
        tbody.appendChild(trCanal);

        // Linha Nível 2: Formas de Pagamento do Canal (EXCLUÍDA A COLUNA MODALIDADE / GATEWAY)
        if (c.modalidades && c.modalidades.length > 0) {
            c.modalidades.forEach(m => {
                const trMod = document.createElement('tr');
                trMod.className = 'matrix-row matrix-row-n2';
                trMod.setAttribute('data-parent', c.id);
                if (isCollapsed) trMod.style.display = 'none';

                let dotColor = m.cor || '#38BDF8';
                if (m.forma.toLowerCase().includes('pix')) dotColor = '#00E676';
                else if (m.forma.toLowerCase().includes('saldo')) dotColor = '#FFE600';
                else if (m.forma.toLowerCase().includes('boleto')) dotColor = '#FFA726';
                else if (m.forma.includes('Mastercard')) dotColor = '#38BDF8';
                else if (m.forma.includes('Visa')) dotColor = '#06B6D4';
                else if (m.forma.includes('Elo')) dotColor = '#A855F7';
                else if (m.forma.toLowerCase().includes('cartão') || m.forma.toLowerCase().includes('cartao')) dotColor = '#38BDF8';

                trMod.innerHTML = `
                    <td class="cell-tree" style="padding-left: 36px; color: #E2E8F0;">
                        <span class="tree-leaf-bullet" style="background: ${dotColor}; box-shadow: 0 0 6px ${dotColor};"></span>
                        <span style="font-weight: 600;">${m.forma}</span>
                    </td>
                    <td class="text-right" style="color: #E2E8F0; font-weight: 600;">
                        ${fmtInt(m.pedidos)}
                    </td>
                    <td class="text-right" style="font-weight: 700; color: #FFFFFF;">
                        R$ ${fmtMoeda(m.valor)}
                    </td>
                    <td class="text-right" style="color: #CBD5E1;">
                        R$ ${fmtMoeda(m.ticket_medio)}
                    </td>
                    <td class="text-right">
                        <div class="share-progress-wrapper">
                            <span style="font-weight: 700; color: ${dotColor};">${fmtPct(m.pct_canal)}</span>
                            <div class="share-bar-mini">
                                <div class="share-bar-fill" style="width: ${Math.min(100, m.pct_canal)}%; background: ${dotColor};"></div>
                            </div>
                        </div>
                    </td>
                    <td class="text-right" style="font-weight: 700; color: #E2E8F0;">
                        ${fmtPct(m.pct_total)}
                    </td>
                `;
                tbody.appendChild(trMod);
            });
        }
    });

    if (tfoot) {
        tfoot.innerHTML = `
            <tr class="tfoot-total-row">
                <td class="total-title" style="padding-left: 16px;">
                    TOTAL CONSOLIDADO <span style="font-size: 10.5px; opacity: 0.8; font-weight: normal; margin-left: 6px;">(5 CANAIS OFICIAIS)</span>
                </td>
                <td class="text-right">${fmtInt(totalGeralPedidos)}</td>
                <td class="text-right" style="color: var(--mq-gold);">R$ ${fmtMoeda(totalGeralValor)}</td>
                <td class="text-right" style="color: var(--mq-gold);">R$ ${fmtMoeda(ticketMedioGeral)}</td>
                <td class="text-right" style="color: #00E676;">100,0%</td>
                <td class="text-right" style="color: var(--mq-gold-light);">100,0%</td>
            </tr>
        `;
    }
}

// ==========================================================================
// 8.1. Gráfico de Rosca Premium: Participação por Forma de Pagamento em %
// ==========================================================================
// ==========================================================================
// 8.1. Gráfico de Rosca Premium: Participação por Forma de Pagamento em %
// Visão Executiva: Redimensionado, Cores Harmoniosas & Seletor de Modo
// ==========================================================================
let modoDonutPagamento = 'tipo'; // 'tipo' (consolidado por categoria) ou 'forma' (detalhado por canal)
let donutHoverIndex = null;
let currentDisplayDonutItens = [];

function trocarModoDonut(modo) {
    modoDonutPagamento = modo;
    const btnTipo = document.getElementById('btn-pay-mode-tipo');
    const btnForma = document.getElementById('btn-pay-mode-forma');
    if (btnTipo && btnForma) {
        if (modo === 'tipo') {
            btnTipo.classList.add('active');
            btnForma.classList.remove('active');
        } else {
            btnTipo.classList.remove('active');
            btnForma.classList.add('active');
        }
    }
    renderizarGraficoPagamentos();
}

function renderizarGraficoPagamentos(data) {
    if (data) {
        currentPagamentosGraficoData = data;
    }
    if (!currentPagamentosGraficoData || !currentPagamentosGraficoData.itens) return;

    const canvas = document.getElementById('chart-pizza-pagamentos');
    if (!canvas) return;

    if (chartPagamentosPizzaInstance) {
        chartPagamentosPizzaInstance.destroy();
        chartPagamentosPizzaInstance = null;
    }

    const totalGeral = currentPagamentosGraficoData.total_valor || 0;
    let itensParaExibir = [];

    if (modoDonutPagamento === 'tipo') {
        // Consolidação Executiva por Macro Categoria (Cartão, Pix, Saldo, Boleto)
        const cats = {
            'CARTAO': { nome: 'Cartão de Crédito', cor: '#0284C7', valor: 0.0, pedidos: 0 },
            'PIX': { nome: 'Pix Instantâneo', cor: '#00E676', valor: 0.0, pedidos: 0 },
            'SALDO': { nome: 'Saldo / Carteira Digital', cor: '#FFD700', valor: 0.0, pedidos: 0 },
            'BOLETO': { nome: 'Boleto Bancário', cor: '#F97316', valor: 0.0, pedidos: 0 },
            'OUTROS': { nome: 'Outros Métodos', cor: '#64748B', valor: 0.0, pedidos: 0 }
        };

        currentPagamentosGraficoData.itens.forEach(it => {
            const nomeU = (it.nome || '').toUpperCase();
            const val = Number(it.valor) || 0;
            const ped = Number(it.pedidos) || 0;

            if (nomeU.includes('PIX')) {
                cats['PIX'].valor += val;
                cats['PIX'].pedidos += ped;
            } else if (nomeU.includes('CART') || nomeU.includes('MASTER') || nomeU.includes('VISA') || nomeU.includes('ELO') || nomeU.includes('HIPER') || nomeU.includes('AMEX') || nomeU.includes('CHECKOUT')) {
                cats['CARTAO'].valor += val;
                cats['CARTAO'].pedidos += ped;
            } else if (nomeU.includes('SALDO') || nomeU.includes('MERCADO PAGO') || nomeU.includes('SHOPEEPAY')) {
                cats['SALDO'].valor += val;
                cats['SALDO'].pedidos += ped;
            } else if (nomeU.includes('BOLETO')) {
                cats['BOLETO'].valor += val;
                cats['BOLETO'].pedidos += ped;
            } else {
                cats['OUTROS'].valor += val;
                cats['OUTROS'].pedidos += ped;
            }
        });

        itensParaExibir = Object.values(cats)
            .filter(c => c.valor > 0)
            .sort((a, b) => b.valor - a.valor)
            .map(c => ({
                ...c,
                pct: totalGeral > 0 ? (c.valor / totalGeral * 100) : 0
            }));
    } else {
        // Exibição por Canal / Modalidade com Paleta Executiva Única (Sem Repetições!)
        const PALETA_EXECUTIVA = [
            '#00E676', // Pix ML (Verde Esmeralda)
            '#0284C7', // Mastercard VTEX (Azul Oceano)
            '#6366F1', // Cartão Shopee (Índigo)
            '#10B981', // Pix Shopee (Verde Menta)
            '#06B6D4', // PIX VTEX (Ciano)
            '#3B82F6', // Visa VTEX (Azul Real)
            '#F59E0B', // Saldo Mercado Pago (Âmbar Ouro)
            '#F97316', // Boleto Shopee (Laranja)
            '#EC4899', // Saldo ShopeePay (Rosa)
            '#8B5CF6', // Cartão Magalu (Violeta)
            '#14B8A6', // Pix Magalu (Teal)
            '#A855F7', // Elo VTEX (Púrpura)
            '#E11D48', // Boleto Magalu (Rubi)
            '#64748B'  // Outros (Ardósia)
        ];

        itensParaExibir = currentPagamentosGraficoData.itens.map((it, idx) => ({
            ...it,
            cor: PALETA_EXECUTIVA[idx % PALETA_EXECUTIVA.length]
        }));
    }

    currentDisplayDonutItens = itensParaExibir;

    const countEl = document.getElementById('pay-modalidades-count');
    if (countEl) {
        countEl.textContent = modoDonutPagamento === 'tipo' 
            ? `${itensParaExibir.length} TIPOS` 
            : `${itensParaExibir.length} FORMAS`;
    }

    const labels = itensParaExibir.map(i => i.nome);
    const dataVals = itensParaExibir.map(i => i.valor);
    const bgColors = itensParaExibir.map(i => i.cor || '#38BDF8');

    donutHoverIndex = null;

    // Plugin para desenhar o Totalizador Interativo no Centro da Rosquinha (Padrão Executivo MQ)
    const centerTotalPlugin = {
        id: 'pagamentosCenterTotal',
        beforeDraw(chart) {
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (donutHoverIndex !== null && donutHoverIndex !== undefined && currentDisplayDonutItens[donutHoverIndex]) {
                const item = currentDisplayDonutItens[donutHoverIndex];
                const total = currentPagamentosGraficoData ? currentPagamentosGraficoData.total_valor : 0;
                const pct = total > 0 ? (item.valor / total * 100) : 0;

                // Título do item selecionado
                ctx.font = '800 8.5px Montserrat';
                ctx.fillStyle = item.cor || '#38BDF8';
                const nomeCurto = item.nome.length > 18 ? item.nome.substring(0, 16) + '...' : item.nome;
                ctx.fillText(nomeCurto.toUpperCase(), centerX, centerY - 15);

                // Valor do item selecionado
                ctx.font = '800 16px Montserrat';
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(`R$ ${fmtMoedaZero(item.valor)}`, centerX, centerY + 1);

                // Percentual e pedidos
                ctx.font = '700 8.5px Montserrat';
                ctx.fillStyle = item.cor || '#38BDF8';
                ctx.fillText(`${pct.toFixed(1).replace('.', ',')}% • ${fmtInt(item.pedidos)} PED`, centerX, centerY + 16);
            } else {
                // Estado Padrão: Total Consolidado
                ctx.font = '800 8.5px Montserrat';
                ctx.fillStyle = '#94A3B8';
                ctx.fillText('TOTAL CONSOLIDADO', centerX, centerY - 15);

                // Valor total faturado em ouro MQ
                ctx.font = '800 17px Montserrat';
                ctx.fillStyle = '#FFD700';
                const total = currentPagamentosGraficoData ? currentPagamentosGraficoData.total_valor : 0;
                ctx.fillText(`R$ ${fmtMoedaZero(total)}`, centerX, centerY + 1);

                // Quantidade total de transações
                ctx.font = '700 8.5px Montserrat';
                ctx.fillStyle = '#CBD5E1';
                const pedidos = currentPagamentosGraficoData ? currentPagamentosGraficoData.total_pedidos : 0;
                ctx.fillText(`${fmtInt(pedidos)} PEDIDOS • 100%`, centerX, centerY + 16);
            }

            ctx.restore();
        }
    };

    const ctx = canvas.getContext('2d');
    chartPagamentosPizzaInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataVals,
                backgroundColor: bgColors,
                borderColor: '#111116',
                borderWidth: 2,
                hoverBorderColor: '#FFFFFF',
                hoverBorderWidth: 2,
                hoverOffset: 6,
                borderRadius: 4,
                spacing: 1.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            layout: {
                padding: 4
            },
            onHover: (event, elements) => {
                if (elements && elements.length > 0) {
                    donutHoverIndex = elements[0].index;
                } else {
                    donutHoverIndex = null;
                }
                chartPagamentosPizzaInstance.draw();
            },
            plugins: {
                legend: {
                    display: false // Usamos os pills executivos modernos embaixo!
                },
                tooltip: {
                    backgroundColor: 'rgba(18, 19, 28, 0.96)',
                    borderColor: 'rgba(203, 151, 39, 0.4)',
                    borderWidth: 1,
                    titleColor: '#FFD700',
                    bodyColor: '#FFFFFF',
                    titleFont: { family: 'Montserrat', size: 12, weight: '800' },
                    bodyFont: { family: 'Montserrat', size: 11, weight: '600' },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const val = context.raw || 0;
                            const total = currentPagamentosGraficoData ? currentPagamentosGraficoData.total_valor : 0;
                            const pct = total > 0 ? (val / total * 100) : 0;
                            const peds = currentDisplayDonutItens[context.dataIndex]?.pedidos || 0;
                            return [
                                `  Faturamento: R$ ${fmtMoeda(val)} (${pct.toFixed(2).replace('.', ',')}%)`,
                                `  Transações: ${fmtInt(peds)} pedidos`
                            ];
                        }
                    }
                }
            }
        },
        plugins: [centerTotalPlugin]
    });

    // Renderiza legenda executiva em pills horizontais abaixo do gráfico
    const pillsContainer = document.getElementById('payment-pills-legend');
    if (pillsContainer) {
        pillsContainer.innerHTML = '';
        itensParaExibir.forEach((item, idx) => {
            const pill = document.createElement('div');
            pill.className = 'donut-pill-item';
            pill.title = `${item.nome}: R$ ${fmtMoeda(item.valor)} (${fmtPct(item.pct)})`;
            pill.innerHTML = `
                <span class="donut-pill-dot" style="background: ${item.cor}; box-shadow: 0 0 6px ${item.cor}88;"></span>
                <span class="donut-pill-label">${item.nome}</span>
                <span class="donut-pill-pct" style="color: ${item.cor};">${fmtPct(item.pct)}</span>
            `;
            pill.addEventListener('mouseenter', () => {
                donutHoverIndex = idx;
                chartPagamentosPizzaInstance.setActiveElements([{ datasetIndex: 0, index: idx }]);
                chartPagamentosPizzaInstance.draw();
            });
            pill.addEventListener('mouseleave', () => {
                donutHoverIndex = null;
                chartPagamentosPizzaInstance.setActiveElements([]);
                chartPagamentosPizzaInstance.draw();
            });
            pillsContainer.appendChild(pill);
        });
    }
}

function renderizarCupons() {
    if (!currentCuponsData) return;

    // 1. Atualiza Mini KPIs com Formatação Rica
    const badgeTot = document.getElementById('badge-total-cupons');
    if (badgeTot) badgeTot.textContent = `Total: R$ ${fmtMoeda(currentCuponsData.total_valor)}`;

    const kpiCom = document.getElementById('kpi-cupom-com');
    if (kpiCom) {
        kpiCom.innerHTML = `R$ ${fmtMoeda(currentCuponsData.vlr_com_cupom)} <span class="mini-kpi-share share-green">(${fmtPct(currentCuponsData.pct_com_cupom)})</span>`;
    }

    const kpiSem = document.getElementById('kpi-cupom-sem');
    if (kpiSem) {
        kpiSem.innerHTML = `R$ ${fmtMoeda(currentCuponsData.vlr_sem_cupom)} <span class="mini-kpi-share share-cyan">(${fmtPct(currentCuponsData.pct_sem_cupom)})</span>`;
    }

    const kpiTop = document.getElementById('kpi-cupom-top');
    if (kpiTop) {
        if (currentCuponsData.top_cupom_nome && currentCuponsData.top_cupom_nome !== '-') {
            kpiTop.innerHTML = `<span class="top-cupom-name">${currentCuponsData.top_cupom_nome}</span> <span class="top-cupom-sub">(R$ ${fmtMoedaZero(currentCuponsData.top_cupom_vlr)})</span>`;
        } else {
            kpiTop.textContent = '-';
        }
    }

    renderizarTabelaCupons();
    if (window.lucide) lucide.createIcons();
}

function renderizarTabelaCupons() {
    if (!currentCuponsData || !currentCuponsData.itens) return;

    const { col, dir } = currentCuponsSort;
    const lista = [...currentCuponsData.itens];

    lista.sort((a, b) => {
        let valA = a[col];
        let valB = b[col];

        if (typeof valA === 'string') {
            const comp = (valA || '').localeCompare(valB || '', 'pt-BR', { sensitivity: 'base' });
            return dir === 'asc' ? comp : -comp;
        }

        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
        return dir === 'asc' ? valA - valB : valB - valA;
    });

    // Atualiza classes nos cabeçalhos da tabela de cupons
    document.querySelectorAll('#table-cupons th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.getAttribute('data-col') === col) {
            th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    const tbody = document.getElementById('cupons-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 24px; color: var(--text-muted);">Nenhum cupom registrado no período</td></tr>`;
        return;
    }

    // Se houver mais de 10 cupons, exibe os 9 primeiros e agrupa os restantes em "Outros Cupons"
    let itensExibicao = lista;
    if (lista.length > 10) {
        const top9 = lista.slice(0, 9);
        const restantes = lista.slice(9);

        const ttOutros = restantes.reduce((acc, it) => acc + (Number(it.tt) || 0), 0);
        const vlrOutros = restantes.reduce((acc, it) => acc + (Number(it.valor) || 0), 0);
        const vlrAntOutros = restantes.reduce((acc, it) => acc + (Number(it.valor_ant) || 0), 0);
        const pctOutros = currentCuponsData.total_valor > 0 
            ? ((vlrOutros / currentCuponsData.total_valor) * 100) 
            : 0;
        const pctAntOutros = currentCuponsData.total_valor_ant > 0 
            ? ((vlrAntOutros / currentCuponsData.total_valor_ant) * 100) 
            : 0;

        // Consolidação das categorias de todos os cupons em 'Outros' com dados de M-1
        const catOutrosMap = {};
        restantes.forEach(r => {
            (r.categorias || []).forEach(c => {
                const cNome = c.categoria || 'OUTROS';
                if (!catOutrosMap[cNome]) {
                    catOutrosMap[cNome] = { valor: 0.0, pedidos: 0, valor_ant: 0.0, pedidos_ant: 0 };
                }
                catOutrosMap[cNome].valor += Number(c.valor) || 0;
                catOutrosMap[cNome].pedidos += Number(c.pedidos) || 0;
                catOutrosMap[cNome].valor_ant += Number(c.valor_ant) || 0;
                catOutrosMap[cNome].pedidos_ant += Number(c.pedidos_ant) || 0;
            });
        });
        const totCatOutros = Object.values(catOutrosMap).reduce((acc, c) => acc + c.valor, 0);
        const totCatOutrosAnt = Object.values(catOutrosMap).reduce((acc, c) => acc + c.valor_ant, 0);
        const catOutrosLista = Object.entries(catOutrosMap)
            .sort((a, b) => b[1].valor - a[1].valor)
            .map(([cat, info]) => {
                const pctCat = totCatOutros > 0 ? Number((info.valor / totCatOutros * 100).toFixed(2)) : 0.0;
                const pctCatAnt = totCatOutrosAnt > 0 ? Number((info.valor_ant / totCatOutrosAnt * 100).toFixed(2)) : 0.0;
                return {
                    categoria: cat,
                    pedidos: info.pedidos,
                    valor: Number(info.valor.toFixed(2)),
                    valor_ant: Number(info.valor_ant.toFixed(2)),
                    diff_valor: Number((info.valor - info.valor_ant).toFixed(2)),
                    pct: pctCat,
                    pct_ant: pctCatAnt,
                    diff_share: Number((pctCat - pctCatAnt).toFixed(2))
                };
            });

        const diffVlrOutros = Number((vlrOutros - vlrAntOutros).toFixed(2));
        const diffShareOutros = Number((pctOutros - pctAntOutros).toFixed(2));
        const nomesRestantes = restantes.map(r => `${r.coupon} (${fmtInt(r.tt)})`).join(', ');

        itensExibicao = [
            ...top9,
            {
                coupon: `Outros (${restantes.length} cupons)`,
                tt: ttOutros,
                valor: vlrOutros,
                valor_ant: vlrAntOutros,
                diff_valor: diffVlrOutros,
                pct: pctOutros,
                pct_ant: pctAntOutros,
                diff_share: diffShareOutros,
                evol_mom: vlrAntOutros > 0 ? ((vlrOutros - vlrAntOutros) / vlrAntOutros * 100) : null,
                categorias: catOutrosLista,
                isOutros: true,
                tooltip: nomesRestantes
            }
        ];
    }

    itensExibicao.forEach(item => {
        const tr = document.createElement('tr');
        const isSemCupom = !item.isOutros && (item.coupon.includes('SEM CUPOM') || item.coupon === '(SEM CUPOM)');
        const isTop = !item.isOutros && item.coupon === currentCuponsData.top_cupom_nome && !isSemCupom;
        const isExpanded = expandedCupons.has(item.coupon);
        const catCount = (item.categorias && item.categorias.length) || 0;

        let tagClass = 'coupon-tag';
        let starIcon = '';
        if (item.isOutros) {
            tagClass = 'coupon-tag outros-coupon';
        } else if (isTop) {
            tagClass = 'coupon-tag top-coupon';
            starIcon = ' ⭐';
        } else if (isSemCupom) {
            tagClass = 'coupon-tag sem-cupom';
        }

        const titleAttr = item.tooltip ? `title="${item.tooltip}"` : '';

        // Badge de Diferença de Valor (R$ MoM)
        let diffValorBadge = '';
        if (item.valor_ant === 0 && item.valor > 0) {
            diffValorBadge = `<span class="diff-tag diff-novo" title="Cupom novo no período">NOVO</span>`;
        } else if (item.diff_valor !== null && item.diff_valor !== undefined) {
            const dv = Number(item.diff_valor);
            if (dv > 0) {
                diffValorBadge = `<span class="diff-tag diff-up" title="+R$ ${fmtMoeda(dv)}">+R$ ${fmtMoedaZero(dv)} ▲</span>`;
            } else if (dv < 0) {
                diffValorBadge = `<span class="diff-tag diff-down" title="-R$ ${fmtMoeda(Math.abs(dv))}">-R$ ${fmtMoedaZero(Math.abs(dv))} ▼</span>`;
            } else {
                diffValorBadge = `<span class="diff-tag diff-neu">R$ 0</span>`;
            }
        } else {
            diffValorBadge = `<span class="diff-tag diff-neu">-</span>`;
        }

        // Badge de Diferença de Share (p.p. MoM)
        let diffShareBadge = '';
        if (item.valor_ant === 0 && item.valor > 0) {
            diffShareBadge = `<span class="diff-tag diff-novo" title="Cupom novo no período">NOVO</span>`;
        } else if (item.diff_share !== null && item.diff_share !== undefined) {
            const ds = Number(item.diff_share);
            if (ds > 0) {
                diffShareBadge = `<span class="diff-tag diff-up" title="+${fmtPct(ds)} p.p.">+${fmtPct(ds)} ▲</span>`;
            } else if (ds < 0) {
                diffShareBadge = `<span class="diff-tag diff-down" title="-${fmtPct(Math.abs(ds))} p.p.">-${fmtPct(Math.abs(ds))} ▼</span>`;
            } else {
                diffShareBadge = `<span class="diff-tag diff-neu">0,0%</span>`;
            }
        } else {
            diffShareBadge = `<span class="diff-tag diff-neu">-</span>`;
        }

        tr.className = `cupom-row ${isExpanded ? 'cupom-row-expanded' : ''}`;
        tr.setAttribute('data-coupon', item.coupon);
        tr.innerHTML = `
            <td>
                <div class="cupom-cell-flex">
                    <button type="button" class="btn-toggle-cupom ${isExpanded ? 'active' : ''}" data-coupon="${item.coupon}" title="Clique para expandir/recolher as categorias de vendas deste cupom">
                        <span class="chevron-arrow ${isExpanded ? 'rotated' : ''}">▶</span>
                        <span class="${tagClass}" ${titleAttr}>${item.coupon}${starIcon}</span>
                    </button>
                    ${catCount > 0 ? `<span class="badge-cat-count" data-coupon="${item.coupon}" title="${catCount} categorias de produtos">${catCount}</span>` : ''}
                </div>
            </td>
            <td class="text-right num-col">${fmtInt(item.tt)}</td>
            <td class="text-right num-col num-valor">R$ ${fmtMoeda(item.valor)}</td>
            <td class="text-right num-col num-valor-ant">${item.valor_ant > 0 ? 'R$ ' + fmtMoeda(item.valor_ant) : '-'}</td>
            <td class="text-right num-col num-diff-valor">${diffValorBadge}</td>
            <td class="text-right num-col num-share ${isTop ? 'gold-val' : ''}">${fmtPct(item.pct)}</td>
            <td class="text-right num-col num-share-ant muted-val">${item.valor_ant > 0 ? fmtPct(item.pct_ant) : '-'}</td>
            <td class="text-right num-col num-diff-share">${diffShareBadge}</td>
        `;
        tbody.appendChild(tr);

        // Se o cupom estiver expandido, insere as linhas de categorias com as 8 colunas perfeitamente alinhadas
        if (isExpanded && item.categorias && item.categorias.length > 0) {
            item.categorias.forEach(cat => {
                const trCat = document.createElement('tr');
                trCat.className = 'cupom-cat-tr';
                trCat.setAttribute('data-parent-coupon', item.coupon);

                let catDiffValBadge = '';
                if (cat.valor_ant === 0 && cat.valor > 0) {
                    catDiffValBadge = `<span class="diff-tag diff-novo-mini">NOVO</span>`;
                } else if (cat.diff_valor !== null && cat.diff_valor !== undefined) {
                    const cdv = Number(cat.diff_valor);
                    if (cdv > 0) {
                        catDiffValBadge = `<span class="diff-tag diff-up-mini" title="+R$ ${fmtMoeda(cdv)}">+R$ ${fmtMoedaZero(cdv)} ▲</span>`;
                    } else if (cdv < 0) {
                        catDiffValBadge = `<span class="diff-tag diff-down-mini" title="-R$ ${fmtMoeda(Math.abs(cdv))}">-R$ ${fmtMoedaZero(Math.abs(cdv))} ▼</span>`;
                    } else {
                        catDiffValBadge = `<span class="diff-tag diff-neu-mini">R$ 0</span>`;
                    }
                } else {
                    catDiffValBadge = `<span class="diff-tag diff-neu-mini">-</span>`;
                }

                let catDiffShareBadge = '';
                if (cat.valor_ant === 0 && cat.valor > 0) {
                    catDiffShareBadge = `<span class="diff-tag diff-novo-mini">NOVO</span>`;
                } else if (cat.diff_share !== null && cat.diff_share !== undefined) {
                    const cds = Number(cat.diff_share);
                    if (cds > 0) {
                        catDiffShareBadge = `<span class="diff-tag diff-up-mini">+${fmtPct(cds)} ▲</span>`;
                    } else if (cds < 0) {
                        catDiffShareBadge = `<span class="diff-tag diff-down-mini">-${fmtPct(Math.abs(cds))} ▼</span>`;
                    } else {
                        catDiffShareBadge = `<span class="diff-tag diff-neu-mini">0,0%</span>`;
                    }
                } else {
                    catDiffShareBadge = `<span class="diff-tag diff-neu-mini">-</span>`;
                }

                trCat.innerHTML = `
                    <td class="cat-cell-name">
                        <div class="cat-indent-cell">
                            <span class="cat-tree-branch">↳</span>
                            <span class="cat-name-label" title="${cat.categoria}">${cat.categoria}</span>
                        </div>
                    </td>
                    <td class="text-right num-col cat-ped">${fmtInt(cat.pedidos)}</td>
                    <td class="text-right num-col cat-val">R$ ${fmtMoeda(cat.valor)}</td>
                    <td class="text-right num-col cat-val-ant">${cat.valor_ant > 0 ? 'R$ ' + fmtMoeda(cat.valor_ant) : '-'}</td>
                    <td class="text-right num-col cat-diff-val">${catDiffValBadge}</td>
                    <td class="text-right num-col cat-share">${fmtPct(cat.pct)}</td>
                    <td class="text-right num-col cat-share-ant muted-val">${cat.valor_ant > 0 ? fmtPct(cat.pct_ant) : '-'}</td>
                    <td class="text-right num-col cat-diff-share">${catDiffShareBadge}</td>
                `;
                tbody.appendChild(trCat);
            });
        }
    });

    // Listeners de clique para expandir/recolher categorias
    tbody.querySelectorAll('.btn-toggle-cupom, .badge-cat-count').forEach(elem => {
        elem.addEventListener('click', (e) => {
            e.stopPropagation();
            const cp = elem.getAttribute('data-coupon');
            if (!cp) return;
            if (expandedCupons.has(cp)) {
                expandedCupons.delete(cp);
            } else {
                expandedCupons.add(cp);
            }
            renderizarTabelaCupons();
        });
    });

    const tfoot = document.getElementById('cupons-table-foot');
    if (tfoot) {
        const diffTotalVlr = Number((currentCuponsData.total_valor - (currentCuponsData.total_valor_ant || 0)).toFixed(2));
        let totalDiffVlrBadge = '';
        if (diffTotalVlr > 0) {
            totalDiffVlrBadge = `<span class="diff-tag diff-up">+R$ ${fmtMoedaZero(diffTotalVlr)} ▲</span>`;
        } else if (diffTotalVlr < 0) {
            totalDiffVlrBadge = `<span class="diff-tag diff-down">-R$ ${fmtMoedaZero(Math.abs(diffTotalVlr))} ▼</span>`;
        } else {
            totalDiffVlrBadge = `<span class="diff-tag diff-neu">R$ 0</span>`;
        }

        tfoot.innerHTML = `
            <tr class="tfoot-total-row">
                <td style="padding: 6px 4px;"><span class="tfoot-glow-text">TOTAL GERAL</span></td>
                <td class="text-right num-col" style="padding: 6px 4px; font-weight: 800;">${fmtInt(currentCuponsData.total_pedidos)}</td>
                <td class="text-right num-col" style="padding: 6px 4px; font-weight: 800; color: #FFE082;">R$ ${fmtMoeda(currentCuponsData.total_valor)}</td>
                <td class="text-right num-col" style="padding: 6px 4px; font-weight: 800; color: #94A3B8;">${currentCuponsData.total_valor_ant > 0 ? 'R$ ' + fmtMoeda(currentCuponsData.total_valor_ant) : '-'}</td>
                <td class="text-right num-col" style="padding: 6px 4px; font-weight: 800;">${totalDiffVlrBadge}</td>
                <td class="text-right num-col" style="padding: 6px 4px; font-weight: 800;"><span class="tfoot-pct-pill">100,0%</span></td>
                <td class="text-right num-col" style="padding: 6px 4px; font-weight: 800;"><span class="tfoot-pct-pill pill-muted">100,0%</span></td>
                <td class="text-right num-col" style="padding: 6px 4px; font-weight: 800;"><span class="tfoot-pct-pill pill-neutral">0,0%</span></td>
            </tr>
        `;
    }
}

// ==========================================================================
// Funil & Taxa de Conversão Mensal (Google Analytics 4)
// ==========================================================================
function renderizarConversao() {
    if (!currentConversaoData) return;

    // 1. Atualiza Mini KPIs com Formatação Rica
    const badgeTot = document.getElementById('badge-total-conversao');
    if (badgeTot) badgeTot.textContent = `Média: ${fmtPct(currentConversaoData.totais.taxa_conversao_media)}`;

    const kpiSess = document.getElementById('kpi-ga-sessoes');
    if (kpiSess) kpiSess.innerHTML = `<span class="val-cyan">${fmtInt(currentConversaoData.totais.total_sessoes)}</span>`;

    const kpiPed = document.getElementById('kpi-ga-pedidos');
    if (kpiPed) kpiPed.innerHTML = `<span class="val-purple">${fmtInt(currentConversaoData.totais.total_pedidos)}</span>`;

    const kpiTaxa = document.getElementById('kpi-ga-taxa');
    if (kpiTaxa) kpiTaxa.innerHTML = `<span class="val-green-glow">${fmtPct(currentConversaoData.totais.taxa_conversao_media)}</span>`;

    renderizarTabelaConversao();
    if (window.lucide) lucide.createIcons();
}

function renderizarTabelaConversao() {
    if (!currentConversaoData || !currentConversaoData.meses) return;

    const { col, dir } = currentConversaoSort;
    const lista = [...currentConversaoData.meses];

    lista.sort((a, b) => {
        let valA = a[col];
        let valB = b[col];

        if (col === 'mes_abrev') {
            valA = a.mes;
            valB = b.mes;
        }

        if (typeof valA === 'string') {
            const comp = (valA || '').localeCompare(valB || '', 'pt-BR', { sensitivity: 'base' });
            return dir === 'asc' ? comp : -comp;
        }

        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
        return dir === 'asc' ? valA - valB : valB - valA;
    });

    // Atualiza classes nos cabeçalhos da tabela de conversão
    document.querySelectorAll('#table-conversao th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.getAttribute('data-col') === col) {
            th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    const tbody = document.getElementById('conversao-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    lista.forEach(item => {
        const tr = document.createElement('tr');
        let badgeClass = 'conv-badge media';
        if (item.taxa_conversao >= 1.4) {
            badgeClass = 'conv-badge alta';
        } else if (item.taxa_conversao < 1.0) {
            badgeClass = 'conv-badge baixa';
        }

        tr.innerHTML = `
            <td class="col-mes-name">
                <span class="mes-pill">${item.mes_abrev}</span>
            </td>
            <td class="text-right num-sessoes">${fmtInt(item.sessoes)}</td>
            <td class="text-right num-pedidos">${fmtInt(item.pedidos)}</td>
            <td class="text-right">
                <span class="${badgeClass}">
                    <span class="status-indicator-dot"></span>
                    <span>${item.taxa_conversao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const tfoot = document.getElementById('conversao-table-foot');
    if (tfoot) {
        tfoot.innerHTML = `
            <tr class="tfoot-total-row">
                <td style="padding: 8px 12px;"><span class="tfoot-glow-text">Total</span></td>
                <td class="text-right" style="padding: 8px 12px; font-weight: 800; color: #BAE6FD;">${fmtInt(currentConversaoData.totais.total_sessoes)}</td>
                <td class="text-right" style="padding: 8px 12px; font-weight: 800;">${fmtInt(currentConversaoData.totais.total_pedidos)}</td>
                <td class="text-right" style="padding: 8px 12px; font-weight: 800;">
                    <span class="conv-badge alta gold-summary-badge">
                        <span class="status-indicator-dot"></span>
                        <span>${fmtPct(currentConversaoData.totais.taxa_conversao_media)}</span>
                    </span>
                </td>
            </tr>
        `;
    }
}

// ==========================================================================
// Gráfico Misto (Combo Chart): Sessões (Barras) + Taxa de Conversão (Linha)
// ==========================================================================
function renderizarGraficoConversao() {
    if (!currentConversaoData || !currentConversaoData.meses) return;

    const ctx = document.getElementById('chart-analytics-conversao');
    if (!ctx) return;

    if (chartConversaoInstance) {
        chartConversaoInstance.destroy();
    }

    // Ordena meses cronologicamente para o gráfico
    const mesesCron = [...currentConversaoData.meses].sort((a, b) => a.mes - b.mes);
    const labels = mesesCron.map(m => m.mes_abrev.toUpperCase());
    const dataSessoes = mesesCron.map(m => m.sessoes);
    const dataTaxas = mesesCron.map(m => m.taxa_conversao);

    chartConversaoInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: 'Taxa Conversão (%)',
                    data: dataTaxas,
                    borderColor: '#00E676',
                    backgroundColor: 'rgba(0, 230, 118, 0.08)',
                    fill: true,
                    borderWidth: 3,
                    pointBackgroundColor: '#FFFFFF',
                    pointBorderColor: '#00E676',
                    pointBorderWidth: 2.5,
                    pointRadius: 5,
                    pointHoverRadius: 7.5,
                    tension: 0.35,
                    yAxisID: 'yTaxa'
                },
                {
                    type: 'bar',
                    label: 'Sessões',
                    data: dataSessoes,
                    backgroundColor: 'rgba(14, 165, 233, 0.75)',
                    hoverBackgroundColor: 'rgba(56, 189, 248, 0.95)',
                    borderColor: 'rgba(56, 189, 248, 0.45)',
                    borderWidth: 1,
                    borderRadius: { topLeft: 5, topRight: 5, bottomLeft: 0, bottomRight: 0 },
                    yAxisID: 'ySessoes'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#F1F5F9',
                        font: { family: 'Montserrat', size: 10.5, weight: '700' },
                        boxWidth: 14,
                        padding: 12
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(18, 19, 28, 0.96)',
                    titleColor: '#FFD700',
                    bodyColor: '#FFFFFF',
                    borderColor: 'rgba(203, 151, 39, 0.4)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    titleFont: { family: 'Montserrat', size: 12, weight: '800' },
                    bodyFont: { family: 'Montserrat', size: 11, weight: '600' },
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.type === 'line') {
                                return `  Taxa Conversão: ${context.raw.toFixed(2)}%`;
                            }
                            return `  Sessões: ${context.raw.toLocaleString('pt-BR')}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#94A3B8', font: { family: 'Montserrat', size: 9.5, weight: '700' } }
                },
                ySessoes: {
                    type: 'linear',
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.03)', drawTicks: false },
                    ticks: {
                        maxTicksLimit: 5,
                        padding: 8,
                        color: '#38BDF8',
                        font: { family: 'Montserrat', size: 9.5, weight: '600' },
                        callback: (v) => (v >= 1000000 ? (v / 1000000).toFixed(1).replace('.', ',') + 'M' : (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v))
                    },
                    title: {
                        display: false
                    }
                },
                yTaxa: {
                    type: 'linear',
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: {
                        maxTicksLimit: 5,
                        padding: 8,
                        color: '#00E676',
                        font: { family: 'Montserrat', size: 9.5, weight: '700' },
                        callback: (v) => v.toFixed(1) + '%'
                    },
                    suggestedMin: 0.4,
                    suggestedMax: 2.3,
                    title: {
                        display: false
                    }
                }
            }
        }
    });
}


// ═══════════════════════════════════════════════════════════════════════════
// SINCRONIZAÇÃO MARIADB ON-DEMAND (COM FEEDBACK VISUAL E POLLING)
// ═══════════════════════════════════════════════════════════════════════════
function initSyncButton() {
    const btnSync = document.getElementById('btnSyncMariaDB');
    if (!btnSync) return;

    btnSync.addEventListener('click', async () => {
        if (btnSync.disabled) return;

        const iconSync = document.getElementById('iconSync');
        const textSync = document.getElementById('textSync');

        btnSync.disabled = true;
        btnSync.classList.add('is-syncing');
        if (textSync) textSync.textContent = 'Atualizando...';

        // Limpa cache local do navegador para forçar consulta limpa
        if (typeof clientDataCache !== 'undefined') {
            clientDataCache.clear();
        }

        showToast('Buscando dados atualizados do banco...', 'info');

        // Recarrega imediatamente os dados do dashboard direto do banco (force refresh)
        try {
            await carregarDados(true);
            const elLast = document.getElementById('last-update');
            if (elLast) elLast.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
        } catch (errLoad) {
            console.error('Erro no refresh inicial:', errLoad);
        }

        try {
            const anos = getAnosSelecionados();
            const meses = getMesesSelecionados();
            const anoParam = anos.length > 0 ? anos[0] : new Date().getFullYear();
            const mesParam = meses.length > 0 ? meses[meses.length - 1] : (new Date().getMonth() + 1);

            const resp = await fetch(`/api/sincronizar?ano=${anoParam}&mes=${mesParam}`, { method: 'POST' });
            const data = await resp.json();

            // Inicia polling de status da sincronização com o Sankhya
            const pollInterval = setInterval(async () => {
                try {
                    const stResp = await fetch('/api/sincronizar/status');
                    const stData = await stResp.json();
                    
                    if (stData && stData.sync_state && !stData.sync_state.is_running) {
                        clearInterval(pollInterval);
                        btnSync.disabled = false;
                        btnSync.classList.remove('is-syncing');
                        if (textSync) textSync.textContent = 'Atualizar Dados';

                        if (stData.sync_state.last_result === 'sucesso') {
                            showToast('Dados sincronizados e atualizados com sucesso!', 'success');
                            if (typeof clientDataCache !== 'undefined') {
                                clientDataCache.clear();
                            }
                            // Recarrega novamente com os dados frescos do Sankhya
                            await carregarDados(true);
                            const elLast = document.getElementById('last-update');
                            if (elLast) elLast.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
                        } else {
                            showToast('Aviso: Sincronização em background concluída com aviso.', 'warning');
                        }
                    }
                } catch (pollErr) {
                    console.error('Erro ao verificar status do sync:', pollErr);
                }
            }, 2000);

            // Timeout de segurança para reabilitar botão após 45s
            setTimeout(() => {
                clearInterval(pollInterval);
                btnSync.disabled = false;
                btnSync.classList.remove('is-syncing');
                if (textSync) textSync.textContent = 'Atualizar Dados';
            }, 45000);

        } catch (e) {
            console.error('Erro ao solicitar sincronização:', e);
            btnSync.disabled = false;
            btnSync.classList.remove('is-syncing');
            if (textSync) textSync.textContent = 'Atualizar Dados';
            showToast('Dados recarregados do banco de dados.', 'success');
        }
    });
}

function showToast(message, type = 'info') {
    const existing = document.querySelector('.sync-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'sync-toast';
    const icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-triangle' : 'info');
    toast.innerHTML = `<i data-lucide="${icon}"></i><span>${message}</span>`;
    document.body.appendChild(toast);
    
    if (window.lucide) {
        window.lucide.createIcons();
    }

    setTimeout(() => {
        toast.style.transition = 'opacity 0.5s ease';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 4500);
}

// Observer para manter o gráfico de rosca perfeitamente sincronizado com a altura da tabela
document.addEventListener('DOMContentLoaded', () => {
    if (window.ResizeObserver) {
        const donutWrap = document.querySelector('.payment-donut-wrapper') || document.querySelector('.payment-donut-container');
        if (donutWrap) {
            new ResizeObserver(() => {
                if (chartPagamentosPizzaInstance && typeof chartPagamentosPizzaInstance.resize === 'function') {
                    chartPagamentosPizzaInstance.resize();
                }
            }).observe(donutWrap);
        }
    }
});
