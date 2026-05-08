"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";

import { ErrorDisplay } from "@/components/ErrorDisplay";
import ROUTES from "@/constants/routes";
import { ConflictDialog } from "@/features/admin-workshop-management/components/ConflictDialog";
import { WorkshopForm } from "@/features/admin-workshop-management/components/WorkshopForm";
import type { WorkshopFormProps } from "@/features/admin-workshop-management/components/WorkshopForm";
import { isApiError } from "@/lib/api/errors";
import { createWorkshop, updateWorkshop } from "@/lib/api/services/admin";
import type {
  RoomSummary,
  SpeakerSummary,
  WorkshopAdmin,
  WorkshopCreateRequest,
} from "@/types/workshop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminWorkshopFormWidgetProps {
  mode: "create" | "edit";
  initialData?: WorkshopAdmin;
  speakers: SpeakerSummary[];
  rooms: RoomSummary[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toCreateRequest(data: Record<string, unknown>): WorkshopCreateRequest {
  return {
    title: String(data.title ?? ""),
    description: data.description != null ? String(data.description) : null,
    speakerId:
      data.speakerId != null && data.speakerId !== ""
        ? String(data.speakerId)
        : null,
    roomId:
      data.roomId != null && data.roomId !== "" ? String(data.roomId) : null,
    startsAt: String(data.startsAt ?? ""),
    endsAt: String(data.endsAt ?? ""),
    seatsTotal: Number(data.seatsTotal),
    price: Number(data.price),
    status: (data.status as "DRAFT" | "OPEN") ?? "DRAFT",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminWorkshopFormWidget({
  mode,
  initialData,
  speakers,
  rooms,
}: AdminWorkshopFormWidgetProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [version, setVersion] = useState(initialData?.version ?? 0);
  const [showConflict, setShowConflict] = useState(false);

  const isEdit = mode === "edit";

  const handleSubmit: WorkshopFormProps["onSubmit"] = useCallback(
    async (formData) => {
      setIsSubmitting(true);
      setServerError(null);

      try {
        if (isEdit && initialData) {
          const request = toCreateRequest(formData);
          const result = await updateWorkshop(initialData.id, request, version);
          if (result.isFailure) {
            if (isApiError(result.error) && result.error.status === 412) {
              setShowConflict(true);
              return;
            }
            setServerError(
              result.error instanceof Error
                ? result.error.message
                : "Lỗi cập nhật workshop"
            );
            return;
          }
          setVersion(result.data.version);
          router.refresh();
        } else {
          const request = toCreateRequest(formData);
          const result = await createWorkshop(request);
          if (result.isFailure) {
            setServerError(
              result.error instanceof Error
                ? result.error.message
                : "Lỗi tạo workshop"
            );
            return;
          }
          router.push(ROUTES.ADMIN_WORKSHOP(result.data.id));
        }
      } catch (err: unknown) {
        if (isApiError(err) && err.status === 412) {
          setShowConflict(true);
          return;
        }
        setServerError(err instanceof Error ? err.message : "Lỗi kết nối");
      } finally {
        setIsSubmitting(false);
      }
    },
    [isEdit, initialData, version, router]
  );

  // Convert WorkshopAdmin to form default values
  const defaultValues = initialData
    ? {
        title: initialData.title,
        description: initialData.description ?? undefined,
        speakerId: initialData.speaker?.id ?? undefined,
        roomId: initialData.room?.id ?? undefined,
        startsAt: initialData.startsAt,
        endsAt: initialData.endsAt,
        seatsTotal: initialData.seatsTotal,
        price: initialData.price,
      }
    : undefined;

  return (
    <>
      {serverError && <ErrorDisplay error={serverError} variant="banner" />}

      <WorkshopForm
        mode={mode}
        defaultValues={defaultValues}
        speakers={speakers}
        rooms={rooms}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        serverError={serverError}
      />

      <ConflictDialog
        open={showConflict}
        onReload={() => router.refresh()}
        onClose={() => setShowConflict(false)}
      />
    </>
  );
}
