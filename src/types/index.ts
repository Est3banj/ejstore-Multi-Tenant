export interface Tenant {
  id: string;
  name: string;
  subdomain?: string;
  logoUrl?: string;
  primaryColor?: string;
  whatsappNumber?: string;
  contactEmail?: string;
  secondaryColor?: string;
  isActive?: boolean;
  createdAt?: Date;
}

export interface Service {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  price: number;
  promotionalPrice?: number;
  category: string;
  images: string[];
  image?: string; // Legacy single image field
  isActive: boolean;
  isPopular?: boolean; // Destacados en Home
  createdAt?: Date;
  plans?: ServicePlan[];
}

export interface ServicePlan {
  id: string;
  name: string;
  price: number;
  duration: string;
  features?: string[];
}

export interface Banner {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  imageUrl: string;
  image?: string; // Legacy field
  link?: string;
  order: number;
  isActive: boolean;
}

export interface Settings {
  tenantId: string;
  siteName: string;
  logo?: string;
  whatsappNumber?: string;
  contactEmail?: string;
  qrImage?: string; // URL de imagen QR para recargas
  brebKey?: string; // Clave BRE-B personalizada por tenant
  brebBankName?: string; // Nombre del banco para BRE-B
}

export interface User {
  uid: string;
  email: string;
  tenantId: string;
  role: 'admin' | 'superadmin';
  createdAt?: Date;
}

// Tipos para la ruleta de premios
export interface RoulettePrize {
  id: string;
  name: string;
  image?: string;
  probability: number; // 0-100
  cost: number; // Costo real del premio
  isActive: boolean;
}

export interface RouletteConfig {
  tenantId: string;
  isEnabled: boolean;
  pricePerSpin: number; // Precio por giro en COP
  spinsForFreeSpin: number; // Giros pagos necesarios para 1 gratis
  prizes: RoulettePrize[];
  paymentMethods: {
    nequi: boolean;
    daviplata: boolean;
  };
}

export interface UserSpinData {
  spinsPaid: number; // Total de giros pagos
  spinsFree: number; // Giros gratis disponibles
  todaySpins: number; // Giros de hoy (para estadísticas)
  lastSpinDate: string; // Fecha del último giro
}

export const TENANT_DEFAULTS: Omit<Tenant, 'id'> = {
  name: 'Mi Tienda',
  primaryColor: '#E50914',
  secondaryColor: '#1A1A1A',
  isActive: true,
};

export const DEFAULT_SETTINGS: Omit<Settings, 'tenantId'> = {
  logo: '',
  whatsappNumber: '',
  contactEmail: '',
  siteName: 'EJStore',
};

// Tipos para recargas
export interface Recharge {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  processedAt?: Date;
  processedBy?: string;
  rejectionReason?: string;
}
