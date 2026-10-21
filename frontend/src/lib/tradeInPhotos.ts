import { csrfHeaders, request } from "./auth";

export type PhotoAngle = "FRONT" | "BACK" | "LEFT" | "RIGHT";

export interface TradeInPhoto {
  id: string;
  angle: PhotoAngle;
  width: number;
  height: number;
  updatedAt: string;
  imageUrl: string;
}

export function getTradeInPhotos(
  tradeInId: string
): Promise<TradeInPhoto[]> {
  return request<TradeInPhoto[]>(
    `/api/v1/trade-ins/${encodeURIComponent(tradeInId)}/photos`
  );
}

export async function uploadTradeInPhoto(
  tradeInId: string,
  angle: PhotoAngle,
  file: File
): Promise<TradeInPhoto> {
  const body = new FormData();
  body.append("angle", angle);
  body.append("file", file);

  const headers = new Headers(await csrfHeaders());

  // El navegador añade Content-Type con el boundary del multipart.
  headers.delete("Content-Type");

  return request<TradeInPhoto>(
    `/api/v1/trade-ins/${encodeURIComponent(tradeInId)}/photos`,
    {
      method: "POST",
      headers,
      body,
    }
  );
}