import { csrfHeaders, request } from "./auth";

export type QuoteStatus =
  | "OFFERED"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED";

export interface TradeInQuote {
  id: string;
  tradeInId: string;
  offeredAmount: number;
  currency: string;
  assessmentNotes: string;
  conditions: string;
  validityDays: number;
  expiresAt: string;
  status: QuoteStatus;
  createdAt: string;
  respondedAt: string | null;
}

export interface CreateTradeInQuote {
  requestKey: string;
  offeredAmount: string;
  assessmentNotes: string;
  validityDays: number;
}

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  OFFERED: "Oferta disponible",
  ACCEPTED: "Oferta aceptada",
  DECLINED: "Oferta rechazada",
  EXPIRED: "Oferta vencida",
};

export function getTradeInQuote(
  tradeInId: string,
  admin = false
): Promise<TradeInQuote> {
  const prefix = admin ? "/api/v1/admin" : "/api/v1";

  return request<TradeInQuote>(
    `${prefix}/trade-ins/${encodeURIComponent(tradeInId)}/quote`
  );
}

export async function createTradeInQuote(
  tradeInId: string,
  input: CreateTradeInQuote
): Promise<TradeInQuote> {
  const headers = new Headers(await csrfHeaders());
  headers.set("Content-Type", "application/json");

  return request<TradeInQuote>(
    `/api/v1/admin/trade-ins/${encodeURIComponent(tradeInId)}/quote`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    }
  );
}
export type QuoteDecision = "ACCEPT" | "DECLINE";

export interface RespondTradeInQuote {
  quoteId: string;
  decision: QuoteDecision;
  conditionsAccepted: boolean;
}

export async function respondTradeInQuote(
  tradeInId: string,
  input: RespondTradeInQuote
): Promise<TradeInQuote> {
  const headers = new Headers(await csrfHeaders());
  headers.set("Content-Type", "application/json");

  return request<TradeInQuote>(
    `/api/v1/trade-ins/${encodeURIComponent(tradeInId)}/quote/response`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    }
  );
}