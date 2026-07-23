import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { User as AppUser } from '../types';

export interface AuthUser extends User {
  tenantId: string | null;
  role?: string;
}

export interface CustomerUser {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  balance: number;
  createdAt: Date;
}

export const login = async (email: string, password: string): Promise<AuthUser> => {
  try {
    // Cliente usa localStorage (persistencia entre tabs)
    await setPersistence(auth, browserLocalPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return {
        ...user,
        tenantId: userData.tenantId,
        role: userData.role
      } as AuthUser;
    }
    
    return user as AuthUser;
  } catch (error: any) {
    console.error('Error logging in:', error);
    
    // Traducir códigos de error de Firebase a mensajes amigables
    if (error.code === 'auth/invalid-credential') {
      throw new Error('Correo o contraseña incorrectos');
    } else if (error.code === 'auth/user-not-found') {
      throw new Error('Usuario no encontrado');
    } else if (error.code === 'auth/wrong-password') {
      throw new Error('Contraseña incorrecta');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Correo electrónico inválido');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('Demasiados intentos. Intenta más tarde');
    }
    
    throw error;
  }
};

export const register = async (
  email: string, 
  password: string,
  firstName: string,
  lastName: string,
  phone: string,
  tenantId?: string
): Promise<AuthUser> => {
  try {
    // Cliente usa localStorage (persistencia entre tabs)
    await setPersistence(auth, browserLocalPersistence);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Crear documento de cliente en Firestore con $1000 de saldo inicial
    // Si se provee tenantId, incluirlo para identificar de qué tienda es el cliente
    const customerData: Record<string, unknown> = {
      email,
      firstName,
      lastName,
      phone,
      balance: 1000, // Saldo inicial para probar la ruleta
      createdAt: serverTimestamp()
    };
    
    // Incluir tenantId si se proporciona
    if (tenantId) {
      customerData.tenantId = tenantId;
    }
    
    await setDoc(doc(db, 'customers', user.uid), customerData);
    
    return user as AuthUser;
  } catch (error) {
    console.error('Error registering:', error);
    throw error;
  }
};

export const logout = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error logging out:', error);
    throw error;
  }
};

export const onAuthChange = (callback: (user: User | null) => void): (() => void) => {
  return onAuthStateChanged(auth, callback);
};

// === Funciones para el panel admin (usando adminAuth, sesión aislada) ===

export const adminLogin = async (email: string, password: string): Promise<AuthUser> => {
  try {
    // Usar sessionStorage para aislar la sesión del admin de la del cliente
    // El cliente usa localStorage (compartido entre tabs), admin usa sessionStorage (solo pestaña actual)
    await setPersistence(auth, browserSessionPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return {
        ...user,
        tenantId: userData.tenantId,
        role: userData.role
      } as AuthUser;
    }

    return user as AuthUser;
  } catch (error: any) {
    console.error('Error logging in admin:', error);

    if (error.code === 'auth/invalid-credential') {
      throw new Error('Correo o contraseña incorrectos');
    } else if (error.code === 'auth/user-not-found') {
      throw new Error('Usuario no encontrado');
    } else if (error.code === 'auth/wrong-password') {
      throw new Error('Contraseña incorrecta');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Correo electrónico inválido');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('Demasiados intentos. Intenta más tarde');
    }

    throw error;
  }
};

export const onAdminAuthChange = (callback: (user: User | null) => void): (() => void) => {
  return onAuthStateChanged(auth, callback);
};

export const adminLogout = async (): Promise<void> => {
  try {
    // Restaurar persistencia a localStorage antes de cerrar sesión
    await setPersistence(auth, browserLocalPersistence);
    await signOut(auth);
  } catch (error) {
    console.error('Error logging out admin:', error);
    throw error;
  }
};

export const checkUserRole = async (uid: string): Promise<AppUser | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        uid: uid,
        email: data.email || '',
        tenantId: data.tenantId,
        role: data.role as AppUser['role']
      } as AppUser;
    }
    return null;
  } catch (error) {
    console.error('Error checking user role:', error);
    return null;
  }
};

export const getCustomerData = async (uid: string, userEmail?: string): Promise<CustomerUser | null> => {
  try {
    const customerDoc = await getDoc(doc(db, 'customers', uid));
    if (customerDoc.exists()) {
      const data = customerDoc.data();
      
      // Si no tiene email pero tenemos el email del usuario, actualizarlo
      if (!data.email && userEmail) {
        await setDoc(doc(db, 'customers', uid), { email: userEmail }, { merge: true });
        return {
          uid,
          email: userEmail,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          phone: data.phone || '',
          balance: data.balance || 0,
          createdAt: data.createdAt?.toDate() || new Date()
        } as CustomerUser;
      }
      
      return {
        uid,
        email: data.email || '',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        phone: data.phone || '',
        balance: data.balance || 0,
        createdAt: data.createdAt?.toDate() || new Date()
      } as CustomerUser;
    }
    
    // Si no existe, crear documento automáticamente
    await setDoc(doc(db, 'customers', uid), {
      email: userEmail || '',
      firstName: 'Usuario',
      lastName: '',
      phone: '',
      balance: 0,
      createdAt: serverTimestamp()
    });
    
    return {
      uid,
      email: userEmail || '',
      firstName: 'Usuario',
      lastName: '',
      phone: '',
      balance: 0,
      createdAt: new Date()
    } as CustomerUser;
  } catch (error) {
    console.error('Error getting customer data:', error);
    return null;
  }
};

export const updateBalance = async (uid: string, amount: number): Promise<void> => {
  try {
    await updateDoc(doc(db, 'customers', uid), {
      balance: increment(amount)
    });
  } catch (error) {
    console.error('Error updating balance:', error);
    throw error;
  }
};

export const createUserRecord = async (
  uid: string, 
  email: string, 
  tenantId: string, 
  role: 'admin' | 'superadmin' = 'admin'
): Promise<void> => {
  try {
    await setDoc(doc(db, 'users', uid), {
      email,
      tenantId,
      role,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating user record:', error);
    throw error;
  }
};
