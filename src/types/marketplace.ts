export interface ServiceAccount {
  id: string;
  serviceId: string;
  tenantId: string;
  label: string;
  credential: {
    email: string;
    password: string;
    extra?: Record<string, string>;
  };
  status: 'available' | 'sold' | 'suspended' | 'expired';
  soldTo?: string;
  purchaseId?: string;
  batchNumber?: string;
  notes?: string;
  extras?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AccountCredentials {
  imapEmail: string;
  imapPassword: string;
  imapHost: string;
  imapPort: number;
  provider: string;
}

export interface Purchase {
  id: string;
  customerId: string;
  customerEmail: string;
  serviceId: string;
  serviceName: string;
  accountId: string;
  price: number;
  status: 'active' | 'expired' | 'refunded' | 'cancelled';
  lastCodeExtraction?: Date;
  codes?: Array<{
    code: string;
    extractedAt: Date;
    source: 'manual' | 'imap';
  }>;
  renewedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  linkTokens?: string[];
}

export interface Reseller {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  phone: string;
  balance: number;
  commissionPercent: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Ticket {
  id: string;
  tenantId: string;
  userId: string;
  userType: 'customer' | 'reseller';
  serviceId: string;
  serviceName: string;
  subject: string;
  description: string;
  imageUrl?: string;
  customerEmail?: string;
  status: 'open' | 'resolved' | 'closed';
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'purchase' | 'extraction' | 'expiration' | 'recharge_status' | 'system';
  title: string;
  message: string;
  read: boolean;
  metadata?: {
    purchaseId?: string;
    serviceName?: string;
  };
  createdAt: Date;
}

export interface PurchaseRequest {
  serviceId: string;
  tenantId: string;
}

export interface PurchaseResponse {
  success: boolean;
  purchaseId: string;
  account: {
    credential: { email: string; password: string; extra?: Record<string, string> };
    serviceName: string;
  };
  newBalance: number;
  message: string;
  linkTokens?: string[];
}

export interface ExtraerCodigoRequest {
  purchaseId: string;
}

export interface ExtraerCodigoResponse {
  success: boolean;
  code: string;
  subject: string;
  from: string;
  bodyText: string;
  extractedAt: string;
}

export interface GetPublicAccountRequest {
  token: string;
}

export interface PublicAccountData {
  serviceName: string;
  credential: Record<string, string>;
  status: 'active' | 'expired';
  createdAt: string;
  expiresAt: string;
}

export interface GetPublicAccountResponse {
  success: boolean;
  account: PublicAccountData;
  lastEmail?: Pick<ExtraerCodigoResponse, 'subject' | 'from' | 'bodyText' | 'code' | 'extractedAt'>;
  error?: string;
}
