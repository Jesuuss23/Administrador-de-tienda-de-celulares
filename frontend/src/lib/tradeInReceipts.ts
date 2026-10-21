import { csrfHeaders, request } from "./auth";

export interface TradeInReceipt {
  tradeInId: string;
  receivedImei: string;
  receiptReference: string;
  receptionNotes: string;
  receivedByName: string;
  receivedAt: string;
}

export interface CreateTradeInReceipt {
  requestKey: string;
  receivedImei: string;
  receiptReference: string;
  receptionNotes: string;
  physicallyReceived: boolean;
}

export function getTradeInReceipt(
  tradeInId: string,
  admin = false
): Promise<TradeInReceipt> {
  const prefix = admin ? "/api/v1/admin" : "/api/v1";

  return request<TradeInReceipt>(
    `${prefix}/trade-ins/${encodeURIComponent(tradeInId)}/receipt`
  );
}

export async function createTradeInReceipt(
  tradeInId: string,
  input: CreateTradeInReceipt
): Promise<TradeInReceipt> {
  const headers = new Headers(await csrfHeaders());
  headers.set("Content-Type", "application/json");

  return request<TradeInReceipt>(
    `/api/v1/admin/trade-ins/${encodeURIComponent(tradeInId)}/receipt`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    }
  );
}