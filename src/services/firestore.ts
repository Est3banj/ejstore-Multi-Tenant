import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  serverTimestamp,
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import type { Service, Banner, Settings, Tenant } from '../types';

// Tipo para documentos de Firestore con timestamps convertidos
interface FirestoreDoc {
  id: string;
  [key: string]: unknown;
}

// Helper para convertir timestamp de Firestore a Date
const convertTimestamp = (timestamp: unknown): Date | undefined => {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }
  if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
    return new Date((timestamp as { seconds: number }).seconds * 1000);
  }
  return undefined;
};

// Helper para mapear documento de Firestore
const mapDoc = <T extends DocumentData>(docSnap: QueryDocumentSnapshot<T>): FirestoreDoc => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        value instanceof Timestamp ? convertTimestamp(value) : value
      ])
    )
  };
};

export const getServices = async (tenantId: string): Promise<Service[]> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const q = query(
      collection(db, 'services'),
      where('tenantId', '==', tenantId)
    );
    const querySnapshot = await getDocs(q);
    const services = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        name: data.name,
        description: data.description,
        price: data.price,
        promotionalPrice: data.promotionalPrice,
        category: data.category,
        images: data.images || [],
        image: data.image || data.images?.[0] || '',
        isActive: data.active !== false,
        isPopular: data.isPopular || false,
        createdAt: convertTimestamp(data.createdAt),
        plans: data.plans
      } as Service;
    });
    return services
      .filter(s => s.isActive === true)
      .sort((a, b) => {
        const aTime = a.createdAt?.getTime() || 0;
        const bTime = b.createdAt?.getTime() || 0;
        return bTime - aTime;
      });
  } catch (error) {
    console.error('Error getting services:', error);
    throw error;
  }
};

export const getAllServices = async (tenantId: string): Promise<Service[]> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const q = query(
      collection(db, 'services'),
      where('tenantId', '==', tenantId)
    );
    const querySnapshot = await getDocs(q);
    const services = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        name: data.name,
        description: data.description,
        price: data.price,
        promotionalPrice: data.promotionalPrice,
        category: data.category,
        images: data.images || [],
        image: data.image || data.images?.[0] || '',
        isActive: data.active !== false,
        isPopular: data.isPopular || false,
        createdAt: convertTimestamp(data.createdAt),
        plans: data.plans
      } as Service;
    });
    return services.sort((a, b) => {
      const aTime = a.createdAt?.getTime() || 0;
      const bTime = b.createdAt?.getTime() || 0;
      return bTime - aTime;
    });
  } catch (error) {
    console.error('Error getting all services:', error);
    throw error;
  }
};

export const getServiceById = async (id: string, tenantId: string): Promise<Service | null> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'services', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.tenantId === tenantId) {
        return {
          id: docSnap.id,
          tenantId: data.tenantId,
          name: data.name,
          description: data.description,
          price: data.price,
          promotionalPrice: data.promotionalPrice,
          category: data.category,
          images: data.images || [],
          image: data.image || data.images?.[0] || '',
          isActive: data.active !== false,
          isPopular: data.isPopular || false,
          createdAt: convertTimestamp(data.createdAt),
          plans: data.plans
        } as Service;
      }
    }
    return null;
  } catch (error) {
    console.error('Error getting service:', error);
    throw error;
  }
};

interface ServiceInput {
  name: string;
  description: string;
  price: number;
  category: string;
  images: string[];
  isActive: boolean;
  isPopular?: boolean;
  plans?: Service['plans'];
}

export const createService = async (serviceData: ServiceInput, tenantId: string): Promise<string> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = await addDoc(collection(db, 'services'), {
      ...serviceData,
      tenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating service:', error);
    throw error;
  }
};

export const updateService = async (id: string, serviceData: Partial<ServiceInput>, tenantId: string): Promise<void> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'services', id);
    await updateDoc(docRef, {
      ...serviceData,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating service:', error);
    throw error;
  }
};

export const deleteService = async (id: string, _tenantId: string): Promise<void> => {
  try {
    const docRef = doc(db, 'services', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting service:', error);
    throw error;
  }
};

export const getTerms = async (tenantId: string): Promise<string> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'tenants', tenantId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().terms || '';
    }
    return '';
  } catch (error) {
    console.error('Error getting terms:', error);
    return '';
  }
};

export const updateTerms = async (tenantId: string, content: string): Promise<void> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'tenants', tenantId);
    await updateDoc(docRef, {
      terms: content,
      termsUpdatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating terms:', error);
    throw error;
  }
};

export const getBanners = async (tenantId: string): Promise<Banner[]> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const q = query(
      collection(db, 'banners'),
      where('tenantId', '==', tenantId)
    );
    const querySnapshot = await getDocs(q);
    const banners = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl || data.image || '',
        image: data.image || data.imageUrl || '',
        link: data.link,
        order: data.order || 0,
        isActive: data.active !== false
      } as Banner;
    });
    return banners
      .filter(b => b.isActive === true)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  } catch (error) {
    console.error('Error getting banners:', error);
    return [];
  }
};

export const getAllBanners = async (tenantId: string): Promise<Banner[]> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const q = query(
      collection(db, 'banners'),
      where('tenantId', '==', tenantId)
    );
    const querySnapshot = await getDocs(q);
    const banners = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl || data.image || '',
        image: data.image || data.imageUrl || '',
        link: data.link,
        order: data.order || 0,
        isActive: data.active !== false
      } as Banner;
    });
    return banners.sort((a, b) => (a.order || 0) - (b.order || 0));
  } catch (error) {
    console.error('Error getting all banners:', error);
    return [];
  }
};

interface BannerInput {
  title: string;
  imageUrl: string;
  link?: string;
  order: number;
  isActive: boolean;
}

export const createBanner = async (bannerData: BannerInput, tenantId: string): Promise<string> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = await addDoc(collection(db, 'banners'), {
      ...bannerData,
      tenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating banner:', error);
    throw error;
  }
};

export const updateBanner = async (id: string, bannerData: Partial<BannerInput>, tenantId: string): Promise<void> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'banners', id);
    await updateDoc(docRef, {
      ...bannerData,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating banner:', error);
    throw error;
  }
};

export const deleteBanner = async (id: string, _tenantId: string): Promise<void> => {
  try {
    const docRef = doc(db, 'banners', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting banner:', error);
    throw error;
  }
};

interface SettingsOutput extends Settings {
  primaryColor?: string;
  secondaryColor?: string;
  qrImage?: string;
  brebKey?: string;
  brebBankName?: string;
  discordWebhookUrl?: string;
}

export const getSettings = async (tenantId: string): Promise<SettingsOutput | null> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'tenants', tenantId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        tenantId,
        logo: data.logoUrl || '',
        whatsappNumber: data.whatsappNumber || '',
        contactEmail: data.contactEmail || '',
        siteName: data.name || 'Mi Tienda',
        primaryColor: data.primaryColor || '#E50914',
        secondaryColor: data.secondaryColor || '#1A1A1A',
        qrImage: data.qrImage || '',
        brebKey: data.brebKey || '',
        brebBankName: data.brebBankName || '',
        discordWebhookUrl: data.discordWebhookUrl || ''
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting settings:', error);
    return null;
  }
};

interface SettingsInput {
  siteName: string;
  logo?: string;
  whatsappNumber?: string;
  contactEmail?: string;
  primaryColor?: string;
  secondaryColor?: string;
  qrImage?: string;
  brebKey?: string;
  brebBankName?: string;
  discordWebhookUrl?: string;
}

export const updateSettings = async (tenantId: string, settings: SettingsInput): Promise<void> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'tenants', tenantId);
    const firestoreData = {
      name: settings.siteName,
      logoUrl: settings.logo,
      whatsappNumber: settings.whatsappNumber,
      contactEmail: settings.contactEmail,
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      qrImage: settings.qrImage,
      brebKey: settings.brebKey,
      brebBankName: settings.brebBankName,
      discordWebhookUrl: settings.discordWebhookUrl || '',
      updatedAt: serverTimestamp()
    };
    await setDoc(docRef, firestoreData, { merge: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};

export const updateTenant = async (tenantId: string, data: Partial<Tenant>): Promise<void> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'tenants', tenantId);
    await setDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error updating tenant:', error);
    throw error;
  }
};

// === RECARGAS ===
import type { Recharge } from '../types';

export const createRechargeRequest = async (recharge: Omit<Recharge, 'id' | 'createdAt' | 'status'>): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, 'recharges'), {
      ...recharge,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating recharge request:', error);
    throw error;
  }
};

export const getRecharges = async (tenantId: string): Promise<Recharge[]> => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const q = query(
      collection(db, 'recharges'),
      where('tenantId', '==', tenantId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date()
    })) as Recharge[];
  } catch (error) {
    console.error('Error getting recharges:', error);
    return [];
  }
};

export const approveRecharge = async (rechargeId: string, adminId: string): Promise<void> => {
  try {
    const docRef = doc(db, 'recharges', rechargeId);
    await updateDoc(docRef, {
      status: 'approved',
      processedAt: serverTimestamp(),
      processedBy: adminId
    });
  } catch (error) {
    console.error('Error approving recharge:', error);
    throw error;
  }
};

export const rejectRecharge = async (rechargeId: string, adminId: string, reason?: string): Promise<void> => {
  try {
    const docRef = doc(db, 'recharges', rechargeId);
    await updateDoc(docRef, {
      status: 'rejected',
      processedAt: serverTimestamp(),
      processedBy: adminId,
      rejectionReason: reason || 'Rechazado por el administrador'
    });
  } catch (error) {
    console.error('Error rejecting recharge:', error);
    throw error;
  }
};

// ========== CONFIGURACIÓN DE RULETA ==========
export interface RouletteConfigData {
  tenantId: string;
  isEnabled: boolean;
  pricePerSpin: number;
  spinsForFreeSpin: number;
  prizes: {
    id: string;
    name: string;
    probability: number;
    cost: number;
    isActive: boolean;
    stock?: number;
  }[];
  updatedAt: Date;
}

export const getRouletteConfig = async (tenantId: string): Promise<RouletteConfigData | null> => {
  if (!tenantId) return null;
  try {
    const docRef = doc(db, 'rouletteConfig', tenantId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        tenantId: data.tenantId,
        isEnabled: data.isEnabled,
        pricePerSpin: data.pricePerSpin,
        spinsForFreeSpin: data.spinsForFreeSpin,
        prizes: data.prizes,
        updatedAt: data.updatedAt?.toDate() || new Date()
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting roulette config:', error);
    return null;
  }
};

export const saveRouletteConfig = async (config: Omit<RouletteConfigData, 'updatedAt'>): Promise<void> => {
  if (!config.tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'rouletteConfig', config.tenantId);
    await setDoc(docRef, {
      ...config,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error saving roulette config:', error);
    throw error;
  }
};
