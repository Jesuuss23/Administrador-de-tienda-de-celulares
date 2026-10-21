import { useEffect, useRef, useState } from "react";
import { BadgeCheck, RefreshCw, Wallet } from "lucide-react";

import {
  confirmTradeInCredit,
  creditStatusLabels,
  getTradeInCredit,
} from "../lib/tradeInCredits";

import type {
  ConfirmTradeInCredit,
  TradeInCredit,
} from "../lib/tradeInCredits";

import { getTradeInQuote } from "../lib/tradeInQuotes";
import type { TradeInQuote } from "../lib/tradeInQuotes";

import {
  getTradeInInspections,
  inspectionResultLabels,
} from "../lib/tradeInInspections";

import type { TradeInInspection } from "../lib/tradeInInspections";
import type { TradeInStatus } from "../lib/tradeIns";

interface Props {
  tradeInId: string;
  status: TradeInStatus;
  admin?: boolean;
  onConfirmed?: () => void;
}

function statusOf(cause: unknown): number | undefined {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "status" in cause &&
    typeof cause.status === "number"
  ) {
    return cause.status;
  }

  return undefined;
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

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
  }).format(amount);
}

export default function TradeInCreditPanel({
  tradeInId,
  status,
  admin = false,
  onConfirmed,
}: Props) {
  const [credit, setCredit] = useState<TradeInCredit | null>(null);
  const [quote, setQuote] = useState<TradeInQuote | null>(null);
  const [inspection, setInspection] =
    useState<TradeInInspection | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  const [checked, setChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [uncertain, setUncertain] = useState(false);

  const pendingAttempt = useRef<ConfirmTradeInCredit | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);

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
    setCredit(null);
    setQuote(null);
    setInspection(null);

    async function load() {
      try {
        let existingCredit: TradeInCredit | null = null;

        try {
          existingCredit = await getTradeInCredit(tradeInId, admin);
        } catch (cause: unknown) {
          if (statusOf(cause) !== 404) {
            throw cause;
          }
        }

        if (!active) {
          return;
        }

        if (existingCredit) {
          setCredit(existingCredit);
          return;
        }

        if (status === "CONFIRMED") {
          throw new Error(
            "El canje figura como confirmado, pero no se encontró su crédito. Actualiza o consulta con la tienda."
          );
        }

        if (admin && status === "RECEIVED") {
          const [quoteResult, inspectionResult] =
            await Promise.allSettled([
              getTradeInQuote(tradeInId, true),
              getTradeInInspections(tradeInId, true),
            ]);

          if (!active) {
            return;
          }

          if (quoteResult.status === "rejected") {
            throw quoteResult.reason;
          }

          if (inspectionResult.status === "rejected") {
            throw inspectionResult.reason;
          }

          setQuote(quoteResult.value);
          setInspection(inspectionResult.value[0] ?? null);
        }
      } catch (cause: unknown) {
        if (active) {
          setLoadError(messageOf(cause));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [tradeInId, status, admin, revision]);

  const canConfirm =
    admin &&
    status === "RECEIVED" &&
    !credit &&
    quote?.status === "ACCEPTED" &&
    inspection?.result === "MATCHES_OFFER" &&
    !loading &&
    !loadError;

  function refresh() {
    if (!uncertain) {
      setChecked(false);
      setSubmitError("");
    }

    setRevision((value) => value + 1);
  }

  async function handleConfirm() {
    if (submitting.current) {
      return;
    }

    setSubmitError("");

    if (!pendingAttempt.current) {
      if (!canConfirm || !inspection || !checked) {
        setSubmitError(
          "Revisa la inspección y confirma el cierre comercial."
        );
        return;
      }

      pendingAttempt.current = {
        requestKey: crypto.randomUUID(),
        inspectionId: inspection.id,
        confirmed: true,
      };
    }

    submitting.current = true;
    setSending(true);

    try {
      const created = await confirmTradeInCredit(
        tradeInId,
        pendingAttempt.current
      );

      if (!mounted.current) {
        return;
      }

      pendingAttempt.current = null;
      setUncertain(false);
      setCredit(created);
      onConfirmed?.();
    } catch (cause: unknown) {
      if (!mounted.current) {
        return;
      }

      const code = statusOf(cause);
      const definitiveRejection =
        code !== undefined &&
        [400, 401, 403, 404, 409, 422].includes(code);

      if (definitiveRejection) {
        pendingAttempt.current = null;
        setUncertain(false);
        setChecked(false);
      } else {
        setUncertain(true);
      }

      setSubmitError(
        `${messageOf(cause)} Actualiza este panel para comprobar el estado.`
      );
    } finally {
      submitting.current = false;

      if (mounted.current) {
        setSending(false);
      }
    }
  }

  return (
    <section className="trade-credit-panel" aria-busy={loading || sending}>
      <div className="trade-photos-heading">
        <div>
          <h4>
            <Wallet size={20} aria-hidden="true" />
            Valor confirmado del canje
          </h4>
          <p>Crédito interno asociado a este equipo y a su propietario.</p>
        </div>

        <button
          type="button"
          className="claim-refresh"
          disabled={loading || sending}
          onClick={refresh}
          aria-label="Actualizar crédito del canje"
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      {loading && (
        <p className="claim-muted" role="status">
          Consultando confirmación…
        </p>
      )}

      {loadError && (
        <p className="warranty-error" role="alert">
          {loadError}
        </p>
      )}

      {!loading && !loadError && credit && (
        <div className="trade-credit-card">
          <span className="trade-credit-badge">
            <BadgeCheck size={17} aria-hidden="true" />
            Crédito {creditStatusLabels[credit.status].toLowerCase()}
          </span>

          <p className="trade-credit-amount">
            {formatMoney(credit.amount, credit.currency)}
          </p>

          <p className="trade-credit-caption">
            Valor registrado por tu celular
          </p>

          <dl className="trade-receipt-data">
            <div>
              <dt>Confirmado el</dt>
              <dd>{formatDate(credit.confirmedAt)}</dd>
            </div>
            <div>
              <dt>Identificador del crédito</dt>
              <dd><code>{credit.id}</code></dd>
            </div>
          </dl>

          <p className="trade-explanation">
            El crédito está registrado. Su aplicación a una compra y
            el pago de la diferencia se habilitarán en el siguiente
            módulo. No representa un depósito bancario.
          </p>
        </div>
      )}

      {!loading && !loadError && !credit && !admin && (
        <p className="claim-info">
          La tienda todavía no ha confirmado el valor del canje.
          Podrás consultar aquí el resultado.
        </p>
      )}

      {!loading && !loadError && !credit && admin && (
        <div className="trade-credit-confirmation">
          {quote && (
            <div className="trade-credit-offer">
              <span>Importe aceptado por el cliente</span>
              <strong>
                {formatMoney(quote.offeredAmount, quote.currency)}
              </strong>
            </div>
          )}

          {quote && quote.status !== "ACCEPTED" && (
            <p className="warranty-error">
              La cotización no está aceptada.
            </p>
          )}

          {!inspection ? (
            <p className="claim-info">
              Falta registrar la inspección física. Si acabas de
              guardarla, actualiza este panel.
            </p>
          ) : (
            <div className="trade-credit-inspection">
              <h5>Inspección más reciente</h5>

              <p>
                <strong>
                  {inspectionResultLabels[inspection.result]}
                </strong>
              </p>

              <p className="claim-muted">
                {inspection.inspectedByName}
                {" · "}
                {formatDate(inspection.inspectedAt)}
              </p>

              <p className="inspection-notes">{inspection.notes}</p>

              {inspection.result !== "MATCHES_OFFER" && (
                <p className="claim-info">
                  Hay discrepancias o comprobaciones pendientes.
                  Este resultado no permite confirmar el crédito.
                </p>
              )}
            </div>
          )}

          {canConfirm && (
            <>
              <p className="trade-explanation">
                Al confirmar se registrará el importe aceptado como
                crédito del cliente. La solicitud cambiará a Canje
                confirmado y dejará de admitir nuevas inspecciones.
              </p>

              <label className="quote-conditions-checkbox">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={sending || uncertain}
                  onChange={(event) => setChecked(event.target.checked)}
                />
                <span>
                  He revisado el informe más reciente y confirmo el
                  canje por el importe aceptado por el cliente.
                </span>
              </label>
            </>
          )}

          {submitError && (
            <p className="warranty-error" role="alert">
              {submitError}
            </p>
          )}

          {uncertain && (
            <p className="claim-info">
              No pudimos confirmar el resultado del envío. Puedes
              actualizar para comprobarlo o reintentar la misma operación.
            </p>
          )}

          {(canConfirm || uncertain) && (
            <button
              type="button"
              className="claim-send-button"
              disabled={sending || (!uncertain && !checked)}
              onClick={() => void handleConfirm()}
            >
              {sending
                ? "Confirmando…"
                : uncertain
                  ? "Reintentar confirmación"
                  : "Confirmar canje y registrar crédito"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}