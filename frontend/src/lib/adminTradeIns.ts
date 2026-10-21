import { csrfHeaders, request } from "./auth";
import type { TradeInStatus } from "./tradeIns";
import type { TradeInPhoto } from "./tradeInPhotos";

export interface AdminTradeIn {
  id: string;
  customerName: string;
  customerEmail: string;
  brand: string;
  model: string;
  storageGb: number;
  color: string;
  imei: string;
  conditionDescription: string;
  functionalIssues: string;
  status: TradeInStatus;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

export function getAdminTradeIns(): Promise<AdminTradeIn[]> {
  return request<AdminTradeIn[]>("/api/v1/admin/trade-ins");
}

export function getAdminTradeInPhotos(
  tradeInId: string
): Promise<TradeInPhoto[]> {
  return request<TradeInPhoto[]>(
    `/api/v1/admin/trade-ins/${encodeURIComponent(tradeInId)}/photos`
  );
}

export async function startTradeInReview(
  tradeInId: string
): Promise<{ message: string }> {
  const headers = new Headers(await csrfHeaders());

  return request<{ message: string }>(
    `/api/v1/admin/trade-ins/${encodeURIComponent(tradeInId)}/review`,
    {
      method: "POST",
      headers,
    }
  );
}