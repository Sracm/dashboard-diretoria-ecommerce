# -*- coding: utf-8 -*-
"""
ETL E-commerce MQ Professional
Sincroniza vendas e pedidos VTEX do Oracle Sankhya para o MariaDB (ecommerce_performance).
"""
import os
import sys
import time
import calendar
import argparse
import logging
from datetime import datetime
from logging.handlers import RotatingFileHandler
import pandas as pd
import pymysql
import oracledb

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from config import Config

LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "etl_ecommerce.log")

log = logging.getLogger("etl_ecommerce")
log.setLevel(logging.INFO)
if not log.handlers:
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh = RotatingFileHandler(LOG_FILE, maxBytes=10*1024*1024, backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt)
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    log.addHandler(fh)
    log.addHandler(ch)

def get_oracle_connection():
    conn = oracledb.connect(
        user=Config.ORACLE_USER,
        password=Config.ORACLE_PASSWORD,
        dsn=Config.ORACLE_DSN
    )
    with conn.cursor() as cur:
        cur.execute("ALTER SESSION SET CURRENT_SCHEMA = SANKHYA")
    return conn

def get_mariadb_connection():
    return pymysql.connect(
        host=Config.MARIADB_HOST,
        port=Config.MARIADB_PORT,
        user=Config.MARIADB_USER,
        password=Config.MARIADB_PASSWORD,
        database=Config.MARIADB_DB,
        charset="utf8mb4",
        autocommit=False
    )

def classificar_canal(apelido: str, marca: str) -> str:
    apelido_str = str(apelido or '').upper()
    marca_str = str(marca or '').upper()
    if 'PARLUX' in marca_str:
        return 'PARLUX'
    if 'MERC' in apelido_str:
        return 'MERCADO LIVRE'
    if 'VTEX' in apelido_str or 'PROPRIA' in apelido_str:
        return 'VTEX'
    if 'SHOPEE' in apelido_str:
        return 'SHOPEE'
    if 'MAGALU' in apelido_str:
        return 'MAGALU'
    return 'OUTROS'

def extrair_vendas_oracle(conn_oracle, dt_ini: str, dt_fim: str) -> pd.DataFrame:
    sql = f"""
    SELECT 
        CAB.NUNOTA,
        CAB.DTENTSAI,
        CAB.DTNEG,
        EXTRACT(YEAR FROM CAB.DTENTSAI) AS ANO,
        EXTRACT(MONTH FROM CAB.DTENTSAI) AS MES,
        EXTRACT(DAY FROM CAB.DTENTSAI) AS DIA,
        CAB.CODTIPOPER,
        CAB.CODEMP,
        CAB.CODVEND,
        VEN.APELIDO AS VENDEDOR,
        CASE 
            WHEN GRU.DESCRGRUPOPROD LIKE '%PARLUX%' THEN 'PARLUX' 
            ELSE 'MQ' 
        END AS MARCA,
        GRU.DESCRGRUPOPROD AS GRUPO,
        ITE.CODPROD,
        PRO.DESCRPROD AS PRODUTO,
        PRO.REFERENCIA AS SKU_MQ,
        ((ITE.VLRTOT - ITE.VLRDESC - ITE.VLRREPRED + ITE.VLRSUBST + ITE.VLRIPI) * VCA.INDITENSBRUTO) * CASE WHEN TOP.BONIFICACAO = 'S' THEN 0 ELSE 1 END * DECODE(CAB.TIPMOV,'D',0,'V',1) AS VALORVENDA,
        CASE WHEN CAB.CODEMP <> 501 AND NVL (TOP.BONIFICACAO, 'N') = 'N' THEN (ITE.QTDNEG) END * DECODE(CAB.TIPMOV,'D',0,'V',1) AS QTDVENDIDA,
        CASE WHEN CAB.CODEMP <> 501 AND NVL (TOP.BONIFICACAO, 'N') = 'N' THEN (F_OBTEM_CUSTO_MQ (CAB.CODEMP, ITE.CODPROD, CAB.DTNEG, CAB.DTNEG) * ITE.QTDNEG) END * DECODE(CAB.TIPMOV,'D',0,'V',1) * (CASE WHEN CAB.CODTIPOPER=11000 THEN 0 ELSE 1 END) AS CUSTOGER,
        F_OBTEM_FRETEITE(CAB.NUNOTA,ITE.SEQUENCIA) AS FRETE,
        ((ITE.VLRTOT - ITE.VLRDESC - ITE.VLRREPRED + ITE.VLRSUBST + ITE.VLRIPI) * VCA.INDITENSBRUTO) * CASE WHEN TOP.BONIFICACAO = 'S' THEN 0 ELSE 1 END * DECODE(CAB.TIPMOV,'D',1,'V',0) AS VALORDEVOLUCAO,
        CAB.AD_PEDIDO_ECOMMERCE AS RASTREIO_PEDIDO
    FROM TGFCAB CAB
         JOIN TGFITE ITE ON CAB.NUNOTA = ITE.NUNOTA
         JOIN TGFTOP TOP ON CAB.CODTIPOPER = TOP.CODTIPOPER AND CAB.DHTIPOPER = TOP.DHALTER
         JOIN TGFPAR PAR ON CAB.CODPARC = PAR.CODPARC
         JOIN TGFPRO PRO ON PRO.CODPROD = ITE.CODPROD
         LEFT JOIN TGFGRU GRU ON PRO.CODGRUPOPROD = GRU.CODGRUPOPROD
         JOIN VGFCAB VCA ON CAB.NUNOTA = VCA.NUNOTA
         LEFT JOIN TGFVEN VEN ON CAB.CODVEND = VEN.CODVEND
    WHERE CAB.TIPMOV IN ('V', 'D')
      AND CAB.STATUSNOTA = 'L' 
      AND (TOP.GOLSINAL = -1 OR TOP.BONIFICACAO='S')
      AND (NOT EXISTS(SELECT 1 FROM TGFVAR VAR WHERE VAR.NUNOTA = ITE.NUNOTA AND VAR.NUNOTAORIG = VAR.NUNOTA AND VAR.SEQUENCIAORIG = ITE.SEQUENCIA))
      AND (TOP.ATUALFINTERC <> 'N' OR TOP.ATUALESTTERC = 'N' OR ITE.TERCEIROS <> 'S')
      AND ITE.SEQUENCIA > 0    
      AND TOP.GOLDEV IN (1,-1)
      AND (VEN.CODGER = 7193 OR VEN.CODVEND = 7193 OR CAB.AD_PEDIDO_ECOMMERCE IS NOT NULL)
      AND CAB.DTENTSAI >= TO_DATE('{dt_ini}','YYYY-MM-DD')
      AND CAB.DTENTSAI <= TO_DATE('{dt_fim}','YYYY-MM-DD')
    """
    df = pd.read_sql(sql, conn_oracle)
    if not df.empty:
        df['CANAL'] = df.apply(lambda r: classificar_canal(r['VENDEDOR'], r['MARCA']), axis=1)
        for col in ['VALORVENDA', 'QTDVENDIDA', 'CUSTOGER', 'FRETE', 'VALORDEVOLUCAO']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
        df['FAT_LIQUIDO'] = df['VALORVENDA'] - df['FRETE'] - df['VALORDEVOLUCAO']
    return df

def extrair_vtex_oracle(conn_oracle, dt_ini: str, dt_fim: str) -> pd.DataFrame:
    sql = f"""
    SELECT 
        v.PEDIDO_VTEX,
        v.CREATION_DATE,
        EXTRACT(YEAR FROM v.CREATION_DATE) AS ANO,
        EXTRACT(MONTH FROM v.CREATION_DATE) AS MES,
        TO_NUMBER(TO_CHAR(v.CREATION_DATE, 'DD')) AS DIA,
        NVL(v.FORMA_PAGAMENTO, 'Outros') AS FORMA_PAGAMENTO,
        NVL(UPPER(TRIM(v.COUPON)), '(Sem Cupom)') AS COUPON,
        v.TOTAL_VALUE,
        v.QUANTITY,
        v.SKU_SELLING_PRICE,
        (v.QUANTITY * v.SKU_SELLING_PRICE) AS VALOR_ITEM,
        NVL(G.DESCRGRUPOPROD, 'OUTROS') AS CATEGORIA
    FROM VMQ_VTEXPED_MKT_POWERBI v
    LEFT JOIN TGFPRO P ON P.REFERENCIA = v.REFERENCE_CODE
    LEFT JOIN TGFGRU G ON G.CODGRUPOPROD = (CASE WHEN LENGTH(TO_CHAR(P.codgrupoprod))=7 THEN RPAD(SUBSTR(TO_CHAR(P.codgrupoprod),1,4),7,'0') ELSE RPAD(SUBSTR(TO_CHAR(P.codgrupoprod),1,5),8,'0') END)
    WHERE v.CREATION_DATE >= TO_DATE('{dt_ini}', 'YYYY-MM-DD')
      AND v.CREATION_DATE < TO_DATE('{dt_fim}', 'YYYY-MM-DD')
      AND v.STATUS = 'Faturado'
    """
    try:
        df = pd.read_sql(sql, conn_oracle)
        return df
    except Exception as e:
        log.warning("Consulta VMQ_VTEXPED_MKT_POWERBI: %s", e)
        return pd.DataFrame()

def sincronizar_metas_mariadb(conn_maria):
    metas_path = os.path.join(BASE_DIR, "metas_ecommerce_2026.json")
    if not os.path.exists(metas_path):
        return
    import json
    with open(metas_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    lista_metas = data.get("metas_ecommerce_2026", [])
    if not lista_metas:
        return
    
    with conn_maria.cursor() as cur:
        for m in lista_metas:
            ano = m["ano"]
            mes = m["mes"]
            vendedor = m["vendedor"]
            vlr_dia = float(m["vlr_dia"])
            dias = int(m["dias_mes"])
            acum = 0.0
            for d in range(1, dias + 1):
                acum += vlr_dia
                sql = """
                INSERT INTO ecom_metas (ano, mes, dia, marca, meta_diaria, meta_acumulada)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE meta_diaria = VALUES(meta_diaria), meta_acumulada = VALUES(meta_acumulada);
                """
                cur.execute(sql, (ano, mes, d, vendedor, vlr_dia, acum))
    conn_maria.commit()
    log.info("Metas 2026 sincronizadas no MariaDB com sucesso.")

def carregar_mes_mariadb(conn_maria, ano: int, mes: int, df_vendas: pd.DataFrame, df_vtex: pd.DataFrame):
    def to_float(val, default=0.0):
        if pd.isna(val) or val is None or str(val).lower() == 'nan':
            return default
        try:
            return float(val)
        except Exception:
            return default

    def to_int(val, default=None):
        if pd.isna(val) or val is None or str(val).lower() == 'nan':
            return default
        try:
            return int(float(val))
        except Exception:
            return default

    with conn_maria.cursor() as cur:
        # 1. Limpa o mês específico para carga idempotente
        cur.execute("DELETE FROM ecom_vendas_data WHERE ano = %s AND mes = %s;", (ano, mes))
        
        # 2. Insere vendas
        if not df_vendas.empty:
            registros = []
            for _, r in df_vendas.iterrows():
                dtentsai_str = r['DTENTSAI'].strftime('%Y-%m-%d') if pd.notnull(r['DTENTSAI']) else None
                dtneg_str = r['DTNEG'].strftime('%Y-%m-%d') if pd.notnull(r['DTNEG']) else None
                registros.append((
                    int(r['NUNOTA']), dtentsai_str, dtneg_str, int(r['ANO']), int(r['MES']), int(r['DIA']),
                    to_int(r.get('CODTIPOPER')),
                    to_int(r.get('CODEMP')),
                    to_int(r.get('CODVEND')),
                    str(r['VENDEDOR']) if pd.notnull(r['VENDEDOR']) else None,
                    str(r['MARCA']) if pd.notnull(r['MARCA']) else None,
                    str(r['GRUPO']) if pd.notnull(r['GRUPO']) else None,
                    to_int(r.get('CODPROD')),
                    str(r['PRODUTO']) if pd.notnull(r['PRODUTO']) else None,
                    str(r['SKU_MQ']) if pd.notnull(r['SKU_MQ']) else None,
                    str(r['CANAL']),
                    to_float(r.get('VALORVENDA')), to_float(r.get('QTDVENDIDA')), to_float(r.get('CUSTOGER')),
                    to_float(r.get('FRETE')), to_float(r.get('VALORDEVOLUCAO')), to_float(r.get('FAT_LIQUIDO')),
                    str(r['RASTREIO_PEDIDO']) if pd.notnull(r.get('RASTREIO_PEDIDO')) else None
                ))
            
            sql_insert_vendas = """
            INSERT INTO ecom_vendas_data (
                nunota, dtentsai, dtneg, ano, mes, dia, codtipoper, codemp, codvend, vendedor,
                marca, grupo, codprod, produto, sku_mq, canal, valorvenda, qtdvendida, custoger,
                frete, valordevolucao, fat_liquido, rastreio_pedido
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s
            );
            """
            cur.executemany(sql_insert_vendas, registros)
            log.info("Inseridas %d linhas de vendas para %02d/%04d", len(registros), mes, ano)

        # 3. Insere pedidos VTEX
        if not df_vtex.empty:
            cur.execute("DELETE FROM ecom_pedidos_vtex WHERE ano = %s AND mes = %s;", (ano, mes))
            regs_vtex = []
            for _, r in df_vtex.iterrows():
                creation_str = r['CREATION_DATE'].strftime('%Y-%m-%d %H:%M:%S') if pd.notnull(r['CREATION_DATE']) else None
                regs_vtex.append((
                    str(r['PEDIDO_VTEX']), creation_str, int(r['ANO']), int(r['MES']), int(r['DIA']),
                    str(r['FORMA_PAGAMENTO']), str(r['COUPON']), 
                    to_float(r.get('TOTAL_VALUE')),
                    to_int(r.get('QUANTITY'), default=0), 
                    to_float(r.get('VALOR_ITEM')), 
                    str(r['CATEGORIA'])
                ))
            sql_insert_vtex = """
            INSERT INTO ecom_pedidos_vtex (
                pedido_vtex, creation_date, ano, mes, dia, forma_pagamento, coupon, total_value, quantity, valor_item, categoria
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """
            cur.executemany(sql_insert_vtex, regs_vtex)
            log.info("Inseridas %d linhas de pedidos VTEX para %02d/%04d", len(regs_vtex), mes, ano)

    conn_maria.commit()

def executar_etl(ano: int = None, mes: int = None, desde: str = None):
    inicio_dt = datetime.now()
    log.info("=======================================================")
    log.info("Iniciando ETL E-commerce Sankhya -> MariaDB")
    log.info("=======================================================")
    
    conn_oracle = None
    conn_maria = None
    total_vendas = 0
    total_pedidos = 0
    status = "sucesso"
    erro_msg = None
    tipo_carga = "incremental" if not desde else "completo"
    
    try:
        conn_oracle = get_oracle_connection()
        conn_maria = get_mariadb_connection()
        
        # 1. Sincroniza Metas
        sincronizar_metas_mariadb(conn_maria)
        
        # 2. Determina meses a processar
        agora = datetime.now()
        meses_processar = []
        
        if desde:
            ano_ini, mes_ini = map(int, desde.split("-"))
            for a in range(ano_ini, agora.year + 1):
                m_inicio = mes_ini if a == ano_ini else 1
                m_fim = agora.month if a == agora.year else 12
                for m in range(m_inicio, m_fim + 1):
                    meses_processar.append((a, m))
        elif ano and mes:
            meses_processar.append((ano, mes))
        elif ano:
            m_fim = agora.month if ano == agora.year else 12
            for m in range(1, m_fim + 1):
                meses_processar.append((ano, m))
        else:
            # Incremental padrão: ano atual inteiro para manter tudo 100% alinhado
            for m in range(1, agora.month + 1):
                meses_processar.append((agora.year, m))
            
        periodo_ini_str = f"{meses_processar[0][0]}-{meses_processar[0][1]:02d}-01"
        _, max_d = calendar.monthrange(meses_processar[-1][0], meses_processar[-1][1])
        periodo_fim_str = f"{meses_processar[-1][0]}-{meses_processar[-1][1]:02d}-{max_d:02d}"
        
        for a_proc, m_proc in meses_processar:
            _, max_d_m = calendar.monthrange(a_proc, m_proc)
            d_ini = f"{a_proc}-{m_proc:02d}-01"
            d_fim_vtex = f"{a_proc+1}-01-01" if m_proc == 12 else f"{a_proc}-{m_proc+1:02d}-01"
            d_fim_vendas = f"{a_proc}-{m_proc:02d}-{max_d_m:02d}"
            log.info("Processando período: %02d/%04d...", m_proc, a_proc)
            
            df_v = extrair_vendas_oracle(conn_oracle, d_ini, d_fim_vendas)
            df_x = extrair_vtex_oracle(conn_oracle, d_ini, d_fim_vtex)
            
            carregar_mes_mariadb(conn_maria, a_proc, m_proc, df_v, df_x)
            total_vendas += len(df_v)
            total_pedidos += len(df_x)

        # Grava auditoria em etl_status
        fim_dt = datetime.now()
        with conn_maria.cursor() as cur:
            cur.execute("""
            INSERT INTO etl_status (inicio, fim, tipo, periodo_ini, periodo_fim, linhas_vendas, linhas_pedidos, status, erro)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
            """, (
                inicio_dt.strftime("%Y-%m-%d %H:%M:%S"),
                fim_dt.strftime("%Y-%m-%d %H:%M:%S"),
                tipo_carga,
                periodo_ini_str,
                periodo_fim_str,
                total_vendas,
                total_pedidos,
                status,
                erro_msg
            ))
        conn_maria.commit()
        log.info("ETL concluído com sucesso em %.2f segundos! Total Vendas: %d, Total VTEX: %d", (fim_dt - inicio_dt).total_seconds(), total_vendas, total_pedidos)

    except Exception as e:
        status = "erro"
        erro_msg = str(e)
        log.error("Erro durante execução do ETL: %s", e, exc_info=True)
        if conn_maria:
            try:
                conn_maria.rollback()
                with conn_maria.cursor() as cur:
                    cur.execute("""
                    INSERT INTO etl_status (inicio, fim, tipo, periodo_ini, periodo_fim, linhas_vendas, linhas_pedidos, status, erro)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """, (
                        inicio_dt.strftime("%Y-%m-%d %H:%M:%S"),
                        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        tipo_carga, None, None, total_vendas, total_pedidos, status, erro_msg
                    ))
                conn_maria.commit()
            except Exception:
                pass
        raise
    finally:
        if conn_oracle:
            conn_oracle.close()
        if conn_maria:
            conn_maria.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ETL E-commerce Sankhya -> MariaDB")
    parser.add_argument("--ano", type=int, help="Ano específico a processar")
    parser.add_argument("--mes", type=int, help="Mês específico a processar")
    parser.add_argument("--desde", type=str, help="Carga completa a partir de AAAA-MM")
    args = parser.parse_args()
    
    executar_etl(ano=args.ano, mes=args.mes, desde=args.desde)
