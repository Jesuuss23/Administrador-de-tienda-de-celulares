import { csrfHeaders, request } from "./auth";
import type { ClaimStatus } from "./warrantyClaims";

export interface AdminWarrantyClaim {
  id: string;
  warrantyId: string;
  orderNumber: number;
  customerName: string;
  customerEmail: string;
  productName: string;
  environment: "TEST" | "LIVE";
  description: string;
  status: ClaimStatus;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateClaimInput {
  expectedStatus: ClaimStatus;
  nextStatus: ClaimStatus;
  notes?: string;
}

export function getAdminWarrantyClaims(): Promise<AdminWarrantyClaim[]> {
  return request<AdminWarrantyClaim[]>("/api/v1/admin/warranty-claims");
}

export async function updateAdminWarrantyClaim(
  claimId: string,
  input: UpdateClaimInput
): Promise<{ message: string }> {
  const headers = new Headers(await csrfHeaders());
  headers.set("Content-Type", "application/json");

  return request<{ message: string }>(
    `/api/v1/admin/warranty-claims/${encodeURIComponent(claimId)}/status`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    }
  );
}