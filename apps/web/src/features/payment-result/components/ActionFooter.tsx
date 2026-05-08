"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

import type { PollState } from "../hooks/use-payment-polling";

interface ActionFooterProps {
  state: PollState;
  registrationId?: string;
  onCheckAgain?: () => void;
}

export function ActionFooter({
  state,
  registrationId,
  onCheckAgain,
}: ActionFooterProps) {
  switch (state) {
    case "succeeded":
      return (
        <Button asChild>
          <Link href={`/me/registrations/${registrationId}`}>Xem QR</Link>
        </Button>
      );

    case "failed":
      return (
        <Button asChild>
          <Link href={`/me/registrations/${registrationId}/pay`}>Thử lại</Link>
        </Button>
      );

    case "unresolved":
    case "timeout":
      return (
        <div className="flex gap-3">
          {onCheckAgain && (
            <Button variant="outline" onClick={onCheckAgain}>
              Kiểm tra lại
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/me/registrations">Quay về danh sách</Link>
          </Button>
        </div>
      );

    default:
      return null;
  }
}
