import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

import { students, users } from '@/database/schema';

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
