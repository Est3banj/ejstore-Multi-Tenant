export interface WompiFeeQuote {
  version: number;
  currency: string;
  baseAmount: number;
  processingFee: number;
  totalAmount: number;
}

export interface WompiWidgetConfig {
  publicKey: string;
  currency: 'COP';
  amountInCents: number;
  reference: string;
  signature: { integrity: string };
  redirectUrl?: string;
}

export interface WompiCheckoutResponse {
  checkoutUrl: string;
  rechargeId?: string;
  reference?: string;
  widgetConfig?: WompiWidgetConfig; // Optional only for older API compatibility.
  environment?: 'test' | 'prod';
  feeQuote?: WompiFeeQuote;
}

export interface WompiWidgetResult {
  transaction?: { id?: string; status?: string } | null;
}

export interface WompiWidget {
  open(callback: (result: WompiWidgetResult) => void): void;
}

declare global {
  interface Window {
    WidgetCheckout?: new (config: WompiWidgetConfig) => WompiWidget;
  }
}
