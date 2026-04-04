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

// Query keys
export const queryKeys = {
  services: ['services'] as const,
  allServices: ['services', 'all'] as const,
  service: (id: string) => ['services', id] as const,
  banners: ['banners'] as const,
  allBanners: ['banners', 'all'] as const,
  settings: ['settings'] as const,
  terms: ['terms'] as const,
};

// Services hooks
export const useServices = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.services,
    queryFn: () => getServices(tenantId!),
    enabled: !!tenantId,
  });
};

export const useAllServices = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.allServices,
    queryFn: () => getAllServices(tenantId!),
    enabled: !!tenantId,
  });
};

export const useService = (id: string) => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.service(id),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.services });
      queryClient.invalidateQueries({ queryKey: queryKeys.allServices });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.services });
      queryClient.invalidateQueries({ queryKey: queryKeys.allServices });
      queryClient.invalidateQueries({ queryKey: queryKeys.service(id) });
    },
  });
};

export const useDeleteService = () => {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: (id: string) => deleteService(id, tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services });
      queryClient.invalidateQueries({ queryKey: queryKeys.allServices });
    },
  });
};

// Banners hooks
export const useBanners = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.banners,
    queryFn: () => getBanners(tenantId!),
    enabled: !!tenantId,
  });
};

export const useAllBanners = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.allBanners,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.banners });
      queryClient.invalidateQueries({ queryKey: queryKeys.allBanners });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.banners });
      queryClient.invalidateQueries({ queryKey: queryKeys.allBanners });
    },
  });
};

export const useDeleteBanner = () => {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: (id: string) => deleteBanner(id, tenantId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.banners });
      queryClient.invalidateQueries({ queryKey: queryKeys.allBanners });
    },
  });
};

// Settings hooks
export const useSettings = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.settings,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
};

// Terms hooks
export const useTerms = () => {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: queryKeys.terms,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.terms });
    },
  });
};
