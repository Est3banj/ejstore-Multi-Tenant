import { DEFAULT_PRIZES, DEFAULT_ROULETTE_CONFIG } from '../utils/roulette';
import type { RoulettePrize, UserSpinData } from '../types';

// Clave para localStorage
const STORAGE_KEY = 'ejstore_roulette_data';

// Función para obtener los datos del usuario
export function getUserSpinData(): UserSpinData {
  if (typeof window === 'undefined') {
    return { spinsPaid: 0, spinsFree: 0, todaySpins: 0, lastSpinDate: '' };
  }
  
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const data = JSON.parse(stored);
      // Verificar si es un nuevo día
      const today = new Date().toDateString();
      if (data.lastSpinDate && new Date(data.lastSpinDate).toDateString() !== today) {
        // Nuevo día, resetear contador de hoy
        return { ...data, todaySpins: 0 };
      }
      return data;
    } catch {
      return { spinsPaid: 0, spinsFree: 0, todaySpins: 0, lastSpinDate: '' };
    }
  }
  return { spinsPaid: 0, spinsFree: 0, todaySpins: 0, lastSpinDate: '' };
}

// Función para guardar los datos del usuario
export function saveUserSpinData(data: UserSpinData): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Función para verificar si puede girar
export function canSpin(userData: UserSpinData): boolean {
  return userData.spinsFree > 0 || userData.spinsPaid > 0;
}

// Función para usar un giro (pago o gratis)
export function useSpin(isFree: boolean, userData: UserSpinData): UserSpinData {
  const today = new Date().toDateString();
  let newData: UserSpinData;

  if (isFree) {
    // Usar giro gratis
    newData = {
      ...userData,
      spinsFree: userData.spinsFree - 1,
      todaySpins: userData.todaySpins + 1,
      lastSpinDate: new Date().toISOString(),
    };
  } else {
    // Usar giro pago
    const newSpinsPaid = userData.spinsPaid + 1;
    const freeSpins = Math.floor(newSpinsPaid / DEFAULT_ROULETTE_CONFIG.spinsForFreeSpin) - 
                      Math.floor(userData.spinsPaid / DEFAULT_ROULETTE_CONFIG.spinsForFreeSpin);
    
    newData = {
      spinsPaid: newSpinsPaid,
      spinsFree: userData.spinsFree + freeSpins,
      todaySpins: userData.todaySpins + 1,
      lastSpinDate: new Date().toISOString(),
    };
  }

  saveUserSpinData(newData);
  return newData;
}

// Función para seleccionar un premio basado en probabilidades
export function spinWheel(prizes: RoulettePrize[] = DEFAULT_PRIZES): RoulettePrize {
  const activePrizes = prizes.filter(p => p.isActive);
  const totalProbability = activePrizes.reduce((sum, p) => sum + p.probability, 0);
  
  const random = Math.random() * totalProbability;
  let cumulative = 0;
  
  for (const prize of activePrizes) {
    cumulative += prize.probability;
    if (random < cumulative) {
      return prize;
    }
  }
  
  // Fallback al último premio
  return activePrizes[activePrizes.length - 1];
}

// Función para calcular la rotación basada en el premio (para que la flecha apunte al premio correcto)
// Esta función es útil si quieres mantener el sistema actual de "generar premio primero"
// Retorna el índice del premio en el array
export function getPrizeIndex(prize: RoulettePrize, prizes: RoulettePrize[] = DEFAULT_PRIZES): number {
  return prizes.findIndex(p => p.id === prize.id);
}

// Función para calcular la ganancia/pérdida esperada
export function calculateExpectedValue(prizes: RoulettePrize[] = DEFAULT_PRIZES): number {
  const price = DEFAULT_ROULETTE_CONFIG.pricePerSpin;
  const expectedCost = prizes
    .filter(p => p.isActive)
    .reduce((sum, p) => sum + (p.probability / 100) * p.cost, 0);
  
  return price - expectedCost;
}

// Obtener el precio por giro
export function getSpinPrice(): number {
  return DEFAULT_ROULETTE_CONFIG.pricePerSpin;
}

// Obtener la cantidad de giros necesarios para uno gratis
export function getSpinsForFreeSpin(): number {
  return DEFAULT_ROULETTE_CONFIG.spinsForFreeSpin;
}
