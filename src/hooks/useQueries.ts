import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getServices, 
  getAllServices, 
  getServiceById,
  createService, 
  updateService, 
  deleteService,
  getBanners,
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  getSettings,
  updateSettings,
  getTerms,
  updateTerms
} from '../services/firestore';
import { useEffectiveTenantId } from '../store';

// Query keys — incluyen tenantId para refetch automático al cambiar de tenant
export const queryKeys = {
  services: (tenantId: string) => ['services', tenantId] as const,
  allServices: (tenantId: string) => ['services', tenantId, 'all'] as const,
  service: (id: string, tenantId: string) => ['services', tenantId, id] as const,
  banners: (tenantId: string) => ['banners', tenantId] as const,
  allBanners: (tenantId: string) => ['banners', tenantId, 'all'] as const,
  settings: (tenantId: string) => ['settings', tenantId] as const,
  terms: (tenantId: string) => ['terms', tenantId] as const,
};

// Services hooks
export const useServices = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.services(tenantId!),
    queryFn: () => getServices(tenantId!),
    enabled: !!tenantId,
  });
};

export const useAllServices = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.allServices(tenantId!),
    queryFn: () => getAllServices(tenantId!),
    enabled: !!tenantId,
  });
};

export const useService = (id: string) => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.service(id, tenantId!),
    queryFn: () => getServiceById(id, tenantId!),
    enabled: !!tenantId && !!id,
  });
};

export const useCreateService = () => {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: (serviceData: Parameters<typeof createService>[0]) => 
      createService(serviceData, tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services(tenantId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allServices(tenantId!) });
    },
  });
};

export const useUpdateService = () => {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateService>[1] }) =>
      updateService(id, data, tenantId!),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services(tenantId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allServices(tenantId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.service(id, tenantId!) });
    },
  });
};

export const useDeleteService = () => {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: (id: string) => deleteService(id, tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services(tenantId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allServices(tenantId!) });
    },
  });
};

// Banners hooks
export const useBanners = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.banners(tenantId!),
    queryFn: () => getBanners(tenantId!),
    enabled: !!tenantId,
  });
};

export const useAllBanners = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.allBanners(tenantId!),
    queryFn: () => getAllBanners(tenantId!),
    enabled: !!tenantId,
  });
};

export const useCreateBanner = () => {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: (bannerData: Parameters<typeof createBanner>[0]) =>
      createBanner(bannerData, tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.banners(tenantId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allBanners(tenantId!) });
    },
  });
};

export const useUpdateBanner = () => {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateBanner>[1] }) =>
      updateBanner(id, data, tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.banners(tenantId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allBanners(tenantId!) });
    },
  });
};

export const useDeleteBanner = () => {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: (id: string) => deleteBanner(id, tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.banners(tenantId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allBanners(tenantId!) });
    },
  });
};

// Settings hooks
export const useSettings = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.settings(tenantId!),
    queryFn: () => getSettings(tenantId!),
    enabled: !!tenantId,
  });
};

export const useUpdateSettings = () => {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: (settings: Parameters<typeof updateSettings>[1]) =>
      updateSettings(tenantId!, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings(tenantId!) });
    },
  });
};

// Terms hooks
export const useTerms = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.terms(tenantId!),
    queryFn: () => getTerms(tenantId!),
    enabled: !!tenantId,
  });
};

export const useUpdateTerms = () => {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: (content: string) => updateTerms(tenantId!, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.terms(tenantId!) });
    },
  });
};
