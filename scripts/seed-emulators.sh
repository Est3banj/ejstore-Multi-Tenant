#!/bin/bash
# ============================================================
# Seed emuladores locales con datos de prueba para la ruleta
# Uso: bash scripts/seed-emulators.sh
# ============================================================
set -e

EMULATOR_HOST="localhost"
AUTH_PORT="9099"
FIRESTORE_PORT="8080"
PROJECT_ID="ejstore-web"

echo "🌱 Sembrando datos en emuladores locales..."

# ===================== 1. CREAR USUARIO DE PRUEBA EN AUTH =====================
echo "📧 Creando usuario de prueba en Auth emulator..."
AUTH_RESPONSE=$(curl -s -X POST "http://${EMULATOR_HOST}:${AUTH_PORT}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@ejstore.com",
    "password": "test123456",
    "returnSecureToken": true
  }')

USER_UID=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['localId'])" 2>/dev/null || echo "")
ID_TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['idToken'])" 2>/dev/null || echo "")

if [ -z "$USER_UID" ]; then
  echo "❌ Error creando usuario. Respuesta: $AUTH_RESPONSE"
  exit 1
fi
echo "   ✅ Usuario creado: UID=$USER_UID, email=test@ejstore.com"

# ===================== 2. CREAR DOCUMENTO EN COLLECTION USERS (para reglas) =====================
echo "👤 Creando documento en users/$USER_UID para reglas de seguridad..."
curl -s -X PATCH "http://${EMULATOR_HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${USER_UID}?updateMask.fieldPaths=role&updateMask.fieldPaths=tenantId" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "role": {"stringValue": "customer"},
      "tenantId": {"stringValue": "ej"}
    }
  }' > /dev/null

echo "   ✅ Documento users/$USER_UID creado (role=customer, tenantId=ej)"

# ===================== 3. CREAR CUSTOMER CON BALANCE =====================
echo "💰 Creando customer con balance de $50,000 COP..."
curl -s -X PATCH "http://${EMULATOR_HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/customers/${USER_UID}?updateMask.fieldPaths=balance&updateMask.fieldPaths=firstName&updateMask.fieldPaths=lastName&updateMask.fieldPaths=email&updateMask.fieldPaths=tenantId" \
  -H "Content-Type: application/json" \
  -d "{
    \"fields\": {
      \"balance\": {\"integerValue\": 50000},
      \"firstName\": {\"stringValue\": \"Test\"},
      \"lastName\": {\"stringValue\": \"User\"},
      \"email\": {\"stringValue\": \"test@ejstore.com\"},
      \"tenantId\": {\"stringValue\": \"ej\"}
    }
  }" > /dev/null

echo "   ✅ Customer $USER_UID creado con balance=50000, tenantId=ej"

# ===================== 4. CREAR RULETA CONFIG =====================
echo "🎰 Creando rouletteConfig/ej..."
curl -s -X PATCH "http://${EMULATOR_HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/rouletteConfig/ej?updateMask.fieldPaths=isEnabled&updateMask.fieldPaths=pricePerSpin&updateMask.fieldPaths=spinsForFreeSpin&updateMask.fieldPaths=prizes" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "isEnabled": {"booleanValue": true},
      "pricePerSpin": {"integerValue": 1000},
      "spinsForFreeSpin": {"integerValue": 3},
      "prizes": {"arrayValue": {"values": [
        {"mapValue": {"fields": {
          "id": {"stringValue": "nothing"},
          "name": {"stringValue": "Nada"},
          "type": {"stringValue": "nothing"},
          "probability": {"doubleValue": 0.85},
          "isActive": {"booleanValue": true}
        }}},
        {"mapValue": {"fields": {
          "id": {"stringValue": "netflix"},
          "name": {"stringValue": "Netflix 1 Mes"},
          "type": {"stringValue": "subscription"},
          "probability": {"doubleValue": 0.02},
          "isActive": {"booleanValue": true}
        }}},
        {"mapValue": {"fields": {
          "id": {"stringValue": "disney"},
          "name": {"stringValue": "Disney+ 1 Mes"},
          "type": {"stringValue": "subscription"},
          "probability": {"doubleValue": 0.02},
          "isActive": {"booleanValue": true}
        }}},
        {"mapValue": {"fields": {
          "id": {"stringValue": "hbo"},
          "name": {"stringValue": "HBO Max 1 Mes"},
          "type": {"stringValue": "subscription"},
          "probability": {"doubleValue": 0.03},
          "isActive": {"booleanValue": true}
        }}},
        {"mapValue": {"fields": {
          "id": {"stringValue": "prime"},
          "name": {"stringValue": "Amazon Prime 1 Mes"},
          "type": {"stringValue": "subscription"},
          "probability": {"doubleValue": 0.03},
          "isActive": {"booleanValue": true}
        }}},
        {"mapValue": {"fields": {
          "id": {"stringValue": "crunchyroll"},
          "name": {"stringValue": "Crunchyroll 1 Mes"},
          "type": {"stringValue": "subscription"},
          "probability": {"doubleValue": 0.05},
          "isActive": {"booleanValue": true}
        }}}
      ]}}
    }
  }' > /dev/null

echo "   ✅ rouletteConfig/ej creada con 6 premios"

# ===================== 5. CREAR TENANT DOC =====================
echo "🏪 Creando tenant/ej..."
curl -s -X PATCH "http://${EMULATOR_HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/tenants/ej?updateMask.fieldPaths=name&updateMask.fieldPaths=subdomain&updateMask.fieldPaths=isActive" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "name": {"stringValue": "EJ Store"},
      "subdomain": {"stringValue": "ej"},
      "isActive": {"booleanValue": true}
    }
  }' > /dev/null

echo "   ✅ tenant/ej creado"

# ===================== 6. CONFIGURAR WEBHOOK DE DISCORD =====================
echo "🔗 Configurando Discord webhook en secrets/webhook..."
# Llamar a la CF setDiscordWebhook via emulador (si está corriendo)
# O crearlo directamente en Firestore
curl -s -X PATCH "http://${EMULATOR_HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/tenants/ej/secrets/webhook?updateMask.fieldPaths=discordUrl&updateMask.fieldPaths=updatedAt" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "discordUrl": {"stringValue": "https://discord.com/api/webhooks/test-local-emulator"},
      "updatedAt": {"timestampValue": "2026-06-02T00:00:00Z"}
    }
  }' > /dev/null

echo "   ✅ Discord webhook configurado (URL de prueba)"

# ===================== 7. CREAR SUPERADMIN PARA PANEL =====================
echo "🛡️ Creando superadmin..."
SUPERADMIN_RESPONSE=$(curl -s -X POST "http://${EMULATOR_HOST}:${AUTH_PORT}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@ejstore.com",
    "password": "admin123456",
    "returnSecureToken": true
  }')

SUPERADMIN_UID=$(echo "$SUPERADMIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['localId'])" 2>/dev/null || echo "")

curl -s -X PATCH "http://${EMULATOR_HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${SUPERADMIN_UID}?updateMask.fieldPaths=role&updateMask.fieldPaths=tenantId&updateMask.fieldPaths=email" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "role": {"stringValue": "superadmin"},
      "tenantId": {"stringValue": "ej"},
      "email": {"stringValue": "admin@ejstore.com"}
    }
  }' > /dev/null

echo "   ✅ Superadmin creado: UID=$SUPERADMIN_UID, email=admin@ejstore.com"

# ===================== RESUMEN =====================
echo ""
echo "=========================================="
echo " 🌱 SEED COMPLETADO"
echo "=========================================="
echo ""
echo "📧 Usuarios de prueba:"
echo "   Cliente:    test@ejstore.com / test123456"
echo "   Admin:      admin@ejstore.com / admin123456"
echo ""
echo "🎰 Ruleta: 6 premios, $1,000/giro, 3 giros = 1 free"
echo "💰 Balance: $50,000 COP (cliente de prueba)"
echo ""
echo "🌐 Emulator UI: http://localhost:4000"
echo "=========================================="
