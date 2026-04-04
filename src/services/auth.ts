import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { User as AppUser } from '../types';

export interface AuthUser extends User {
  tenantId: string | null;
  role?: string;
}

export const login = async (email: string, password: string): Promise<AuthUser> => {
  try {
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
  } catch (error) {
    console.error('Error logging in:', error);
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

export const checkUserRole = async (uid: string): Promise<AppUser | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        uid: uid,
        email: data.email || '',
        tenantId: data.tenantId,
        role: data.role as 'admin' | 'superadmin'
      } as AppUser;
    }
    return null;
  } catch (error) {
    console.error('Error checking user role:', error);
    return null;
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
