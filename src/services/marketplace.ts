import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
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
}

export const createAccount = async (serviceId: string, data: CreateAccountInput): Promise<string> => {
  if (!serviceId) throw new Error('serviceId required');
  try {
    const docRef = await addDoc(collection(db, 'services', serviceId, 'accounts'), {
      ...data,
      serviceId,
      status: 'available',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
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
    const docRef = await addDoc(collection(db, 'tickets'), {
      ...data,
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
    return {
      total: accounts.length,
      available: accounts.filter((a) => a.status === 'available').length,
      sold: accounts.filter((a) => a.status === 'sold').length,
      expired: accounts.filter((a) => a.status === 'expired').length,
    };
  } catch (error) {
    console.error('Error getting stock:', error);
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
}): Promise<{
  success: boolean;
  purchaseId: string;
  credentials: any[];
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
