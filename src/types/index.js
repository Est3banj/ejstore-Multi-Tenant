/**
 * @typedef {Object} Tenant
 * @property {string} id
 * @property {string} name
 * @property {string} [subdomain]
 * @property {string} [logoUrl]
 * @property {string} [primaryColor]
 * @property {string} [whatsappNumber]
 * @property {string} [contactEmail]
 * @property {string} [secondaryColor]
 * @property {boolean} [isActive]
 * @property {Date} [createdAt]
 */

/**
 * @typedef {Object} Service
 * @property {string} id
 * @property {string} tenantId
 * @property {string} name
 * @property {string} description
 * @property {number} price
 * @property {string} category
 * @property {string[]} images
 * @property {boolean} isActive
 * @property {Date} [createdAt]
 */

/**
 * @typedef {Object} Banner
 * @property {string} id
 * @property {string} tenantId
 * @property {string} title
 * @property {string} imageUrl
 * @property {string} [link]
 * @property {number} order
 * @property {boolean} isActive
 */

/**
 * @typedef {Object} Settings
 * @property {string} tenantId
 * @property {string} siteName
 * @property {string} [logo]
 * @property {string} [whatsappNumber]
 * @property {string} [contactEmail]
 */

export const TENANT_DEFAULTS = {
  name: 'Mi Tienda',
  primaryColor: '#E50914',
  secondaryColor: '#1A1A1A',
  isActive: true,
};

export const DEFAULT_SETTINGS = {
  logo: '',
  whatsappNumber: '',
  contactEmail: '',
  siteName: 'EJStore',
};