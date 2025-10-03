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
const messageHistory = []; // Histórico de mensagens enviadas
const MAX_HISTORY = 1000; // Máximo de mensagens no histórico

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
async function initializeWhatsApp() {
    console.log('🚀 Iniciando WhatsApp Client com Chromium otimizado...');

    const chromium = require('@sparticuz/chromium');

    whatsappClient = new Client({
        authStrategy: new LocalAuth({
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: chromium.headless,
            executablePath: await chromium.executablePath(),
            args: chromium.args
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
        console.log('❌ WhatsApp desconectado. Motivo:', reason);
        isReady = false;
        qrCodeData = null;

        // Tenta reconectar após 5 segundos
        console.log('🔄 Tentando reconectar em 5 segundos...');
        setTimeout(() => {
            console.log('🔄 Reinicializando WhatsApp Client...');
            whatsappClient.initialize().catch(err => {
                console.error('❌ Erro ao reinicializar:', err.message);
            });
        }, 5000);
    });

    // Evento: Falha de autenticação
    whatsappClient.on('auth_failure', (msg) => {
        console.error('❌ Falha na autenticação:', msg);
        isReady = false;
    });

    // Evento: Mudança de estado
    whatsappClient.on('change_state', (state) => {
        console.log('🔄 Estado alterado para:', state);
    });

    // Evento: Erro de conexão
    whatsappClient.on('loading_screen', (percent, message) => {
        console.log(`⏳ Carregando... ${percent}% - ${message}`);
    });

    whatsappClient.initialize();
}

// Simula digitação humana
async function typeWithHumanDelay(text) {
    // Retorna o texto como está, o whatsapp-web.js já envia naturalmente
    return text;
}

// Salva mensagem no histórico
function saveToHistory(type, to, content, status, error = null, taskId = null) {
    const entry = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        type,
        to,
        content,
        status,
        error,
        taskId,
        timestamp: new Date().toISOString()
    };

    messageHistory.unshift(entry);

    // Limita o tamanho do histórico
    if (messageHistory.length > MAX_HISTORY) {
        messageHistory.pop();
    }

    return entry.id;
}

// Limpa número de telefone removendo caracteres especiais
function cleanPhoneNumber(phone) {
    // Remove tudo que não seja dígito
    return phone.replace(/[^\d]/g, '');
}

// Envia mensagem de texto
async function sendTextMessage(to, text, taskId = null) {
    try {
        // Separa número e domínio se tiver @
        let chatId;
        if (to.includes('@')) {
            const [number, domain] = to.split('@');
            const cleanNumber = cleanPhoneNumber(number);
            chatId = `${cleanNumber}@${domain}`;
        } else {
            const cleanNumber = cleanPhoneNumber(to);
            chatId = `${cleanNumber}@c.us`;
        }

        // Simula digitação humana adicionando delay aleatório
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

        await whatsappClient.sendMessage(chatId, text);

        console.log(`✅ Mensagem enviada para ${to}`);
        saveToHistory('text', to, text, 'sent', null, taskId);
        return { success: true, to };
    } catch (error) {
        console.error(`❌ Erro ao enviar mensagem para ${to}:`, error.message);
        saveToHistory('text', to, text, 'failed', error.message, taskId);
        return { success: false, error: error.message };
    }
}

// Envia imagem
async function sendImageMessage(to, imageUrl, caption, taskId = null) {
    try {
        // Separa número e domínio se tiver @
        let chatId;
        if (to.includes('@')) {
            const [number, domain] = to.split('@');
            const cleanNumber = cleanPhoneNumber(number);
            chatId = `${cleanNumber}@${domain}`;
        } else {
            const cleanNumber = cleanPhoneNumber(to);
            chatId = `${cleanNumber}@c.us`;
        }

        // Baixa a imagem
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const base64 = buffer.toString('base64');
        const mimeType = response.headers['content-type'] || 'image/jpeg';

        const media = new MessageMedia(mimeType, base64);

        await whatsappClient.sendMessage(chatId, media, { caption: caption || '' });

        console.log(`✅ Imagem enviada para ${to}`);
        saveToHistory('image', to, { imageUrl, caption }, 'sent', null, taskId);
        return { success: true, to };
    } catch (error) {
        console.error(`❌ Erro ao enviar imagem para ${to}:`, error.message);
        saveToHistory('image', to, { imageUrl, caption }, 'failed', error.message, taskId);
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
            result = await sendTextMessage(task.data.to, task.data.text, task.taskId);
        } else if (task.type === 'image') {
            result = await sendImageMessage(task.data.to, task.data.imageUrl, task.data.caption, task.taskId);
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
        whatsapp_state: whatsappClient ? whatsappClient.info?.wid?.user || 'initializing' : 'not_initialized',
        queue_size: messageQueue.length,
        history_size: messageHistory.length
    });
});

// Força reconexão do WhatsApp
app.post('/reconnect', requireAuth, async (req, res) => {
    try {
        console.log('🔄 Reconexão forçada solicitada');

        if (whatsappClient) {
            await whatsappClient.destroy();
        }

        isReady = false;
        qrCodeData = null;

        await initializeWhatsApp();

        res.json({
            success: true,
            message: 'Reconexão iniciada. Verifique /qr para novo QR Code se necessário.'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
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

// Visualizar fila completa (mensagens pendentes)
app.get('/queue/list', (req, res) => {
    const queueList = messageQueue.map((item, index) => ({
        position: index + 1,
        taskId: item.taskId,
        type: item.type,
        to: item.to,
        addedAt: queueStatus[item.taskId]?.queued_at || null
    }));

    res.json({
        total: messageQueue.length,
        isProcessing: isProcessingQueue,
        messages: queueList
    });
});

// Histórico de mensagens
app.get('/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status; // 'sent', 'failed', ou null para todos
    const type = req.query.type; // 'text', 'image', ou null para todos

    let filtered = messageHistory;

    if (status) {
        filtered = filtered.filter(m => m.status === status);
    }

    if (type) {
        filtered = filtered.filter(m => m.type === type);
    }

    const paginated = filtered.slice(offset, offset + limit);

    res.json({
        total: filtered.length,
        limit,
        offset,
        messages: paginated
    });
});

// Estatísticas do histórico
app.get('/history/stats', (req, res) => {
    const sent = messageHistory.filter(m => m.status === 'sent').length;
    const failed = messageHistory.filter(m => m.status === 'failed').length;
    const textMessages = messageHistory.filter(m => m.type === 'text').length;
    const imageMessages = messageHistory.filter(m => m.type === 'image').length;

    res.json({
        total: messageHistory.length,
        sent,
        failed,
        successRate: messageHistory.length > 0 ? ((sent / messageHistory.length) * 100).toFixed(2) + '%' : '0%',
        byType: {
            text: textMessages,
            image: imageMessages
        }
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
