import { auth, adminAuth } from './firebase';
import type { Auth } from 'firebase/auth';

const CALL_TIMEOUT_MS = 70_000;
const FRIENDLY_UNAVAILABLE = 'No se pudo conectar con el servidor. Intentá de nuevo.';
const PUBLIC_CALLS = new Set(['getStockAvailability', 'getPublicAccount', 'getPublicStats']);
const CODE_FOR_STATUS: Record<number, string> = {
  400: 'invalid-argument', 401: 'unauthenticated', 403: 'permission-denied',
  404: 'not-found', 409: 'failed-precondition', 429: 'resource-exhausted',
  500: 'internal', 501: 'unimplemented', 503: 'unavailable', 504: 'deadline-exceeded',
};

function functionsError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code.startsWith('functions/') ? code : `functions/${code}`;
  return error;
}

async function execute<Res>(session: Auth, name: string, data: unknown, signal: AbortSignal): Promise<{ data: Res }> {
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const privateCall = !PUBLIC_CALLS.has(name);
  // Wait for persisted Firebase sessions, without creating/signing out an app.
  if (privateCall) await session.authStateReady();
  const user = session.currentUser;
  const assertSession = () => {
    if (privateCall && (!user || session.currentUser !== user)) {
      throw functionsError('unauthenticated', 'La sesión cambió o venció. Volvé a iniciar sesión.');
    }
  };
  assertSession();
  if (privateCall && user) {
    let token: string;
    try {
      token = await user.getIdToken();
    } catch {
      throw functionsError('unauthenticated', 'No se pudo validar la sesión. Volvé a iniciar sesión.');
    }
    assertSession();
    if (!token) throw functionsError('unauthenticated', 'Falta el token de sesión.');
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${base}/api/${name}`, {
    method: 'POST', headers, body: JSON.stringify({ data }), signal,
  });
  if (response.ok) {
    const body = (await response.json()) as { result?: Res };
    assertSession();
    return { data: body.result as Res };
  }
  const text = await response.text().catch(() => '');
  assertSession();
  let parsed: { error?: { code?: string; message?: string } } | null = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* HTTP status remains authoritative */ }
  throw functionsError(parsed?.error?.code || CODE_FOR_STATUS[response.status] || 'internal',
    parsed?.error?.message || 'Error inesperado del servidor. Intentá de nuevo.');
}

async function call<Res>(session: Auth, name: string, data?: unknown): Promise<{ data: Res }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    return await execute<Res>(session, name, data, controller.signal);
  } catch (err) {
    if (typeof (err as { code?: unknown })?.code === 'string' && (err as { code: string }).code.startsWith('functions/')) throw err;
    if (controller.signal.aborted) throw functionsError('deadline-exceeded', 'deadline-exceeded');
    throw functionsError('unavailable', FRIENDLY_UNAVAILABLE);
  } finally { clearTimeout(timer); }
}

export const customCallable = <Res>(name: string, data?: unknown): Promise<{ data: Res }> => call<Res>(auth, name, data);
export const customAdminCallable = <Res>(name: string, data?: unknown): Promise<{ data: Res }> => call<Res>(adminAuth, name, data);
