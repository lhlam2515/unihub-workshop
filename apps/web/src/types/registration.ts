import type { WorkshopListItem } from "./workshop";

export type RegistrationStatus = "PENDING" | "CONFIRMED" | "PAID" | "CANCELLED";

export interface RegistrationListItem {
  id: string;
  workshopId: string;
  /** Optional per OpenAPI — API may omit when embedding is disabled. */
  workshop?: WorkshopListItem;
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

export interface RegistrationAdmin {
  id: string;
  workshopId: string;
  student: {
    studentId: string;
    fullName: string;
    email: string;
  };
  status: RegistrationStatus;
  registeredAt: string;
  checkedInAt: string | null;
}
