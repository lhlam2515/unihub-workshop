"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isApiError, isValidationError } from "@/lib/api/errors";
import { createRoom } from "@/lib/api/services/admin";
import type { RoomCreateRequest } from "@/types/workshop";

import { CreateRoomSchema } from "../lib/room-form.schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoomFormValues {
  name: string;
  building?: string;
  floor?: number;
  capacity: number;
  floorPlanUrl?: string;
}

export interface CreateRoomDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateRoomDialog({
  open,
  onClose,
  onCreated,
}: CreateRoomDialogProps) {
  const [formData, setFormData] = useState<RoomFormValues>({
    name: "",
    building: "",
    floor: undefined,
    capacity: 0,
    floorPlanUrl: "",
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof RoomFormValues, string>>
  >({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (
    field: keyof RoomFormValues,
    value: string | number | undefined
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async () => {
    setServerError(null);

    const parsed = CreateRoomSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof RoomFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof RoomFormValues;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const body: RoomCreateRequest = {
        name: parsed.data.name,
        building: parsed.data.building,
        floor: parsed.data.floor,
        capacity: parsed.data.capacity,
        floorPlanUrl: parsed.data.floorPlanUrl || undefined,
      };
      const result = await createRoom(body);
      if (result.isFailure) {
        const err = result.error;
        if (isApiError(err) && isValidationError(err) && err.fieldErrors) {
          const fieldErrors: Partial<Record<keyof RoomFormValues, string>> = {};
          for (const fe of err.fieldErrors) {
            const field = fe.field as keyof RoomFormValues;
            fieldErrors[field] = fe.message;
          }
          setErrors(fieldErrors);
        } else {
          setServerError(
            typeof err === "object" && err !== null && "message" in err
              ? String(err.message)
              : "Có lỗi xảy ra"
          );
        }
        return;
      }
      handleClose();
      onCreated?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      building: "",
      floor: undefined,
      capacity: 0,
      floorPlanUrl: "",
    });
    setErrors({});
    setServerError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo phòng mới</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {serverError && (
            <div
              role="alert"
              className="border-destructive/20 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
            >
              {serverError}
            </div>
          )}

          {/* Name + Building */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="room-name" className="text-sm font-medium">
                Tên phòng *
              </label>
              <input
                id="room-name"
                className="border-input flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm shadow-xs"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                disabled={isSubmitting}
              />
              {errors.name && (
                <p className="text-destructive text-xs">{errors.name}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="room-building" className="text-sm font-medium">
                Tòa nhà
              </label>
              <input
                id="room-building"
                className="border-input flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm shadow-xs"
                value={formData.building ?? ""}
                onChange={(e) => updateField("building", e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Floor + Capacity */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="room-floor" className="text-sm font-medium">
                Tầng
              </label>
              <input
                id="room-floor"
                type="number"
                className="border-input flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm shadow-xs"
                value={formData.floor ?? ""}
                onChange={(e) =>
                  updateField(
                    "floor",
                    e.target.value === "" ? undefined : Number(e.target.value)
                  )
                }
                disabled={isSubmitting}
              />
              {errors.floor && (
                <p className="text-destructive text-xs">{errors.floor}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="room-capacity" className="text-sm font-medium">
                Sức chứa *
              </label>
              <input
                id="room-capacity"
                type="number"
                min={1}
                className="border-input flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm shadow-xs"
                value={formData.capacity}
                onChange={(e) =>
                  updateField("capacity", Number(e.target.value))
                }
                disabled={isSubmitting}
              />
              {errors.capacity && (
                <p className="text-destructive text-xs">{errors.capacity}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="border-input inline-flex h-9 items-center justify-center rounded-lg border bg-transparent px-4 text-sm font-medium"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Hủy
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-800 px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
