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
  orderBy,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { db } from './firebase';
import { customCallable, customAdminCallable } from './apiClient';
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
  DiamondOrder,
  CreateDiamondOrderRequest,
  CreateDiamondOrderResponse,
  ProcessDiamondOrderRequest,
  ProcessDiamondOrderResponse,
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

      // Las compras históricas sin credencial inline recuperan sólo la
      // credencial asignada mediante autorización server-side de la compra.
      if (base.accountId && data.serviceId && !data.credential && !data.profiles?.length) {
        try {
          base.credential = await getPurchaseCredentials(snapDoc.id);
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
    const result = await customCallable<PurchaseResponse>('processPurchase', data);
    return result.data;
  } catch (error) {
    console.error('Error processing purchase:', error);
    throw error;
  }
};

export const extraerCodigo = async (data: ExtraerCodigoRequest): Promise<ExtraerCodigoResponse> => {
  try {
    const result = await customCallable<ExtraerCodigoResponse>('extraerCodigo', data);
    return result.data;
  } catch (error) {
    console.error('Error extracting code:', error);
    throw error;
  }
};

// ===== DIAMOND ORDERS =====

export const createDiamondOrder = async (data: CreateDiamondOrderRequest): Promise<CreateDiamondOrderResponse> => {
  try {
    const result = await customCallable<CreateDiamondOrderResponse>('createDiamondOrder', data);
    return result.data;
  } catch (error) {
    console.error('Error creating diamond order:', error);
    throw error;
  }
};

export const processDiamondOrder = async (data: ProcessDiamondOrderRequest): Promise<ProcessDiamondOrderResponse> => {
  try {
    const result = await customAdminCallable<ProcessDiamondOrderResponse>('processDiamondOrder', data);
    return result.data;
  } catch (error) {
    console.error('Error processing diamond order:', error);
    throw error;
  }
};

export const getDiamondOrders = async (customerId: string): Promise<DiamondOrder[]> => {
  if (!customerId) throw new Error('customerId required');
  try {
    const q = query(
      collection(db, 'diamondOrders'),
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((snapDoc) => {
      const data = snapDoc.data();
      return {
        id: snapDoc.id,
        tenantId: data.tenantId,
        customerId: data.customerId,
        customerEmail: data.customerEmail,
        serviceId: data.serviceId,
        serviceName: data.serviceName,
        price: data.price,
        freeFireId: data.freeFireId,
        status: data.status,
        createdAt: convertTimestamp(data.createdAt) || new Date(),
        processedAt: convertTimestamp(data.processedAt),
        processedBy: data.processedBy,
        rejectReason: data.rejectReason,
      } as DiamondOrder;
    });
  } catch (error) {
    console.error('Error getting diamond orders:', error);
    return [];
  }
};

export const getDiamondOrdersByTenant = async (tenantId: string): Promise<DiamondOrder[]> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const q = query(
      collection(db, 'diamondOrders'),
      where('tenantId', '==', tenantId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((snapDoc) => {
      const data = snapDoc.data();
      return {
        id: snapDoc.id,
        tenantId: data.tenantId,
        customerId: data.customerId,
        customerEmail: data.customerEmail,
        serviceId: data.serviceId,
        serviceName: data.serviceName,
        price: data.price,
        freeFireId: data.freeFireId,
        status: data.status,
        createdAt: convertTimestamp(data.createdAt) || new Date(),
        processedAt: convertTimestamp(data.processedAt),
        processedBy: data.processedBy,
        rejectReason: data.rejectReason,
      } as DiamondOrder;
    });
  } catch (error) {
    console.error('Error getting tenant diamond orders:', error);
    return [];
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
    customCallable('onTicketCreated', { ticketId: docRef.id }).catch(() => {});
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
  if (data.status === 'resolved') {
    customAdminCallable('onTicketUpdated', { ticketId }).catch(() => {});
  }
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

/** Public aggregate only. Errors remain unknown availability, never stock zero. */
export const getAvailableServiceStock = async (serviceId: string, tenantId: string): Promise<number> => {
  if (!serviceId) throw new Error('serviceId required');
  if (!tenantId) throw new Error('tenantId required');
  const result = await customCallable<{ available: number }>('getStockAvailability', { serviceId, tenantId });
  if (!Number.isSafeInteger(result.data?.available) || result.data.available < 0) {
    throw new Error('Respuesta de disponibilidad inválida');
  }
  return result.data.available;
};

export const getPurchaseCredentials = async (purchaseId: string): Promise<{ email: string; password: string }> => {
  const result = await customCallable<{ credential: { email: string; password: string } }>(
    'getPurchaseCredentials', { purchaseId }
  );
  const credential = result.data?.credential;
  if (typeof credential?.email !== 'string' || typeof credential?.password !== 'string') {
    throw new Error('Respuesta de credenciales inválida');
  }
  return { email: credential.email, password: credential.password };
};

// ===== RESELLER =====

export const createReseller = async (data: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  commissionPercent?: number;
}): Promise<CreateResellerResponse> => {
  const result = await customAdminCallable<CreateResellerResponse>('createReseller', data);
  return result.data;
};

// TEMPORAL: eliminar distribuidor por email
export const adminDeleteResellerByEmail = async (email: string): Promise<{ success: boolean; message: string }> => {
  const result = await customAdminCallable<{ success: boolean; message: string }>('adminDeleteResellerByEmail', { email });
  return result.data;
};

export const loadResellerBalance = async (data: {
  resellerId: string;
  amount: number;
}): Promise<LoadResellerBalanceResponse> => {
  const result = await customAdminCallable<LoadResellerBalanceResponse>('loadResellerBalance', data);
  return result.data;
};

export const processBulkPurchase = async (data: {
  serviceId: string;
  tenantId: string;
  quantity: number;
  customerName?: string;
}): Promise<ProcessBulkPurchaseResponse> => {
  const result = await customAdminCallable<ProcessBulkPurchaseResponse>('processBulkPurchase', data);
  return result.data;
};

export const getResellers = async (tenantId: string): Promise<Reseller[]> => {
  if (!tenantId) throw new Error('tenantId required');
  const { collection, query, where, getDocs } = await import('firebase/firestore');
  const { db: dbInstance } = await import('./firebase');
  const q = query(collection(dbInstance, 'resellers'), where('tenantId', '==', tenantId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reseller));
};

export const getResellerById = async (resellerId: string, _db?: Firestore): Promise<Reseller | null> => {
  const { doc, getDoc } = await import('firebase/firestore');
  const { db: dbInstance } = await import('./firebase');
  const docRef = doc(_db || dbInstance, 'resellers', resellerId);
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
}): Promise<SaveEmailConfigResponse> => {
  const result = await customAdminCallable<SaveEmailConfigResponse>('saveEmailConfig', data);
  return result.data;
};

export const getEmailConfig = async (tenantId: string, docId?: string): Promise<GetEmailConfigResponse> => {
  const result = await customAdminCallable<GetEmailConfigResponse>('getEmailConfig', {
    tenantId,
    docId: docId || 'emailConfig',
  });
  return result.data;
};

export const checkEmailStatus = async (tenantId: string, docId?: string): Promise<CheckEmailStatusResponse> => {
  const result = await customAdminCallable<CheckEmailStatusResponse>('checkEmailStatus', {
    tenantId,
    docId: docId || 'emailConfig',
  });
  return result.data;
};

// ─── Telegram ──────────────────────────────────────────────────────────────

export const generateTelegramToken = async (): Promise<GenerateTelegramTokenResponse> => {
  const result = await customAdminCallable<GenerateTelegramTokenResponse>('generateTelegramToken', {});
  return result.data;
};

export const checkTelegramStatus = async (): Promise<CheckTelegramStatusResponse> => {
  const result = await customAdminCallable<CheckTelegramStatusResponse>('checkTelegramStatus', {});
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
}): Promise<UpdateTicketCredentialsResponse> => {
  const result = await customAdminCallable<UpdateTicketCredentialsResponse>('updateTicketCredentials', data);
  return result.data;
};

export const adminUpdateTicket = async (data: Record<string, unknown>): Promise<{ success: boolean }> => {
  const result = await customAdminCallable<{ success: boolean }>('adminUpdateTicket', data);
  return result.data;
};

export const checkRechargePayment = async (data: { rechargeId: string; customerName?: string }): Promise<CheckRechargePaymentResponse> => {
  const result = await customCallable<CheckRechargePaymentResponse>('checkRechargePayment', data);
  return result.data;
};

export const testEmailConnection = async (data: {
  email: string;
  password: string;
  host: string;
  port: number;
}): Promise<TestEmailConnectionResponse> => {
  const result = await customAdminCallable<TestEmailConnectionResponse>('testEmailConnection', data);
  return result.data;
};

export const getRechargeHistory = async (): Promise<GetRechargeHistoryResponse> => {
  const result = await customCallable<GetRechargeHistoryResponse>('getRechargeHistory', {});
  return result.data;
};

// ─── SMTP ──────────────────────────────────────────────────────────────────

export const saveSmtpConfig = async (data: SmtpConfig): Promise<void> => {
  await customAdminCallable<void>('saveSmtpConfig', data);
};

export const getSmtpConfig = async (): Promise<SmtpConfig | null> => {
  const result = await customAdminCallable<SmtpConfig | null>('getSmtpConfig', {});
  return result.data;
};

export const sendTestEmail = async (): Promise<{ success: boolean; message: string }> => {
  const result = await customAdminCallable<{ success: boolean; message: string }>('sendTestEmail', {});
  return result.data;
};
