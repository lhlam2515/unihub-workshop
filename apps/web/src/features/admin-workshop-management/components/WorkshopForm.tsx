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
import { Textarea } from "@/components/ui/textarea";
import { isApiError, isValidationError } from "@/lib/api/errors";
import type { RoomSummary, SpeakerSummary } from "@/types/workshop";

import { CreateWorkshopSchema } from "../lib/workshop-form.schema";

import type { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkshopFormValues = z.input<typeof CreateWorkshopSchema>;

export interface WorkshopFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<WorkshopFormValues>;
  speakers: SpeakerSummary[];
  rooms: RoomSummary[];
  onSubmit: (data: WorkshopFormValues) => Promise<void>;
  isSubmitting: boolean;
  serverError?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkshopForm({
  mode,
  defaultValues,
  speakers,
  rooms,
  onSubmit,
  isSubmitting,
  serverError,
}: WorkshopFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<WorkshopFormValues>({
    resolver: zodResolver(CreateWorkshopSchema),
    defaultValues: { status: "DRAFT", price: 0, ...defaultValues },
    mode: "onBlur",
  });

  const typedErrors = errors as Record<
    string,
    { message?: string } | undefined
  >;

  // Handle form submit and map server field errors
  const onFormSubmit = async (data: WorkshopFormValues) => {
    try {
      await onSubmit(data);
    } catch (err) {
      if (isApiError(err) && isValidationError(err) && err.fieldErrors) {
        for (const fe of err.fieldErrors) {
          setError(fe.field as keyof WorkshopFormValues, {
            message: fe.message,
          });
        }
      }
    }
  };

  const isCreate = mode === "create";

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="space-y-6"
      noValidate
    >
      {serverError && <ErrorDisplay error={serverError} variant="banner" />}

      {/* Title + Status row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!typedErrors.title} className="sm:col-span-1">
          <FieldLabel htmlFor="title">Tiêu đề</FieldLabel>
          <FieldContent>
            <Input
              id="title"
              placeholder="Tiêu đề workshop"
              disabled={isSubmitting}
              {...register("title")}
            />
            <FieldError errors={[typedErrors.title]} />
          </FieldContent>
        </Field>

        {isCreate && (
          <Field data-invalid={!!typedErrors.status}>
            <FieldLabel htmlFor="status">Trạng thái</FieldLabel>
            <FieldContent>
              <select
                id="status"
                className="border-input flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm shadow-xs"
                disabled={isSubmitting}
                {...register("status")}
              >
                <option value="DRAFT">Bản nháp</option>
                <option value="OPEN">Công bố ngay</option>
              </select>
              <FieldError errors={[typedErrors.status]} />
            </FieldContent>
          </Field>
        )}
      </div>

      {/* Speaker + Room */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!typedErrors.speakerId}>
          <FieldLabel htmlFor="speakerId">Diễn giả</FieldLabel>
          <FieldContent>
            <select
              id="speakerId"
              className="border-input flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm shadow-xs"
              disabled={isSubmitting}
              {...register("speakerId")}
            >
              <option value="">-- Chọn diễn giả --</option>
              {speakers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
            <FieldError errors={[typedErrors.speakerId]} />
          </FieldContent>
        </Field>

        <Field data-invalid={!!typedErrors.roomId}>
          <FieldLabel htmlFor="roomId">Phòng</FieldLabel>
          <FieldContent>
            <select
              id="roomId"
              className="border-input flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm shadow-xs"
              disabled={isSubmitting}
              {...register("roomId")}
            >
              <option value="">-- Chọn phòng --</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.building ? `(${r.building})` : ""}
                </option>
              ))}
            </select>
            <FieldError errors={[typedErrors.roomId]} />
          </FieldContent>
        </Field>
      </div>

      {/* Start + End time */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!typedErrors.startsAt}>
          <FieldLabel htmlFor="startsAt">Thời gian bắt đầu</FieldLabel>
          <FieldContent>
            <Input
              id="startsAt"
              type="datetime-local"
              disabled={isSubmitting}
              {...register("startsAt")}
            />
            <FieldError errors={[typedErrors.startsAt]} />
          </FieldContent>
        </Field>

        <Field data-invalid={!!typedErrors.endsAt}>
          <FieldLabel htmlFor="endsAt">Thời gian kết thúc</FieldLabel>
          <FieldContent>
            <Input
              id="endsAt"
              type="datetime-local"
              disabled={isSubmitting}
              {...register("endsAt")}
            />
            <FieldError errors={[typedErrors.endsAt]} />
          </FieldContent>
        </Field>
      </div>

      {/* Seats + Price */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!typedErrors.seatsTotal}>
          <FieldLabel htmlFor="seatsTotal">Số lượng ghế</FieldLabel>
          <FieldContent>
            <Input
              id="seatsTotal"
              type="number"
              min={1}
              max={1000}
              disabled={isSubmitting}
              {...register("seatsTotal")}
            />
            <FieldError errors={[typedErrors.seatsTotal]} />
          </FieldContent>
        </Field>

        <Field data-invalid={!!typedErrors.price}>
          <FieldLabel htmlFor="price">Giá (VNĐ)</FieldLabel>
          <FieldContent>
            <Input
              id="price"
              type="number"
              min={0}
              disabled={isSubmitting}
              {...register("price")}
            />
            <FieldError errors={[typedErrors.price]} />
          </FieldContent>
        </Field>
      </div>

      {/* Description */}
      <Field data-invalid={!!typedErrors.description}>
        <FieldLabel htmlFor="description">Mô tả</FieldLabel>
        <FieldContent>
          <Textarea
            id="description"
            rows={4}
            placeholder="Mô tả workshop..."
            disabled={isSubmitting}
            {...register("description")}
          />
          <FieldError errors={[typedErrors.description]} />
        </FieldContent>
      </Field>

      {/* Actions */}
      {isCreate ? (
        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Đang lưu..." : "Lưu nháp"}
          </Button>
          <Button type="submit" variant="default" disabled={isSubmitting}>
            {isSubmitting ? "Đang lưu..." : "Lưu & công bố"}
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
        </Button>
      )}
    </form>
  );
}
