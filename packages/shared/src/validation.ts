import { EmailSchema, PhoneSchema, MoneySchema } from './types';

export const validateEmail = (email: string): boolean => EmailSchema.safeParse(email).success;
export const validatePhone = (phone: string): boolean => PhoneSchema.safeParse(phone).success;
export const validateMoney = (amount: number): boolean => MoneySchema.safeParse(amount).success;

export const formatMoney = (amount: number, currency = 'USD'): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
};

export const sanitizeHtml = (html: string): string => {
  return html
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
};