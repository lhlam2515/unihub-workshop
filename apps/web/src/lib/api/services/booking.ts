import { api, type PaginatedResult } from "@/lib/api/client";
import { Result } from "@/lib/result";
import type {
  RegistrationListItem,
  Registration,
  RegistrationCreateRequest,
} from "@/types/registration";

/**
 * List the authenticated student's registrations with optional filters.
 *
 * Row-level security: server enforces WHERE student_id = JWT.sub.
 */
export async function listMyRegistrations(
  params: {
    status?: string;
    upcoming?: boolean;
    cursor?: string;
    limit?: number;
  } = {}
): Promise<Result<PaginatedResult<RegistrationListItem>>> {
  return Result.fromPromise(
    api.getPaginated<RegistrationListItem>("/registrations", { params })
  );
}

/**
 * Get a single registration with QR code (if status ∈ confirmed, paid).
 *
 * 404 if not owned (anti-enumeration).
 */
export async function getRegistration(
  registrationId: string
): Promise<Result<Registration>> {
  return Result.fromPromise(
    api.get<Registration>(`/registrations/${registrationId}`)
  );
}

/**
 * Cancel a registration.
 *
 * For paid registrations the server enqueues a refund job.
 */
export async function cancelRegistration(
  registrationId: string
): Promise<Result<Registration>> {
  return Result.fromPromise(
    api.delete<Registration>(`/registrations/${registrationId}`)
  );
}

/**
 * Register for a workshop (free or paid).
 *
 * Requires a client-generated Idempotency-Key header for retry safety.
 * T2 + T3 rate-limited on the server.
 */
export async function createRegistration(
  body: RegistrationCreateRequest,
  idempotencyKey: string
): Promise<Result<Registration>> {
  return Result.fromPromise(
    api.post<Registration>("/registrations", body, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  );
}
