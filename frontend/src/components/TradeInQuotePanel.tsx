import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { BadgeDollarSign, RefreshCw } from "lucide-react";
import TradeInQuoteDecision from "./TradeInQuoteDecision";

import {
  createTradeInQuote,
  getTradeInQuote,
  quoteStatusLabels,
} from "../lib/tradeInQuotes";

import type {
  CreateTradeInQuote,
  TradeInQuote,
} from "../lib/tradeInQuotes";

import type { TradeInStatus } from "../lib/tradeIns";

interface Props {
  tradeInId: string;
  status: TradeInStatus;
  admin?: boolean;
  onCreated?: () => void;
  onResponded?: () => void;
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

export default function TradeInQuotePanel({
  tradeInId,
  status,
  admin = false,
  onCreated,
  onResponded,
}: Props) {
  const [quote, setQuote] = useState<TradeInQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [validityDays, setValidityDays] = useState("7");

  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [now, setNow] = useState(Date.now());

  const pendingAttempt = useRef<CreateTradeInQuote | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setLoadError("");
    setQuote(null);

    getTradeInQuote(tradeInId, admin)
      .then((data) => {
        if (active) {
          setQuote(data);
        }
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }

        if (statusOf(cause) === 404) {
          // Todavía no hay una cotización para esta solicitud.
          setQuote(null);
        } else {
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
  }, [tradeInId, admin, status, revision]);

  const canCreate =
    admin &&
    status === "UNDER_REVIEW" &&
    !quote &&
    !loading &&
    !loadError;

  const visibleStatus =
    quote?.status === "OFFERED" &&
    now >= new Date(quote.expiresAt).getTime()
      ? "EXPIRED"
      : quote?.status;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) {
      return;
    }

    setSubmitError("");

    if (!pendingAttempt.current) {
      const normalizedAmount = amount.trim().replace(",", ".");
      const normalizedNotes = notes.trim();
      const days = Number(validityDays);

      if (
        !/^\d{1,10}(\.\d{1,2})?$/.test(normalizedAmount) ||
        Number(normalizedAmount) <= 0
      ) {
        setSubmitError(
          "Ingresa un importe mayor que cero y con hasta dos decimales."
        );
        return;
      }

      if (
        normalizedNotes.length < 20 ||
        normalizedNotes.length > 3000
      ) {
        setSubmitError(
          "Las observaciones deben tener entre 20 y 3000 caracteres."
        );
        return;
      }

      if (!Number.isInteger(days) || days < 1 || days > 30) {
        setSubmitError("La vigencia debe estar entre 1 y 30 días.");
        return;
      }

      pendingAttempt.current = {
        requestKey: crypto.randomUUID(),
        offeredAmount: normalizedAmount,
        assessmentNotes: normalizedNotes,
        validityDays: days,
      };
    }

    submitting.current = true;
    setSending(true);

    try {
      const created = await createTradeInQuote(
        tradeInId,
        pendingAttempt.current
      );

      if (!mounted.current) {
        return;
      }

      pendingAttempt.current = null;
      setUncertain(false);
      setQuote(created);
      onCreated?.();
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
      } else {
        setUncertain(true);
      }

      setSubmitError(messageOf(cause));
    } finally {
      submitting.current = false;

      if (mounted.current) {
        setSending(false);
      }
    }
  }

  return (
    <section
      className="trade-quote-panel"
      aria-busy={loading || sending}
    >
      <div className="trade-photos-heading">
        <div>
          <h4>
            <BadgeDollarSign size={20} aria-hidden="true" />
            Cotización del equipo
          </h4>
          <p>Oferta preliminar sujeta a inspección física.</p>
        </div>

        <button
          type="button"
          className="claim-refresh"
          disabled={loading || sending}
          onClick={() => setRevision((value) => value + 1)}
          aria-label="Actualizar cotización"
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      {loading && (
        <p className="claim-muted" role="status">
          Consultando cotización…
        </p>
      )}

      {loadError && (
        <p className="warranty-error" role="alert">
          {loadError}
        </p>
      )}

      {!loading && !loadError && quote && visibleStatus && (
        <div className="trade-quote-card">
          <span
            className={`trade-quote-status trade-quote-status--${visibleStatus.toLowerCase()}`}
          >
            {quoteStatusLabels[visibleStatus]}
          </span>

          <p className="trade-quote-amount">
            {new Intl.NumberFormat("es-PE", {
              style: "currency",
              currency: quote.currency,
            }).format(quote.offeredAmount)}
          </p>

          <p className="trade-quote-caption">
            Importe ofrecido por el celular usado
          </p>

          <dl className="trade-quote-dates">
            <div>
              <dt>Emitida</dt>
              <dd>{formatDate(quote.createdAt)}</dd>
            </div>
            <div>
              <dt>Válida hasta</dt>
              <dd>{formatDate(quote.expiresAt)}</dd>
            </div>
          </dl>

          <h5>Evaluación de la tienda</h5>
          <p className="trade-quote-text">{quote.assessmentNotes}</p>

          <details className="warranty-terms">
            <summary>Ver condiciones de la oferta</summary>
            <p className="trade-quote-text">{quote.conditions}</p>
          </details>

          {visibleStatus === "EXPIRED" && (
            <p className="claim-info">
              El plazo de esta oferta terminó.
            </p>
          )}
          {!admin && visibleStatus === "OFFERED" && (
            <TradeInQuoteDecision
                key={quote.id}
                tradeInId={tradeInId}
                quote={quote}
                onResponded={(updated) => {
                setQuote(updated);
                onResponded?.();
                }}
            />
            )}

            {visibleStatus === "ACCEPTED" && (
            <p className="claim-notice" role="status">
                {status === "CONFIRMED"
                ? "La oferta fue aceptada y el canje ya está confirmado."
                : status === "RECEIVED"
                    ? "La oferta fue aceptada y el equipo ya fue recibido. Consulta la inspección y la confirmación comercial más abajo."
                    : "La oferta fue aceptada. La recepción física del equipo sigue pendiente."}
            </p>
            )}

            {visibleStatus === "DECLINED" && (
            <p className="claim-info">
                La oferta fue rechazada y la solicitud de canje quedó cancelada.
            </p>
            )}

            {quote.respondedAt && (
            <p className="trade-help">
                Respuesta registrada: {formatDate(quote.respondedAt)}
            </p>
            )}
        </div>
      )}

      {!loading && !loadError && !quote && !canCreate && (
        <p className="claim-muted">
          Todavía no hay una cotización disponible. Actualiza esta
          sección para consultar novedades.
        </p>
      )}

      {canCreate && (
        <form className="trade-quote-form" onSubmit={handleSubmit}>
          <fieldset
            className="trade-fieldset"
            disabled={sending || uncertain}
          >
            <div className="trade-fields">
              <label>
                Importe ofrecido en soles
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="850.00"
                  maxLength={13}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </label>

              <label>
                Vigencia en días
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={validityDays}
                  onChange={(event) =>
                    setValidityDays(event.target.value)
                  }
                  required
                />
              </label>
            </div>

            <label className="trade-full-field">
              Observaciones de la evaluación
              <textarea
                rows={5}
                minLength={20}
                maxLength={3000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Describe el estado observado, las limitaciones de la revisión y cómo justificas el importe."
                required
              />
            </label>

            <p className="trade-help">
              El cliente podrá leer estas observaciones. No des por
              comprobado el funcionamiento interno basándote solo en fotos.
            </p>
          </fieldset>

          <p className="trade-explanation">
            Esta acción publicará la oferta para el cliente y cambiará
            la solicitud a Cotizada. El importe no podrá editarse desde
            este formulario después de emitirlo.
          </p>

          {submitError && (
            <p className="warranty-error" role="alert">
              {submitError}
            </p>
          )}

          {uncertain && (
            <p className="claim-info">
              No pudimos confirmar el resultado. Puedes actualizar para
              comprobar si se guardó o reintentar con la misma clave.
            </p>
          )}

          <button
            type="submit"
            className="claim-send-button"
            disabled={sending}
          >
            {sending
              ? "Emitiendo…"
              : uncertain
                ? "Reintentar emisión"
                : "Emitir cotización"}
          </button>
        </form>
      )}
    </section>
  );
}