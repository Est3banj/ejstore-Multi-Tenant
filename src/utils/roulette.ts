import type { RoulettePrize } from '../types';

// Orden correcto para la ruleta (índice 0 = sector starting at 0°)
// sectores van en orden: 0-60°, 60-120°, etc.
export const DEFAULT_PRIZES: RoulettePrize[] = [
  { id: 'nothing', name: 'X', probability: 70, cost: 0, isActive: true },
  { id: 'crunchyroll', name: 'Crunchyroll', probability: 10, cost: 9000, isActive: true },
  { id: 'hbo', name: 'HBO Max', probability: 7, cost: 16000, isActive: true },
  { id: 'prime', name: 'Prime Video', probability: 6, cost: 22900, isActive: true },
  { id: 'disney', name: 'Disney Premium', probability: 4, cost: 31900, isActive: true },
  { id: 'netflix', name: 'Netflix', probability: 3, cost: 26500, isActive: true },
];

export const DEFAULT_ROULETTE_CONFIG = {
  pricePerSpin: 1000,
  spinsForFreeSpin: 5,
  paymentMethods: { nequi: true, daviplata: true },
};

export const DEFAULT_PAYMENT_INFO = {
  nequi: '3101234567',
  daviplata: '3101234567',
};