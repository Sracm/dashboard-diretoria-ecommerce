/**
 * MQ Professional — Diretoria de E-commerce
 * Controle Executivo de Metas & Realizado Diário (Faturamento Líquido)
 */

let chartInstances = {};
let currentMatrizData = null;
let currentParams = null;
let currentViewMode = 'ranking'; // 'ranking' ou 'categoria'
let currentRankingSort = { col: 'fat', dir: 'desc' };
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
    return (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%';
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
        labelDiaFim.textContent = e.target.value;
    });

    sliderDias.addEventListener('change', () => carregarDadosDebounced(100));
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
    const btnCategoria = document.getElementById('btn-view-categoria');
    const actionBtns = document.getElementById('matrix-prods-action-btns');

    if (btnRanking && btnCategoria) {
        btnRanking.addEventListener('click', () => {
            btnRanking.classList.add('active');
            btnCategoria.classList.remove('active');
            currentViewMode = 'ranking';
            if (actionBtns) actionBtns.style.display = 'none';
            const thLbl = document.getElementById('th-matrix1-label');
            if (thLbl) thLbl.innerHTML = 'PRODUTO <i class="sort-icon"></i>';
            renderizarMatriz();
        });
        btnCategoria.addEventListener('click', () => {
            btnCategoria.classList.add('active');
            btnRanking.classList.remove('active');
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
            if (currentMatrizData && currentMatrizData.categorias) {
                currentMatrizData.categorias.forEach(cat => collapsedNodes.add(cat.id));
            }
            renderizarMatriz();
        });
    }

    // Ordenação interativa da Matriz 1 (Ranking Geral)
    document.querySelectorAll('#matrix-sales-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-col');
            if (!col) return;
            if (currentRankingSort.col === col) {
                currentRankingSort.dir = currentRankingSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                currentRankingSort.col = col;
                currentRankingSort.dir = col === 'nome' ? 'asc' : 'desc';
            }
            renderizarMatriz();
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

    // Controle de Modo TV / Tela Cheia Adaptativo
    const btnTv = document.getElementById('btn-toggle-tv');
    const btnTvText = document.getElementById('btn-tv-text');
    if (btnTv) {
        btnTv.addEventListener('click', () => {
            const isTv = document.body.classList.toggle('tv-mode');
            btnTv.classList.toggle('active', isTv);
            if (btnTvText) btnTvText.textContent = isTv ? 'Sair TV' : 'Modo TV';

            // Tentar Fullscreen nativo
            if (isTv) {
                if (document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen().catch(() => {});
                }
            } else {
                if (document.fullscreenElement && document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                }
            }

            // Forçar redimensionamento dos gráficos para o novo tamanho
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 150);
        });
    }

    // Listener global para redimensionamento suave e instantâneo (Qualquer Tela / TV / Notebook)
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            Object.values(chartInstances).forEach(inst => {
                if (inst && typeof inst.resize === 'function') inst.resize();
            });
            if (chartPagamentosPizzaInstance && typeof chartPagamentosPizzaInstance.resize === 'function') {
                chartPagamentosPizzaInstance.resize();
            }
        }, 100);
    });
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

function aplicarDadosDashboard(data) {
    if (!data) return;
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
    const lastUpdateEl = document.getElementById('last-update');
    if (lastUpdateEl) {
        if (metaETL && metaETL.timestamp) {
            lastUpdateEl.textContent = `Última carga: ${metaETL.timestamp}`;
            lastUpdateEl.title = `Dados sincronizados via MariaDB (${metaETL.linhas_vendas ? metaETL.linhas_vendas.toLocaleString('pt-BR') : ''} vendas)`;
        } else {
            const agora = new Date();
            lastUpdateEl.textContent = `Atualizado: ${agora.toLocaleTimeString('pt-BR')}`;
        }
    }
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
        overlay.classList.remove('hidden');
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

        // 1. Atualizar Performance do Período Trabalhado (Dentro / Fora da Meta com Venda/dia vs Meta/dia)
        const perfBadge = document.getElementById(`perf-badge-${s}`);
        const perfAting = document.getElementById(`perf-ating-${s}`);
        const perfVendaDia = document.getElementById(`perf-venda-dia-${s}`);
        const perfMetaDia = document.getElementById(`perf-meta-dia-${s}`);
        
        if (perfAting) {
            perfAting.textContent = `${fmtPct(info.atingimento_pct)}`;
            const statusClass = info.atingimento_pct >= 100 ? 'superou' : (info.atingimento_pct >= 75 ? 'atencao' : 'critico');
            perfAting.className = `perf-pct-main status-badge ${statusClass}`;
        }
        if (perfVendaDia) perfVendaDia.innerHTML = `Venda/dia: <strong>R$ ${fmtMoedaZero(info.venda_dia)}</strong>`;
        if (perfMetaDia) perfMetaDia.innerHTML = `Meta/dia: <strong>R$ ${fmtMoedaZero(info.meta_dia)}</strong>`;
        
        if (perfBadge) {
            const dentro = info.atingimento_pct >= 100;
            const diffPct = (info.atingimento_pct - 100).toFixed(1);
            const diffSign = diffPct > 0 ? '+' : '';
            perfBadge.textContent = dentro ? `Dentro da Meta (${diffSign}${diffPct}%)` : `Fora da Meta (${diffPct}%)`;
            perfBadge.className = `perf-status-pill ${dentro ? 'dentro' : 'fora'}`;
        }
        
        // 2. Atualizar Projeção de Fechamento do Mês (Ritmo Atual de Vendas)
        const perfProjBadge = document.getElementById(`perf-proj-badge-${s}`);
        const perfProjVal = document.getElementById(`perf-proj-val-${s}`);
        const perfProjPct = document.getElementById(`perf-proj-pct-${s}`);
        const perfMetaMes = document.getElementById(`perf-meta-mes-${s}`);
        const perfGapProj = document.getElementById(`perf-gap-proj-${s}`);
        
        if (perfProjVal) perfProjVal.textContent = `R$ ${fmtMoedaZero(info.projecao_mes)}`;
        if (perfProjPct) perfProjPct.textContent = `${fmtPct(info.projecao_pct)} da Meta Mês`;
        if (perfMetaMes) perfMetaMes.innerHTML = `Meta Mês: <strong>R$ ${fmtMoedaZero(info.meta_mes)}</strong>`;
        if (perfGapProj) {
            const gapSign = (info.gap_projecao || 0) >= 0 ? '+' : '';
            perfGapProj.innerHTML = `Gap: <strong>${gapSign}R$ ${fmtMoedaZero(info.gap_projecao)}</strong>`;
            perfGapProj.className = `daily-item ${(info.gap_projecao || 0) >= 0 ? 'green-item' : 'red-item'}`;
        }
        if (perfProjBadge) {
            const atingProj = (info.projecao_pct || 0) >= 100;
            perfProjBadge.textContent = `Fecha em ${fmtPct(info.projecao_pct)}`;
            perfProjBadge.className = `perf-status-pill ${atingProj ? 'dentro' : 'fora'}`;
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
        // Quando visualizado o mês todo (>12 dias), removemos as bolinhas estáticas que
        // embolavam as 3 curvas em um bloco ilegível. No hover, o ponto do dia acende com brilho.
        const isMesLongo = totalPontos > 12;
        const pRadius = isMesLongo ? 0 : 2.5;
        const pRadiusFat = isMesLongo ? 0 : 3;

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
                        pointBackgroundColor: '#00E676',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 1.5,
                        pointRadius: pRadius,
                        pointHoverRadius: 6,
                        tension: 0.1
                    },
                    {
                        label: 'Fat. Acum Mês ant.',
                        data: info.acumulado_fat_ant || [],
                        borderColor: '#2979FF',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointBackgroundColor: '#2979FF',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 1.5,
                        pointRadius: pRadius,
                        pointHoverRadius: 6,
                        borderDash: [4, 4],
                        tension: 0.1
                    },
                    {
                        label: 'Fat. Acumulado',
                        data: info.acumulado_fat,
                        borderColor: '#FF5252',
                        backgroundColor: 'rgba(255, 82, 82, 0.08)',
                        borderWidth: 2.5,
                        pointBackgroundColor: '#FF5252',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                        pointRadius: pRadiusFat,
                        pointHoverRadius: 7,
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
                        backgroundColor: 'rgba(20, 20, 26, 0.95)',
                        titleColor: '#CB9727',
                        titleFont: { family: 'Montserrat', size: 11, weight: '700' },
                        bodyColor: '#FFFFFF',
                        bodyFont: { family: 'Montserrat', size: 10.5 },
                        borderColor: 'rgba(203, 151, 39, 0.35)',
                        borderWidth: 1,
                        padding: 10,
                        boxPadding: 4,
                        usePointStyle: true,
                        callbacks: {
                            title: (items) => {
                                if (!items.length) return '';
                                const dLabel = String(items[0].label).replace(/^D/i, '');
                                return `📅 Dia ${dLabel}`;
                            },
                            label: (ctx) => ` ${ctx.dataset.label}: R$ ${fmtMoeda(ctx.raw)}`,
                            afterBody: (items) => {
                                const fatItem = items.find(i => i.dataset.label === 'Fat. Acumulado');
                                const metaItem = items.find(i => i.dataset.label === 'Meta Acumulada');
                                if (fatItem && metaItem && metaItem.raw > 0) {
                                    const ating = ((fatItem.raw / metaItem.raw) * 100).toFixed(1);
                                    const diff = fatItem.raw - metaItem.raw;
                                    const sinal = diff >= 0 ? '+' : '';
                                    return `\n🎯 Ating. até o dia: ${ating}%\n⚖️ Saldo vs Meta: ${sinal}R$ ${fmtMoeda(diff)}`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: (context) => {
                                if (context.index !== undefined && (context.index + 1) % 5 === 0) {
                                    return 'rgba(255, 255, 255, 0.09)';
                                }
                                return 'rgba(255, 255, 255, 0.025)';
                            },
                            drawTicks: false
                        },
                        ticks: {
                            autoSkip: false, // EXIBE TODOS OS DIAS (1 a 31) SEM PULAR NENHUM DIA!
                            maxRotation: isMesLongo ? 45 : 0,
                            minRotation: isMesLongo ? 45 : 0,
                            color: '#9E9EA8',
                            font: {
                                family: 'Montserrat',
                                size: totalPontos > 26 ? 8 : (totalPontos > 15 ? 8.5 : 9.5),
                                weight: '600'
                            },
                            padding: 2,
                            callback: function(val, index) {
                                const lbl = this.getLabelForValue(val);
                                return lbl ? String(lbl).replace(/^D/i, '') : val;
                            }
                        }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: {
                            color: '#666672',
                            font: { family: 'Montserrat', size: 9 },
                            callback: (v) => 'R$ ' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)
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
                <span class="modal-kpi-lbl">Fat. Mês Anterior</span>
                <span class="modal-kpi-val blue-text">R$ ${fmtMoeda(info.total_fat_ant_periodo)}</span>
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
                        pointBackgroundColor: '#00E676',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 1.5,
                        pointRadius: totalPontos > 20 ? 1 : 3,
                        pointHoverRadius: 7,
                        tension: 0.1
                    },
                    {
                        label: 'Fat. Acum Mês ant.',
                        data: info.acumulado_fat_ant || [],
                        borderColor: '#2979FF',
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        pointBackgroundColor: '#2979FF',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 1.5,
                        pointRadius: totalPontos > 20 ? 1 : 3,
                        pointHoverRadius: 7,
                        borderDash: [5, 5],
                        tension: 0.1
                    },
                    {
                        label: 'Fat. Acumulado',
                        data: info.acumulado_fat,
                        borderColor: '#FF5252',
                        backgroundColor: 'rgba(255, 82, 82, 0.12)',
                        borderWidth: 3,
                        pointBackgroundColor: '#FF5252',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                        pointRadius: totalPontos > 20 ? 2 : 4,
                        pointHoverRadius: 8,
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
                        backgroundColor: 'rgba(20, 20, 26, 0.95)',
                        titleColor: '#CB9727',
                        titleFont: { family: 'Montserrat', size: 12, weight: '700' },
                        bodyColor: '#FFFFFF',
                        bodyFont: { family: 'Montserrat', size: 11 },
                        borderColor: 'rgba(203, 151, 39, 0.4)',
                        borderWidth: 1,
                        padding: 12,
                        boxPadding: 5,
                        usePointStyle: true,
                        callbacks: {
                            title: (items) => `📅 Dia ${String(items[0].label).replace(/^D/i, '')}`,
                            label: (ctx) => ` ${ctx.dataset.label}: R$ ${fmtMoeda(ctx.raw)}`,
                            afterBody: (items) => {
                                const fatItem = items.find(i => i.dataset.label === 'Fat. Acumulado');
                                const metaItem = items.find(i => i.dataset.label === 'Meta Acumulada');
                                if (fatItem && metaItem && metaItem.raw > 0) {
                                    const ating = ((fatItem.raw / metaItem.raw) * 100).toFixed(1);
                                    const diff = fatItem.raw - metaItem.raw;
                                    const sinal = diff >= 0 ? '+' : '';
                                    return `\n🎯 Ating. acumulado: ${ating}%\n⚖️ Saldo vs Meta: ${sinal}R$ ${fmtMoeda(diff)}`;
                                }
                                return '';
                            }
                        }
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
                            color: '#A0A0B0',
                            font: { family: 'Montserrat', size: 10, weight: '600' },
                            callback: function(val, index) {
                                const lbl = this.getLabelForValue(val);
                                return lbl ? String(lbl).replace(/^D/i, '') : val;
                            }
                        }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#888894',
                            font: { family: 'Montserrat', size: 10 },
                            callback: (v) => 'R$ ' + (v >= 1000 ? (v / 1000).toLocaleString('pt-BR') + 'k' : v)
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
                        backgroundColor: 'rgba(20, 20, 26, 0.95)',
                        titleColor: '#CB9727',
                        borderColor: 'rgba(203, 151, 39, 0.4)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            title: (items) => `📅 Dia ${String(items[0].label).replace(/^D/i, '')}`,
                            label: (ctx) => ` ${ctx.dataset.label}: R$ ${fmtMoeda(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            autoSkip: false,
                            color: '#A0A0B0',
                            font: { family: 'Montserrat', size: 10, weight: '600' },
                            callback: function(val, index) {
                                const lbl = this.getLabelForValue(val);
                                return lbl ? String(lbl).replace(/^D/i, '') : val;
                            }
                        }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#888894',
                            font: { family: 'Montserrat', size: 10 },
                            callback: (v) => 'R$ ' + (v >= 1000 ? (v / 1000).toLocaleString('pt-BR') + 'k' : v)
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

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="channel-name">${c.canal}</td>
            <td class="text-right" style="color: #EF5350;">R$ ${fmtMoeda(c.devolucao)} (${fmtPct(c.pct_devolucao)})</td>
            <td class="text-right" style="font-weight: 700; color: #FFF;">R$ ${fmtMoeda(c.faturamento_liquido)}</td>
            <td class="text-right" style="color: #00E676; font-weight: 600;">R$ ${fmtMoeda(c.meta_periodo)}</td>
            <td>
                <div class="progress-cell-box">
                    <div class="progress-header">
                        <span>${fmtPct(c.atingimento_periodo_pct)}</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill ${barClass}" style="width: ${barWidth}%"></div>
                    </div>
                </div>
            </td>
            <td class="text-right">R$ ${fmtMoeda(c.meta_mes)}</td>
            <td class="text-right" style="color: #CB9727; font-weight: 600;">R$ ${fmtMoeda(c.projecao_mes)}</td>
            <td class="text-right">${fmtInt(c.itens)}</td>
            <td class="text-right">R$ ${fmtMoeda(c.ticket_medio)}</td>
            <td class="text-right" style="font-weight: 700;">${fmtPct(c.share_pct)}</td>
            <td class="text-right" style="font-weight: 600; color: #94A3B8;">${fmtPct(c.share_ant_pct)}</td>
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
                <td class="text-right" style="font-weight: 800; color: #FFF;">R$ ${fmtMoeda(totFatLiquido)}</td>
                <td class="text-right" style="color: #00E676; font-weight: 700;">R$ ${fmtMoeda(totMetaPeriodo)}</td>
                <td>
                    <div class="progress-cell-box">
                        <div class="progress-header">
                            <span style="font-weight: 800;">${fmtPct(totAtingPeriodoPct)}</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill ${barClassTot}" style="width: ${barWidthTot}%"></div>
                        </div>
                    </div>
                </td>
                <td class="text-right" style="font-weight: 700;">R$ ${fmtMoeda(totMetaMes)}</td>
                <td class="text-right" style="color: #CB9727; font-weight: 700;">R$ ${fmtMoeda(totProjecao)}</td>
                <td class="text-right" style="font-weight: 700;">${fmtInt(totItens)}</td>
                <td class="text-right" style="font-weight: 700;">R$ ${fmtMoeda(totTicketMedio)}</td>
                <td class="text-right" style="font-weight: 800; color: #CB9727;">100,0%</td>
                <td class="text-right" style="font-weight: 800; color: #94A3B8;">100,0%</td>
            </tr>
        `;
    }
}

// 4. Renderizar os 4 Gráficos do Histórico Mensal 2026 (Sem comparação com mês anterior)
function renderizarHistoricoMensal(hist) {
    if (!hist || hist.length === 0) return;

    const labels = hist.map(h => h.mes_abrev);
    const last = hist[hist.length - 1]; // Mês corrente selecionado

    // 1. Quantidade de Itens Vendidos
    const itensDados = hist.map(h => h.itens);
    const totalItens = itensDados.reduce((a, b) => a + (Number(b) || 0), 0);
    criarGraficoLinhaArea(
        'chart-hist-itens', labels, itensDados,
        '#00E676', 'rgba(0, 230, 118, 0.15)', false, 'Itens Vendidos'
    );
    const footItensTotal = document.getElementById('foot-hist-itens-total');
    const footItensAtual = document.getElementById('foot-hist-itens-atual');
    if (footItensTotal) footItensTotal.textContent = `Acumulado: ${fmtInt(totalItens)}`;
    if (footItensAtual) footItensAtual.textContent = `Mês Atual: ${fmtInt(last.itens)}`;

    // 2. Faturamento Líquido (R$)
    const fatDados = hist.map(h => h.faturamento);
    const totalFat = fatDados.reduce((a, b) => a + (Number(b) || 0), 0);
    criarGraficoLinhaArea(
        'chart-hist-fat', labels, fatDados,
        '#CB9727', 'rgba(203, 151, 39, 0.15)', true, 'Faturamento'
    );
    const footFatTotal = document.getElementById('foot-hist-fat-total');
    const footFatAtual = document.getElementById('foot-hist-fat-atual');
    if (footFatTotal) footFatTotal.textContent = `Acumulado: R$ ${fmtMoedaZero(totalFat)}`;
    if (footFatAtual) footFatAtual.textContent = `Mês Atual: R$ ${fmtMoedaZero(last.faturamento)}`;

    // 3. Ticket Médio Líquido (R$)
    const ticketDados = hist.map(h => h.ticket_medio);
    const mediaTicket = totalItens > 0 ? (totalFat / totalItens) : 0;
    criarGraficoLinhaArea(
        'chart-hist-ticket', labels, ticketDados,
        '#64B5F6', 'rgba(100, 181, 246, 0.15)', true, 'Ticket Médio'
    );
    const footTicketTotal = document.getElementById('foot-hist-ticket-total');
    const footTicketAtual = document.getElementById('foot-hist-ticket-atual');
    if (footTicketTotal) footTicketTotal.textContent = `Médio Geral: R$ ${fmtMoeda(mediaTicket)}`;
    if (footTicketAtual) footTicketAtual.textContent = `Mês Atual: R$ ${fmtMoeda(last.ticket_medio)}`;

    // 4. Devoluções Mensais (R$)
    const devDados = hist.map(h => h.devolucoes);
    const totalDev = devDados.reduce((a, b) => a + (Number(b) || 0), 0);
    criarGraficoLinhaArea(
        'chart-hist-dev', labels, devDados,
        '#FF5252', 'rgba(255, 82, 82, 0.15)', true, 'Devoluções'
    );
    const footDevTotal = document.getElementById('foot-hist-dev-total');
    const footDevAtual = document.getElementById('foot-hist-dev-atual');
    if (footDevTotal) footDevTotal.textContent = `Acumulado: R$ ${fmtMoedaZero(totalDev)}`;
    if (footDevAtual) footDevAtual.textContent = `Mês Atual: R$ ${fmtMoedaZero(last.devolucoes)}`;
}

function criarGraficoLinhaArea(canvasId, labels, dataVals, color, bgColor, isMoeda, metricName) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: metricName,
                    data: dataVals,
                    borderColor: color,
                    backgroundColor: bgColor,
                    borderWidth: 2.2,
                    pointBackgroundColor: color,
                    pointRadius: 3.5,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.25
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
                    backgroundColor: '#1E1E24',
                    titleColor: '#CB9727',
                    bodyColor: '#FFFFFF',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 9,
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.raw || 0;
                            return isMoeda ? ` ${metricName}: R$ ${fmtMoeda(val)}` : ` ${metricName}: ${fmtInt(val)} itens`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#888894', font: { family: 'Montserrat', size: 9 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: {
                        color: '#666672',
                        font: { family: 'Montserrat', size: 8 },
                        callback: (v) => isMoeda ? (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) : v
                    }
                }
            }
        }
    });
}

// Helper para badge de ranking e evolução de posições vs mês anterior (▲ subiu / ▼ caiu / = igual / NOVO)
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
        if (currentViewMode === 'ranking' && th.getAttribute('data-col') === currentRankingSort.col) {
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
                    <div class="share-progress-wrapper">
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

    } else {
        // Modo 'categoria' (agrupado por Categoria: PRANCHA, SECADOR... sem canal)
        const categorias = currentMatrizData.categorias;
        if (!categorias || categorias.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center kpi-subtext" style="padding: 24px;">Nenhuma categoria encontrada para o filtro selecionado</td></tr>';
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        categorias.forEach(cat => {
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
            cat.produtos.forEach(p => {
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

    const lista = currentMatrizVendData.vendedores;
    tbody.innerHTML = '';

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center kpi-subtext" style="padding: 24px;">Nenhum dado de vendedor encontrado</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    lista.forEach(v => {
        const isCollapsed = collapsedVendNodes.has(v.id);
        const iconToggle = isCollapsed ? '+' : '−';

        // Linha Nível 1: Vendedor / Conta
        const trV = document.createElement('tr');
        trV.className = 'matrix-row matrix-row-n1';
        trV.dataset.id = v.id;
        trV.dataset.type = 'v1';
        trV.innerHTML = `
            <td class="text-center" style="padding: 4px 2px;">
                ${getRankBadge(v.rank, v.rank_diff)}
            </td>
            <td class="cell-tree" style="padding-left: 8px;">
                <span class="btn-toggle-tree" onclick="toggleVendNode('${v.id}', event)">${iconToggle}</span>
                <strong style="color: #FFFFFF; font-size: 11px;">${v.nome}</strong>
            </td>
            <td class="text-right">${v.qtd > 0 ? fmtInt(v.qtd) : ''}</td>
            <td class="text-right" style="font-weight: 800; color: var(--mq-gold);">R$ ${fmtMoedaZero(v.fat)}</td>
            <td class="text-right">${fmtPct(v.pct)}</td>
            <td class="text-right">${v.vlr_medio > 0 ? 'R$ ' + fmtMoeda(v.vlr_medio) : ''}</td>
            <td class="text-center">${getEvolBadge(v.evolucao_pct)}</td>
        `;
        tbody.appendChild(trV);

        // Linha Nível 2: Produtos do Vendedor
        v.produtos.forEach(p => {
            const trP = document.createElement('tr');
            trP.className = 'matrix-row matrix-row-n2';
            trP.dataset.parentV = v.id;
            trP.dataset.type = 'v2';
            trP.dataset.search = `${v.nome} ${p.nome} ${p.sku}`.toLowerCase();
            if (isCollapsed) trP.style.display = 'none';

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
                <td class="text-right">${p.qtd > 0 ? fmtInt(p.qtd) : '-'}</td>
                <td class="text-right" style="font-weight: 700;">${p.fat > 0 ? 'R$ ' + fmtMoedaZero(p.fat) : '-'}</td>
                <td class="text-right">${p.pct > 0 ? fmtPct(p.pct) : '-'}</td>
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
                ctx.font = '800 10.5px Montserrat';
                ctx.fillStyle = item.cor || '#38BDF8';
                const nomeCurto = item.nome.length > 20 ? item.nome.substring(0, 18) + '...' : item.nome;
                ctx.fillText(nomeCurto.toUpperCase(), centerX, centerY - 16);

                // Valor do item selecionado
                ctx.font = '800 20px Montserrat';
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(`R$ ${fmtMoedaZero(item.valor)}`, centerX, centerY + 3);

                // Percentual e pedidos
                ctx.font = '700 11px Montserrat';
                ctx.fillStyle = item.cor || '#38BDF8';
                ctx.fillText(`${pct.toFixed(1).replace('.', ',')}% • ${fmtInt(item.pedidos)} PED`, centerX, centerY + 21);
            } else {
                // Estado Padrão: Total Consolidado
                ctx.font = '800 10.5px Montserrat';
                ctx.fillStyle = '#94A3B8';
                ctx.fillText('TOTAL CONSOLIDADO', centerX, centerY - 16);

                // Valor total faturado em ouro MQ
                ctx.font = '800 21px Montserrat';
                ctx.fillStyle = '#FFD700';
                const total = currentPagamentosGraficoData ? currentPagamentosGraficoData.total_valor : 0;
                ctx.fillText(`R$ ${fmtMoedaZero(total)}`, centerX, centerY + 3);

                // Quantidade total de transações
                ctx.font = '700 11px Montserrat';
                ctx.fillStyle = '#CBD5E1';
                const pedidos = currentPagamentosGraficoData ? currentPagamentosGraficoData.total_pedidos : 0;
                ctx.fillText(`${fmtInt(pedidos)} PEDIDOS • 100%`, centerX, centerY + 21);
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
                borderWidth: 3,
                hoverBorderColor: '#FFFFFF',
                hoverBorderWidth: 2.5,
                hoverOffset: 12,
                borderRadius: 6,
                spacing: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            layout: {
                padding: 10
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
                <td style="padding: 8px 12px;"><span class="tfoot-glow-text">MÉDIA ANUAL</span></td>
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
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: {
                        color: '#38BDF8',
                        font: { family: 'Montserrat', size: 9.5, weight: '600' },
                        callback: (v) => (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)
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
        if (textSync) textSync.textContent = 'Sincronizando...';

        showToast('Sincronização com Oracle Sankhya iniciada em segundo plano...', 'info');

        try {
            const resp = await fetch('/api/sincronizar', { method: 'POST' });
            const data = await resp.json();

            // Inicia polling de status
            const pollInterval = setInterval(async () => {
                try {
                    const stResp = await fetch('/api/sincronizar/status');
                    const stData = await stResp.json();
                    
                    if (stData && stData.sync_state && !stData.sync_state.is_running) {
                        clearInterval(pollInterval);
                        btnSync.disabled = false;
                        btnSync.classList.remove('is-syncing');
                        if (textSync) textSync.textContent = 'Sincronizar';

                        if (stData.sync_state.last_result === 'sucesso') {
                            showToast('Dados sincronizados com sucesso no MariaDB!', 'success');
                            if (stData.ultima_atualizacao) {
                                registrarUltimaAtualizacao(stData.ultima_atualizacao);
                            }
                            // Recarrega o dashboard com dados novos
                            carregarDados(true);
                        } else {
                            showToast('Aviso: Falha na sincronização. Verifique os logs.', 'error');
                        }
                    }
                } catch (pollErr) {
                    console.error('Erro ao verificar status do sync:', pollErr);
                }
            }, 3000);

            // Timeout de segurança para reabilitar botão após 2.5 min
            setTimeout(() => {
                clearInterval(pollInterval);
                btnSync.disabled = false;
                btnSync.classList.remove('is-syncing');
                if (textSync) textSync.textContent = 'Sincronizar';
            }, 150000);

        } catch (e) {
            console.error('Erro ao solicitar sincronização:', e);
            btnSync.disabled = false;
            btnSync.classList.remove('is-syncing');
            if (textSync) textSync.textContent = 'Sincronizar';
            showToast('Erro ao iniciar sincronização.', 'error');
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
