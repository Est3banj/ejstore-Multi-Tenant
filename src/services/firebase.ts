import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import {
  getAnalytics,
  isSupported,
  logEvent as firebaseLogEvent,
  type Analytics
} from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Second Firebase app for admin sessions (isolated from user auth)
const adminApp = initializeApp(firebaseConfig, 'admin');

// Initialize services
export const auth = getAuth(app);
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');
export const adminFunctions = getFunctions(adminApp, 'us-central1');

// GA4: init lazy/async. isSupported() resuelve false en entornos sin soporte
// (SSR, algunos webviews) y nunca debe tirar. Sin VITE_FIREBASE_MEASUREMENT_ID
// (dev/local sin GA) no se inicializa nada.
let analytics: Analytics | null = null;
if (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) {
  isSupported()
    .then((supported) => {
      if (supported) analytics = getAnalytics(app);
    })
    .catch(() => {});
}

// Wrapper seguro para el resto de la app: no-op si analytics no está
// disponible y jamás lanza — GA4 nunca puede romper el flujo del usuario.
export const logAnalyticsEvent = (name: string, params?: Record<string, unknown>): void => {
  if (!analytics) return;
  try {
    firebaseLogEvent(analytics, name, params);
  } catch {
    // silencioso: el tracking es best-effort
  }
};

export default app;

