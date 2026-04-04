import { doc, getDoc, where, getDocs, collection, query } from 'firebase/firestore';
import { db } from './firebase';
import type { Tenant } from '../types';

export const getTenantById = async (tenantId: string): Promise<Tenant | null> => {
  if (!tenantId) return null;
  
  try {
    const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
    if (tenantDoc.exists()) {
      const data = tenantDoc.data();
      return {
        id: tenantDoc.id,
        name: data.name,
        subdomain: data.subdomain,
        logoUrl: data.logoUrl,
        primaryColor: data.primaryColor,
        whatsappNumber: data.whatsappNumber,
        contactEmail: data.contactEmail,
        secondaryColor: data.secondaryColor,
        isActive: data.isActive,
        createdAt: data.createdAt?.toDate?.() || data.createdAt
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching tenant:', error);
    return null;
  }
};

export const getTenantBySubdomain = async (subdomain: string): Promise<Tenant | null> => {
  if (!subdomain) return null;
  
  try {
    const q = query(collection(db, 'tenants'), where('subdomain', '==', subdomain));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name,
        subdomain: data.subdomain,
        logoUrl: data.logoUrl,
        primaryColor: data.primaryColor,
        whatsappNumber: data.whatsappNumber,
        contactEmail: data.contactEmail,
        secondaryColor: data.secondaryColor,
        isActive: data.isActive,
        createdAt: data.createdAt?.toDate?.() || data.createdAt
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching tenant by subdomain:', error);
    return null;
  }
};

export const detectTenantFromUrl = (): string | null => {
  const urlParams = new URLSearchParams(window.location.search);
  
  const tenantFromV = urlParams.get('v');
  const tenantFromQuery = urlParams.get('tenant');
  
  if (tenantFromV) {
    return tenantFromV;
  }
  if (tenantFromQuery) {
    return tenantFromQuery;
  }

  const hostname = window.location.hostname;
  
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const parts = hostname.split('.');
    if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'ejstore-web') {
      return parts[0];
    }
  }
  
  return null;
};
