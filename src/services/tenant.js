import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export const getTenantById = async (tenantId) => {
  if (!tenantId) return null;
  
  try {
    const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
    if (tenantDoc.exists()) {
      return { id: tenantDoc.id, ...tenantDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error fetching tenant:', error);
    return null;
  }
};

export const getTenantBySubdomain = async (subdomain) => {
  if (!subdomain) return null;
  
  try {
    const { where, getDocs, collection, query } = await import('firebase/firestore');
    const q = query(collection(db, 'tenants'), where('subdomain', '==', subdomain));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error fetching tenant by subdomain:', error);
    return null;
  }
};

export const detectTenantFromUrl = () => {
  const urlParams = new URLSearchParams(window.location.search);
  
  // Buscar ?v= (preferido) o ?tenant= (alternativo)
  const tenantFromV = urlParams.get('v');
  const tenantFromQuery = urlParams.get('tenant');
  
  if (tenantFromV) {
    return tenantFromV;
  }
  if (tenantFromQuery) {
    return tenantFromQuery;
  }

  const hostname = window.location.hostname;
  
  // Detectar subdomain (ej: micromercado.ejstore.com)
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const parts = hostname.split('.');
    // Si hay 2+ partes y la primera no es www, es subdomain
    if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'ejstore-web') {
      return parts[0];
    }
  }
  
  return null;
};