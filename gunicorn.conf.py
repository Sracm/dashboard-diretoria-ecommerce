# -*- coding: utf-8 -*-
"""
Configuração do Gunicorn para implantação em Servidor Linux
Diretoria de E-commerce - MQ Professional
"""

import multiprocessing

bind = "0.0.0.0:5200"
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "sync"
threads = 4
timeout = 120
keepalive = 5

accesslog = "-"
errorlog = "-"
loglevel = "info"
proc_name = "mq_dashboard_ecommerce"
