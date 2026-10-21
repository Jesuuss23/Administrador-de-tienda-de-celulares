import { useEffect, useRef, useState } from "react";

import { respondTradeInQuote } from "../lib/tradeInQuotes";

import type {
  QuoteDecision,
  RespondTradeInQuote,
  TradeInQuote,
} from "../lib/tradeInQuotes";

interface Props {
  tradeInId: string;
  quote: TradeInQuote;
  onResponded: (quote: TradeInQuote) => void;
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

export default function TradeInQuoteDecision({
  tradeInId,
  quote,
  onResponded,
}: Props) {
  const [decision, setDecision] = useState<QuoteDecision | null>(null);
  const [conditionsAccepted, setConditionsAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");

  const pendingAttempt = useRef<RespondTradeInQuote | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  function chooseDecision(value: QuoteDecision) {
    setDecision(value);
    setConditionsAccepted(false);
    setError("");
  }

  async function confirmDecision() {
    if (!decision || submitting.current) {
      return;
    }

    if (!pendingAttempt.current) {
      if (decision === "ACCEPT" && !conditionsAccepted) {
        setError("Debes aceptar las condiciones de la oferta.");
        return;
      }

      pendingAttempt.current = {
        quoteId: quote.id,
        decision,
        conditionsAccepted: decision === "ACCEPT",
      };
    }

    submitting.current = true;
    setSending(true);
    setError("");

    try {
      const updated = await respondTradeInQuote(
        tradeInId,
        pendingAttempt.current
      );

      if (!mounted.current) {
        return;
      }

      pendingAttempt.current = null;
      setUncertain(false);
      onResponded(updated);
    } catch (cause: unknown) {
      if (!mounted.current) {
        return;
      }

      const status = statusOf(cause);
      const definitiveRejection =
        status !== undefined &&
        [400, 401, 403, 404, 409, 422].includes(status);

      if (definitiveRejection) {
        pendingAttempt.current = null;
        setUncertain(false);
      } else {
        setUncertain(true);
      }

      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos confirmar tu respuesta."
      );
    } finally {
      submitting.current = false;

      if (mounted.current) {
        setSending(false);
      }
    }
  }

  return (
    <div className="quote-decision">
      {!decision && (
        <div className="claim-form-actions">
          <button
            type="button"
            className="claim-send-button"
            onClick={() => chooseDecision("ACCEPT")}
          >
            Aceptar oferta
          </button>

          <button
            type="button"
            className="claim-cancel-button"
            onClick={() => chooseDecision("DECLINE")}
          >
            Rechazar oferta
          </button>
        </div>
      )}

      {decision && (
        <div className="quote-decision-confirmation">
          <h5>
            {decision === "ACCEPT"
              ? "Confirma que deseas aceptar"
              : "Confirma que deseas rechazar"}
          </h5>

          {decision === "ACCEPT" ? (
            <>
              <p>
                Aceptarás el importe ofrecido y sus condiciones.
                El equipo todavía debe pasar la inspección física.
                Esta acción no genera un cobro ni reserva otro celular.
              </p>

              <label className="quote-conditions-checkbox">
                <input
                  type="checkbox"
                  checked={conditionsAccepted}
                  disabled={sending || uncertain}
                  onChange={(event) =>
                    setConditionsAccepted(event.target.checked)
                  }
                />

                <span>
                  He leído y acepto el importe y las condiciones
                  mostradas en esta cotización.
                </span>
              </label>
            </>
          ) : (
            <p>
              La oferta quedará rechazada y esta solicitud de canje
              se cancelará. No podrás cambiar esta decisión desde aquí.
            </p>
          )}

          {error && (
            <p className="warranty-error" role="alert">
              {error}
            </p>
          )}

          {uncertain && (
            <p className="claim-info">
              No pudimos confirmar el resultado. Reintenta la misma
              decisión o actualiza la cotización para comprobar su estado.
            </p>
          )}

          <div className="claim-form-actions">
            <button
              type="button"
              className="claim-send-button"
              disabled={
                sending ||
                (decision === "ACCEPT" && !conditionsAccepted)
              }
              onClick={() => void confirmDecision()}
            >
              {sending
                ? "Guardando…"
                : uncertain
                  ? "Reintentar respuesta"
                  : decision === "ACCEPT"
                    ? "Confirmar aceptación"
                    : "Confirmar rechazo"}
            </button>

            {!uncertain && (
              <button
                type="button"
                className="claim-cancel-button"
                disabled={sending}
                onClick={() => {
                  setDecision(null);
                  setConditionsAccepted(false);
                  setError("");
                }}
              >
                Volver
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}