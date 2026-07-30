import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { db, adminDb } from './firebase';
import { httpsCallable, type Functions } from 'firebase/functions';
import { functions, adminFunctions } from './firebase';
import type {
  ServiceAccount,
  Purchase,
  Notification,
  Ticket,
  PurchaseRequest,
  PurchaseResponse,
  ExtraerCodigoRequest,
  ExtraerCodigoResponse,
  CreateResellerResponse,
  LoadResellerBalanceResponse,
  ProcessBulkPurchaseResponse,
  SaveEmailConfigResponse,
  GetEmailConfigResponse,
  CheckEmailStatusResponse,
  GenerateTelegramTokenResponse,
  CheckTelegramStatusResponse,
  UpdateTicketCredentialsResponse,
  CheckRechargePaymentResponse,
  TestEmailConnectionResponse,
  GetRechargeHistoryResponse,
  Reseller,
  SmtpConfig,
} from '../types/marketplace';

// Helper to convert Firestore timestamps
const convertTimestamp = (timestamp: unknown): Date | undefined => {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }
  if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
    return new Date((timestamp as { seconds: number }).seconds * 1000);
  }
  return undefined;
};

// ===== ACCOUNTS =====

export const getAccounts = async (serviceId: string, _db?: Firestore): Promise<ServiceAccount[]> => {
  const dbInstance = _db || db;
  if (!serviceId) throw new Error('serviceId required');
  try {
    const q = query(collection(dbInstance, 'services', serviceId, 'accounts'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ServiceAccount));
  } catch (error) {
    console.error('Error getting accounts:', error);
    throw error;
  }
};

export const getAccountById = async (serviceId: string, accountId: string, _db?: Firestore): Promise<ServiceAccount | null> => {
  const dbInstance = _db || db;
  if (!serviceId) throw new Error('serviceId required');
  try {
    const docRef = doc(dbInstance, 'services', serviceId, 'accounts', accountId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as ServiceAccount;
    }
    return null;
  } catch (error) {
    console.error('Error getting account:', error);
    throw error;
  }
};

interface CreateAccountInput {
  label: string;
  credential: { email: string; password: string; extra?: Record<string, string> };
  extras?: string[];
  notes?: string;
  batchNumber?: string;
  profiles?: Array<{ name: string; pin: string }>;
}

export const createAccount = async (serviceId: string, data: CreateAccountInput, _db?: Firestore): Promise<string> => {
  const dbInstance = _db || db;
  if (!serviceId) throw new Error('serviceId required');
  try {
    const profiles = data.profiles || [];
    const totalProfiles = profiles.length;

    if (totalProfiles > 0) {
      // Use batch write: create account + profile subdocs
      const accountsRef = collection(dbInstance, 'services', serviceId, 'accounts');
      const accountDocRef = doc(accountsRef);

      const batch = writeBatch(dbInstance);
      batch.set(accountDocRef, {
        serviceId,
        label: data.label,
        credential: data.credential,
        extras: data.extras || [],
        notes: data.notes || '',
        batchNumber: data.batchNumber || '',
        status: 'available',
        totalProfiles,
        availableProfiles: totalProfiles,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const profile of profiles) {
        const profileRef = doc(collection(dbInstance, 'services', serviceId, 'accounts', accountDocRef.id, 'profiles'));
        batch.set(profileRef, {
          name: profile.name,
          pin: profile.pin || '',
          status: 'available',
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      return accountDocRef.id;
    } else {
      // Legacy: no profiles, create account only (backward compat)
      const docRef = await addDoc(collection(dbInstance, 'services', serviceId, 'accounts'), {
        ...data,
        serviceId,
        status: 'available',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    }
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
};

export const updateAccount = async (
  serviceId: string,
  accountId: string,
  data: Partial<CreateAccountInput & { status: ServiceAccount['status'] }>,
  _db?: Firestore
): Promise<void> => {
  const dbInstance = _db || db;
  if (!serviceId) throw new Error('serviceId required');
  try {
    const docRef = doc(dbInstance, 'services', serviceId, 'accounts', accountId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating account:', error);
    throw error;
  }
};

export const deleteAccount = async (serviceId: string, accountId: string, _db?: Firestore): Promise<void> => {
  const dbInstance = _db || db;
  if (!serviceId) throw new Error('serviceId required');
  try {
    const docRef = doc(dbInstance, 'services', serviceId, 'accounts', accountId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting account:', error);
    throw error;
  }
};

// Batch import: parse text lines and create accounts
export const createAccountsBatch = async (
  serviceId: string,
  lines: string[],
  _db?: Firestore
): Promise<{ created: number; failed: { line: string; error: string }[] }> => {
  if (!serviceId) throw new Error('serviceId required');

  const results = { created: 0, failed: [] as { line: string; error: string }[] };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format: email:password:label:extras
    // Support both : and | as delimiters
    const parts = trimmed.includes('|') ? trimmed.split('|') : trimmed.split(':');

    if (parts.length < 2) {
      results.failed.push({ line: trimmed, error: 'Formato inválido. Mínimo: email:password' });
      continue;
    }

    try {
      const credential = { email: parts[0].trim(), password: parts[1].trim() };
      const label = parts[2]?.trim() || '';
      const extras = parts[3] ? parts[3].split(',').map((e: string) => e.trim()) : [];

      await createAccount(serviceId, { label, credential, extras }, _db);
      results.created++;
    } catch (error) {
      results.failed.push({ line: trimmed, error: (error as Error).message });
    }
  }

  return results;
};

// ===== PURCHASES =====

export const getPurchases = async (customerId: string): Promise<Purchase[]> => {
  if (!customerId) throw new Error('customerId required');
  try {
    const q = query(collection(db, 'purchases'), where('customerId', '==', customerId));
    const snapshot = await getDocs(q);
    const purchases = await Promise.all(snapshot.docs.map(async (snapDoc) => {
      const data = snapDoc.data();
      const base: Record<string, unknown> = {
        id: snapDoc.id,
        ...data,
        createdAt: convertTimestamp(data.createdAt) || new Date(),
        expiresAt: data.expiresAt ? convertTimestamp(data.expiresAt) : undefined,
        renewedAt: data.renewedAt ? convertTimestamp(data.renewedAt) : undefined,
        lastCodeExtraction: data.lastCodeExtraction ? convertTimestamp(data.lastCodeExtraction) : undefined,
      };

      // Si la compra tiene accountId pero no tiene credenciales inline,
      // buscar las credenciales desde el documento de la cuenta
      if (base.accountId && data.serviceId && !data.credential && !data.profiles) {
        try {
          const acctRef = doc(db, 'services', data.serviceId, 'accounts', base.accountId as string);
          const acctSnap = await getDoc(acctRef);
          if (acctSnap.exists()) {
            const acctData = acctSnap.data() as Record<string, unknown>;
            const cred = (acctData.credential as Record<string, string>) || acctData;
            base.credential = {
              email: (cred.email || cred.correo || '') as string,
              password: (cred.password || cred.clave || '') as string,
            };
            base.profileName = (base.profileName as string) || (acctData.profileName as string) || '';
            base.profilePin = (base.profilePin as string) || (acctData.profilePin as string) || '';
          }
        } catch {
          // silencioso
        }
      }

      return base as unknown as Purchase;
    }));
    return purchases;
  } catch (error) {
    console.error('Error getting purchases:', error);
    return [];
  }
};

// Cloud Function wrappers
export const processPurchase = async (data: PurchaseRequest): Promise<PurchaseResponse> => {
  try {
    const cf = httpsCallable<PurchaseRequest, PurchaseResponse>(functions, 'processPurchase');
    const result = await cf(data);
    return result.data;
  } catch (error) {
    console.error('Error processing purchase:', error);
    throw error;
  }
};

export const extraerCodigo = async (data: ExtraerCodigoRequest): Promise<ExtraerCodigoResponse> => {
  try {
    const cf = httpsCallable<ExtraerCodigoRequest, ExtraerCodigoResponse>(functions, 'extraerCodigo');
    const result = await cf(data);
    return result.data;
  } catch (error) {
    console.error('Error extracting code:', error);
    throw error;
  }
};

// ===== NOTIFICATIONS =====

export const getNotifications = async (userId: string): Promise<Notification[]> => {
  if (!userId) throw new Error('userId required');
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      // TODO: order by createdAt descending once index is created
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: convertTimestamp(data.createdAt) || new Date(),
      } as Notification;
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    return [];
  }
};

export const markNotificationRead = async (notificationId: string): Promise<void> => {
  try {
    const docRef = doc(db, 'notifications', notificationId);
    await updateDoc(docRef, { read: true });
  } catch (error) {
    console.error('Error marking notification read:', error);
    throw error;
  }
};

// ===== TICKETS =====

export const createTicket = async (data: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  try {
    // Firestore no acepta undefined como valor, solo null
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    const docRef = await addDoc(collection(db, 'tickets'), {
      ...cleanData,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating ticket:', error);
    throw error;
  }
};

export const getTickets = async (tenantId: string): Promise<Ticket[]> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const q = query(collection(adminDb, 'tickets'), where('tenantId', '==', tenantId));
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: convertTimestamp(data.createdAt) || new Date(),
        updatedAt: convertTimestamp(data.updatedAt) || new Date(),
      } as Ticket;
    });
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (error) {
    console.error('Error getting tickets:', error);
    return [];
  }
};

export const updateTicket = async (
  ticketId: string,
  data: { status?: 'open' | 'resolved' | 'closed'; adminNotes?: string; newCredentials?: Record<string, string> },
  _db?: Firestore
): Promise<void> => {
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  const { db } = await import('./firebase');
  const dbInstance = _db || db;
  const ticketRef = doc(dbInstance, 'tickets', ticketId);
  await updateDoc(ticketRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

// ===== STOCK =====

export const getServiceStock = async (serviceId: string, _db?: Firestore): Promise<{
  total: number;
  available: number;
  sold: number;
  expired: number;
}> => {
  if (!serviceId) throw new Error('serviceId required');
  try {
    const accounts = await getAccounts(serviceId, _db);
    let total = 0, available = 0, sold = 0, expired = 0;

    for (const account of accounts) {
      if (account.availableProfiles !== undefined) {
        total += account.totalProfiles || 0;
        available += account.availableProfiles;
        sold += (account.totalProfiles || 0) - account.availableProfiles;
      } else {
        total += 1;
        if (account.status === 'available') available += 1;
        else if (account.status === 'sold') sold += 1;
        else if (account.status === 'expired') expired += 1;
      }
    }

    return { total, available, sold, expired };
  } catch (error) {
    console.error('Error getting stock:', error);
    throw error;
  }
};

/**
 * Returns available stock count for a service — queries only `status == 'available'` accounts.
 * Works within Firestore rules for resellers who don't have isSuperadmin()/isAdmin().
 *
 * The rules allow reading accounts where `resource.data.status == 'available'`,
 * but for a list query to match this condition, the query MUST include a `where('status', '==', 'available')`.
 * This function exists specifically for the reseller catalog view where we only need the available count
 * and can't use getServiceStock() (which queries ALL accounts without a filter).
 */
export const getAvailableServiceStock = async (serviceId: string, _db?: Firestore): Promise<number> => {
  const dbInstance = _db || db;
  if (!serviceId) throw new Error('serviceId required');
  try {
    const q = query(
      collection(dbInstance, 'services', serviceId, 'accounts'),
      where('status', '==', 'available')
    );
    const snapshot = await getDocs(q);
    let available = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      // New format: accounts have availableProfiles counter
      // Legacy format: each account = 1 profile
      available += data.availableProfiles ?? 1;
    }
    return available;
  } catch (error) {
    console.error('Error getting available stock:', error);
    throw error;
  }
};

// ===== RESELLER =====

export const createReseller = async (data: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  commissionPercent?: number;
}, _functions?: Functions): Promise<CreateResellerResponse> => {
  const fnInstance = _functions || functions;
  const cf = httpsCallable<Record<string, unknown>, CreateResellerResponse>(fnInstance, 'createReseller');
  const result = await cf(data);
  return result.data;
};

// TEMPORAL: eliminar distribuidor por email
export const adminDeleteResellerByEmail = async (email: string, _functions?: Functions): Promise<{ success: boolean; message: string }> => {
  const fnInstance = _functions || functions;
  const cf = httpsCallable<{ email: string }, { success: boolean; message: string }>(fnInstance, 'adminDeleteResellerByEmail');
  const result = await cf({ email });
  return result.data;
};

export const loadResellerBalance = async (data: {
  resellerId: string;
  amount: number;
}, _functions?: Functions): Promise<LoadResellerBalanceResponse> => {
  const fnInstance = _functions || functions;
  const cf = httpsCallable<Record<string, unknown>, LoadResellerBalanceResponse>(fnInstance, 'loadResellerBalance');
  const result = await cf(data);
  return result.data;
};

export const processBulkPurchase = async (data: {
  serviceId: string;
  tenantId: string;
  quantity: number;
  customerName?: string;
}, _functions?: Functions): Promise<ProcessBulkPurchaseResponse> => {
  const fnInstance = _functions || functions;
  const cf = httpsCallable<Record<string, unknown>, ProcessBulkPurchaseResponse>(fnInstance, 'processBulkPurchase');
  const result = await cf(data);
  return result.data;
};

export const getResellers = async (tenantId: string): Promise<Reseller[]> => {
  if (!tenantId) throw new Error('tenantId required');
  const { collection, query, where, getDocs } = await import('firebase/firestore');
  const { adminDb: db } = await import('./firebase');
  const q = query(collection(db, 'resellers'), where('tenantId', '==', tenantId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reseller));
};

export const getResellerById = async (resellerId: string): Promise<Reseller | null> => {
  const { doc, getDoc } = await import('firebase/firestore');
  const { adminDb } = await import('./firebase');
  const docRef = doc(adminDb, 'resellers', resellerId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() } as Reseller;
  return null;
};

// ─── Correo Madre ──────────────────────────────────────────────────────────

export const saveEmailConfig = async (data: {
  tenantId: string;
  email: string;
  password: string;
  host: string;
  port: number;
  docId?: string;
}, _functions?: Functions): Promise<SaveEmailConfigResponse> => {
  const fnInstance = _functions || functions;
  const cf = httpsCallable<Record<string, unknown>, SaveEmailConfigResponse>(fnInstance, 'saveEmailConfig');
  const result = await cf(data);
  return result.data;
};

export const getEmailConfig = async (tenantId: string, docId?: string, _functions?: Functions): Promise<GetEmailConfigResponse> => {
  const fnInstance = _functions || functions;
  const cf = httpsCallable<Record<string, unknown>, GetEmailConfigResponse>(fnInstance, 'getEmailConfig');
  const result = await cf({ tenantId, docId: docId || 'emailConfig' });
  return result.data;
};

export const checkEmailStatus = async (tenantId: string, docId?: string, _functions?: Functions): Promise<CheckEmailStatusResponse> => {
  const fnInstance = _functions || functions;
  const cf = httpsCallable<Record<string, unknown>, CheckEmailStatusResponse>(fnInstance, 'checkEmailStatus');
  const result = await cf({ tenantId, docId: docId || 'emailConfig' });
  return result.data;
};

// ─── Telegram ────────────────────────────────────────────────────────────

export const generateTelegramToken = async (): Promise<GenerateTelegramTokenResponse> => {
  const cf = httpsCallable<Record<string, never>, GenerateTelegramTokenResponse>(adminFunctions, 'generateTelegramToken');
  const result = await cf({});
  return result.data;
};

export const checkTelegramStatus = async (): Promise<CheckTelegramStatusResponse> => {
  const cf = httpsCallable<Record<string, never>, CheckTelegramStatusResponse>(adminFunctions, 'checkTelegramStatus');
  const result = await cf({});
  return result.data;
};

export const updateTicketCredentials = async (data: {
  ticketId: string;
  purchaseDocId?: string;
  accountIndex?: number;
  newEmail?: string;
  newPassword?: string;
  newProfileName?: string;
  newProfilePin?: string;
}, _functions?: Functions): Promise<UpdateTicketCredentialsResponse> => {
  const fnInstance = _functions || functions;
  const cf = httpsCallable<Record<string, unknown>, UpdateTicketCredentialsResponse>(fnInstance, 'updateTicketCredentials');
  const result = await cf(data);
  return result.data;
};

export const adminUpdateTicket = async (data: Record<string, unknown>): Promise<{ success: boolean }> => {
  const cf = httpsCallable<Record<string, unknown>, { success: boolean }>(adminFunctions, 'adminUpdateTicket');
  const result = await cf(data);
  return result.data;
};

export const checkRechargePayment = async (data: { rechargeId: string; customerName?: string }): Promise<CheckRechargePaymentResponse> => {
  const cf = httpsCallable<Record<string, unknown>, CheckRechargePaymentResponse>(functions, 'checkRechargePayment');
  const result = await cf(data);
  return result.data;
};

export const testEmailConnection = async (data: {
  email: string;
  password: string;
  host: string;
  port: number;
}, _functions?: Functions): Promise<TestEmailConnectionResponse> => {
  const fnInstance = _functions || functions;
  const cf = httpsCallable<Record<string, unknown>, TestEmailConnectionResponse>(fnInstance, 'testEmailConnection');
  const result = await cf(data);
  return result.data;
};

export const getRechargeHistory = async (_functions?: Functions): Promise<GetRechargeHistoryResponse> => {
  const fnInstance = _functions || functions;
  const cf = httpsCallable<Record<string, never>, GetRechargeHistoryResponse>(fnInstance, 'getRechargeHistory');
  const result = await cf({});
  return result.data;
};

// ─── SMTP ─────────────────────────────────────────────────────────────────

export const saveSmtpConfig = async (data: SmtpConfig, _functions?: Functions): Promise<void> => {
  const fnInstance = _functions || functions;
  const fn = httpsCallable<Record<string, unknown>, void>(fnInstance, 'saveSmtpConfig');
  await fn(data as unknown as Record<string, unknown>);
};

export const getSmtpConfig = async (_functions?: Functions): Promise<SmtpConfig | null> => {
  const fnInstance = _functions || functions;
  const fn = httpsCallable<Record<string, never>, SmtpConfig | null>(fnInstance, 'getSmtpConfig');
  const result = await fn({});
  return result.data;
};

export const sendTestEmail = async (_functions?: Functions): Promise<{ success: boolean; message: string }> => {
  const fnInstance = _functions || functions;
  const fn = httpsCallable<Record<string, never>, { success: boolean; message: string }>(fnInstance, 'sendTestEmail');
  const result = await fn({});
  return result.data;
};
