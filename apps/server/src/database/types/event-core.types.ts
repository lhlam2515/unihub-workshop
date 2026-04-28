import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

import { rooms, speakers, workshopSlots, workshops } from '@/database/schema';

export const speakersSelectSchema = createSelectSchema(speakers);
export const speakersInsertSchema = createInsertSchema(speakers);
export const speakersUpdateSchema = createUpdateSchema(speakers);

export type Speaker = z.infer<typeof speakersSelectSchema>;
export type NewSpeaker = z.infer<typeof speakersInsertSchema>;
export type SpeakerUpdate = z.infer<typeof speakersUpdateSchema>;

export const roomsSelectSchema = createSelectSchema(rooms);
export const roomsInsertSchema = createInsertSchema(rooms);
export const roomsUpdateSchema = createUpdateSchema(rooms);

export type Room = z.infer<typeof roomsSelectSchema>;
export type NewRoom = z.infer<typeof roomsInsertSchema>;
export type RoomUpdate = z.infer<typeof roomsUpdateSchema>;

export const workshopsSelectSchema = createSelectSchema(workshops);
export const workshopsInsertSchema = createInsertSchema(workshops);
export const workshopsUpdateSchema = createUpdateSchema(workshops);

export type Workshop = z.infer<typeof workshopsSelectSchema>;
export type NewWorkshop = z.infer<typeof workshopsInsertSchema>;
export type WorkshopUpdate = z.infer<typeof workshopsUpdateSchema>;

export const workshopSlotsSelectSchema = createSelectSchema(workshopSlots);
export const workshopSlotsInsertSchema = createInsertSchema(workshopSlots);
export const workshopSlotsUpdateSchema = createUpdateSchema(workshopSlots);

export type WorkshopSlot = z.infer<typeof workshopSlotsSelectSchema>;
export type NewWorkshopSlot = z.infer<typeof workshopSlotsInsertSchema>;
export type WorkshopSlotUpdate = z.infer<typeof workshopSlotsUpdateSchema>;
