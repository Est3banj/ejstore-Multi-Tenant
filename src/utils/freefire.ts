export const FF_ID_REGEX = /^\d{8,12}$/;

export const isValidFFId = (value: string): boolean => FF_ID_REGEX.test(value);
