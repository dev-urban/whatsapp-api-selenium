#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WhatsApp API - Selenium Bot
API para envio de mensagens via WhatsApp Web
"""

from flask import Flask, request, jsonify, Response
from functools import wraps
import os
import time
import random
import threading
import requests
from io import BytesIO
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException

app = Flask(__name__)

# Token de autorização (substitua pelo seu)
BEARER_TOKEN = os.getenv('BEARER_TOKEN', 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyOS8wNy8yMDI0IiwibmFtZSI6IlVyYmFuIENvbXBhbnkifQ.msPAj8cbZ5JJLREax8WTjNcz7i6xLfPBflp8Px64TIHT7ve6OLmLLRzVjW-0EfvGkaH9aqWFh5XyQcwkCHVBHw')

# Cliente WhatsApp global
whatsapp_client = None
client_lock = threading.Lock()


class WhatsAppClient:
    def __init__(self):
        self.driver = None
        self.wait = None
        self.is_ready = False

    def iniciar(self):
        """Inicia o Chrome e WhatsApp Web"""
        print("🚀 Iniciando Chrome...")

        # Modo headless apenas se variável de ambiente estiver definida
        headless_mode = os.getenv('HEADLESS', 'true').lower() == 'true'

        chrome_options = Options()
        if headless_mode:
            chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--user-data-dir=/tmp/chrome_profile")
        chrome_options.add_experimental_option("excludeSwitches", ["enable-logging"])

        self.driver = webdriver.Chrome(options=chrome_options)
        self.wait = WebDriverWait(self.driver, 30)

        self.driver.get("https://web.whatsapp.com")

        if headless_mode:
            print("📱 WhatsApp Web carregado (headless)")
            print("⚠️  Para fazer login via SSH, use: HEADLESS=false python app.py")
        else:
            print("📱 WhatsApp Web carregado - Janela visível para login!")
            print("🔐 Escaneie o QR Code agora...")

    def verificar_login(self):
        """Verifica se está logado"""
        try:
            self.wait.until(EC.presence_of_element_located((
                By.XPATH, '//div[@contenteditable="true"][@data-tab="3"]'
            )))
            self.is_ready = True
            print("✅ WhatsApp pronto!")
            return True
        except TimeoutException:
            print("⏳ Aguardando login no WhatsApp...")
            return False

    def digitar_como_humano(self, elemento, texto):
        """Simula digitação humana com delays aleatórios"""
        for char in texto:
            elemento.send_keys(char)
            # Delay aleatório entre 50-150ms por caractere
            time.sleep(random.uniform(0.05, 0.15))

    def buscar_contato(self, numero):
        """Busca um contato pelo número"""
        try:
            # Normaliza o número (remove @s.whatsapp.net se tiver)
            numero_limpo = numero.replace('@s.whatsapp.net', '').replace('@c.us', '')

            # Clica na caixa de pesquisa
            search_box = self.wait.until(EC.presence_of_element_located((
                By.XPATH, '//div[@contenteditable="true"][@data-tab="3"]'
            )))
            search_box.click()
            time.sleep(0.5)

            # Limpa e digita o número
            search_box.clear()
            self.digitar_como_humano(search_box, numero_limpo)
            time.sleep(2)

            # Clica no primeiro resultado
            try:
                contato = self.wait.until(EC.presence_of_element_located((
                    By.XPATH, f'//span[@title="{numero_limpo}"]'
                )))
            except:
                # Tenta clicar no primeiro resultado da lista
                contato = self.wait.until(EC.presence_of_element_located((
                    By.XPATH, '//div[@id="pane-side"]//div[@role="listitem"][1]'
                )))

            contato.click()
            time.sleep(1.5)
            return True

        except (TimeoutException, NoSuchElementException) as e:
            print(f"❌ Erro ao buscar contato {numero}: {e}")
            return False

    def enviar_mensagem(self, numero, texto):
        """Envia mensagem de texto para um número"""
        try:
            if not self.buscar_contato(numero):
                return {"success": False, "error": "Contato não encontrado"}

            # Localiza a caixa de mensagem
            msg_box = self.wait.until(EC.presence_of_element_located((
                By.XPATH, '//div[@contenteditable="true"][@data-tab="10"]'
            )))

            # Digita a mensagem com efeito humano
            linhas = texto.split('\n')
            for i, linha in enumerate(linhas):
                self.digitar_como_humano(msg_box, linha)
                if i < len(linhas) - 1:
                    msg_box.send_keys(Keys.SHIFT + Keys.ENTER)

            time.sleep(random.uniform(0.3, 0.7))  # Pausa antes de enviar

            # Envia a mensagem
            msg_box.send_keys(Keys.ENTER)
            time.sleep(1)

            print(f"✅ Mensagem enviada para {numero}")
            return {"success": True, "to": numero}

        except Exception as e:
            print(f"❌ Erro ao enviar mensagem: {e}")
            return {"success": False, "error": str(e)}

    def enviar_imagem(self, numero, image_url, caption=None):
        """Envia imagem para um número"""
        try:
            if not self.buscar_contato(numero):
                return {"success": False, "error": "Contato não encontrado"}

            # Baixa a imagem
            response = requests.get(image_url, timeout=10)
            if response.status_code != 200:
                return {"success": False, "error": "Erro ao baixar imagem"}

            # Salva temporariamente
            temp_path = "/tmp/whatsapp_image.jpg"
            with open(temp_path, 'wb') as f:
                f.write(response.content)

            # Clica no botão de anexar
            attach_btn = self.wait.until(EC.presence_of_element_located((
                By.XPATH, '//div[@title="Anexar"]'
            )))
            attach_btn.click()
            time.sleep(0.5)

            # Clica em enviar foto/vídeo
            photo_btn = self.wait.until(EC.presence_of_element_located((
                By.XPATH, '//input[@accept="image/*,video/mp4,video/3gpp,video/quicktime"]'
            )))
            photo_btn.send_keys(temp_path)
            time.sleep(2)

            # Adiciona legenda se fornecida
            if caption:
                caption_box = self.wait.until(EC.presence_of_element_located((
                    By.XPATH, '//div[@contenteditable="true"][@data-tab="10"]'
                )))
                self.digitar_como_humano(caption_box, caption)
                time.sleep(0.5)

            # Envia
            send_btn = self.wait.until(EC.presence_of_element_located((
                By.XPATH, '//span[@data-icon="send"]'
            )))
            send_btn.click()
            time.sleep(2)

            # Remove arquivo temporário
            os.remove(temp_path)

            print(f"✅ Imagem enviada para {numero}")
            return {"success": True, "to": numero}

        except Exception as e:
            print(f"❌ Erro ao enviar imagem: {e}")
            return {"success": False, "error": str(e)}

    def fechar(self):
        """Fecha o navegador"""
        if self.driver:
            self.driver.quit()


# Decorador para autenticação
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')

        if not auth_header:
            return jsonify({"error": "Token de autorização não fornecido"}), 401

        try:
            token = auth_header.split(' ')[1]  # Remove "Bearer "
            if token != BEARER_TOKEN:
                return jsonify({"error": "Token inválido"}), 401
        except:
            return jsonify({"error": "Formato de token inválido"}), 401

        return f(*args, **kwargs)
    return decorated_function


# Rotas da API
@app.route('/health', methods=['GET'])
def health():
    """Verifica status da API"""
    status = {
        "status": "online",
        "whatsapp_ready": whatsapp_client.is_ready if whatsapp_client else False
    }
    return jsonify(status), 200


@app.route('/rest/sendMessage/<instance>/text', methods=['POST'])
@require_auth
def send_text_message(instance):
    """
    Envia mensagem de texto
    Body: {
        "messageData": {
            "to": "5511999999999@s.whatsapp.net",
            "text": "Mensagem aqui"
        }
    }
    """
    try:
        data = request.json
        message_data = data.get('messageData', {})

        to = message_data.get('to')
        text = message_data.get('text')

        if not to or not text:
            return jsonify({"error": "Campos 'to' e 'text' são obrigatórios"}), 400

        if not whatsapp_client or not whatsapp_client.is_ready:
            return jsonify({"error": "WhatsApp não está pronto"}), 503

        with client_lock:
            result = whatsapp_client.enviar_mensagem(to, text)

        if result['success']:
            return jsonify({"status": "success", "data": result}), 200
        else:
            return jsonify({"status": "error", "message": result.get('error')}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/rest/sendMessage/<instance>/image', methods=['POST'])
@require_auth
def send_image_message(instance):
    """
    Envia imagem
    Body: {
        "messageData": {
            "to": "5511999999999@s.whatsapp.net",
            "imageUrl": "https://example.com/image.jpg",
            "caption": "Legenda opcional"
        }
    }
    """
    try:
        data = request.json
        message_data = data.get('messageData', {})

        to = message_data.get('to')
        image_url = message_data.get('imageUrl')
        caption = message_data.get('caption')

        if not to or not image_url:
            return jsonify({"error": "Campos 'to' e 'imageUrl' são obrigatórios"}), 400

        if not whatsapp_client or not whatsapp_client.is_ready:
            return jsonify({"error": "WhatsApp não está pronto"}), 503

        with client_lock:
            result = whatsapp_client.enviar_imagem(to, image_url, caption)

        if result['success']:
            return jsonify({"status": "success", "data": result}), 200
        else:
            return jsonify({"status": "error", "message": result.get('error')}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/qr', methods=['GET'])
def get_qr():
    """Retorna screenshot da página para ver o QR code"""
    if not whatsapp_client:
        return jsonify({"message": "Cliente não inicializado"}), 503

    if whatsapp_client.is_ready:
        return jsonify({"message": "WhatsApp já está conectado"}), 200

    try:
        # Tira screenshot da página
        screenshot = whatsapp_client.driver.get_screenshot_as_png()

        # Retorna como imagem
        return Response(screenshot, mimetype='image/png')
    except Exception as e:
        return jsonify({"error": f"Erro ao capturar QR Code: {str(e)}"}), 500


def inicializar_whatsapp():
    """Inicializa o cliente WhatsApp em background"""
    global whatsapp_client

    whatsapp_client = WhatsAppClient()
    whatsapp_client.iniciar()

    # Loop para verificar login
    max_tentativas = 60  # 5 minutos
    for i in range(max_tentativas):
        if whatsapp_client.verificar_login():
            break
        time.sleep(5)

    if not whatsapp_client.is_ready:
        print("⚠️ WhatsApp não foi conectado após 5 minutos")


if __name__ == '__main__':
    # Inicia WhatsApp em thread separada
    whatsapp_thread = threading.Thread(target=inicializar_whatsapp, daemon=True)
    whatsapp_thread.start()

    # Aguarda um pouco antes de iniciar o servidor
    time.sleep(3)

    # Inicia servidor Flask
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
