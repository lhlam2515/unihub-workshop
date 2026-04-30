import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const CreateRegistrationSchema = z.object({
  workshop_id: z.string().uuid(),
});

export class CreateRegistrationDto extends createZodDto(
  CreateRegistrationSchema
) {}

export type CreateRegistrationDtoType = z.infer<
  typeof CreateRegistrationSchema
>;
