# Exploración: Notificaciones por Telegram

## Estado Actual
- **Discord**: Sistema completo. Webhook store URL en `tenants/{tenantId}/secrets/webhook.discordUrl`. `sendDiscordWebhook(tenantId, embed)` envía embeds a Discord.
- **Telegram**: Código deprecado/comentado. Usaba variables de entorno `TELEGRAM_BOT_TOKEN` y `ADMIN_CHAT_ID`.
- **In-app**: Colección `notifications` con `userId`, `type`, `title`, `message`, `read`.

## Arquitectura Propuesta

### Admin Bot (un bot por tienda)
- Token del bot almacenado en Firebase Config: `functions:config:set telegram.admin_bot_token="..."`
- Admin genera un **token de vinculación** desde el panel de admin
- Ese token lo usa en Telegram con el bot para vincular su chatId
- El chatId se guarda en `tenants/{tenantId}/secrets/telegram.adminChatId`
- Recibe TODAS las notificaciones de la tienda

### Reseller Bot (un bot para todos los distribuidores)
- Token almacenado en: `functions:config:set telegram.reseller_bot_token="..."`
- Cada reseller genera su token de vinculación desde su perfil
- El chatId se guarda en `resellers/{resellerUid}.telegramChatId`
- Recibe solo notificaciones de su propia actividad

### Flujo de vinculación
1. Admin/Reseller hace clic en "Vincular Telegram" en su panel
2. Se genera un token único (ej: "abc123") que expira en 5 min
3. El usuario envía `/start abc123` al bot en Telegram
4. El bot responde confirmando la vinculación
5. El chatId queda guardado en Firestore

### Funciones Cloud necesarias
- `generateTelegramToken(userId, role)` — genera token de vinculación
- `telegramWebhook` — endpoint HTTP que recibe los mensajes del bot (via Bot API webhook)
- `sendTelegramMessage(chatId, text)` — helper para enviar mensajes

### Notificaciones por tipo

#### Admin
- 💰 Nueva recarga solicitada (monto, cliente)
- ✅ Recarga aprobada (monto, cliente)
- ❌ Recarga rechazada (monto, cliente, motivo)
- 🛒 Nueva compra de servicio (servicio, cliente)
- 🎫 Servicio reportado (servicio, cliente, detalle)
- 📊 Resumen diario/semanal

#### Reseller
- 💵 Venta realizada (servicio, monto, ganancia)
- ⏳ Servicio próximo a vencer (cliente, días restantes)
- ❌ Servicio vencido (cliente, servicio)
- ✅ Respuesta a reporte (respuesta del admin)
- 💰 Movimiento de saldo (carga, descuento)

### Archivos afectados
- `functions/index.js` — helpers telegram, webhook endpoint, notificaciones
- `src/pages/admin/Settings.jsx` — UI para vincular Telegram admin
- `src/pages/reseller/Perfil.tsx` — UI para vincular Telegram reseller
- Firebase Config — `telegram.admin_bot_token`, `telegram.reseller_bot_token`

## Recomendación
Implementar por fases:
1. Helpers base (`sendTelegramMessage`, webhook handler)
2. Admin: generar token + vincular + notificaciones principales
3. Reseller: generar token + vincular + notificaciones
4. Completar notificaciones faltantes
