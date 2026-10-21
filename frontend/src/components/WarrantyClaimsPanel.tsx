import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { MessageSquare, RefreshCw, Send } from "lucide-react";

import {
  claimStatusLabels,
  createWarrantyClaim,
  getWarrantyClaims,
  isOpenClaim,
} from "../lib/warrantyClaims";

import type {
  CreateWarrantyClaim,
  WarrantyClaim,
} from "../lib/warrantyClaims";

import type { WarrantyStatus } from "../lib/warranties";

interface Props {
  orderId: string;
  warrantyId: string;
  warrantyStatus: WarrantyStatus;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "No pudimos completar la operación.";
}

export default function WarrantyClaimsPanel({
  orderId,
  warrantyId,
  warrantyStatus,
}: Props) {
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");

  /*
   * Conservamos el contenido y la clave de un intento.
   * Si la respuesta se pierde, el reintento envía lo mismo.
   */
  const pendingAttempt = useRef<CreateWarrantyClaim | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);

  const [uncertain, setUncertain] = useState(false);

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

    getWarrantyClaims(orderId, warrantyId)
      .then((data) => {
        if (active) {
          setClaims(data);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setLoadError(errorMessage(cause));
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
  }, [orderId, warrantyId, revision]);

  const warrantyAllowsClaims =
    warrantyStatus === "ACTIVE" ||
    warrantyStatus === "EXPIRING_SOON";

  const hasOpenClaim = claims.some((claim) => isOpenClaim(claim.status));

  const canStart =
    warrantyAllowsClaims &&
    !hasOpenClaim &&
    !loading &&
    !loadError;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) {
      return;
    }

    const text = description.trim();

    if (!pendingAttempt.current && (text.length < 20 || text.length > 2000)) {
      setSubmitError("Describe la falla usando entre 20 y 2000 caracteres.");
      return;
    }

    if (!pendingAttempt.current) {
      pendingAttempt.current = {
        requestKey: crypto.randomUUID(),
        description: text,
      };
    }

    const attempt = pendingAttempt.current;

    submitting.current = true;
    setSending(true);
    setSubmitError("");
    setNotice("");

    try {
      const created = await createWarrantyClaim(
        orderId,
        warrantyId,
        attempt
      );

      if (!mounted.current) {
        return;
      }

      pendingAttempt.current = null;
      setUncertain(false);

      setClaims((current) => [
        created,
        ...current.filter((claim) => claim.id !== created.id),
      ]);

      setDescription("");
      setFormOpen(false);
      setNotice(
        "Solicitud recibida. El administrador revisará la falla reportada."
      );

      setRevision((value) => value + 1);
    } catch (cause: unknown) {
      if (!mounted.current) {
        return;
      }

      const status =
        typeof cause === "object" &&
        cause !== null &&
        "status" in cause &&
        typeof cause.status === "number"
          ? cause.status
          : undefined;

      /*
       * Los errores de validación/autorización/conflicto
       * permiten corregir el formulario.
       * Ante errores de red o del servidor conservamos
       * el intento para consultar/reintentar sin duplicar.
       */
      const definitiveRejection =
        status !== undefined &&
        [400, 401, 403, 404, 409, 422].includes(status);

      if (definitiveRejection) {
        pendingAttempt.current = null;
        setUncertain(false);
      } else {
        setUncertain(true);
      }

      setSubmitError(errorMessage(cause));
    } finally {
      submitting.current = false;

      if (mounted.current) {
        setSending(false);
      }
    }
  }

  return (
    <section className="claim-panel" aria-busy={loading || sending}>
      <div className="claim-heading">
        <h4>
          <MessageSquare size={17} aria-hidden="true" />
          Atención por garantía
        </h4>

        <button
          type="button"
          className="claim-refresh"
          disabled={loading || sending}
          onClick={() => setRevision((value) => value + 1)}
          aria-label="Actualizar solicitudes de garantía"
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      {notice && (
        <p className="claim-notice" role="status">
          {notice}
        </p>
      )}

      {loadError && (
        <p className="warranty-error" role="alert">
          {loadError}
        </p>
      )}

      {loading && <p className="claim-muted">Cargando solicitudes…</p>}

      {!loading && !loadError && claims.length === 0 && (
        <p className="claim-muted">
          Todavía no has reportado fallas para este equipo.
        </p>
      )}

      {!loading && !loadError && hasOpenClaim && (
        <p className="claim-info">
          Tienes una solicitud abierta. Puedes consultar su avance aquí.
        </p>
      )}

      {!warrantyAllowsClaims && (
        <p className="claim-muted">
          Esta garantía no admite nuevas solicitudes en su estado actual.
          Las solicitudes anteriores conservan su seguimiento.
        </p>
      )}

      {canStart && !formOpen && (
        <button
          type="button"
          className="claim-open-button"
          onClick={() => {
            setSubmitError("");
            setNotice("");
            setFormOpen(true);
          }}
        >
          <MessageSquare size={16} aria-hidden="true" />
          Reportar una falla
        </button>
      )}

      {formOpen && (canStart || uncertain) && (
        <form className="claim-form" onSubmit={handleSubmit}>
          <label htmlFor={`claim-description-${warrantyId}`}>
            ¿Qué problema presenta el equipo?
          </label>

          <textarea
            id={`claim-description-${warrantyId}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Explica qué sucede, desde cuándo y en qué situaciones ocurre."
            minLength={20}
            maxLength={2000}
            rows={5}
            required
            disabled={sending || uncertain}
            aria-describedby={`claim-help-${warrantyId}`}
          />

          <div className="claim-form-meta">
            <span id={`claim-help-${warrantyId}`}>
              Mínimo 20 caracteres.
            </span>
            <span>{description.length}/2000</span>
          </div>

          <p className="claim-muted">
            No incluyas contraseñas ni códigos de desbloqueo.
            La solicitud estará sujeta a revisión.
          </p>

          {submitError && (
            <p className="warranty-error" role="alert">
              {submitError}
            </p>
          )}

          {uncertain && (
            <p className="claim-info">
              No pudimos confirmar el resultado del envío. Reintenta:
              utilizaremos la misma solicitud para evitar duplicados.
            </p>
          )}

          <div className="claim-form-actions">
            <button
              type="submit"
              className="claim-send-button"
              disabled={sending || (!uncertain && !canStart)}
            >
              <Send size={15} aria-hidden="true" />
              {sending
                ? "Enviando…"
                : uncertain
                  ? "Reintentar envío"
                  : "Enviar solicitud"}
            </button>

            {!uncertain && (
              <button
                type="button"
                className="claim-cancel-button"
                disabled={sending}
                onClick={() => {
                  setFormOpen(false);
                  setSubmitError("");
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {!loading && !loadError && (
        <div className="claim-history">
          {claims.map((claim) => (
            <article className="claim-history-item" key={claim.id}>
              <div className="claim-history-top">
                <span className={`claim-badge claim-badge--${claim.status.toLowerCase()}`}>
                  {claimStatusLabels[claim.status]}
                </span>

                <time dateTime={claim.createdAt}>
                  {formatDate(claim.createdAt)}
                </time>
              </div>

              <p className="claim-description">{claim.description}</p>

              {claim.resolutionNotes && (
                <div className="claim-resolution">
                  <strong>Respuesta del administrador</strong>
                  <p>{claim.resolutionNotes}</p>

                  {claim.resolvedAt && (
                    <small>{formatDate(claim.resolvedAt)}</small>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}