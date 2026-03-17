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
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

const withTenantFilter = (tenantId, constraints = []) => {
  return [...constraints, where('tenantId', '==', tenantId)];
};

export const getServices = async (tenantId) => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const q = query(
      collection(db, 'services'),
      where('tenantId', '==', tenantId)
    );
    const querySnapshot = await getDocs(q);
    const services = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return services
      .filter(s => s.active === true)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (error) {
    console.error('Error getting services:', error);
    throw error;
  }
};

export const getAllServices = async (tenantId) => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const q = query(
      collection(db, 'services'),
      where('tenantId', '==', tenantId)
    );
    const querySnapshot = await getDocs(q);
    const services = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return services.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (error) {
    console.error('Error getting all services:', error);
    throw error;
  }
};

export const getServiceById = async (id, tenantId) => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'services', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().tenantId === tenantId) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error('Error getting service:', error);
    throw error;
  }
};

export const createService = async (serviceData, tenantId) => {
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

export const updateService = async (id, serviceData, tenantId) => {
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

export const deleteService = async (id, tenantId) => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'services', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting service:', error);
    throw error;
  }
};

export const getTerms = async (tenantId) => {
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

export const updateTerms = async (tenantId, content) => {
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

export const getBanners = async (tenantId) => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const q = query(
      collection(db, 'banners'),
      where('tenantId', '==', tenantId)
    );
    const querySnapshot = await getDocs(q);
    const banners = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return banners
      .filter(b => b.active === true)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  } catch (error) {
    console.error('Error getting banners:', error);
    return [];
  }
};

export const getAllBanners = async (tenantId) => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const q = query(
      collection(db, 'banners'),
      where('tenantId', '==', tenantId)
    );
    const querySnapshot = await getDocs(q);
    const banners = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return banners.sort((a, b) => (a.order || 0) - (b.order || 0));
  } catch (error) {
    console.error('Error getting all banners:', error);
    return [];
  }
};

export const createBanner = async (bannerData, tenantId) => {
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

export const updateBanner = async (id, bannerData, tenantId) => {
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

export const deleteBanner = async (id, tenantId) => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'banners', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting banner:', error);
    throw error;
  }
};

export const getSettings = async (tenantId) => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'tenants', tenantId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        logo: data.logoUrl || '',
        whatsappNumber: data.whatsappNumber || '',
        contactEmail: data.contactEmail || '',
        siteName: data.name || 'Mi Tienda',
        primaryColor: data.primaryColor || '#E50914',
        secondaryColor: data.secondaryColor || '#1A1A1A'
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting settings:', error);
    return null;
  }
};

export const updateSettings = async (tenantId, settings) => {
  if (!tenantId) throw new Error('tenantId required');
  try {
    const docRef = doc(db, 'tenants', tenantId);
    await setDoc(docRef, {
      ...settings,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};

export const updateTenant = async (tenantId, data) => {
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