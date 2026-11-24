import { useTenantStore } from '../store/tenantStore';
import { detectTenantFromUrl } from '../services/tenant';

// Tenant activo para construir links: store resuelto (URL o sesión) con
// fallback al parámetro de URL si el store todavía no cargó.
export const currentTenantId = (): string | null => {
  return useTenantStore.getState().tenant?.id || detectTenantFromUrl();
};

// Agrega ?v=<tenant> a un path interno preservando params y hash existentes.
// Sin tenant activo devuelve el path sin tocar (apex/marketing).
export const withTenantParam = (path: string): string => {
  const tenantId = currentTenantId();
  if (!tenantId) return path;

  const [pathPart, hash] = path.split('#');
  const queryIndex = pathPart.indexOf('?');
  const pathname = queryIndex === -1 ? pathPart : pathPart.slice(0, queryIndex);
  const search = new URLSearchParams(
    queryIndex === -1 ? '' : pathPart.slice(queryIndex + 1)
  );

  if (!search.get('v') && !search.get('tenant')) {
    search.set('v', tenantId);
  }

  const query = search.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
};
