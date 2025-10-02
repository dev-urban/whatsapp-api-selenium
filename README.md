# WhatsApp API - Selenium Bot

API REST para envio de mensagens via WhatsApp Web usando Selenium (simula digitação humana).

## 🚀 Deploy no Railway

### 1. Criar conta no Railway
- Acesse https://railway.app
- Faça login com GitHub

### 2. Deploy do projeto

**Opção A: Via GitHub**
1. Faça push do código para um repositório GitHub
2. No Railway: "New Project" > "Deploy from GitHub repo"
3. Selecione o repositório
4. Configure a variável de ambiente `BEARER_TOKEN`

**Opção B: Via Railway CLI**
```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

### 3. Configurar variáveis de ambiente

No Railway, adicione:
- `BEARER_TOKEN`: Seu token de autenticação
- `PORT`: 5000 (geralmente automático)

### 4. Primeiro login no WhatsApp

Após o deploy, você precisa escanear o QR Code uma vez:

1. Acesse os logs do Railway
2. O Chrome vai tentar carregar o WhatsApp Web
3. **IMPORTANTE**: Como está em headless, você precisa adicionar temporariamente uma rota para visualizar o QR

**Solução**: Use um serviço de VNC ou:
- Temporariamente comente a linha `chrome_options.add_argument("--headless")`
- Rode localmente uma vez para escanear o QR
- A sessão ficará salva em `chrome_profile/`
- Faça upload dessa pasta pro Railway

## 📡 Endpoints da API

### 1. Health Check
```bash
GET /health
```

### 2. Enviar Mensagem de Texto
```bash
POST /rest/sendMessage/{instance}/text
Content-Type: application/json
Authorization: Bearer {seu_token}

{
  "messageData": {
    "to": "5511999999999@s.whatsapp.net",
    "text": "Olá! Esta é uma mensagem automática."
  }
}
```

### 3. Enviar Imagem
```bash
POST /rest/sendMessage/{instance}/image
Content-Type: application/json
Authorization: Bearer {seu_token}

{
  "messageData": {
    "to": "5511999999999@s.whatsapp.net",
    "imageUrl": "https://example.com/image.jpg",
    "caption": "Legenda opcional"
  }
}
```

## 🧪 Testando Localmente

```bash
# 1. Instalar dependências
pip install -r requirements.txt

# 2. Definir token
export BEARER_TOKEN="seu_token_aqui"

# 3. Executar
python app.py

# 4. Testar
curl -X POST http://localhost:5000/rest/sendMessage/comunicacao_urban/text \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu_token_aqui" \
  -d '{
    "messageData": {
      "to": "5511999999999@s.whatsapp.net",
      "text": "Teste de mensagem"
    }
  }'
```

## 🔧 Recursos

- ✅ Simula digitação humana (delays aleatórios entre caracteres)
- ✅ Suporta texto multilinha
- ✅ Envio de imagens com legenda
- ✅ Autenticação via Bearer token
- ✅ Chrome headless para rodar em servidor
- ✅ Sessão persistente (não precisa escanear QR sempre)

## ⚠️ Notas Importantes

### Autenticação no Railway (QR Code)
O maior desafio é escanear o QR Code inicial. Opções:

**Opção 1: Rodar localmente primeiro**
1. Comente `--headless` em `app.py`
2. Execute localmente
3. Escaneie o QR
4. Faça upload da pasta `chrome_profile/` para o Railway

**Opção 2: Usar whatsapp-web.js (alternativa)**
Considere usar a biblioteca `whatsapp-web.js` do Node.js que tem melhor suporte para QR code em produção.

**Opção 3: VNC no container**
Configure um servidor VNC no Railway para acessar o navegador remotamente.

### Limitações
- WhatsApp pode detectar automação e bloquear
- Use delays apropriados entre mensagens
- Não envie spam
- A sessão pode expirar

## 📚 Formato dos números

Os números devem estar no formato:
- `5511999999999@s.whatsapp.net` (com código do país)
- Ou apenas `5511999999999` (a API normaliza)

## 🐛 Troubleshooting

**Erro: Chrome não encontrado**
- Verifique se o `nixpacks.toml` está configurado corretamente
- O Railway deve instalar chromium automaticamente

**Erro: WhatsApp não está pronto**
- A sessão expirou, precisa escanear QR novamente
- Verifique os logs do Railway

**Mensagem não enviada**
- Verifique se o número está no formato correto
- Certifique-se que o contato existe no WhatsApp
