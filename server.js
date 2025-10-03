const express = require('express');
const wppconnect = require('@wppconnect-team/wppconnect');
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
let isInitializing = false; // Flag para evitar múltiplas inicializações

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

// Inicializar WhatsApp Client com wppconnect
async function initializeWhatsApp() {
    if (isInitializing) {
        console.log('⚠️ Inicialização já em andamento, ignorando...');
        return;
    }

    isInitializing = true;
    console.log('🚀 Iniciando WhatsApp Client com wppconnect...');

    try {
        whatsappClient = await wppconnect.create({
            session: 'whatsapp-session',
            catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
                console.log('📱 QR Code recebido');
                qrCodeData = base64Qr;
            },
            statusFind: (statusSession, session) => {
                console.log('🔍 Status da sessão:', statusSession);
                if (statusSession === 'isLogged') {
                    console.log('✅ Sessão já autenticada!');
                    isReady = true;
                    qrCodeData = null;
                    isInitializing = false;
                } else if (statusSession === 'qrReadSuccess') {
                    console.log('✅ QR Code escaneado com sucesso!');
                } else if (statusSession === 'autocloseCalled') {
                    console.log('⚠️ Navegador foi fechado');
                    isReady = false;
                    isInitializing = false;
                } else if (statusSession === 'notLogged') {
                    console.log('⚠️ Sessão não autenticada');
                    isReady = false;
                } else if (statusSession === 'deviceNotConnected') {
                    console.log('❌ Dispositivo não conectado');
                    isReady = false;
                    isInitializing = false;
                }
            },
            headless: true,
            devtools: false,
            useChrome: false, // Usa Chromium bundled
            debug: false,
            logQR: false,
            browserArgs: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled'
            ],
            autoClose: 60000 * 60, // 1 hora de inatividade
            disableWelcome: true,
            updatesLog: false
        });

        console.log('✅ WhatsApp Client criado e pronto!');
        isReady = true;
        qrCodeData = null;
        isInitializing = false;

        // Listener de desconexão
        whatsappClient.onStateChange((state) => {
            console.log('🔄 Estado alterado para:', state);
            if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
                console.log('❌ Cliente desconectado:', state);
                isReady = false;
            } else if (state === 'CONNECTED') {
                console.log('✅ Cliente conectado');
                isReady = true;
            }
        });

    } catch (error) {
        console.error('❌ Erro ao inicializar WhatsApp:', error);
        isReady = false;
        isInitializing = false;

        // Tenta reconectar após 10 segundos
        console.log('🔄 Tentando reconectar em 10 segundos...');
        setTimeout(() => {
            initializeWhatsApp();
        }, 10000);
    }
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
        // Verifica se está realmente conectado
        if (!isReady || !whatsappClient) {
            throw new Error('WhatsApp não está conectado');
        }

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

        console.log(`📞 Enviando para: ${chatId}`);

        // Simula digitação humana adicionando delay aleatório maior (2-5 segundos)
        const delay = Math.random() * 3000 + 2000; // 2000-5000ms
        console.log(`⏱️ Aguardando ${Math.round(delay/1000)}s antes de enviar...`);
        await new Promise(resolve => setTimeout(resolve, delay));

        await whatsappClient.sendText(chatId, text);

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
        // Verifica se está realmente conectado
        if (!isReady || !whatsappClient) {
            throw new Error('WhatsApp não está conectado');
        }

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

        console.log(`📞 Enviando imagem para: ${chatId}`);

        // Simula delay humano
        const delay = Math.random() * 3000 + 2000;
        console.log(`⏱️ Aguardando ${Math.round(delay/1000)}s antes de enviar imagem...`);
        await new Promise(resolve => setTimeout(resolve, delay));

        // wppconnect pode enviar direto pela URL ou por base64
        await whatsappClient.sendImageFromBase64(chatId, imageUrl, 'image.jpg', caption || '');

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
            result = await sendTextMessage(task.data.to, task.data.text, task.id);
        } else if (task.type === 'image') {
            result = await sendImageMessage(task.data.to, task.data.imageUrl, task.data.caption, task.id);
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

        // Delay aleatório entre 90-150 segundos (1.5 a 2.5 minutos)
        if (messageQueue.length > 0) {
            const delay = Math.floor(Math.random() * 60000) + 90000; // 90000-150000ms
            console.log(`⏳ Aguardando ${(delay / 1000).toFixed(1)}s antes da próxima mensagem...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    isProcessingQueue = false;
}

// ==================== ROTAS DA API ====================

// Health check
app.get('/health', async (req, res) => {
    let phoneNumber = 'not_initialized';

    if (whatsappClient && isReady) {
        try {
            const hostDevice = await whatsappClient.getHostDevice();
            phoneNumber = hostDevice.id.user || 'unknown';
        } catch (error) {
            phoneNumber = 'error_fetching';
        }
    }

    res.json({
        status: 'online',
        whatsapp_ready: isReady,
        whatsapp_state: phoneNumber,
        queue_size: messageQueue.length,
        history_size: messageHistory.length
    });
});

// Força reconexão do WhatsApp
app.post('/reconnect', requireAuth, async (req, res) => {
    try {
        console.log('🔄 Reconexão forçada solicitada');

        if (whatsappClient) {
            await whatsappClient.close();
        }

        isReady = false;
        qrCodeData = null;
        isInitializing = false;

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

// Limpa sessão e reinicia (útil quando sessão está corrompida)
app.post('/reset-session', requireAuth, async (req, res) => {
    try {
        console.log('🗑️ Limpando sessão corrompida...');

        if (whatsappClient) {
            await whatsappClient.close();
        }

        isReady = false;
        qrCodeData = null;
        isInitializing = false;

        // Remove tokens de autenticação
        const tokensPath = path.join(__dirname, 'tokens');
        if (fs.existsSync(tokensPath)) {
            fs.rmSync(tokensPath, { recursive: true, force: true });
            console.log('🗑️ Pasta tokens removida');
        }

        await initializeWhatsApp();

        res.json({
            success: true,
            message: 'Sessão limpa. Novo QR Code gerado. Acesse /qr para escanear.'
        });
    } catch (error) {
        console.error('❌ Erro ao limpar sessão:', error);
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
    const { instance } = req.params;

    console.log(`📨 Recebida requisição de mensagem para instância: ${instance}`);
    console.log(`📊 Status: isReady=${isReady}, whatsappClient=${!!whatsappClient}`);

    if (!isReady) {
        console.log('❌ Rejeitada: WhatsApp não está pronto');
        return res.status(503).json({
            name: 'FORBIDDEN',
            message: 'Instance not logged in',
            statusCode: 503,
            instance: instance,
            isReady: isReady
        });
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
    const { instance } = req.params;

    console.log(`📨 Recebida requisição de imagem para instância: ${instance}`);
    console.log(`📊 Status: isReady=${isReady}, whatsappClient=${!!whatsappClient}`);

    if (!isReady) {
        console.log('❌ Rejeitada: WhatsApp não está pronto');
        return res.status(503).json({
            name: 'FORBIDDEN',
            message: 'Instance not logged in',
            statusCode: 503,
            instance: instance,
            isReady: isReady
        });
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
        taskId: item.id,
        type: item.type,
        to: item.data.to,
        addedAt: queueStatus[item.id]?.queued_at || null
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
    console.log('🚀 WhatsApp API com wppconnect iniciada');
    console.log(`📡 Servidor rodando na porta ${PORT}`);
    console.log('⏱️  Delay entre mensagens: 90-150 segundos (aleatório)');
    console.log('='.repeat(60));
});
