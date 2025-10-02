#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para fazer login no WhatsApp via SSH
Execute este script quando conectado via SSH ao Railway
"""

import os
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException

print("""
╔══════════════════════════════════════════╗
║   WhatsApp Login Helper via SSH          ║
║   Execute via SSH no Railway             ║
╚══════════════════════════════════════════╝
""")

print("🚀 Iniciando Chrome...")

chrome_options = Options()
# NÃO usar headless para ver o QR Code
chrome_options.add_argument("--no-sandbox")
chrome_options.add_argument("--disable-dev-shm-usage")
chrome_options.add_argument("--disable-gpu")
chrome_options.add_argument("--window-size=1920,1080")
chrome_options.add_argument("--user-data-dir=/tmp/chrome_profile")
chrome_options.add_experimental_option("excludeSwitches", ["enable-logging"])

print("📱 Abrindo WhatsApp Web...")
driver = webdriver.Chrome(options=chrome_options)
wait = WebDriverWait(driver, 120)

driver.get("https://web.whatsapp.com")

print("\n" + "="*50)
print("🔐 INSTRUÇÕES:")
print("="*50)
print("1. Uma janela do Chrome foi aberta")
print("2. Você verá o QR Code na tela do servidor")
print("3. Escaneie com seu WhatsApp")
print("4. Aguarde até aparecer 'Login realizado!'")
print("="*50 + "\n")

# Aguarda login
print("⏳ Aguardando login...")
print("   (Timeout: 2 minutos)\n")

try:
    # Aguarda a caixa de pesquisa aparecer (indica que logou)
    wait.until(EC.presence_of_element_located((
        By.XPATH, '//div[@contenteditable="true"][@data-tab="3"]'
    )))

    print("\n" + "="*50)
    print("✅ LOGIN REALIZADO COM SUCESSO!")
    print("="*50)
    print("\nA sessão foi salva em: /tmp/chrome_profile/")
    print("Agora você pode fechar este script e iniciar a API normalmente.")
    print("\nPressione Ctrl+C quando quiser sair...")

    # Mantém o navegador aberto
    while True:
        time.sleep(1)

except TimeoutException:
    print("\n❌ Timeout! O login não foi completado em 2 minutos.")
    print("Execute o script novamente se necessário.\n")

except KeyboardInterrupt:
    print("\n\n👋 Encerrando...")

finally:
    driver.quit()
    print("✅ Sessão salva! Você já pode usar a API.\n")
