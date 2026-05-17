import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";

import {
  checkinRecords,
  idempotencyKeys,
  payments,
  registrations,
} from "@/infra/database/schema";

export const idempotencyKeysSelectSchema = createSelectSchema(idempotencyKeys);
export const idempotencyKeysInsertSchema = createInsertSchema(idempotencyKeys);
export const idempotencyKeysUpdateSchema = createUpdateSchema(idempotencyKeys);

export type IdempotencyKey = z.infer<typeof idempotencyKeysSelectSchema>;
export type NewIdempotencyKey = z.infer<typeof idempotencyKeysInsertSchema>;
export type IdempotencyKeyUpdate = z.infer<typeof idempotencyKeysUpdateSchema>;

export const registrationsSelectSchema = createSelectSchema(registrations);
export const registrationsInsertSchema = createInsertSchema(registrations);
export const registrationsUpdateSchema = createUpdateSchema(registrations);

export type Registration = z.infer<typeof registrationsSelectSchema>;
export type NewRegistration = z.infer<typeof registrationsInsertSchema>;
export type RegistrationUpdate = z.infer<typeof registrationsUpdateSchema>;

export const paymentsSelectSchema = createSelectSchema(payments);
export const paymentsInsertSchema = createInsertSchema(payments);
export const paymentsUpdateSchema = createUpdateSchema(payments);

export type Payment = z.infer<typeof paymentsSelectSchema>;
export type NewPayment = z.infer<typeof paymentsInsertSchema>;
export type PaymentUpdate = z.infer<typeof paymentsUpdateSchema>;

export const checkinRecordsSelectSchema = createSelectSchema(checkinRecords);
export const checkinRecordsInsertSchema = createInsertSchema(checkinRecords);
export const checkinRecordsUpdateSchema = createUpdateSchema(checkinRecords);

export type CheckinRecord = z.infer<typeof checkinRecordsSelectSchema>;
export type NewCheckinRecord = z.infer<typeof checkinRecordsInsertSchema>;
export type CheckinRecordUpdate = z.infer<typeof checkinRecordsUpdateSchema>;
