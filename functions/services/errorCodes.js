const ErrorCode = {
  AUTH_UNAUTHENTICATED: 'AUTH_UNAUTHENTICATED',
  AUTH_PERMISSION_DENIED: 'AUTH_PERMISSION_DENIED',
  AUTH_INVALID_CLAIMS: 'AUTH_INVALID_CLAIMS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TENANT_MISMATCH: 'AUTH_TENANT_MISMATCH',

  VALIDATION_INVALID_ARGUMENT: 'VALIDATION_INVALID_ARGUMENT',
  VALIDATION_MISSING_FIELD: 'VALIDATION_MISSING_FIELD',
  VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',
  VALIDATION_IDEMPOTENCY_INVALID: 'VALIDATION_IDEMPOTENCY_INVALID',

  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  RESOURCE_STOCK_INSUFFICIENT: 'RESOURCE_STOCK_INSUFFICIENT',

  PURCHASE_INSUFFICIENT_BALANCE: 'PURCHASE_INSUFFICIENT_BALANCE',
  PURCHASE_SERVICE_EXHAUSTED: 'PURCHASE_SERVICE_EXHAUSTED',
  PURCHASE_CUSTOMER_NOT_FOUND: 'PURCHASE_CUSTOMER_NOT_FOUND',
  PURCHASE_SERVICE_NOT_FOUND: 'PURCHASE_SERVICE_NOT_FOUND',
  PURCHASE_IDEMPOTENCY_TIMEOUT: 'PURCHASE_IDEMPOTENCY_TIMEOUT',
  PURCHASE_DUPLICATE_DETECTED: 'PURCHASE_DUPLICATE_DETECTED',

  RATE_LIMITED: 'RATE_LIMITED',
  RATE_LIMIT_QUOTA_EXCEEDED: 'RATE_LIMIT_QUOTA_EXCEEDED',

  WEBHOOK_INVALID_SIGNATURE: 'WEBHOOK_INVALID_SIGNATURE',
  WEBHOOK_REPLAY_DETECTED: 'WEBHOOK_REPLAY_DETECTED',
  WEBHOOK_TIMESTAMP_EXPIRED: 'WEBHOOK_TIMESTAMP_EXPIRED',
  WEBHOOK_INVALID_PAYLOAD: 'WEBHOOK_INVALID_PAYLOAD',
  WEBHOOK_CONFIG_ERROR: 'WEBHOOK_CONFIG_ERROR',

  IMAP_CONNECTION_FAILED: 'IMAP_CONNECTION_FAILED',
  IMAP_TLS_ERROR: 'IMAP_TLS_ERROR',
  IMAP_AUTH_FAILED: 'IMAP_AUTH_FAILED',
  IMAP_POOL_EXHAUSTED: 'IMAP_POOL_EXHAUSTED',

  SMTP_CONNECTION_FAILED: 'SMTP_CONNECTION_FAILED',
  SMTP_AUTH_FAILED: 'SMTP_AUTH_FAILED',
  SMTP_SEND_FAILED: 'SMTP_SEND_FAILED',

  TELEGRAM_TOKEN_NOT_FOUND: 'TELEGRAM_TOKEN_NOT_FOUND',
  TELEGRAM_TOKEN_EXPIRED: 'TELEGRAM_TOKEN_EXPIRED',
  TELEGRAM_SEND_FAILED: 'TELEGRAM_SEND_FAILED',
  TELEGRAM_NOT_CONFIGURED: 'TELEGRAM_NOT_CONFIGURED',

  SECRET_NOT_FOUND: 'SECRET_NOT_FOUND',
  SECRET_ACCESS_DENIED: 'SECRET_ACCESS_DENIED',
  SECRET_ROTATION_FAILED: 'SECRET_ROTATION_FAILED',

  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INTERNAL_TIMEOUT: 'INTERNAL_TIMEOUT',
  INTERNAL_DEPENDENCY_UNAVAILABLE: 'INTERNAL_DEPENDENCY_UNAVAILABLE',

  CONFIG_MISSING: 'CONFIG_MISSING',
  CONFIG_INVALID: 'CONFIG_INVALID',
};

const ERROR_HTTP_MAP = {
  [ErrorCode.AUTH_UNAUTHENTICATED]: { status: 401, message: 'Debe iniciar sesión' },
  [ErrorCode.AUTH_PERMISSION_DENIED]: { status: 403, message: 'No tiene permisos para esta acción' },
  [ErrorCode.AUTH_INVALID_CLAIMS]: { status: 401, message: 'Token inválido' },
  [ErrorCode.AUTH_TOKEN_EXPIRED]: { status: 401, message: 'Sesión expirada, inicie sesión nuevamente' },
  [ErrorCode.AUTH_TENANT_MISMATCH]: { status: 403, message: 'No tiene acceso a este tenant' },

  [ErrorCode.VALIDATION_INVALID_ARGUMENT]: { status: 400, message: 'Parámetros inválidos' },
  [ErrorCode.VALIDATION_MISSING_FIELD]: { status: 400, message: 'Campo requerido faltante' },
  [ErrorCode.VALIDATION_INVALID_FORMAT]: { status: 400, message: 'Formato de dato inválido' },
  [ErrorCode.VALIDATION_IDEMPOTENCY_INVALID]: { status: 400, message: 'Clave de idempotencia inválida' },

  [ErrorCode.RESOURCE_NOT_FOUND]: { status: 404, message: 'Recurso no encontrado' },
  [ErrorCode.RESOURCE_CONFLICT]: { status: 409, message: 'Conflicto de recurso' },
  [ErrorCode.RESOURCE_EXHAUSTED]: { status: 429, message: 'Recurso agotado' },
  [ErrorCode.RESOURCE_STOCK_INSUFFICIENT]: { status: 409, message: 'Stock insuficiente' },

  [ErrorCode.PURCHASE_INSUFFICIENT_BALANCE]: { status: 400, message: 'Saldo insuficiente' },
  [ErrorCode.PURCHASE_SERVICE_EXHAUSTED]: { status: 409, message: 'Servicio agotado, contacte al administrador' },
  [ErrorCode.PURCHASE_CUSTOMER_NOT_FOUND]: { status: 404, message: 'Cliente no encontrado' },
  [ErrorCode.PURCHASE_SERVICE_NOT_FOUND]: { status: 404, message: 'Servicio no encontrado' },
  [ErrorCode.PURCHASE_IDEMPOTENCY_TIMEOUT]: { status: 408, message: 'Tiempo de espera agotado, intente nuevamente' },
  [ErrorCode.PURCHASE_DUPLICATE_DETECTED]: { status: 409, message: 'Compra duplicada detectada' },

  [ErrorCode.RATE_LIMITED]: { status: 429, message: 'Demasiadas solicitudes, intente más tarde' },
  [ErrorCode.RATE_LIMIT_QUOTA_EXCEEDED]: { status: 429, message: 'Cuota de tasa excedida' },

  [ErrorCode.WEBHOOK_INVALID_SIGNATURE]: { status: 401, message: 'Firma de webhook inválida' },
  [ErrorCode.WEBHOOK_REPLAY_DETECTED]: { status: 409, message: 'Solicitud duplicada detectada' },
  [ErrorCode.WEBHOOK_TIMESTAMP_EXPIRED]: { status: 400, message: 'Timestamp fuera de ventana permitida' },
  [ErrorCode.WEBHOOK_INVALID_PAYLOAD]: { status: 400, message: 'Carga de webhook inválida' },
  [ErrorCode.WEBHOOK_CONFIG_ERROR]: { status: 500, message: 'Error de configuración del servidor' },

  [ErrorCode.IMAP_CONNECTION_FAILED]: { status: 503, message: 'Error de conexión IMAP' },
  [ErrorCode.IMAP_TLS_ERROR]: { status: 503, message: 'Error TLS en conexión IMAP' },
  [ErrorCode.IMAP_AUTH_FAILED]: { status: 503, message: 'Error de autenticación IMAP' },
  [ErrorCode.IMAP_POOL_EXHAUSTED]: { status: 503, message: 'Pool de conexiones IMAP agotado' },

  [ErrorCode.SMTP_CONNECTION_FAILED]: { status: 503, message: 'Error de conexión SMTP' },
  [ErrorCode.SMTP_AUTH_FAILED]: { status: 503, message: 'Error de autenticación SMTP' },
  [ErrorCode.SMTP_SEND_FAILED]: { status: 503, message: 'Error enviando email' },

  [ErrorCode.TELEGRAM_TOKEN_NOT_FOUND]: { status: 404, message: 'Token de Telegram no encontrado' },
  [ErrorCode.TELEGRAM_TOKEN_EXPIRED]: { status: 400, message: 'Token de Telegram expirado' },
  [ErrorCode.TELEGRAM_SEND_FAILED]: { status: 503, message: 'Error enviando mensaje Telegram' },
  [ErrorCode.TELEGRAM_NOT_CONFIGURED]: { status: 500, message: 'Telegram no configurado' },

  [ErrorCode.SECRET_NOT_FOUND]: { status: 500, message: 'Secreto no encontrado' },
  [ErrorCode.SECRET_ACCESS_DENIED]: { status: 500, message: 'Acceso denegado a secreto' },
  [ErrorCode.SECRET_ROTATION_FAILED]: { status: 500, message: 'Error rotando secreto' },

  [ErrorCode.INTERNAL_ERROR]: { status: 500, message: 'Error interno del servidor' },
  [ErrorCode.INTERNAL_TIMEOUT]: { status: 504, message: 'Tiempo de espera agotado' },
  [ErrorCode.INTERNAL_DEPENDENCY_UNAVAILABLE]: { status: 503, message: 'Servicio no disponible' },

  [ErrorCode.CONFIG_MISSING]: { status: 500, message: 'Configuración faltante' },
  [ErrorCode.CONFIG_INVALID]: { status: 500, message: 'Configuración inválida' },
};

function toHttpError(errorCode, customMessage = null) {
  const mapping = ERROR_HTTP_MAP[errorCode] || ERROR_HTTP_MAP[ErrorCode.INTERNAL_ERROR];
  return {
    status: mapping.status,
    message: customMessage || mapping.message,
    code: errorCode,
  };
}

function createErrorResponse(errorCode, customMessage = null, correlationId = null) {
  const httpError = toHttpError(errorCode, customMessage);
  return {
    error: {
      code: httpError.code,
      message: httpError.message,
      status: httpError.status,
      timestamp: new Date().toISOString(),
      correlationId,
    },
  };
}

module.exports = {
  ErrorCode,
  ERROR_HTTP_MAP,
  toHttpError,
  createErrorResponse,
};