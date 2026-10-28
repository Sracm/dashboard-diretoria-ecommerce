# -*- coding: utf-8 -*-
"""
Módulo de Integração Oficial Google Analytics 4 (GA4 Data API)
Sincroniza sessões diárias do GA4 diretamente para a tabela ecom_ga4_sessoes no MariaDB.
Roda automaticamente a cada 30 minutos integrado ao ETL do E-commerce.
"""

import os
import sys
import logging
from datetime import datetime, timedelta
import pymysql

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from config import Config

logger = logging.getLogger("etl_ga4")

CREDENTIALS_PATH = os.path.join(BASE_DIR, "ga4_credentials.json")
PROPERTY_ID_FILE = os.path.join(BASE_DIR, "ga4_property_id.txt")

def obter_property_id():
    env_id = os.environ.get("GA4_PROPERTY_ID")
    if env_id:
        return env_id.strip()
    
    if os.path.exists(PROPERTY_ID_FILE):
        with open(PROPERTY_ID_FILE, "r", encoding="utf-8") as f:
            val = f.read().strip()
            if val:
                return val
    return None

def obter_conexao_mariadb():
    return pymysql.connect(
        host=Config.MARIADB_HOST,
        port=Config.MARIADB_PORT,
        user=Config.MARIADB_USER,
        password=Config.MARIADB_PASSWORD,
        database=Config.MARIADB_DB,
        charset="utf8mb4",
        autocommit=True
    )

def sincronizar_ga4_mariadb(dias_atras=35):
    """
    Consulta a API do Google Analytics 4 e salva as sessões diárias no MariaDB.
    """
    property_id = obter_property_id()
    if not property_id:
        print("[GA4 ETL] ID da Propriedade GA4 não configurado (ga4_property_id.txt).")
        return False

    if not os.path.exists(CREDENTIALS_PATH):
        print(f"[GA4 ETL] Arquivo de credenciais JSON não encontrado em: {CREDENTIALS_PATH}")
        return False

    try:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.analytics.data_v1beta.types import (
            DateRange,
            Dimension,
            Metric,
            RunReportRequest,
        )

        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = CREDENTIALS_PATH
        client = BetaAnalyticsDataClient()

        prop_str = property_id if property_id.startswith("properties/") else f"properties/{property_id}"
        
        data_fim = datetime.now().strftime("%Y-%m-%d")
        data_ini = (datetime.now() - timedelta(days=dias_atras)).strftime("%Y-%m-%d")

        print(f"[GA4 ETL] Consultando GA4 ({prop_str}) no período de {data_ini} a {data_fim}...")

        request = RunReportRequest(
            property=prop_str,
            dimensions=[Dimension(name="date")],
            metrics=[Metric(name="sessions")],
            date_ranges=[DateRange(start_date=data_ini, end_date=data_fim)],
        )

        response = client.run_report(request)
        registros = []

        for row in response.rows:
            data_raw = row.dimension_values[0].value  # YYYYMMDD
            sessoes_val = int(row.metric_values[0].value)
            
            dt = datetime.strptime(data_raw, "%Y%m%d")
            data_fmt = dt.strftime("%Y-%m-%d")
            ano = dt.year
            mes = dt.month
            dia = dt.day

            registros.append((data_fmt, ano, mes, dia, sessoes_val, "GA4_API"))

        if not registros:
            print("[GA4 ETL] Nenhuma linha retornada pelo GA4.")
            return True

        conn = obter_conexao_mariadb()
        try:
            with conn.cursor() as cur:
                sql = """
                INSERT INTO ecom_ga4_sessoes (data, ano, mes, dia, sessoes, fonte)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    sessoes = VALUES(sessoes),
                    fonte = VALUES(fonte),
                    atualizado_em = NOW();
                """
                cur.executemany(sql, registros)
            print(f"[GA4 ETL] Sucesso! {len(registros)} dias sincronizados com o GA4 no MariaDB.")
            return True
        finally:
            conn.close()

    except Exception as e:
        print(f"[GA4 ETL] Erro ao sincronizar com Google Analytics: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    sincronizar_ga4_mariadb(dias_atras=35)
