import { Monitor, User, Music, Tv, Gift } from 'lucide-react';

export const CATEGORIES = [
  { id: 'pantallas', name: 'Pantallas', icon: Monitor },
  { id: 'cuentas', name: 'Cuentas', icon: User },
  { id: 'musica-video', name: 'Música y Video', icon: Music },
  { id: 'tv-deportes', name: 'TV / Deportes', icon: Tv },
  { id: 'combos', name: 'Combos', icon: Gift }
];

export const PAYMENT_METHODS = [
  { id: 'nequi', name: 'Nequi', icon: '/nequi.png', logo: true },
  { id: 'llaves-bre-b', name: 'Llaves BRE-B', icon: '/breb.svg', logo: true }
];

export const PLANS = [
  { id: '1', name: '1 Mes', months: 1 },
  { id: '3', name: '3 Meses', months: 3 },
  { id: '6', name: '6 Meses', months: 6 },
  { id: '12', name: '12 Meses', months: 12 }
];

