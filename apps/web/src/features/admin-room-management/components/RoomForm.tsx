"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isApiError, isValidationError } from "@/lib/api/errors";

import { FloorPlanUrlInput } from "./FloorPlanUrlInput";
import { UpdateRoomSchema } from "../lib/room-form.schema";

import type { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RoomFormValues = z.input<typeof UpdateRoomSchema>;

export interface RoomFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<RoomFormValues>;
  onSubmit: (data: RoomFormValues) => Promise<void>;
  isSubmitting: boolean;
  serverError?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoomForm({
  mode,
  defaultValues,
  onSubmit,
  isSubmitting,
  serverError,
}: RoomFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RoomFormValues>({
    resolver: zodResolver(UpdateRoomSchema),
    defaultValues: { ...defaultValues },
    mode: "onBlur",
  });

  const typedErrors = errors as Record<
    string,
    { message?: string } | undefined
  >;

  const floorPlanUrl = watch("floorPlanUrl") ?? "";

  const onFormSubmit = async (data: RoomFormValues) => {
    try {
      await onSubmit(data);
    } catch (err) {
      if (isApiError(err) && isValidationError(err) && err.fieldErrors) {
        for (const fe of err.fieldErrors) {
          setError(fe.field as keyof RoomFormValues, {
            message: fe.message,
          });
        }
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="space-y-6"
      noValidate
    >
      {serverError && <ErrorDisplay error={serverError} variant="banner" />}

      {/* Name + Building */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!typedErrors.name}>
          <FieldLabel htmlFor="name">Tên phòng</FieldLabel>
          <FieldContent>
            <Input
              id="name"
              placeholder="Tên phòng"
              disabled={isSubmitting}
              {...register("name")}
            />
            <FieldError errors={[typedErrors.name]} />
          </FieldContent>
        </Field>

        <Field data-invalid={!!typedErrors.building}>
          <FieldLabel htmlFor="building">Tòa nhà</FieldLabel>
          <FieldContent>
            <Input
              id="building"
              placeholder="Tên tòa nhà"
              disabled={isSubmitting}
              {...register("building")}
            />
            <FieldError errors={[typedErrors.building]} />
          </FieldContent>
        </Field>
      </div>

      {/* Floor + Capacity */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!typedErrors.floor}>
          <FieldLabel htmlFor="floor">Tầng</FieldLabel>
          <FieldContent>
            <Input
              id="floor"
              type="number"
              disabled={isSubmitting}
              {...register("floor")}
            />
            <FieldError errors={[typedErrors.floor]} />
          </FieldContent>
        </Field>

        <Field data-invalid={!!typedErrors.capacity}>
          <FieldLabel htmlFor="capacity">Sức chứa</FieldLabel>
          <FieldContent>
            <Input
              id="capacity"
              type="number"
              min={1}
              disabled={isSubmitting}
              {...register("capacity")}
            />
            <FieldError errors={[typedErrors.capacity]} />
          </FieldContent>
        </Field>
      </div>

      {/* Floor plan URL */}
      <Field data-invalid={!!typedErrors.floorPlanUrl}>
        <FieldLabel htmlFor="floorPlanUrl">Sơ đồ phòng (URL)</FieldLabel>
        <FieldContent>
          <FloorPlanUrlInput
            value={floorPlanUrl}
            onChange={(url) =>
              setValue("floorPlanUrl", url, { shouldValidate: true })
            }
            error={typedErrors.floorPlanUrl?.message}
            disabled={isSubmitting}
          />
        </FieldContent>
      </Field>

      {/* Actions */}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting
          ? "Đang lưu..."
          : mode === "create"
            ? "Lưu"
            : "Lưu thay đổi"}
      </Button>
    </form>
  );
}
