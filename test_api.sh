#!/bin/bash

# Script para testar a API

API_URL="http://localhost:5000"
TOKEN="eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyOS8wNy8yMDI0IiwibmFtZSI6IlVyYmFuIENvbXBhbnkifQ.msPAj8cbZ5JJLREax8WTjNcz7i6xLfPBflp8Px64TIHT7ve6OLmLLRzVjW-0EfvGkaH9aqWFh5XyQcwkCHVBHw"

echo "🧪 Testando WhatsApp API"
echo ""

# 1. Health check
echo "1. Health Check:"
curl -s "$API_URL/health" | jq
echo ""
echo ""

# 2. Enviar mensagem de texto
echo "2. Enviando mensagem de texto:"
curl -X POST "$API_URL/rest/sendMessage/comunicacao_urban/text" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "messageData": {
      "to": "5511999999999@s.whatsapp.net",
      "text": "Olá! Esta é uma mensagem de teste.\n\nEnviada via API."
    }
  }' | jq
echo ""
echo ""

# 3. Enviar imagem
echo "3. Enviando imagem:"
curl -X POST "$API_URL/rest/sendMessage/comunicacao_urban/image" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "messageData": {
      "to": "5511999999999@s.whatsapp.net",
      "imageUrl": "https://picsum.photos/800/600",
      "caption": "Imagem de teste via API"
    }
  }' | jq

echo ""
echo "✅ Testes concluídos"
