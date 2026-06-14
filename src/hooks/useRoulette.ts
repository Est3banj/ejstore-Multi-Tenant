import { db, functions } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { RoulettePrize, CustomerSpinData } from '../types';

export interface RouletteConfig {
  isEnabled?: boolean;
  pricePerSpin?: number;
  spinsForFreeSpin?: number;
  prizes?: RoulettePrize[];
}

export async function fetchRouletteConfig(tenantId: string): Promise<RouletteConfig | null> {
  if (!tenantId || typeof window === 'undefined') return null;
  
  try {
    const docRef = doc(db, 'rouletteConfig', tenantId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        isEnabled: data.isEnabled,
        pricePerSpin: data.pricePerSpin,
        spinsForFreeSpin: data.spinsForFreeSpin,
        prizes: data.prizes,
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching roulette config:', error);
    return null;
  }
}

export async function fetchSpinData(customerId: string): Promise<CustomerSpinData | null> {
  if (!customerId) return null;

  try {
    const spinDataRef = doc(db, 'customers', customerId, 'spinData', 'default');
    const snap = await getDoc(spinDataRef);
    if (snap.exists()) {
      return snap.data() as CustomerSpinData;
    }
    return null;
  } catch (error) {
    console.error('Error fetching spin data:', error);
    return null;
  }
}

export async function executeServerSpin(tenantId: string): Promise<{
  prize: { id: string; name: string; type: string };
  newBalance: number;
  spinType: 'free' | 'paid';
  transactionId: string;
}> {
  const processSpinFn = httpsCallable(functions, 'processSpin');
  const result = await processSpinFn({ tenantId });
  const data = result.data as any;
  return {
    prize: data.prize,
    newBalance: data.newBalance,
    spinType: data.spinType,
    transactionId: data.transactionId,
  };
}

export async function notifyPrizeWon(transactionId: string): Promise<boolean> {
  try {
    const fn = httpsCallable(functions, 'notifyPrizeWon');
    const result = await fn({ transactionId });
    const data = result.data as any;
    if (data?.notified === false) {
      console.warn('notifyPrizeWon: sendDiscordWebhook returned false (no se pudo enviar)');
    }
    return data?.success === true;
  } catch (error: any) {
    console.error('Error notifying prize won:', error);
    // Mostrar error visible para debug (temporal)
    const msg = error?.message || error?.details || 'Error desconocido';
    alert('⚠️ Error de notificación: ' + msg);
    return false;
  }
}
