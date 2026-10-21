import { useEffect, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";

import { getAdminTradeInPhotos } from "../lib/adminTradeIns";
import type { PhotoAngle, TradeInPhoto } from "../lib/tradeInPhotos";
import AdminTradeInVisualAnalysis from "./AdminTradeInVisualAnalysis";

interface Props {
  tradeInId: string;
}

const angles: { value: PhotoAngle; label: string }[] = [
  { value: "FRONT", label: "Frente" },
  { value: "BACK", label: "Parte posterior" },
  { value: "LEFT", label: "Lateral izquierdo" },
  { value: "RIGHT", label: "Lateral derecho" },
];

export default function AdminTradeInPhotos({ tradeInId }: Props) {
  const [photos, setPhotos] = useState<TradeInPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");
    setPhotos([]);

    getAdminTradeInPhotos(tradeInId)
      .then((data) => {
        if (active) {
          setPhotos(data);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos cargar las fotografías."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [tradeInId, revision]);

  return (
    <section className="admin-trade-gallery" aria-busy={loading}>
      <div className="trade-photos-heading">
        <div>
          <h4>
            <Camera size={18} aria-hidden="true" />
            Evidencia fotográfica
          </h4>
          <p>Abre cada imagen para inspeccionarla en tamaño completo.</p>
        </div>

        <button
          type="button"
          className="claim-refresh"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
          aria-label="Actualizar galería"
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      {loading && (
        <p className="claim-muted" role="status">
          Cargando fotografías…
        </p>
      )}

      {error && (
        <p className="warranty-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="admin-trade-photo-grid">
          {angles.map((angle) => {
            const photo = photos.find(
              (item) => item.angle === angle.value
            );

            const url = photo
              ? `${photo.imageUrl}?v=${encodeURIComponent(
                  photo.updatedAt
                )}&refresh=${revision}`
              : "";

            return (
              <figure className="admin-trade-photo" key={angle.value}>
                {photo ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir fotografía: ${angle.label}`}
                  >
                    <img
                      src={url}
                      alt={`${angle.label} del equipo enviado para canje`}
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <div className="admin-trade-photo-missing">
                    <Camera size={26} aria-hidden="true" />
                    <span>Pendiente</span>
                  </div>
                )}

                <figcaption>{angle.label}</figcaption>
              </figure>
            );
          })}
        </div>
      )}
      <AdminTradeInVisualAnalysis
        key={tradeInId}
        tradeInId={tradeInId}
        />
    </section>
  );
}