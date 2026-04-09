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
}

export interface User {
  uid: string;
  email: string;
  tenantId: string;
  role: 'admin' | 'superadmin';
  createdAt?: Date;
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
