import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export const login = async (email, password) => {
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
      };
    }
    
    return user;
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error logging out:', error);
    throw error;
  }
};

export const onAuthChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};

export const checkUserRole = async (uid) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return userDoc.data();
    }
    return null;
  } catch (error) {
    console.error('Error checking user role:', error);
    return null;
  }
};

export const createUserRecord = async (uid, email, tenantId, role = 'admin') => {
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

import { setDoc, serverTimestamp } from 'firebase/firestore';