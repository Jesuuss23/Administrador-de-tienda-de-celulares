import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { RefreshCw, ShieldCheck } from "lucide-react";

import {
  getAdminWarrantyClaims,
  updateAdminWarrantyClaim,
} from "../lib/adminWarrantyClaims";

import type { AdminWarrantyClaim } from "../lib/adminWarrantyClaims";
import { claimStatusLabels } from "../lib/warrantyClaims";
import type { ClaimStatus } from "../lib/warrantyClaims";

type ClosingStatus = "REJECTED" | "RESOLVED";

interface ClosingAction {
  claim: AdminWarrantyClaim;
  nextStatus: ClosingStatus;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "No pudimos completar la operación.";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

export default function AdminWarrantyClaimsPage() {
  const [claims, setClaims] = useState<AdminWarrantyClaim[]>([]);
  const [filter, setFilter] = useState<ClaimStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const [busy, setBusy] = useState(false);
  const actionInProgress = useRef(false);

  const [closing, setClosing] = useState<ClosingAction | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let active = true;

    setLoading(true);
    setLoadError("");

    getAdminWarrantyClaims()
      .then((data) => {
        if (active) {
          setClaims(data);
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
  }, [revision]);

  const visibleClaims = claims.filter(
    (claim) => filter === "ALL" || claim.status === filter
  );

  async function changeStatus(
    claim: AdminWarrantyClaim,
    nextStatus: ClaimStatus,
    resolutionNotes?: string
  ) {
    if (actionInProgress.current) {
      return;
    }

    actionInProgress.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");

    try {
      await updateAdminWarrantyClaim(claim.id, {
        expectedStatus: claim.status,
        nextStatus,
        notes: resolutionNotes,
      });

      setClosing(null);
      setNotes("");
      setNotice("Solicitud actualizada correctamente.");
      setRevision((value) => value + 1);
    } catch (cause: unknown) {
      setActionError(
        `${messageOf(cause)} Actualiza la lista para comprobar el estado antes de reintentar.`
      );
    } finally {
      actionInProgress.current = false;
      setBusy(false);
    }
  }

  function openClosing(
    claim: AdminWarrantyClaim,
    nextStatus: ClosingStatus
  ) {
    setClosing({ claim, nextStatus });
    setNotes("");
    setActionError("");
    setNotice("");
  }

  function submitClosing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!closing) {
      return;
    }

    const text = notes.trim();

    if (text.length < 20 || text.length > 2000) {
      setActionError(
        "La explicación debe tener entre 20 y 2000 caracteres."
      );
      return;
    }

    void changeStatus(closing.claim, closing.nextStatus, text);
  }

  function refresh() {
    setClosing(null);
    setNotes("");
    setActionError("");
    setNotice("");
    setRevision((value) => value + 1);
  }

  return (
    <main className="admin-claims-page">
      <header className="admin-claims-header">
        <div>
          <Link to="/admin/productos" className="admin-claims-back">
            ← Administración
          </Link>

          <h1>
            <ShieldCheck aria-hidden="true" />
            Atención de garantías
          </h1>

          <p>
            Revisa fallas reportadas y registra el resultado de la atención.
          </p>
        </div>

        <button
          type="button"
          className="warranty-refresh"
          disabled={loading || busy}
          onClick={refresh}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Actualizar
        </button>
      </header>

      <div className="admin-claims-toolbar">
        <label htmlFor="claim-status-filter">Estado</label>

        <select
          id="claim-status-filter"
          value={filter}
          disabled={busy || closing !== null}
          onChange={(event) =>
            setFilter(event.target.value as ClaimStatus | "ALL")
          }
        >
          <option value="ALL">Todos</option>
          {Object.entries(claimStatusLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>

        <span>Filtro sobre las 100 solicitudes más recientes.</span>
      </div>

      {notice && (
        <p className="claim-notice" role="status">
          {notice}
        </p>
      )}

      {actionError && (
        <p className="warranty-error" role="alert">
          {actionError}
        </p>
      )}

      {loadError && (
        <div className="warranty-error" role="alert">
          <p>{loadError}</p>
          <Link to="/cuenta">Ir a mi cuenta</Link>
        </div>
      )}

      {loading && <p role="status">Cargando solicitudes…</p>}

      {!loading && !loadError && visibleClaims.length === 0 && (
        <p className="warranty-empty">
          No hay solicitudes para este filtro en la lista cargada.
        </p>
      )}

      {!loading && !loadError && (
        <div className="admin-claims-list">
          {visibleClaims.map((claim) => (
            <article className="admin-claim-card" key={claim.id}>
              <div className="claim-history-top">
                <span className={`claim-badge claim-badge--${claim.status.toLowerCase()}`}>
                  {claimStatusLabels[claim.status]}
                </span>

                <span className="admin-claim-order">
                  Pedido #{claim.orderNumber}
                  {claim.environment === "TEST" && " · TEST"}
                </span>
              </div>

              <h2>{claim.productName}</h2>

              <p className="admin-claim-customer">
                {claim.customerName} · {claim.customerEmail}
              </p>

              <p className="claim-description">{claim.description}</p>

              <p className="claim-muted">
                Recibida: {formatDate(claim.createdAt)}
                <br />
                Última actualización: {formatDate(claim.updatedAt)}
              </p>

              {claim.resolutionNotes && (
                <div className="claim-resolution">
                  <strong>Respuesta registrada</strong>
                  <p>{claim.resolutionNotes}</p>
                </div>
              )}

              <div className="claim-form-actions">
                {claim.status === "RECEIVED" && (
                  <button
                    type="button"
                    className="claim-send-button"
                    disabled={busy || closing !== null}
                    onClick={() => void changeStatus(claim, "UNDER_REVIEW")}
                  >
                    Iniciar revisión
                  </button>
                )}

                {claim.status === "UNDER_REVIEW" && (
                  <>
                    <button
                      type="button"
                      className="claim-send-button"
                      disabled={busy || closing !== null}
                      onClick={() => void changeStatus(claim, "ACCEPTED")}
                    >
                      Aceptar atención
                    </button>

                    <button
                      type="button"
                      className="claim-cancel-button"
                      disabled={busy || closing !== null}
                      onClick={() => openClosing(claim, "REJECTED")}
                    >
                      Rechazar con motivo
                    </button>
                  </>
                )}

                {claim.status === "ACCEPTED" && (
                  <button
                    type="button"
                    className="claim-send-button"
                    disabled={busy || closing !== null}
                    onClick={() => openClosing(claim, "RESOLVED")}
                  >
                    Registrar resolución
                  </button>
                )}
              </div>

              {closing?.claim.id === claim.id && (
                <form className="claim-form" onSubmit={submitClosing}>
                  <label htmlFor={`resolution-${claim.id}`}>
                    {closing.nextStatus === "REJECTED"
                      ? "Motivo del rechazo"
                      : "¿Cómo se resolvió el problema?"}
                  </label>

                  <textarea
                    id={`resolution-${claim.id}`}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    minLength={20}
                    maxLength={2000}
                    rows={4}
                    required
                    disabled={busy}
                  />

                  <p className="claim-muted">
                    El cliente podrá ver esta explicación.
                    Mínimo 20 caracteres.
                  </p>

                  <div className="claim-form-actions">
                    <button
                      type="submit"
                      className="claim-send-button"
                      disabled={busy}
                    >
                      {busy ? "Guardando…" : "Confirmar"}
                    </button>

                    <button
                      type="button"
                      className="claim-cancel-button"
                      disabled={busy}
                      onClick={() => {
                        setClosing(null);
                        setNotes("");
                        setActionError("");
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}