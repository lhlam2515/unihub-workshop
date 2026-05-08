"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import ROUTES from "@/constants/routes";
import { SpeakerForm } from "@/features/admin-speaker-management/components/SpeakerForm";
import { createSpeaker, updateSpeaker } from "@/lib/api/services/admin";
import type { SpeakerAdmin } from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminSpeakerFormWidgetProps {
  mode: "create" | "edit";
  initialData?: SpeakerAdmin;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminSpeakerFormWidget({
  mode,
  initialData,
}: AdminSpeakerFormWidgetProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setIsSubmitting(true);
    setServerError(null);
    try {
      const body = {
        fullName: data.fullName as string,
        title: (data.title as string) || undefined,
        bio: (data.bio as string) || undefined,
        avatarUrl: (data.avatarUrl as string) || undefined,
      };

      const result =
        mode === "create"
          ? await createSpeaker(body)
          : await updateSpeaker(initialData!.id, body);

      if (result.isFailure) {
        const err = result.error;
        setServerError(
          typeof err === "object" && err !== null && "message" in err
            ? String(err.message)
            : "Có lỗi xảy ra"
        );
        // Re-throw so SpeakerForm can map field errors
        throw err;
      }

      router.push(ROUTES.ADMIN_SPEAKERS);
      router.refresh();
    } catch (err) {
      // Let field-level errors propagate to SpeakerForm's catch handler
      if (err instanceof Error || (typeof err === "object" && err !== null)) {
        throw err;
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          mode === "create"
            ? "Tạo diễn giả mới"
            : (initialData?.fullName ?? "Chỉnh sửa diễn giả")
        }
      />

      <div className="max-w-xl">
        <SpeakerForm
          mode={mode}
          defaultValues={
            initialData
              ? {
                  fullName: initialData.fullName,
                  title: initialData.title ?? "",
                  bio: initialData.bio ?? "",
                  avatarUrl: initialData.avatarUrl ?? "",
                }
              : undefined
          }
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          serverError={serverError}
        />
      </div>
    </div>
  );
}
