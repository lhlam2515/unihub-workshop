import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

import {
  checkinRecords,
  offlineCheckinQueue,
  payments,
  registrations,
  tickets,
} from '@/database/schema';

const offlineCheckinSyncStatusSchema = z.enum([
  'PENDING',
  'SYNCED',
  'CONFLICT',
]);

export const registrationsSelectSchema = createSelectSchema(registrations);
export const registrationsInsertSchema = createInsertSchema(registrations);
export const registrationsUpdateSchema = createUpdateSchema(registrations);

export type Registration = z.infer<typeof registrationsSelectSchema>;
export type NewRegistration = z.infer<typeof registrationsInsertSchema>;
export type RegistrationUpdate = z.infer<typeof registrationsUpdateSchema>;

export const ticketsSelectSchema = createSelectSchema(tickets);
export const ticketsInsertSchema = createInsertSchema(tickets);
export const ticketsUpdateSchema = createUpdateSchema(tickets);

export type Ticket = z.infer<typeof ticketsSelectSchema>;
export type NewTicket = z.infer<typeof ticketsInsertSchema>;
export type TicketUpdate = z.infer<typeof ticketsUpdateSchema>;

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

export const offlineCheckinQueueSelectSchema = createSelectSchema(
  offlineCheckinQueue,
  {
    syncStatus: offlineCheckinSyncStatusSchema,
  }
);
export const offlineCheckinQueueInsertSchema = createInsertSchema(
  offlineCheckinQueue,
  {
    syncStatus: offlineCheckinSyncStatusSchema,
  }
);
export const offlineCheckinQueueUpdateSchema = createUpdateSchema(
  offlineCheckinQueue,
  {
    syncStatus: offlineCheckinSyncStatusSchema.optional(),
  }
);

export type OfflineCheckinQueueItem = z.infer<
  typeof offlineCheckinQueueSelectSchema
>;
export type NewOfflineCheckinQueueItem = z.infer<
  typeof offlineCheckinQueueInsertSchema
>;
export type OfflineCheckinQueueItemUpdate = z.infer<
  typeof offlineCheckinQueueUpdateSchema
>;
