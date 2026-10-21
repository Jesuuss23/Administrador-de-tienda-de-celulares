import { csrfHeaders, request } from "./auth";

export type ClaimStatus =
  | "RECEIVED"
  | "UNDER_REVIEW"
  | "ACCEPTED"
  | "REJECTED"
  | "RESOLVED";

export interface WarrantyClaim {
  id: string;
  warrantyId: string;
  description: string;
  status: ClaimStatus;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface CreateWarrantyClaim {
  requestKey: string;
  description: string;
}

export const claimStatusLabels: Record<ClaimStatus, string> = {
  RECEIVED: "Recibida",
  UNDER_REVIEW: "En revisión",
  ACCEPTED: "Atención aceptada",
  REJECTED: "Rechazada",
  RESOLVED: "Resuelta",
};

export function isOpenClaim(status: ClaimStatus): boolean {
  return (
    status === "RECEIVED" ||
    status === "UNDER_REVIEW" ||
    status === "ACCEPTED"
  );
}

function claimsUrl(orderId: string, warrantyId: string): string {
  return (
    `/api/v1/orders/${encodeURIComponent(orderId)}` +
    `/warranties/${encodeURIComponent(warrantyId)}/claims`
  );
}

export function getWarrantyClaims(
  orderId: string,
  warrantyId: string
): Promise<WarrantyClaim[]> {
  return request<WarrantyClaim[]>(claimsUrl(orderId, warrantyId));
}

export async function createWarrantyClaim(
  orderId: string,
  warrantyId: string,
  input: CreateWarrantyClaim
): Promise<WarrantyClaim> {
  const headers = new Headers(await csrfHeaders());
  headers.set("Content-Type", "application/json");

  return request<WarrantyClaim>(claimsUrl(orderId, warrantyId), {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
}