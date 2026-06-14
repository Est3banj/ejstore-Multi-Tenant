#!/bin/bash
# ============================================================
# Iniciar Firebase Emulators + Seed data
# Uso: bash scripts/emulators.sh
# ============================================================
set -e

echo "🔥 Iniciando Firebase Emulators..."
echo "   Auth:      localhost:9099"
echo "   Firestore: localhost:8080"
echo "   Functions: localhost:5001"
echo "   UI:        http://localhost:4000"
echo ""

# Iniciar emuladores en background
firebase emulators:start --project=ejstore-web &
EMULATOR_PID=$!

# Esperar a que los emuladores estén listos
echo "⏳ Esperando a que los emuladores inicien..."
sleep 8

# Sembrar datos de prueba
echo "🌱 Sembrando datos de prueba..."
bash scripts/seed-emulators.sh

echo ""
echo "=========================================="
echo " ✅ Emuladores listos!"
echo "=========================================="
echo " 🌐 UI:          http://localhost:4000"
echo " 📧 Cliente:     test@ejstore.com / test123456"
echo " 🛡️ Admin:       admin@ejstore.com / admin123456"
echo " 💰 Balance:     $50,000 COP"
echo "=========================================="
echo ""
echo "Presiona Ctrl+C para detener los emuladores"

# Esperar a que termine el proceso de emuladores
wait $EMULATOR_PID
