import type { WorkshopListItem } from "./workshop";

export type RegistrationStatus = "PENDING" | "CONFIRMED" | "PAID" | "CANCELLED";

export interface RegistrationListItem {
  id: string;
  workshopId: string;
  workshop: WorkshopListItem;
  status: RegistrationStatus;
  qrCode: string | null;
  registeredAt: string;
}

export interface Registration {
  id: string;
  workshopId: string;
  status: RegistrationStatus;
  qrCode: string | null;
  registeredAt: string;
  nextStep: {
    action: "CREATE_PAYMENT";
    endpoint: string;
    amount: number;
    currency: string;
    expiresAt: string;
  } | null;
}

export interface RegistrationCreateRequest {
  workshopId: string;
}

export type PaymentStatus = "INITIATED" | "SUCCEEDED" | "FAILED" | "UNRESOLVED";

export type PaymentGateway = "VNPAY" | "STRIPE" | "MOMO" | "MOCK";

export interface Payment {
  id: string;
  registrationId: string;
  amount: number;
  currency: string;
  gateway: PaymentGateway;
  gatewayChargeId: string | null;
  status: PaymentStatus;
  qrCode: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PaymentCreateRequest {
  registrationId: string;
  gateway: PaymentGateway;
  returnUrl: string;
}
