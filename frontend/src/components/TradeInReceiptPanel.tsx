import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { PackageCheck, RefreshCw } from "lucide-react";

import {
  createTradeInReceipt,
  getTradeInReceipt,
} from "../lib/tradeInReceipts";

import type {
  CreateTradeInReceipt,
  TradeInReceipt,
} from "../lib/tradeInReceipts";

import type { TradeInStatus } from "../lib/tradeIns";

interface Props {
  tradeInId: string;
  status: TradeInStatus;
  admin?: boolean;
  onReceived?: () => void;
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

export default function TradeInReceiptPanel({
  tradeInId,
  status,
  admin = false,
  onReceived,
}: Props) {
  const [receipt, setReceipt] = useState<TradeInReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  const [imei, setImei] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [uncertain, setUncertain] = useState(false);

  const pendingAttempt = useRef<CreateTradeInReceipt | null>(null);
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
    setReceipt(null);

    getTradeInReceipt(tradeInId, admin)
      .then((data) => {
        if (active) {
          setReceipt(data);
        }
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }

        if (statusOf(cause) === 404) {
          setReceipt(null);

          if (status === "RECEIVED") {
            setLoadError(
              "La solicitud figura como recibida, pero no se encontró su constancia. Actualiza o consulta con la tienda."
            );
          }
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
  }, [tradeInId, status, admin, revision]);

  const canReceive =
    admin &&
    status === "ACCEPTED" &&
    !receipt &&
    !loading &&
    !loadError;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) {
      return;
    }

    setSubmitError("");

    if (!pendingAttempt.current) {
      const normalizedImei = imei.trim();
      const normalizedReference = reference.trim();
      const normalizedNotes = notes.trim();

      if (!/^[0-9]{15}$/.test(normalizedImei)) {
        setSubmitError("El IMEI debe contener exactamente 15 dígitos.");
        return;
      }

      if (
        normalizedReference.length < 3 ||
        normalizedReference.length > 120
      ) {
        setSubmitError(
          "La referencia debe tener entre 3 y 120 caracteres."
        );
        return;
      }

      if (
        normalizedNotes.length < 20 ||
        normalizedNotes.length > 2000
      ) {
        setSubmitError(
          "Las observaciones deben tener entre 20 y 2000 caracteres."
        );
        return;
      }

      if (!confirmed) {
        setSubmitError("Debes confirmar la recepción física del equipo.");
        return;
      }

      pendingAttempt.current = {
        requestKey: crypto.randomUUID(),
        receivedImei: normalizedImei,
        receiptReference: normalizedReference,
        receptionNotes: normalizedNotes,
        physicallyReceived: true,
      };
    }

    submitting.current = true;
    setSending(true);

    try {
      const created = await createTradeInReceipt(
        tradeInId,
        pendingAttempt.current
      );

      if (!mounted.current) {
        return;
      }

      pendingAttempt.current = null;
      setUncertain(false);
      setReceipt(created);
      onReceived?.();
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
      className="trade-receipt-panel"
      aria-busy={loading || sending}
    >
      <div className="trade-photos-heading">
        <div>
          <h4>
            <PackageCheck size={20} aria-hidden="true" />
            Recepción del equipo
          </h4>
          <p>Registro de la entrega física del celular a la tienda.</p>
        </div>

        <button
          type="button"
          className="claim-refresh"
          disabled={loading || sending}
          onClick={() => setRevision((value) => value + 1)}
          aria-label="Actualizar recepción"
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      {loading && (
        <p className="claim-muted" role="status">
          Consultando recepción…
        </p>
      )}

      {loadError && (
        <p className="warranty-error" role="alert">
          {loadError}
        </p>
      )}

      {!loading && !loadError && receipt && (
        <div className="trade-receipt-card">
          <span className="trade-receipt-badge">
            <PackageCheck size={16} aria-hidden="true" />
            Recepción registrada
          </span>

          <dl className="trade-receipt-data">
            <div>
              <dt>Referencia</dt>
              <dd>{receipt.receiptReference}</dd>
            </div>

            <div>
              <dt>IMEI recibido</dt>
              <dd><code>{receipt.receivedImei}</code></dd>
            </div>

            <div>
              <dt>Fecha y hora</dt>
              <dd>{formatDate(receipt.receivedAt)}</dd>
            </div>

            <div>
              <dt>Recibido por</dt>
              <dd>{receipt.receivedByName}</dd>
            </div>
          </dl>

          <h5>Observaciones de recepción</h5>
          <p className="trade-receipt-notes">
            {receipt.receptionNotes}
          </p>

          <p className="trade-explanation">
            Esta constancia registra la recepción física. No acredita
            por sí sola la aprobación de la inspección ni genera un
            saldo disponible para comprar.
          </p>
        </div>
      )}

      {!loading && !loadError && !receipt && !canReceive && (
        <p className="claim-muted">
          Todavía no se ha registrado la recepción del equipo.
        </p>
      )}

      {canReceive && (
        <form className="trade-receipt-form" onSubmit={handleSubmit}>
          <fieldset
            className="trade-fieldset"
            disabled={sending || uncertain}
          >
            <label>
              IMEI observado en el dispositivo
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{15}"
                minLength={15}
                maxLength={15}
                autoComplete="off"
                value={imei}
                onChange={(event) => setImei(event.target.value)}
                placeholder="Escribe los 15 dígitos"
                required
              />
            </label>

            <p className="trade-help">
              Comprueba el identificador directamente en el equipo.
              Debe coincidir con el IMEI de la solicitud.
            </p>

            <label className="trade-full-field">
              Referencia de recepción
              <input
                type="text"
                minLength={3}
                maxLength={120}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Por ejemplo: REC-2026-001"
                required
              />
            </label>

            <label className="trade-full-field">
              Observaciones
              <textarea
                rows={5}
                minLength={20}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Describe el estado visible al recibirlo y los accesorios entregados."
                required
              />
            </label>

            <p className="trade-help">
              El cliente podrá consultar estas observaciones.
              No registres contraseñas ni códigos de desbloqueo.
            </p>

            <label className="receipt-confirmation">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                required
              />
              <span>
                Confirmo que recibí físicamente el equipo y comprobé
                su IMEI.
              </span>
            </label>
          </fieldset>

          {submitError && (
            <p className="warranty-error" role="alert">
              {submitError}
            </p>
          )}

          {uncertain && (
            <p className="claim-info">
              No pudimos confirmar el resultado. Puedes actualizar para
              comprobar si se guardó o reintentar el mismo envío.
            </p>
          )}

          <button
            type="submit"
            className="claim-send-button"
            disabled={sending || !confirmed}
          >
            {sending
              ? "Registrando…"
              : uncertain
                ? "Reintentar recepción"
                : "Registrar recepción"}
          </button>
        </form>
      )}
    </section>
  );
}