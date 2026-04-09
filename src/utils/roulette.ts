import type { RoulettePrize } from '../types';

// Premios por defecto para la ruleta
export const DEFAULT_PRIZES: RoulettePrize[] = [
  { id: 'nothing', name: 'X', probability: 70, cost: 0, isActive: true },
  { id: 'crunchyroll', name: 'Crunchyroll', probability: 10, cost: 2000, isActive: true },
  { id: 'hbo', name: 'HBO Max', probability: 7, cost: 2200, isActive: true },
  { id: 'prime', name: 'Prime Video', probability: 6, cost: 2500, isActive: true },
  { id: 'disney', name: 'Disney Premium', probability: 4, cost: 8000, isActive: true },
  { id: 'netflix', name: 'Netflix', probability: 3, cost: 10000, isActive: true },
];

// Configuración por defecto de la ruleta
export const DEFAULT_ROULETTE_CONFIG = {
  pricePerSpin: 1000, // $1.000 COP
  spinsForFreeSpin: 5, // 5 giros pagos = 1 gratis
  paymentMethods: {
    nequi: true,
    daviplata: true,
  },
};

// Números de pago (estos se configuran desde el admin)
export const DEFAULT_PAYMENT_INFO = {
  nequi: '3101234567',
  daviplata: '3101234567',
};
