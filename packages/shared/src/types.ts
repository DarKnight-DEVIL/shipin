import { z } from 'zod';

export const EmailSchema = z.string().email();
export const PhoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/);
export const MoneySchema = z.number().positive().max(1000000).multipleOf(0.01);
export const UUIDSchema = z.string().uuid();

export type Email = z.infer<typeof EmailSchema>;
export type Phone = z.infer<typeof PhoneSchema>;
export type Money = z.infer<typeof MoneySchema>;
export type UUID = z.infer<typeof UUIDSchema>;