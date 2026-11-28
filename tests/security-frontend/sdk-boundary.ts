// Only external SDK/network boundaries. No src service/store/component mocks.
import { vi } from 'vitest';
import '@testing-library/jest-dom';

const sdk = vi.hoisted(() => {
  const sessions = new Map<string, any>();
  const listeners = new Map<any, Set<(user: any) => void>>();
  return {
    sessions, listeners, documents: new Map<string, any>(), reads: [] as any[], writes: [] as any[],
    getDoc: vi.fn(), getDocs: vi.fn(), logEvent: vi.fn(), supported: vi.fn(async () => true),
    emit(session: any, user: any) {
      session.currentUser = user;
      for (const callback of listeners.get(session) || []) callback(user);
    },
  };
});

vi.mock('firebase/app', async importOriginal => ({
  ...await importOriginal<any>(),
  initializeApp: vi.fn((options, name = '[DEFAULT]') => ({ name, options })),
}));
vi.mock('firebase/auth', async importOriginal => ({
  ...await importOriginal<any>(),
  getAuth: vi.fn(app => {
    if (!sdk.sessions.has(app.name)) sdk.sessions.set(app.name, { app, currentUser: null, authStateReady: async () => {} });
    return sdk.sessions.get(app.name);
  }),
  onAuthStateChanged: vi.fn((session, callback) => {
    const set = sdk.listeners.get(session) || new Set();
    sdk.listeners.set(session, set);
    set.add(callback);
    callback(session.currentUser);
    return () => set.delete(callback);
  }),
  setPersistence: vi.fn(async () => {}),
  createUserWithEmailAndPassword: vi.fn(async (session, email) => {
    const user = { uid: 'registered', email };
    sdk.emit(session, user);
    return { user };
  }),
  signOut: vi.fn(async session => sdk.emit(session, null)),
}));
vi.mock('firebase/firestore', async importOriginal => ({
  ...await importOriginal<any>(),
  getFirestore: vi.fn(app => ({ app })),
  doc: (db, ...parts) => ({ db, path: parts.join('/') }),
  collection: (db, ...parts) => ({ db, path: parts.join('/') }),
  where: (field, op, value) => ({ field, op, value }),
  query: (ref, ...filters) => ({ ...ref, filters }),
  getDoc: sdk.getDoc,
  getDocs: sdk.getDocs,
  setDoc: vi.fn(async (ref, data) => { sdk.writes.push({ ref, data }); }),
  updateDoc: vi.fn(async (ref, data) => { sdk.writes.push({ ref, data }); }),
  serverTimestamp: () => 'synthetic-timestamp',
}));
vi.mock('firebase/storage', async importOriginal => ({
  ...await importOriginal<any>(), getStorage: app => ({ app }),
}));
vi.mock('firebase/functions', async importOriginal => ({
  ...await importOriginal<any>(), getFunctions: app => ({ app }),
}));
vi.mock('firebase/analytics', () => ({
  isSupported: sdk.supported, getAnalytics: vi.fn(app => ({ app })), logEvent: sdk.logEvent,
  settings: vi.fn(),
}));
Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addListener() {}, removeListener() {} }) });
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as any;
export { sdk };
