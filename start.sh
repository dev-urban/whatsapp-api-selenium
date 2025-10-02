#!/bin/bash

# Encontrar Chromium
CHROMIUM_PATH=$(which chromium || which chromium-browser || echo "")

if [ -z "$CHROMIUM_PATH" ]; then
    echo "❌ Erro: Chromium não encontrado!"
    exit 1
fi

echo "✅ Usando Chromium: $CHROMIUM_PATH"

# Configurar variáveis de ambiente
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=$CHROMIUM_PATH
export LD_LIBRARY_PATH=/nix/var/nix/profiles/default/lib:${LD_LIBRARY_PATH}

# Iniciar aplicação
exec node server.js
