const DEFAULT_ORIGINS = [
  'https://ejstore-web.web.app',
  'https://ejstore-web.firebaseapp.com',
  // Panel admin en su propio origin (Firebase Auth = 1 slot de localStorage
  // por origin; sin este origen el panel-admin no puede hablar con la API
  // aunque el env ALLOWED_ORIGINS no esté actualizado en Vercel).
  'https://admin.ejstreaming.shop',
];

function getAllowedOrigins() {
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const devOrigins =
    process.env.NODE_ENV !== 'production'
      ? ['http://localhost:5173', 'http://localhost:3001']
      : [];
  return [...new Set([...DEFAULT_ORIGINS, ...envOrigins, ...devOrigins])];
}

function TELEGRAM_WEBHOOK_SECRET() {
  return process.env.TELEGRAM_WEBHOOK_SECRET || '';
}

module.exports = { DEFAULT_ORIGINS, getAllowedOrigins, TELEGRAM_WEBHOOK_SECRET };
