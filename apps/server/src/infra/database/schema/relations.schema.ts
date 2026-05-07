import { relations } from "drizzle-orm";

import {
  aiSummaries,
  notificationLogs,
  studentSyncErrors,
  studentSyncJobs,
  workshopDocuments,
} from "./async.schema";
import { rooms, speakers, workshops } from "./event-core.schema";
import { checkinStaffAssignments, deviceTokens, staff, students, users } from "./identity.schema";
import {
  checkinRecords,
  payments,
  registrations,
  tickets,
} from "./transaction.schema";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  checkinScans: many(checkinRecords, { relationName: "checkin_staff" }),
  uploadedDocuments: many(workshopDocuments, { relationName: "document_uploader" }),
  staffAssignments: one(checkinStaffAssignments),
}));

export const staffRelations = relations(staff, ({ many }) => ({
  createdWorkshops: many(workshops, { relationName: "workshop_creator" }),
}));

export const checkinStaffAssignmentsRelations = relations(
  checkinStaffAssignments,
  ({ one }) => ({
    user: one(users, {
      fields: [checkinStaffAssignments.userId],
      references: [users.userId],
    }),
  })
);

export const studentsRelations = relations(students, ({ many }) => ({
  registrations: many(registrations),
  payments: many(payments),
  checkinRecords: many(checkinRecords),
  deviceTokens: many(deviceTokens),
}));

export const deviceTokensRelations = relations(deviceTokens, ({ one }) => ({
  student: one(students, {
    fields: [deviceTokens.studentId],
    references: [students.studentId],
  }),
}));

// ---------------------------------------------------------------------------
// Event Core
// ---------------------------------------------------------------------------

export const speakersRelations = relations(speakers, ({ many }) => ({
  workshops: many(workshops),
}));

export const roomsRelations = relations(rooms, ({ many }) => ({
  workshops: many(workshops),
}));

export const workshopsRelations = relations(workshops, ({ one, many }) => ({
  speaker: one(speakers, {
    fields: [workshops.speakerId],
    references: [speakers.speakerId],
  }),
  room: one(rooms, {
    fields: [workshops.roomId],
    references: [rooms.roomId],
  }),
  creator: one(staff, {
    fields: [workshops.createdBy],
    references: [staff.staffId],
    relationName: "workshop_creator",
  }),
  registrations: many(registrations),
  checkinRecords: many(checkinRecords),
  notificationLogs: many(notificationLogs),
  documents: many(workshopDocuments),
  summaries: many(aiSummaries),
}));

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

export const registrationsRelations = relations(
  registrations,
  ({ one, many }) => ({
    student: one(students, {
      fields: [registrations.studentId],
      references: [students.studentId],
    }),
    workshop: one(workshops, {
      fields: [registrations.workshopId],
      references: [workshops.workshopId],
    }),
    ticket: one(tickets),
    payments: many(payments),
    checkinRecords: many(checkinRecords),
  })
);

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  registration: one(registrations, {
    fields: [tickets.registrationId],
    references: [registrations.registrationId],
  }),
  checkinRecords: many(checkinRecords),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  registration: one(registrations, {
    fields: [payments.registrationId],
    references: [registrations.registrationId],
  }),
  student: one(students, {
    fields: [payments.studentId],
    references: [students.studentId],
  }),
}));

export const checkinRecordsRelations = relations(checkinRecords, ({ one }) => ({
  registration: one(registrations, {
    fields: [checkinRecords.registrationId],
    references: [registrations.registrationId],
  }),
  ticket: one(tickets, {
    fields: [checkinRecords.ticketId],
    references: [tickets.ticketId],
  }),
  student: one(students, {
    fields: [checkinRecords.studentId],
    references: [students.studentId],
  }),
  workshop: one(workshops, {
    fields: [checkinRecords.workshopId],
    references: [workshops.workshopId],
  }),
  checkedInBy: one(users, {
    fields: [checkinRecords.checkedInBy],
    references: [users.userId],
    relationName: "checkin_staff",
  }),
}));

// ---------------------------------------------------------------------------
// Async
// ---------------------------------------------------------------------------

export const notificationLogsRelations = relations(
  notificationLogs,
  ({ one }) => ({
    workshop: one(workshops, {
      fields: [notificationLogs.workshopId],
      references: [workshops.workshopId],
    }),
  })
);

export const workshopDocumentsRelations = relations(
  workshopDocuments,
  ({ one }) => ({
    workshop: one(workshops, {
      fields: [workshopDocuments.workshopId],
      references: [workshops.workshopId],
    }),
    uploadedBy: one(users, {
      fields: [workshopDocuments.uploadedBy],
      references: [users.userId],
      relationName: "document_uploader",
    }),
    summary: one(aiSummaries),
  })
);

export const aiSummariesRelations = relations(aiSummaries, ({ one }) => ({
  document: one(workshopDocuments, {
    fields: [aiSummaries.documentId],
    references: [workshopDocuments.documentId],
  }),
  workshop: one(workshops, {
    fields: [aiSummaries.workshopId],
    references: [workshops.workshopId],
  }),
}));

export const studentSyncJobsRelations = relations(
  studentSyncJobs,
  ({ many }) => ({
    errors: many(studentSyncErrors),
  })
);

export const studentSyncErrorsRelations = relations(
  studentSyncErrors,
  ({ one }) => ({
    job: one(studentSyncJobs, {
      fields: [studentSyncErrors.jobId],
      references: [studentSyncJobs.jobId],
    }),
  })
);
