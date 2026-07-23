import { create } from 'zustand';
import type { ServiceAccount, Purchase, Notification } from '../types/marketplace';

interface MarketplaceState {
  accounts: Record<string, ServiceAccount[]>;
  purchases: Purchase[];
  notifications: Notification[];
  loading: boolean;
  error: string | null;

  loadAccounts: (serviceId: string) => Promise<void>;
  loadPurchases: (customerId: string) => Promise<void>;
  loadNotifications: (userId: string) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  reset: () => void;
}

export const useMarketplaceStore = create<MarketplaceState>((set, _get) => ({
  accounts: {},
  purchases: [],
  notifications: [],
  loading: false,
  error: null,

  loadAccounts: async (serviceId: string) => {
    set({ loading: true, error: null });
    try {
      const { getAccounts } = await import('../services/marketplace');
      const accounts = await getAccounts(serviceId);
      set((state) => ({
        accounts: { ...state.accounts, [serviceId]: accounts },
        loading: false,
      }));
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  loadPurchases: async (customerId: string) => {
    set({ loading: true, error: null });
    try {
      const { getPurchases } = await import('../services/marketplace');
      const purchases = await getPurchases(customerId);
      set({ purchases, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  loadNotifications: async (userId: string) => {
    set({ loading: true, error: null });
    try {
      const { getNotifications } = await import('../services/marketplace');
      const notifications = await getNotifications(userId);
      set({ notifications, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  markNotificationRead: async (notificationId: string) => {
    try {
      const { markNotificationRead: markRead } = await import('../services/marketplace');
      await markRead(notificationId);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n
        ),
      }));
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  reset: () => {
    set({ accounts: {}, purchases: [], notifications: [], loading: false, error: null });
  },
}));
