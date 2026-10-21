import { csrfHeaders, request } from "./auth";

export type TradeInStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "QUOTED"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED"
  | "RECEIVED"
  | "CONFIRMED";

export interface TradeIn {
  id: string;
  brand: string;
  model: string;
  storageGb: number;
  color: string;
  imei: string;
  conditionDescription: string;
  functionalIssues: string;
  status: TradeInStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTradeInInput {
  requestKey: string;
  brand: string;
  model: string;
  storageGb: number;
  color: string;
  imei: string;
  conditionDescription: string;
  functionalIssues: string;
}

export const tradeInStatusLabels: Record<TradeInStatus, string> = {
  SUBMITTED: "Enviada",
  UNDER_REVIEW: "En revisión",
  QUOTED: "Cotizada",
  ACCEPTED: "Cotización aceptada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
  RECEIVED: "Equipo recibido",
  CONFIRMED: "Canje confirmado",
};

export function getMyTradeIns(): Promise<TradeIn[]> {
  return request<TradeIn[]>("/api/v1/trade-ins");
}

export async function createTradeIn(
  input: CreateTradeInInput
): Promise<TradeIn> {
  const headers = new Headers(await csrfHeaders());
  headers.set("Content-Type", "application/json");

  return request<TradeIn>("/api/v1/trade-ins", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
}

export function isValidImei(value: string): boolean {
  if (!/^[0-9]{15}$/.test(value) || value === "000000000000000") {
    return false;
  }

  const sum = [...value].reduce((total, character, index) => {
    let digit = Number(character);

    if (index % 2 === 1) {
      digit *= 2;

      if (digit > 9) {
        digit -= 9;
      }
    }

    return total + digit;
  }, 0);

  return sum % 10 === 0;
}