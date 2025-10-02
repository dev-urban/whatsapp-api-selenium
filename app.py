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
import uuid
from queue import Queue
from datetime import datetime
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

# Fila de mensagens
message_queue = Queue()
queue_status = {}  # Armazena status de cada mensagem na fila


class WhatsAppClient:
    def __init__(self):
        self.driver = None
        self.wait = None
        self.is_ready = False
        self.initialization_error = None

    def iniciar(self):
        """Inicia o Chrome e WhatsApp Web"""
        try:
            print("🚀 Iniciando Chrome...")

            # Modo headless apenas se variável de ambiente estiver definida
            headless_mode = os.getenv('HEADLESS', 'true').lower() == 'true'

            chrome_options = Options()
            if headless_mode:
                chrome_options.add_argument("--headless=new")  # Novo modo headless

            # User agent real para não ser detectado como bot
            chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--disable-software-rasterizer")
            chrome_options.add_argument("--disable-extensions")
            chrome_options.add_argument("--disable-blink-features=AutomationControlled")  # Remove flag de automação
            chrome_options.add_argument("--window-size=1920,1080")
            chrome_options.add_argument("--user-data-dir=/tmp/chrome_profile")
            chrome_options.add_argument("--lang=pt-BR")

            # Remove indicadores de webdriver
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
            chrome_options.add_experimental_option('useAutomationExtension', False)

            print("🔧 Configurações do Chrome aplicadas")
            print(f"   - Headless: {headless_mode}")
            print(f"   - User data dir: /tmp/chrome_profile")

            print("🌐 Iniciando ChromeDriver...")
            self.driver = webdriver.Chrome(options=chrome_options)

            # Remove propriedade navigator.webdriver para parecer navegador real
            self.driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
                'source': '''
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    })
                '''
            })

            print("✅ ChromeDriver iniciado com sucesso")

            self.wait = WebDriverWait(self.driver, 30)

            print("📡 Acessando WhatsApp Web...")
            self.driver.get("https://web.whatsapp.com")

            # Aguarda página carregar completamente
            time.sleep(5)

            print(f"✅ Página carregada: {self.driver.title if self.driver.title else 'Carregando...'}")
            print(f"📍 URL atual: {self.driver.current_url}")

            if headless_mode:
                print("📱 WhatsApp Web carregado (headless)")
                print("⚠️  Para fazer login via SSH, use: HEADLESS=false python app.py")
            else:
                print("📱 WhatsApp Web carregado - Janela visível para login!")
                print("🔐 Escaneie o QR Code agora...")

        except Exception as e:
            self.initialization_error = str(e)
            print(f"❌ ERRO ao inicializar Chrome: {e}")
            import traceback
            traceback.print_exc()
            raise

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


def process_message_queue():
    """Worker que processa a fila de mensagens com delay entre 60-90 segundos"""
    print("🔄 Worker de fila de mensagens iniciado")

    while True:
        try:
            # Pega próxima mensagem da fila (bloqueia até ter uma)
            message_task = message_queue.get()

            if message_task is None:  # Sinal para parar
                break

            task_id = message_task['id']
            task_type = message_task['type']
            task_data = message_task['data']

            # Atualiza status para processando
            queue_status[task_id]['status'] = 'processing'
            queue_status[task_id]['started_at'] = datetime.now().isoformat()

            print(f"📤 Processando mensagem {task_id} ({task_type})")

            # Processa a mensagem
            if not whatsapp_client or not whatsapp_client.is_ready:
                queue_status[task_id]['status'] = 'error'
                queue_status[task_id]['error'] = 'WhatsApp não está pronto'
                queue_status[task_id]['completed_at'] = datetime.now().isoformat()
                message_queue.task_done()
                continue

            with client_lock:
                if task_type == 'text':
                    result = whatsapp_client.enviar_mensagem(
                        task_data['to'],
                        task_data['text']
                    )
                elif task_type == 'image':
                    result = whatsapp_client.enviar_imagem(
                        task_data['to'],
                        task_data['imageUrl'],
                        task_data.get('caption')
                    )
                else:
                    result = {'success': False, 'error': 'Tipo de mensagem inválido'}

            # Atualiza status
            if result['success']:
                queue_status[task_id]['status'] = 'sent'
                print(f"✅ Mensagem {task_id} enviada com sucesso")
            else:
                queue_status[task_id]['status'] = 'error'
                queue_status[task_id]['error'] = result.get('error', 'Erro desconhecido')
                print(f"❌ Erro ao enviar mensagem {task_id}: {result.get('error')}")

            queue_status[task_id]['completed_at'] = datetime.now().isoformat()
            queue_status[task_id]['result'] = result

            message_queue.task_done()

            # Delay aleatório entre 60 e 90 segundos (1 min a 1.5 min)
            if not message_queue.empty():  # Só faz delay se tiver mais mensagens
                delay = random.uniform(60, 90)
                print(f"⏳ Aguardando {delay:.1f} segundos antes da próxima mensagem...")
                time.sleep(delay)

        except Exception as e:
            print(f"❌ Erro no worker da fila: {e}")
            if task_id in queue_status:
                queue_status[task_id]['status'] = 'error'
                queue_status[task_id]['error'] = str(e)
                queue_status[task_id]['completed_at'] = datetime.now().isoformat()
            message_queue.task_done()


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
    """Verifica status da API com detalhes do Selenium"""
    status = {
        "status": "online",
        "whatsapp_ready": whatsapp_client.is_ready if whatsapp_client else False,
        "selenium_initialized": whatsapp_client.driver is not None if whatsapp_client else False,
        "initialization_error": whatsapp_client.initialization_error if whatsapp_client else None
    }

    # Adiciona informações extras se o driver estiver ativo
    if whatsapp_client and whatsapp_client.driver:
        try:
            status["current_url"] = whatsapp_client.driver.current_url
            status["page_title"] = whatsapp_client.driver.title
        except:
            status["driver_error"] = "Driver não está respondendo"

    return jsonify(status), 200


@app.route('/rest/sendMessage/<instance>/text', methods=['POST'])
@require_auth
def send_text_message(instance):
    """
    Adiciona mensagem de texto na fila
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

        # Gera ID único para a tarefa
        task_id = str(uuid.uuid4())

        # Cria tarefa
        task = {
            'id': task_id,
            'type': 'text',
            'data': {
                'to': to,
                'text': text
            }
        }

        # Adiciona na fila
        message_queue.put(task)

        # Registra status inicial
        queue_status[task_id] = {
            'status': 'queued',
            'type': 'text',
            'to': to,
            'queued_at': datetime.now().isoformat(),
            'position': message_queue.qsize()
        }

        print(f"📥 Mensagem {task_id} adicionada à fila (posição: {message_queue.qsize()})")

        return jsonify({
            "status": "success",
            "message": "Mensagem adicionada à fila",
            "task_id": task_id,
            "queue_position": message_queue.qsize()
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/rest/sendMessage/<instance>/image', methods=['POST'])
@require_auth
def send_image_message(instance):
    """
    Adiciona imagem na fila
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

        # Gera ID único para a tarefa
        task_id = str(uuid.uuid4())

        # Cria tarefa
        task = {
            'id': task_id,
            'type': 'image',
            'data': {
                'to': to,
                'imageUrl': image_url,
                'caption': caption
            }
        }

        # Adiciona na fila
        message_queue.put(task)

        # Registra status inicial
        queue_status[task_id] = {
            'status': 'queued',
            'type': 'image',
            'to': to,
            'queued_at': datetime.now().isoformat(),
            'position': message_queue.qsize()
        }

        print(f"📥 Imagem {task_id} adicionada à fila (posição: {message_queue.qsize()})")

        return jsonify({
            "status": "success",
            "message": "Imagem adicionada à fila",
            "task_id": task_id,
            "queue_position": message_queue.qsize()
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/queue/status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """Consulta status de uma mensagem específica"""
    if task_id not in queue_status:
        return jsonify({"error": "Task ID não encontrado"}), 404

    return jsonify(queue_status[task_id]), 200


@app.route('/queue/status', methods=['GET'])
def get_queue_status():
    """Retorna status de toda a fila"""
    return jsonify({
        "queue_size": message_queue.qsize(),
        "total_tasks": len(queue_status),
        "tasks": queue_status
    }), 200


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

    # Inicia worker da fila de mensagens
    queue_worker_thread = threading.Thread(target=process_message_queue, daemon=True)
    queue_worker_thread.start()

    # Aguarda um pouco antes de iniciar o servidor
    time.sleep(3)

    print("="*60)
    print("🚀 WhatsApp API iniciada com sistema de fila")
    print("⏱️  Delay entre mensagens: 60-90 segundos (aleatório)")
    print("="*60)

    # Inicia servidor Flask
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
