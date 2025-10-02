# 🔐 Como fazer login no WhatsApp via SSH no Railway

## Passo a passo completo

### 1️⃣ Fazer deploy no Railway

```bash
# Via GitHub
1. Push o código para um repositório GitHub
2. No Railway: New Project > Deploy from GitHub repo
3. Adicione a variável de ambiente BEARER_TOKEN

# Via CLI
railway login
railway init
railway up
```

### 2️⃣ Instalar Railway CLI (se ainda não tem)

```bash
npm i -g @railway/cli
railway login
```

### 3️⃣ Conectar via SSH ao Railway

No painel do Railway:
1. Vá até seu projeto
2. Clique em "Settings"
3. Na seção "SSH", copie o comando de conexão

Ou via CLI:
```bash
railway link    # Vincula ao projeto
railway shell   # Abre shell SSH
```

### 4️⃣ Executar o script de login

Dentro do SSH do Railway:

```bash
# Definir modo não-headless
export HEADLESS=false

# Executar script de login
python3 login_ssh.py
```

### 5️⃣ Escanear o QR Code

**IMPORTANTE**: Como o Railway não tem interface gráfica, você precisa usar uma solução de VNC ou fazer de outra forma.

## 🎯 Solução Recomendada: Login Local + Upload da Sessão

A forma **mais simples** é:

### Opção A: Login local e upload

```bash
# 1. No seu PC, execute localmente (com Chrome visível)
export HEADLESS=false
python app.py

# 2. Escaneie o QR Code

# 3. A pasta chrome_profile/ será criada com a sessão

# 4. Faça upload da pasta para o Railway
railway shell
# Dentro do SSH:
mkdir -p /tmp/chrome_profile
# Use scp ou outro método para copiar os arquivos
```

### Opção B: Usar código de pareamento do WhatsApp

Adicione ao `app.py`:

```python
# Em vez de QR Code, use código de pareamento
# WhatsApp permite vincular via código de 8 dígitos
```

### Opção C: Screenshot do QR Code via API

Adicione um endpoint que retorna screenshot:

```bash
GET /qr-screenshot
# Retorna imagem PNG do QR Code
```

## 🚀 Solução Mais Prática Implementada

Vou criar um endpoint `/qr` que:
1. Tira screenshot da página
2. Retorna como imagem
3. Você acessa via navegador: `https://seu-app.railway.app/qr`

### Acessar QR Code via URL

```bash
# Depois do deploy
curl https://seu-app.railway.app/qr > qr.png
# Abra qr.png e escaneie
```

## ⚡ Comandos úteis Railway

```bash
# Ver logs em tempo real
railway logs

# Abrir shell SSH
railway shell

# Ver variáveis de ambiente
railway variables

# Executar comando único
railway run python login_ssh.py
```

## 🔄 Workflow Completo Recomendado

1. **Deploy inicial no Railway** (código vai rodar em headless)
2. **Acesse via navegador**: `https://seu-app.railway.app/qr`
3. **Escaneie o QR Code** que aparecer
4. **Sessão salva automaticamente**
5. **Próximos deploys**: já estará logado

## 📝 Notas Importantes

- A sessão fica em `/tmp/chrome_profile/` no Railway
- O `/tmp/` pode ser limpo em redeploys
- Use volumes do Railway para persistência
- Ou re-autentique após cada deploy
