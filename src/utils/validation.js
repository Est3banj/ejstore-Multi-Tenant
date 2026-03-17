/**
 * Validation utilities for EJStream
 */

// Valid image extensions
const VALID_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif'];

/**
 * Validates if a string is a valid URL
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if valid URL, false otherwise
 */
export const isValidUrl = (url) => {
    if (!url || typeof url !== 'string') return false;

    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

/**
 * Extracts file extension from a URL
 * @param {string} url - The URL to extract extension from
 * @returns {string|null} - The extension without dot, or null if not found
 */
export const getUrlExtension = (url) => {
    if (!url) return null;

    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const match = pathname.match(/\.([^.]+)$/);
        return match ? match[1].toLowerCase() : null;
    } catch {
        return null;
    }
};

/**
 * Validates if a URL points to a valid image
 * @param {string} url - The URL to validate
 * @returns {object} - Object with isValid boolean and error message if invalid
 */
export const validateImageUrl = (url) => {
    if (!url || url.trim() === '') {
        return { isValid: true, error: '' }; // Empty is valid (optional field)
    }

    if (!isValidUrl(url)) {
        return { isValid: false, error: 'URL inválida' };
    }

    const extension = getUrlExtension(url);

    // If no extension found, allow it (some CDN URLs don't have extensions)
    if (!extension) {
        return { isValid: true, error: '', warning: 'No se detectó extensión de imagen' };
    }

    if (!VALID_IMAGE_EXTENSIONS.includes(extension)) {
        return {
            isValid: false,
            error: `Formato de imagen no válido. Use: ${VALID_IMAGE_EXTENSIONS.join(', ')}`
        };
    }

    return { isValid: true, error: '' };
};
