# MQ Professional — Diretoria de E-commerce
## Contexto Executivo, Arquitetura & Estado Atual do Projeto

> **Data de Atualização:** 06/10/2026  
> **Status do Projeto:** Ativo, integrado ao Oracle Sankhya ERP e em produção local/rede interna.  
> **Porta Oficial:** `5200`  
> **Link Local:** [http://127.0.0.1:5200/](http://127.0.0.1:5200/)  
> **Link Rede Interna:** `http://10.81.234.4:5200/` ou `http://MQ71:5200/`  

---

## 1. Como Iniciar o Projeto Após Reiniciar a Máquina

### Opção A — Pelo Arquivo Batch (Recomendado):
Basta dar dois cliques no arquivo:
```
c:\Users\amello\OneDrive - MQHAIR\T.I\PROJETOS BI\ANTIGRAVITY\PROJETOS\Dir.Ecommerce\start.bat
```

### Opção B — Pelo Terminal PowerShell:
```powershell
cd "c:\Users\amello\OneDrive - MQHAIR\T.I\PROJETOS BI\ANTIGRAVITY\PROJETOS\Dir.Ecommerce"
python app.py
```
O servidor inicializará na porta `5200` ouvindo em todas as interfaces (`0.0.0.0:5200`).

---

## 2. Visão Geral da Arquitetura

- **Backend:** Flask (`app.py`), Python 3.12, Pandas, cx_Oracle.
- **Camada de Banco de Dados (`db.py`):** Conexão direta com Oracle Sankhya ERP (`PROD`), utilizando pool de conexões e cache inteligente baseado em intervalos de datas (`ano`, `mes`, `dia_ini`, `dia_fim`).
  - Views / Tabelas consultadas: `TGFCAB`, `TGFITE`, `TGFPRO`, `TGFTOP`, `TGFVEN`, `TGFTPV`, `VMQ_VTEXPED_MKT_POWERBI`.
- **Frontend:**
  - `templates/index.html`: Layout modular e semântico.
  - `static/css/style.css`: Folha de estilo completa seguindo o **MQ Design System Oficial** (Preto `#0B0B0E`, Card `#16161B`, Dourado MQ `#CB9727` / `#E5B244`, Tipografia Montserrat).
  - `static/js/app.js`: Lógica client-side sem frameworks pesados, com Chart.js para gráficos diários e evolução mensal, ordenação interativa de tabelas, controle de árvores hierárquicas e filtros em tempo real.
- **Metas Corporativas:** `metas_ecommerce_2026.py` (Metas v2 consolidadas para cada canal e mês de 2026).

---

## 3. Histórico de Demandas Concluídas e Validadas

### 1. Filtros de Múltipla Escolha
- **Múltiplos Anos e Múltiplos Meses:** Dropdowns com checkboxes customizados permitindo cruzar períodos específicos.
- **Slider de Dias:** Controle deslizante para recortar o período do mês (D1 até D_fim).
- **Filtro de Marca e Canal:** Permite isolar MQ Professional, Parlux, ou canais específicos.

### 2. Ordenação Completa em Todas as Tabelas
- Implementada ordenação bidirecional (maior para menor / menor para maior) em **todas** as colunas de todas as tabelas e matrizes do dashboard, com ícones visuais (`▲` / `▼`).

### 3. Exclusão da Coluna Frete
- Removida a coluna de frete das tabelas conforme regra da Diretoria Comercial (o faturamento líquido já deduz frete e devoluções: `Faturamento Líquido = Venda Bruta - Frete - Devoluções`).

### 4. Duas Matrizes Executivas Lado a Lado (`.matrices-dual-grid`)
- **Matriz 1: Canal de Vendas & Produto (`matrix-sales-table`):**
  - Alternância entre **Macro Canal** (`Marketplace` vs `Sites Oficiais`) e **Canais Individuais** (`Mercado Livre`, `VTEX`, `Shopee`, `Magalu`, `Parlux`).
  - Hierarquia de 3 níveis: Canal/Macro -> Categoria -> Produto/SKU.
  - Métricas: Qtd, Vlr. Faturado, %, Ticket Médio, Evolução vs Mês Anterior (M-1).
- **Matriz 2: Conta / Vendedor & Produto (`matrix-vend-table`):**
  - Agrupamento por conta comercial (`Mercado Livre Full`, `Loja VTEX`, `Shopee`, `Magalu`, `Assistência Técnica`, etc.).
  - Abertura de produtos vinculados à conta.
- Ambas possuem botões rápidos de **Expandir**, **Recolher** e **Busca rápida instantânea**.

### 5. E-commerce Analytics: Cupons VTEX & Conversão GA4
- **Acompanhamento de Cupons (`table-cupons`):** Lista completa de cupons da VTEX com quantidade de pedidos, faturamento gerado, ticket médio e share.
- **Funil & Taxa de Conversão GA4 (`table-conversao`):** Etapas do funil (Sessões, Adições ao Carrinho, Checkouts, Transações, Taxa de Conversão) com badges semânticos de performance.

### 6. Exclusão Total do Gráfico de Pizza
- O gráfico de pizza de vendedores e formas de pagamento foi completamente removido do dashboard (HTML, CSS e JS limpos).

### 7. Nova Matriz: Formas de Pagamento por Canal de Venda (`table-pagamentos-canal`)
- Tabela executiva com hierarquia retrátil:
  - **Mercado Livre:** Processamento via `Mercado Pago (Cartão de Crédito / Pix / Saldo)`.
  - **VTEX (Loja Própria):** Abertura detalhada real por bandeira capturada do Sankhya / Gateway: `Mastercard`, `PIX VTEX`, `Visa`, `Elo`.
  - **Shopee:** `ShopeePay (Cartão / Pix / Boleto Shopee)`.
  - **Magalu:** `MagaluPay (Cartão / Pix / Boleto Luiza)`.
  - **Parlux:** Distribuição faturada / cartão oficial.
- Métricas: Transações/Pedidos, Valor Faturado (R$), Ticket Médio, % no Canal (com mini barra de progresso colorida) e % do Total Geral.

### 8. Harmonização Visual Total com as Cores do Dashboard (MQ Design System)
- Eliminados os blocos e cabeçalhos em azul intenso (`#005A9E`, `#004578`, `#003F73`).
- Aplicado o design escuro e luxuoso oficial da MQ Professional em **todas** as matrizes:
  - Cabeçalho de grupos: `#181820` / `#111116` com destaque dourado (`#E5B244`) e borda lateral em ouro MQ (`#CB9727`).
  - Cabeçalho de colunas: `#111116` com texto em cinza claro e setas de sort em ouro.
  - Linhas Nível 1: Fundo escuro sutil com indicador lateral em ouro.
  - Rodapé Consolidado: Fundo escuro corporativo (`#14141A`) com borda superior dupla em ouro MQ (`#CB9727`).

### 9. Evolução Mensal 2026 Limpa (Sem M-1)
- Na seção **Evolução Mensal — Histórico Consolidado**:
  - Removida a linha tracejada azul de M-1 de todos os 4 gráficos (Itens, Faturamento, Ticket Médio, Devoluções).
  - Removidas as legendas e badges comparativos que não faziam sentido em uma evolução mês a mês.
  - Rodapé atualizado para exibir o **Total Acumulado de 2026** e o **Mês Atual**, proporcionando leitura direta e limpa da curva anual.

### 10. Regra de Negócio: Exclusão de PARLUX da Meta Consolidada (Card "Meta Mês")
- No card de KPIs principais (**Projeção do Mês / Meta Mês**) e na curva acumulada da meta do gráfico **GERAL**:
  - O valor de meta do canal **PARLUX** foi **desconsiderado** da meta total consolidada, somando exclusivamente os canais oficiais do E-commerce (`Mercado Livre`, `VTEX`, `Shopee`, `Magalu`).
  - O canal PARLUX mantém seu card individual e sua meta exibida separadamente no seu gráfico de canal e nas matrizes.
  - Se o usuário filtrar especificamente pelo canal Parlux, a meta exibida passa a ser a meta da Parlux.

### 11. Ajuste Visual: Card 4 Exclusivo de Devoluções
- Título alterado de **"Devoluções & Frete"** para **"Devoluções"**.
- Removida a exibição de frete (`Frete: R$ ...`) e qualquer referência a frete deste card.
- O card agora destaca exclusivamente:
  - Valor Principal: `% de Devolução` (taxa percentual calculada: `devoluções / venda bruta`).
  - Rodapé: `Total Devolvido:` e o valor faturado em devoluções com destaque visual em vermelho suave (`.highlight-text.red`).

### 12. Reordenação dos Gráficos Diários Acumulados
- O card do gráfico **TOTAL E-COMMERCE (Consolidado Geral)** foi reposicionado para a **primeira posição** (antes do Mercado Livre).
- A nova ordem visual dos 6 cards no grid é:
  1. **TOTAL E-COMMERCE**
  2. **MERCADO LIVRE**
  3. **VTEX (LOJA PRÓPRIA)**
  4. **SHOPEE**
  5. **MAGALU**
  6. **PARLUX**

### 13. Quadro de Resultados por Canal: Linha TOTAL e Exclusão de PARLUX
- **Exclusão de PARLUX:** O canal PARLUX foi completamente retirado do Quadro de Resultados por Canal, exibindo exclusivamente os 4 canais oficiais do E-commerce (`MERCADO LIVRE`, `VTEX`, `SHOPEE`, `MAGALU`), com as porcentagens de share redistribuídas proporcionalmente para somar 100%.
- **Linha Total no Rodapé (`tfoot`):** Adicionada linha fixa de total consolidado somando e ponderando todas as colunas:
  - Venda Bruta Total
  - Devoluções Totais e % de Devolução Geral
  - Faturamento Líquido Total
  - Meta Período Total
  - % Atingimento do Período Consolidado com mini barra de progresso colorida
  - Meta Mês Total Consolidada
  - Projeção do Mês Consolidada
  - Quantidade Total de Itens Vendidos
  - Ticket Médio Ponderado Geral
  - Share Total (100,0%) com estilo no padrão oficial MQ Hair (borda em ouro `#CB9727` e fundo escuro `#14141A`).

### 14. Seção Formas de Pagamento Exclusiva VTEX (Gráfico de Pizza & Tabela Detalhada)
- **Remoção dos Demais Canais:** Removidos todos os marketplaces e canais terceiros (`Mercado Livre`, `Shopee`, `Magalu`, `Parlux`) da seção de Formas de Pagamento, mantendo estritamente **VTEX (Loja Própria Oficial)**, uma vez que gateways e bandeiras de pagamento só se aplicam à operação de checkout direto da VTEX.
- **Gráfico de Pizza / Rosquinha Executivo (`#chart-pizza-vtex`):**
  - Implementado gráfico Chart.js (`doughnut` com cutout de 58%) estilizado no padrão oficial do Power BI / MQ Hair.
  - Centro da rosquinha com totalizador dinâmico de faturamento VTEX (`R$ ...` em ouro MQ `#E5B244`).
  - Paleta de cores oficial: `Mastercard` (`#9FD1FF`), `PIX VTEX` (`#F7F300`), `Visa` (`#00FDF5`), `Elo` (`#A855F7`).
  - Tooltips customizados exibindo Faturamento (R$), % de Participação, Quantidade de Pedidos e Ticket Médio.
- **Tabela Executiva de Apoio (`#table-pagamentos-vtex`):**
  - Exibição paralela (layout em grid de 2 colunas) detalhando cada modalidade/bandeira com ícone de cor, modalidade/gateway, transações, faturamento, ticket médio e barra de progresso da participação.
  - Ordenação interativa em todas as colunas e linha de totalizador consolidado no rodapé (`tfoot`).

### 15. Matriz 1: Produtos Mais Vendidos no Geral (Remoção dos Filtros de Marketplace e Site)
- **Remoção de Filtros de Canal/Macro:** Eliminados os botões `Macro Canal` (Marketplace vs Sites Oficiais) e `Canais` da Matriz 1, atendendo ao pedido da Diretoria para exibir diretamente o consolidado de produtos mais vendidos no geral.
- **Visualização Primária — Ranking Geral de Produtos:**
  - Exibe todos os produtos vendidos no e-commerce ordenados pelo faturamento líquido (`1º`, `2º`, `3º`... com badges de destaque em ouro, prata e bronze).
  - Inclui nome do produto, SKU, tag da categoria (`PRANCHA`, `SECADOR`, etc.), quantidade vendida, faturamento líquido (R$), % de share com mini barra de progresso, ticket médio e indicador de evolução vs M-1.
- **Visualização Secundária — Por Categoria:**
  - Alternância rápida para agrupar por Categoria (`PRANCHA`, `SECADOR`, `MODELADOR`...) sem divisão por canais, com expansão/recolhimento interativo.
- **Matriz 2 Mantida Intacta:** A `Matriz: Conta / Vendedor & Produto` (`matrix-vend-table`) foi mantida exatamente como aprovada pelo usuário.

---

## 4. Endpoints Principais da API (`app.py`)

- `GET /`: Página principal do Dashboard E-commerce.
- `GET /api/resumo`: Retorna o resumo completo de vendas, KPIs, gráficos diários, matrizes, pagamentos por canal, cupons e métricas de conversão.
  - Parâmetros: `anos` (lista/int), `meses` (lista/int), `dia_ini`, `dia_fim`, `canal`, `marca`, `force` (bool para limpar cache).
- `GET /api/metas`: Retorna a estrutura de metas por canal e mês.
- `GET /health`: Health-check do serviço.

---

## 5. Estrutura de Arquivos Principais

```
Dir.Ecommerce/
├── app.py                      # Servidor Flask principal e lógica de rotas
├── db.py                       # Consultas Oracle Sankhya e views VTEX
├── config.py                   # Configurações de porta (5200), host e banco
├── metas_ecommerce_2026.py     # Metas orçadas 2026 por canal e mês
├── start.bat                   # Script de inicialização rápida
├── templates/
│   └── index.html              # Template principal com todas as seções
├── static/
│   ├── css/
│   │   └── style.css           # Estilos completos e MQ Design System
│   └── js/
│       └── app.js              # Lógica de renderização, ordenação e filtros
└── CONTEXTO_PROJETO.md         # Este documento de contexto persistente
```

---
*Contexto salvo com sucesso antes do reinício do sistema.*
