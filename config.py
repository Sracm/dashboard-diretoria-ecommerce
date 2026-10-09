import os
from dotenv import load_dotenv

# Carrega variáveis do arquivo .env se existir
load_dotenv()

class Config:
    ORACLE_USER = os.getenv("ORACLE_USER", "POWERBI")
    ORACLE_PASSWORD = os.getenv("ORACLE_PASSWORD", "@Yzmpq100#")
    ORACLE_DSN = os.getenv("ORACLE_DSN", "192.168.1.55/ORCL")
    
    PORT = int(os.getenv("PORT", 5200))
    HOST = os.getenv("HOST", "0.0.0.0")
    DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")
    TEMPLATES_AUTO_RELOAD = True
    SECRET_KEY = os.getenv("SECRET_KEY", "mq_ecommerce_secret_key_2026")
    
    CACHE_TTL_REALTIME = int(os.getenv("CACHE_TTL_REALTIME", 600))  # 10 min
    CACHE_TTL_HISTORIC = int(os.getenv("CACHE_TTL_HISTORIC", 86400)) # 24 horas
    
        # MariaDB (Banco de dados de alta performance)
    MARIADB_HOST = os.getenv("MARIADB_HOST", "192.168.1.22")
    MARIADB_PORT = int(os.getenv("MARIADB_PORT", 3306))
    MARIADB_USER = os.getenv("MARIADB_USER", "antonio")
    MARIADB_PASSWORD = os.getenv("MARIADB_PASSWORD", "yzmpq100")
    MARIADB_DB = os.getenv("MARIADB_DB", "ecommerce_performance")

    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    CACHE_DIR = os.path.join(BASE_DIR, "cache")
