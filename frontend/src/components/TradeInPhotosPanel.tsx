import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, RefreshCw, Upload } from "lucide-react";

import {
  getTradeInPhotos,
  uploadTradeInPhoto,
} from "../lib/tradeInPhotos";

import type {
  PhotoAngle,
  TradeInPhoto,
} from "../lib/tradeInPhotos";

import type { TradeInStatus } from "../lib/tradeIns";

interface Props {
  tradeInId: string;
  status: TradeInStatus;
}

const angles: {
  value: PhotoAngle;
  label: string;
  hint: string;
}[] = [
  {
    value: "FRONT",
    label: "Frente",
    hint: "Pantalla completa y bordes visibles.",
  },
  {
    value: "BACK",
    label: "Parte posterior",
    hint: "Carcasa y cámaras sin funda.",
  },
  {
    value: "LEFT",
    label: "Lateral izquierdo",
    hint: "Borde completo, botones y marcas.",
  },
  {
    value: "RIGHT",
    label: "Lateral derecho",
    hint: "Borde completo, botones y marcas.",
  },
];

function messageOf(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "No pudimos completar la operación.";
}

export default function TradeInPhotosPanel({
  tradeInId,
  status,
}: Props) {
  const [photos, setPhotos] = useState<TradeInPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  const [uploadingAngle, setUploadingAngle] =
    useState<PhotoAngle | null>(null);

  const uploadInProgress = useRef(false);
  const mounted = useRef(false);

  const editable = status === "SUBMITTED";
  const completed = angles.filter((angle) =>
    photos.some((photo) => photo.angle === angle.value)
  ).length;

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setLoadError("");

    getTradeInPhotos(tradeInId)
      .then((data) => {
        if (active) {
          setPhotos(data);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setLoadError(messageOf(cause));
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

  async function handleUpload(angle: PhotoAngle, file: File) {
    if (uploadInProgress.current || !editable) {
      return;
    }

    setUploadError("");
    setNotice("");

    if (file.size === 0) {
      setUploadError("El archivo está vacío.");
      return;
    }

    if (file.size > 6 * 1024 * 1024) {
      setUploadError("La imagen no puede superar los 6 MB.");
      return;
    }

    // Esta comprobación ayuda al usuario.
    // El backend verifica el contenido real de la imagen.
    if (
      file.type &&
      file.type !== "image/jpeg" &&
      file.type !== "image/png"
    ) {
      setUploadError("Selecciona una imagen JPEG o PNG.");
      return;
    }

    uploadInProgress.current = true;
    setUploadingAngle(angle);

    try {
      const saved = await uploadTradeInPhoto(tradeInId, angle, file);

      if (!mounted.current) {
        return;
      }

      setPhotos((current) => [
        ...current.filter((photo) => photo.angle !== angle),
        saved,
      ]);

      const label = angles.find((item) => item.value === angle)?.label;

      setNotice(`Fotografía guardada: ${label ?? angle}.`);
    } catch (cause: unknown) {
      if (mounted.current) {
        setUploadError(
          `${messageOf(cause)} Puedes actualizar las fotos para comprobar si se guardó.`
        );
      }
    } finally {
      uploadInProgress.current = false;

      if (mounted.current) {
        setUploadingAngle(null);
      }
    }
  }

  return (
    <section
      className="trade-photos-panel"
      aria-busy={loading || uploadingAngle !== null}
    >
      <div className="trade-photos-heading">
        <div>
          <h4>
            <Camera size={18} aria-hidden="true" />
            Fotos del equipo
          </h4>

          {!loading && !loadError && (
            <p>{completed} de 4 ángulos completados</p>
          )}
        </div>

        <button
          type="button"
          className="claim-refresh"
          aria-label="Actualizar fotografías"
          disabled={loading || uploadingAngle !== null}
          onClick={() => {
            setUploadError("");
            setNotice("");
            setRevision((value) => value + 1);
          }}
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      <p className="trade-help">
        Usa buena iluminación y muestra el equipo completo, sin funda.
        JPEG o PNG, hasta 6 MB y 12 megapíxeles.
        Cada lado debe medir entre 320 y 6000 píxeles.
      </p>

      {!editable && (
        <p className="claim-info">
          Las fotografías están disponibles para consulta. Ya no pueden
          modificarse porque la solicitud avanzó de estado.
        </p>
      )}

      {notice && (
        <p className="claim-notice" role="status">
          {notice}
        </p>
      )}

      {uploadError && (
        <p className="warranty-error" role="alert">
          {uploadError}
        </p>
      )}

      {loadError && (
        <p className="warranty-error" role="alert">
          {loadError}
        </p>
      )}

      {loading && (
        <p className="claim-muted" role="status">
          Cargando fotografías…
        </p>
      )}

      {!loading && !loadError && (
        <>
          <div className="trade-photo-grid">
            {angles.map((angle) => {
              const photo = photos.find(
                (item) => item.angle === angle.value
              );

              const inputId = `photo-${tradeInId}-${angle.value}`;
              const uploading = uploadingAngle === angle.value;

              const imageUrl = photo
                ? `${photo.imageUrl}?v=${encodeURIComponent(
                    photo.updatedAt
                  )}&refresh=${revision}`
                : "";

              return (
                <div className="trade-photo-slot" key={angle.value}>
                  <div className="trade-photo-preview">
                    {photo ? (
                      <a
                        href={imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Abrir fotografía: ${angle.label}`}
                      >
                        <img
                          src={imageUrl}
                          alt={`${angle.label} del celular`}
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <div className="trade-photo-placeholder">
                        <Camera size={28} aria-hidden="true" />
                        <span>Sin fotografía</span>
                      </div>
                    )}

                    {photo && (
                      <span className="trade-photo-check">
                        <CheckCircle2 size={17} aria-hidden="true" />
                        Guardada
                      </span>
                    )}
                  </div>

                  <div className="trade-photo-info">
                    <h5>{angle.label}</h5>
                    <p>{angle.hint}</p>

                    {editable && (
                      <>
                        <label
                          className="trade-photo-input-label"
                          htmlFor={inputId}
                        >
                          <Upload size={14} aria-hidden="true" />
                          {uploading
                            ? "Subiendo…"
                            : photo
                              ? "Reemplazar fotografía"
                              : "Seleccionar fotografía"}
                        </label>

                        <input
                          id={inputId}
                          className="trade-photo-input"
                          type="file"
                          accept="image/jpeg,image/png"
                          disabled={uploadingAngle !== null}
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0];

                            // Permite volver a seleccionar el mismo archivo.
                            event.currentTarget.value = "";

                            if (file) {
                              void handleUpload(angle.value, file);
                            }
                          }}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {completed === 4 && (
            <p className="claim-notice">
              Los cuatro ángulos tienen una fotografía cargada.
              La tienda todavía debe revisar su claridad y contenido.
            </p>
          )}
        </>
      )}
    </section>
  );
}