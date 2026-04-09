import type { RoulettePrize } from '../types';

// Premios por defecto para la ruleta
export const DEFAULT_PRIZES: RoulettePrize[] = [
  { id: 'nothing', name: 'X', probability: 75, cost: 0, isActive: true },
  { id: 'crunchyroll', name: 'Crunchyroll 1 Mes', probability: 10, cost: 2000, isActive: true },
  { id: 'hbo', name: 'HBO Max 1 Mes', probability: 7, cost: 2200, isActive: true },
  { id: 'prime', name: 'Prime Video 1 Mes', probability: 5, cost: 2500, isActive: true },
  { id: 'netflix', name: 'Netflix 1 Mes', probability: 3, cost: 10000, isActive: true },
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
