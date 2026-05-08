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

import { AvatarUrlInput } from "./AvatarUrlInput";
import { CreateSpeakerSchema } from "../lib/speaker-form.schema";


import type { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SpeakerFormValues = z.input<typeof CreateSpeakerSchema>;

export interface SpeakerFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<SpeakerFormValues>;
  onSubmit: (data: SpeakerFormValues) => Promise<void>;
  isSubmitting: boolean;
  serverError?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpeakerForm({
  mode,
  defaultValues,
  onSubmit,
  isSubmitting,
  serverError,
}: SpeakerFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SpeakerFormValues>({
    resolver: zodResolver(CreateSpeakerSchema),
    defaultValues: { ...defaultValues },
    mode: "onBlur",
  });

  const typedErrors = errors as Record<
    string,
    { message?: string } | undefined
  >;

  const avatarUrl = watch("avatarUrl") ?? "";

  const onFormSubmit = async (data: SpeakerFormValues) => {
    try {
      await onSubmit(data);
    } catch (err) {
      if (isApiError(err) && isValidationError(err) && err.fieldErrors) {
        for (const fe of err.fieldErrors) {
          setError(fe.field as keyof SpeakerFormValues, {
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

      {/* FullName + Title */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!typedErrors.fullName}>
          <FieldLabel htmlFor="fullName">Họ tên</FieldLabel>
          <FieldContent>
            <Input
              id="fullName"
              placeholder="Họ và tên diễn giả"
              disabled={isSubmitting}
              {...register("fullName")}
            />
            <FieldError errors={[typedErrors.fullName]} />
          </FieldContent>
        </Field>

        <Field data-invalid={!!typedErrors.title}>
          <FieldLabel htmlFor="title">Chức danh</FieldLabel>
          <FieldContent>
            <Input
              id="title"
              placeholder="Ví dụ: Giảng viên, Kỹ sư..."
              disabled={isSubmitting}
              {...register("title")}
            />
            <FieldError errors={[typedErrors.title]} />
          </FieldContent>
        </Field>
      </div>

      {/* Bio */}
      <Field data-invalid={!!typedErrors.bio}>
        <FieldLabel htmlFor="bio">Giới thiệu</FieldLabel>
        <FieldContent>
          <Textarea
            id="bio"
            rows={4}
            placeholder="Tiểu sử / giới thiệu diễn giả..."
            disabled={isSubmitting}
            {...register("bio")}
          />
          <FieldError errors={[typedErrors.bio]} />
        </FieldContent>
      </Field>

      {/* Avatar URL */}
      <Field data-invalid={!!typedErrors.avatarUrl}>
        <FieldLabel htmlFor="avatarUrl">Ảnh đại diện (URL)</FieldLabel>
        <FieldContent>
          <AvatarUrlInput
            value={avatarUrl}
            onChange={(url) =>
              setValue("avatarUrl", url, { shouldValidate: true })
            }
            error={typedErrors.avatarUrl?.message}
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
