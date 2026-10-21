import { request } from "./auth";

export type WarrantyStatus =
  | "ACTIVE"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "VOID"
  | "NOT_STARTED";

export interface WarrantyIdentifier {
  type: string;
  value: string;
}

export interface Warranty {
  id: string;
  unitId: string;
  productName: string;
  policyName: string;
  durationDays: number;
  coverage: string;
  exclusions: string;
  environment: "TEST" | "LIVE";
  startsAt: string;
  endsAt: string;
  status: WarrantyStatus;
  voidReason: string | null;
  identifiers: WarrantyIdentifier[];
}

export const warrantyStatusLabels: Record<WarrantyStatus, string> = {
  ACTIVE: "Vigente",
  EXPIRING_SOON: "Por vencer",
  EXPIRED: "Vencida",
  VOID: "Anulada",
  NOT_STARTED: "Por iniciar",
};

export function getOrderWarranties(orderId: string): Promise<Warranty[]> {
  return request<Warranty[]>(
    `/api/v1/orders/${encodeURIComponent(orderId)}/warranties`
  );
}