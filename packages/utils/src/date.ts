import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

export const formatDate = (date: Date | string, pattern = 'PPP'): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return 'Invalid date';
  return format(d, pattern);
};

export const formatRelativeTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return 'Unknown';
  return formatDistanceToNow(d, { addSuffix: true });
};

export const isDateInPast = (date: Date | string): boolean => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return d < new Date();
};

export const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const daysBetween = (start: Date, end: Date): number => {
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};