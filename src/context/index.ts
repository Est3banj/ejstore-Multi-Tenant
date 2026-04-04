import type { ReactNode } from 'react';
import { useApp, useTenant, useAuthStore } from './compatibility';
export { StoreProvider } from '../store';

// Re-export for backward compatibility
export { useApp, useTenant, useAuthStore };

// Legacy provider wrapper for backward compatibility
export const AppProvider = ({ children }: { children: ReactNode }) => children;
export const TenantProvider = ({ children }: { children: ReactNode }) => children;
