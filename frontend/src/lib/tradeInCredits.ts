import { csrfHeaders, request } from "./auth";

export type TradeInCreditStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "USED"
  | "VOID";

export interface TradeInCredit {
  id: string;
  tradeInId: string;
  inspectionId: string;
  amount: number;
  currency: string;
  status: TradeInCreditStatus;
  confirmedAt: string;
}

export interface ConfirmTradeInCredit {
  requestKey: string;
  inspectionId: string;
  confirmed: boolean;
}

export const creditStatusLabels: Record<TradeInCreditStatus, string> = {
  AVAILABLE: "Disponible",
  RESERVED: "Reservado",
  USED: "Utilizado",
  VOID: "Anulado",
};

export function getTradeInCredit(
  tradeInId: string,
  admin = false
): Promise<TradeInCredit> {
  const prefix = admin ? "/api/v1/admin" : "/api/v1";

  return request<TradeInCredit>(
    `${prefix}/trade-ins/${encodeURIComponent(tradeInId)}/credit`
  );
}

export async function confirmTradeInCredit(
  tradeInId: string,
  input: ConfirmTradeInCredit
): Promise<TradeInCredit> {
  const headers = new Headers(await csrfHeaders());
  headers.set("Content-Type", "application/json");

  return request<TradeInCredit>(
    `/api/v1/admin/trade-ins/${encodeURIComponent(tradeInId)}/credit`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    }
  );
}