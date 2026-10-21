import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import {
  getOrderWarranties,
  warrantyStatusLabels,
} from "../lib/warranties";
import type { Warranty } from "../lib/warranties";
import WarrantyClaimsPanel from "./WarrantyClaimsPanel";

interface Props {
  orderId: string;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

export default function OrderWarranties({ orderId }: Props) {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");
    setWarranties([]);

    getOrderWarranties(orderId)
      .then((data) => {
        if (active) {
          setWarranties(data);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos cargar las garantías."
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
  }, [orderId, revision]);

  return (
    <section className="warranty-section" aria-busy={loading}>
      <div className="warranty-section-heading">
        <div className="warranty-title">
          <span className="warranty-title-icon">
            <ShieldCheck size={23} aria-hidden="true" />
          </span>

          <div>
            <h2>Garantías de tus equipos</h2>
            <p>Consulta la cobertura y las fechas de cada celular.</p>
          </div>
        </div>

        <button
          type="button"
          className="warranty-refresh"
          onClick={() => setRevision((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {loading ? "Cargando…" : "Actualizar"}
        </button>
      </div>

      {error && (
        <p className="warranty-error" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <p className="warranty-empty" role="status">
          Consultando tus garantías…
        </p>
      )}

      {!loading && !error && warranties.length === 0 && (
        <div className="warranty-empty">
          <strong>Aún no hay garantías emitidas para este pedido.</strong>
          <p>
            Se generan al registrar la entrega. Si acabas de recibir tu
            equipo, pulsa Actualizar.
          </p>
        </div>
      )}

      {!loading && !error && (
        <div className="warranty-grid">
          {warranties.map((warranty) => (
            <article className="warranty-card" key={warranty.id}>
              <div className="warranty-card-top">
                <Smartphone size={24} aria-hidden="true" />

                <span
                  className={`warranty-status warranty-status--${warranty.status.toLowerCase()}`}
                >
                  {warrantyStatusLabels[warranty.status]}
                </span>
              </div>

              <h3>{warranty.productName}</h3>
              <p className="warranty-policy">{warranty.policyName}</p>

              {warranty.environment === "TEST" && (
                <p className="warranty-test">
                  TEST · Garantía de demostración, sin efectos comerciales.
                </p>
              )}

              <div className="warranty-identifiers">
                {warranty.identifiers.map((identifier, index) => (
                  <div
                    key={`${identifier.type}-${identifier.value}-${index}`}
                  >
                    <span>{identifier.type}</span>
                    <code>{identifier.value}</code>
                  </div>
                ))}
              </div>

              <dl className="warranty-dates">
                <div>
                  <dt>Inicio</dt>
                  <dd>{formatDate(warranty.startsAt)}</dd>
                </div>
                <div>
                  <dt>Vencimiento</dt>
                  <dd>{formatDate(warranty.endsAt)}</dd>
                </div>
                <div>
                  <dt>Duración</dt>
                  <dd>{warranty.durationDays} días</dd>
                </div>
              </dl>

              <details className="warranty-terms">
                <summary>Ver cobertura y exclusiones</summary>

                <h4>Cobertura</h4>
                <p>{warranty.coverage}</p>

                <h4>Exclusiones</h4>
                <p>{warranty.exclusions}</p>
              </details>

              {warranty.status === "VOID" && warranty.voidReason && (
                <p className="warranty-error">
                  <strong>Motivo de anulación: </strong>
                  {warranty.voidReason}
                </p>
              )}
              <WarrantyClaimsPanel
                key={warranty.id}
                orderId={orderId}
                warrantyId={warranty.id}
                warrantyStatus={warranty.status}
                />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}