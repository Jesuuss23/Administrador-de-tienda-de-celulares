import { csrfHeaders, request } from "./auth";

export type InspectionTestResult = "PASS" | "FAIL" | "NOT_TESTED";

export type InspectionResult =
  | "MATCHES_OFFER"
  | "REQUIRES_REVIEW";

export interface InspectionChecks {
  screenTest: InspectionTestResult;
  touchTest: InspectionTestResult;
  camerasTest: InspectionTestResult;
  audioTest: InspectionTestResult;
  chargingTest: InspectionTestResult;
  connectivityTest: InspectionTestResult;
  imeiMatches: boolean;
  accountLocksRemoved: boolean;
  conditionMatches: boolean;
}

export interface CreateTradeInInspection extends InspectionChecks {
  requestKey: string;
  notes: string;
}

export interface TradeInInspection extends InspectionChecks {
  id: string;
  tradeInId: string;
  notes: string;
  result: InspectionResult;
  inspectedByName: string;
  inspectedAt: string;
}

export const inspectionTestLabels: Record<InspectionTestResult, string> = {
  PASS: "Aprobada",
  FAIL: "Con falla",
  NOT_TESTED: "No realizada",
};

export const inspectionResultLabels: Record<InspectionResult, string> = {
  MATCHES_OFFER: "Coincide con la oferta",
  REQUIRES_REVIEW: "Requiere revisión",
};

export function getTradeInInspections(
  tradeInId: string,
  admin = false
): Promise<TradeInInspection[]> {
  const prefix = admin ? "/api/v1/admin" : "/api/v1";

  return request<TradeInInspection[]>(
    `${prefix}/trade-ins/${encodeURIComponent(tradeInId)}/inspections`
  );
}

export async function createTradeInInspection(
  tradeInId: string,
  input: CreateTradeInInspection
): Promise<TradeInInspection> {
  const headers = new Headers(await csrfHeaders());
  headers.set("Content-Type", "application/json");

  return request<TradeInInspection>(
    `/api/v1/admin/trade-ins/${encodeURIComponent(tradeInId)}/inspections`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    }
  );
}