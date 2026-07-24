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
} from 'firebase/firestore';
import { db } from './firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type {
  ServiceAccount,
  Purchase,
  Notification,
  Ticket,
  PurchaseRequest,
  PurchaseResponse,
  ExtraerCodigoRequest,
  ExtraerCodigoResponse,
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

export const getAccounts = async (serviceId: string): Promise<ServiceAccount[]> => {
  if (!serviceId) throw new Error('serviceId required');
  try {
    const q = query(collection(db, 'services', serviceId, 'accounts'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ServiceAccount));
  } catch (error) {
    console.error('Error getting accounts:', error);
    throw error;
  }
};

export const getAccountById = async (serviceId: string, accountId: string): Promise<ServiceAccount | null> => {
  if (!serviceId) throw new Error('serviceId required');
  try {
    const docRef = doc(db, 'services', serviceId, 'accounts', accountId);
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

export const createAccount = async (serviceId: string, data: CreateAccountInput): Promise<string> => {
  if (!serviceId) throw new Error('serviceId required');
  try {
    const profiles = data.profiles || [];
    const totalProfiles = profiles.length;

    if (totalProfiles > 0) {
      // Use batch write: create account + profile subdocs
      const accountsRef = collection(db, 'services', serviceId, 'accounts');
      const accountDocRef = doc(accountsRef);

      const batch = writeBatch(db);
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
        const profileRef = doc(collection(db, 'services', serviceId, 'accounts', accountDocRef.id, 'profiles'));
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
      const docRef = await addDoc(collection(db, 'services', serviceId, 'accounts'), {
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
  data: Partial<CreateAccountInput & { status: ServiceAccount['status'] }>
): Promise<void> => {
  if (!serviceId) throw new Error('serviceId required');
  try {
    const docRef = doc(db, 'services', serviceId, 'accounts', accountId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating account:', error);
    throw error;
  }
};

export const deleteAccount = async (serviceId: string, accountId: string): Promise<void> => {
  if (!serviceId) throw new Error('serviceId required');
  try {
    const docRef = doc(db, 'services', serviceId, 'accounts', accountId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting account:', error);
    throw error;
  }
};

// Batch import: parse text lines and create accounts
export const createAccountsBatch = async (
  serviceId: string,
  lines: string[]
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

      await createAccount(serviceId, { label, credential, extras });
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
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: convertTimestamp(data.createdAt) || new Date(),
        expiresAt: data.expiresAt ? convertTimestamp(data.expiresAt) : undefined,
        renewedAt: data.renewedAt ? convertTimestamp(data.renewedAt) : undefined,
        lastCodeExtraction: data.lastCodeExtraction ? convertTimestamp(data.lastCodeExtraction) : undefined,
      } as Purchase;
    });
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
    const q = query(collection(db, 'tickets'), where('tenantId', '==', tenantId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: convertTimestamp(data.createdAt) || new Date(),
        updatedAt: convertTimestamp(data.updatedAt) || new Date(),
      } as Ticket;
    });
  } catch (error) {
    console.error('Error getting tickets:', error);
    return [];
  }
};

export const updateTicket = async (
  ticketId: string,
  data: { status?: 'open' | 'resolved' | 'closed'; adminNotes?: string }
): Promise<void> => {
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  const { db } = await import('./firebase');
  const ticketRef = doc(db, 'tickets', ticketId);
  await updateDoc(ticketRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

// ===== STOCK =====

export const getServiceStock = async (serviceId: string): Promise<{
  total: number;
  available: number;
  sold: number;
  expired: number;
}> => {
  if (!serviceId) throw new Error('serviceId required');
  try {
    const accounts = await getAccounts(serviceId);
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
export const getAvailableServiceStock = async (serviceId: string): Promise<number> => {
  if (!serviceId) throw new Error('serviceId required');
  try {
    const q = query(
      collection(db, 'services', serviceId, 'accounts'),
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
}): Promise<{ success: boolean; uid: string; email: string; message: string }> => {
  const cf = httpsCallable(functions, 'createReseller');
  const result = await cf(data);
  return result.data as any;
};

export const loadResellerBalance = async (data: {
  resellerId: string;
  amount: number;
}): Promise<{ success: boolean; newBalance: number }> => {
  const cf = httpsCallable(functions, 'loadResellerBalance');
  const result = await cf(data);
  return result.data as any;
};

export const processBulkPurchase = async (data: {
  serviceId: string;
  tenantId: string;
  quantity: number;
  customerName?: string;
}): Promise<{
  success: boolean;
  purchaseId: string;
  credentials: any[];
  profiles?: any[];
  serviceName: string;
  quantity: number;
  newBalance: number;
  message: string;
  linkTokens?: string[];
}> => {
  const cf = httpsCallable(functions, 'processBulkPurchase');
  const result = await cf(data);
  return result.data as any;
};

export const getResellers = async (tenantId: string): Promise<any[]> => {
  if (!tenantId) throw new Error('tenantId required');
  const { collection, query, where, getDocs } = await import('firebase/firestore');
  const { db } = await import('./firebase');
  const q = query(collection(db, 'resellers'), where('tenantId', '==', tenantId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getResellerById = async (resellerId: string): Promise<any | null> => {
  const { doc, getDoc } = await import('firebase/firestore');
  const { db } = await import('./firebase');
  const docRef = doc(db, 'resellers', resellerId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
  return null;
};

// ─── Correo Madre ──────────────────────────────────────────────────────────

export const saveEmailConfig = async (data: {
  tenantId: string;
  email: string;
  password: string;
  host: string;
  port: number;
}): Promise<{ success: boolean }> => {
  const cf = httpsCallable(functions, 'saveEmailConfig');
  const result = await cf(data);
  return result.data as any;
};

export const getEmailConfig = async (tenantId: string): Promise<{
  config: { email: string; host: string; port: number; hasPassword: boolean } | null;
}> => {
  const cf = httpsCallable(functions, 'getEmailConfig');
  const result = await cf({ tenantId });
  return result.data as any;
};

export const updateTicketCredentials = async (data: {
  ticketId: string;
  purchaseDocId: string;
  accountIndex: number;
  newEmail?: string;
  newPassword?: string;
  newProfileName?: string;
  newProfilePin?: string;
}): Promise<{ success: boolean }> => {
  const cf = httpsCallable(functions, 'updateTicketCredentials');
  const result = await cf(data);
  return result.data as any;
};

export const testEmailConnection = async (data: {
  email: string;
  password: string;
  host: string;
  port: number;
}): Promise<{ success: boolean; message: string }> => {
  const cf = httpsCallable(functions, 'testEmailConnection');
  const result = await cf(data);
  return result.data as any;
};
