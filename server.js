const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Configurações
const PORT = process.env.PORT || 5000;
const BEARER_TOKEN = process.env.BEARER_TOKEN || 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyOS8wNy8yMDI0IiwibmFtZSI6IlVyYmFuIENvbXBhbnkifQ.msPAj8cbZ5JJLREax8WTjNcz7i6xLfPBflp8Px64TIHT7ve6OLmLLRzVjW-0EfvGkaH9aqWFh5XyQcwkCHVBHw';

// Estado global
let whatsappClient = null;
let isReady = false;
let qrCodeData = null;
const messageQueue = [];
const queueStatus = {};
let isProcessingQueue = false;

// Middleware de autenticação
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Token de autorização não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    if (token !== BEARER_TOKEN) {
        return res.status(401).json({ error: 'Token inválido' });
    }

    next();
}

// Inicializar WhatsApp Client
function initializeWhatsApp() {
    console.log('🚀 Iniciando WhatsApp Client...');

    whatsappClient = new Client({
        authStrategy: new LocalAuth({
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || '/nix/var/nix/profiles/default/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    // Evento: QR Code gerado
    whatsappClient.on('qr', (qr) => {
        console.log('📱 QR Code recebido');
        qrcode.toDataURL(qr, (err, url) => {
            qrCodeData = url;
        });
    });

    // Evento: Autenticado
    whatsappClient.on('authenticated', () => {
        console.log('✅ Autenticado!');
        qrCodeData = null;
    });

    // Evento: Pronto para uso
    whatsappClient.on('ready', () => {
        console.log('✅ WhatsApp Client está pronto!');
        isReady = true;
        qrCodeData = null;
    });

    // Evento: Desconectado
    whatsappClient.on('disconnected', (reason) => {
        console.log('❌ WhatsApp desconectado:', reason);
        isReady = false;
        qrCodeData = null;
    });

    // Evento: Falha de autenticação
    whatsappClient.on('auth_failure', (msg) => {
        console.error('❌ Falha na autenticação:', msg);
        isReady = false;
    });

    whatsappClient.initialize();
}

// Simula digitação humana
async function typeWithHumanDelay(text) {
    // Retorna o texto como está, o whatsapp-web.js já envia naturalmente
    return text;
}

// Envia mensagem de texto
async function sendTextMessage(to, text) {
    try {
        const chatId = to.includes('@') ? to : `${to}@c.us`;

        // Simula digitação humana adicionando delay aleatório
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

        await whatsappClient.sendMessage(chatId, text);

        console.log(`✅ Mensagem enviada para ${to}`);
        return { success: true, to };
    } catch (error) {
        console.error(`❌ Erro ao enviar mensagem para ${to}:`, error.message);
        return { success: false, error: error.message };
    }
}

// Envia imagem
async function sendImageMessage(to, imageUrl, caption) {
    try {
        const chatId = to.includes('@') ? to : `${to}@c.us`;

        // Baixa a imagem
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const base64 = buffer.toString('base64');
        const mimeType = response.headers['content-type'] || 'image/jpeg';

        const media = new MessageMedia(mimeType, base64);

        await whatsappClient.sendMessage(chatId, media, { caption: caption || '' });

        console.log(`✅ Imagem enviada para ${to}`);
        return { success: true, to };
    } catch (error) {
        console.error(`❌ Erro ao enviar imagem para ${to}:`, error.message);
        return { success: false, error: error.message };
    }
}

// Processa fila de mensagens
async function processMessageQueue() {
    if (isProcessingQueue || messageQueue.length === 0) {
        return;
    }

    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const task = messageQueue.shift();

        console.log(`📤 Processando mensagem ${task.id} (${task.type})`);

        // Atualiza status
        queueStatus[task.id].status = 'processing';
        queueStatus[task.id].started_at = new Date().toISOString();

        let result;

        if (task.type === 'text') {
            result = await sendTextMessage(task.data.to, task.data.text);
        } else if (task.type === 'image') {
            result = await sendImageMessage(task.data.to, task.data.imageUrl, task.data.caption);
        }

        // Atualiza status final
        if (result.success) {
            queueStatus[task.id].status = 'sent';
            console.log(`✅ Mensagem ${task.id} enviada com sucesso`);
        } else {
            queueStatus[task.id].status = 'error';
            queueStatus[task.id].error = result.error;
            console.error(`❌ Erro ao enviar mensagem ${task.id}:`, result.error);
        }

        queueStatus[task.id].completed_at = new Date().toISOString();
        queueStatus[task.id].result = result;

        // Delay aleatório entre 60-90 segundos (1 a 1.5 minutos)
        if (messageQueue.length > 0) {
            const delay = Math.floor(Math.random() * 30000) + 60000; // 60000-90000ms
            console.log(`⏳ Aguardando ${(delay / 1000).toFixed(1)}s antes da próxima mensagem...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    isProcessingQueue = false;
}

// ==================== ROTAS DA API ====================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        whatsapp_ready: isReady,
        queue_size: messageQueue.length
    });
});

// QR Code
app.get('/qr', (req, res) => {
    if (isReady) {
        return res.json({ message: 'WhatsApp já está conectado' });
    }

    if (!qrCodeData) {
        return res.json({ message: 'Aguardando QR Code...' });
    }

    // Retorna HTML com imagem do QR Code
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp QR Code</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .container {
                    background: white;
                    padding: 40px;
                    border-radius: 10px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    text-align: center;
                }
                h1 {
                    color: #128C7E;
                    margin-bottom: 20px;
                }
                img {
                    max-width: 300px;
                    margin: 20px 0;
                }
                p {
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📱 WhatsApp QR Code</h1>
                <img src="${qrCodeData}" alt="QR Code">
                <p>Escaneie este QR Code com seu WhatsApp</p>
                <p><small>A página será atualizada automaticamente</small></p>
            </div>
            <script>
                setTimeout(() => location.reload(), 5000);
            </script>
        </body>
        </html>
    `;

    res.send(html);
});

// Enviar mensagem de texto
app.post('/rest/sendMessage/:instance/text', requireAuth, (req, res) => {
    if (!isReady) {
        return res.status(503).json({ error: 'WhatsApp não está pronto' });
    }

    const { messageData } = req.body;

    if (!messageData || !messageData.to || !messageData.text) {
        return res.status(400).json({ error: 'Campos "to" e "text" são obrigatórios' });
    }

    const taskId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const task = {
        id: taskId,
        type: 'text',
        data: {
            to: messageData.to,
            text: messageData.text
        }
    };

    messageQueue.push(task);

    queueStatus[taskId] = {
        status: 'queued',
        type: 'text',
        to: messageData.to,
        queued_at: new Date().toISOString(),
        position: messageQueue.length
    };

    console.log(`📥 Mensagem ${taskId} adicionada à fila (posição: ${messageQueue.length})`);

    // Inicia processamento da fila
    processMessageQueue();

    res.json({
        status: 'success',
        message: 'Mensagem adicionada à fila',
        task_id: taskId,
        queue_position: messageQueue.length
    });
});

// Enviar imagem
app.post('/rest/sendMessage/:instance/image', requireAuth, (req, res) => {
    if (!isReady) {
        return res.status(503).json({ error: 'WhatsApp não está pronto' });
    }

    const { messageData } = req.body;

    if (!messageData || !messageData.to || !messageData.imageUrl) {
        return res.status(400).json({ error: 'Campos "to" e "imageUrl" são obrigatórios' });
    }

    const taskId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const task = {
        id: taskId,
        type: 'image',
        data: {
            to: messageData.to,
            imageUrl: messageData.imageUrl,
            caption: messageData.caption
        }
    };

    messageQueue.push(task);

    queueStatus[taskId] = {
        status: 'queued',
        type: 'image',
        to: messageData.to,
        queued_at: new Date().toISOString(),
        position: messageQueue.length
    };

    console.log(`📥 Imagem ${taskId} adicionada à fila (posição: ${messageQueue.length})`);

    // Inicia processamento da fila
    processMessageQueue();

    res.json({
        status: 'success',
        message: 'Imagem adicionada à fila',
        task_id: taskId,
        queue_position: messageQueue.length
    });
});

// Status de uma mensagem específica
app.get('/queue/status/:task_id', (req, res) => {
    const { task_id } = req.params;

    if (!queueStatus[task_id]) {
        return res.status(404).json({ error: 'Task ID não encontrado' });
    }

    res.json(queueStatus[task_id]);
});

// Status de toda a fila
app.get('/queue/status', (req, res) => {
    res.json({
        queue_size: messageQueue.length,
        total_tasks: Object.keys(queueStatus).length,
        tasks: queueStatus
    });
});

// ==================== INICIALIZAÇÃO ====================

// Inicializa WhatsApp
initializeWhatsApp();

// Inicia servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log('🚀 WhatsApp API iniciada com sistema de fila');
    console.log(`📡 Servidor rodando na porta ${PORT}`);
    console.log('⏱️  Delay entre mensagens: 60-90 segundos (aleatório)');
    console.log('='.repeat(60));
});
