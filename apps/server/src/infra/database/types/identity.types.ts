import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";

import {
  checkinStaffAssignments,
  deviceTokens,
  staff,
  students,
  users,
} from "@/infra/database/schema";

export const usersSelectSchema = createSelectSchema(users);
export const usersInsertSchema = createInsertSchema(users);
export const usersUpdateSchema = createUpdateSchema(users);

export type User = z.infer<typeof usersSelectSchema>;
export type NewUser = z.infer<typeof usersInsertSchema>;
export type UserUpdate = z.infer<typeof usersUpdateSchema>;

export const studentsSelectSchema = createSelectSchema(students);
export const studentsInsertSchema = createInsertSchema(students);
export const studentsUpdateSchema = createUpdateSchema(students);

export type Student = z.infer<typeof studentsSelectSchema>;
export type NewStudent = z.infer<typeof studentsInsertSchema>;
export type StudentUpdate = z.infer<typeof studentsUpdateSchema>;

export const staffSelectSchema = createSelectSchema(staff);
export const staffInsertSchema = createInsertSchema(staff);
export const staffUpdateSchema = createUpdateSchema(staff);

export type Staff = z.infer<typeof staffSelectSchema>;
export type NewStaff = z.infer<typeof staffInsertSchema>;
export type StaffUpdate = z.infer<typeof staffUpdateSchema>;

export const deviceTokensSelectSchema = createSelectSchema(deviceTokens);
export const deviceTokensInsertSchema = createInsertSchema(deviceTokens);
export const deviceTokensUpdateSchema = createUpdateSchema(deviceTokens);

export type DeviceToken = z.infer<typeof deviceTokensSelectSchema>;
export type NewDeviceToken = z.infer<typeof deviceTokensInsertSchema>;
export type DeviceTokenUpdate = z.infer<typeof deviceTokensUpdateSchema>;

export const checkinStaffAssignmentsSelectSchema = createSelectSchema(
  checkinStaffAssignments
);
export const checkinStaffAssignmentsInsertSchema = createInsertSchema(
  checkinStaffAssignments
);

export type CheckinStaffAssignment = z.infer<
  typeof checkinStaffAssignmentsSelectSchema
>;
export type NewCheckinStaffAssignment = z.infer<
  typeof checkinStaffAssignmentsInsertSchema
>;

/**
 * Enriched user row produced by admin queries that LEFT JOIN students / staff
 * to resolve fullName and studentId alongside the core users fields.
 */
export interface UserWithProfile {
  userId: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  /** Resolved from students.full_name (STUDENT) or staff.full_name (BTC/CHECKIN_STAFF). */
  fullName: string | null;
  /** students.student_id — present only for STUDENT role users. */
  studentId: string | null;
  /** staff.staff_id — present only for BTC and CHECKIN_STAFF role users. */
  staffId: string | null;
}
