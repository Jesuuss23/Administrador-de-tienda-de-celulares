import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { ArrowRightLeft, RefreshCw, Smartphone } from "lucide-react";
import TradeInPhotosPanel from "../components/TradeInPhotosPanel";
import TradeInQuotePanel from "../components/TradeInQuotePanel";
import TradeInReceiptPanel from "../components/TradeInReceiptPanel";
import TradeInInspectionPanel from "../components/TradeInInspectionPanel";
import TradeInCreditPanel from "../components/TradeInCreditPanel";

import {
  createTradeIn,
  getMyTradeIns,
  isValidImei,
  tradeInStatusLabels,
} from "../lib/tradeIns";

import type {
  CreateTradeInInput,
  TradeIn,
} from "../lib/tradeIns";

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "No pudimos completar la operación.";
}

function errorStatus(cause: unknown): number | undefined {
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

export default function TradeInsPage() {
  const [requests, setRequests] = useState<TradeIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const [revision, setRevision] = useState(0);

  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);

  const pendingAttempt = useRef<CreateTradeInInput | null>(null);
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
    setLoginRequired(false);

    getMyTradeIns()
      .then((data) => {
        if (active) {
          setRequests(data);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setLoadError(errorMessage(cause));
          setLoginRequired(errorStatus(cause) === 401);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) {
      return;
    }

    const form = event.currentTarget;
    setSubmitError("");
    setNotice("");

    if (!pendingAttempt.current) {
      const data = new FormData(form);
      const text = (name: string) =>
        String(data.get(name) ?? "").trim();

      const input: CreateTradeInInput = {
        requestKey: crypto.randomUUID(),
        brand: text("brand"),
        model: text("model"),
        storageGb: Number(data.get("storageGb")),
        color: text("color"),
        imei: text("imei"),
        conditionDescription: text("conditionDescription"),
        functionalIssues: text("functionalIssues"),
      };

      if (!input.brand || !input.model || !input.color) {
        setSubmitError("Completa la marca, el modelo y el color.");
        return;
      }

      if (
        !Number.isInteger(input.storageGb) ||
        input.storageGb < 1 ||
        input.storageGb > 8192
      ) {
        setSubmitError("La capacidad debe estar entre 1 y 8192 GB.");
        return;
      }

      if (!isValidImei(input.imei)) {
        setSubmitError(
          "El IMEI debe tener 15 dígitos y un dígito de control válido."
        );
        return;
      }

      if (
        input.conditionDescription.length < 20 ||
        input.conditionDescription.length > 2000
      ) {
        setSubmitError(
          "Describe el estado físico usando entre 20 y 2000 caracteres."
        );
        return;
      }

      if (
        input.functionalIssues.length < 2 ||
        input.functionalIssues.length > 2000
      ) {
        setSubmitError(
          "Indica las fallas conocidas o escribe Ninguna."
        );
        return;
      }

      pendingAttempt.current = input;
    }

    submitting.current = true;
    setSending(true);

    try {
      const created = await createTradeIn(pendingAttempt.current);

      if (!mounted.current) {
        return;
      }

      pendingAttempt.current = null;
      setUncertain(false);

      setRequests((current) =>
        [
          created,
          ...current.filter((item) => item.id !== created.id),
        ].slice(0, 50)
      );

      form.reset();

      setNotice(
        "Solicitud enviada. Podrás consultar su avance en tu historial."
      );
    } catch (cause: unknown) {
      if (!mounted.current) {
        return;
      }

      const status = errorStatus(cause);
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

      if (status === 401) {
        setLoginRequired(true);
      }
    } finally {
      submitting.current = false;

      if (mounted.current) {
        setSending(false);
      }
    }
  }

  return (
    <main className="trade-page">
      <header className="trade-header">
        <Link to="/" className="trade-back">
          ← Volver al catálogo
        </Link>

        <Link to="/cuenta" className="trade-back">
          Mi cuenta
        </Link>
      </header>

      <section className="trade-hero">
        <span className="trade-eyebrow">
          <ArrowRightLeft size={16} aria-hidden="true" />
          CELU-CANJE
        </span>

        <h1>Tu próximo celular empieza con el que ya tienes.</h1>

        <p>
          Cuéntanos cómo está tu equipo. La tienda revisará sus datos
          antes de ofrecerte una cotización.
        </p>
      </section>

      {loginRequired && (
        <div className="trade-login" role="status">
          <strong>Inicia sesión para gestionar tus canjes.</strong>
          <p>Tu cuenta permite guardar la solicitud y consultar su avance.</p>
          <Link to="/cuenta" className="claim-send-button">
            Ir a mi cuenta
          </Link>
        </div>
      )}

      {loadError && !loginRequired && (
        <p className="warranty-error" role="alert">
          {loadError}
        </p>
      )}

      {notice && (
        <p className="claim-notice" role="status">
          {notice}
        </p>
      )}

      <div className="trade-layout">
        <section className="trade-form-card">
          <div className="trade-section-title">
            <Smartphone size={22} aria-hidden="true" />
            <div>
              <h2>Registra tu equipo</h2>
              <p>Completa los datos tal como aparecen en el dispositivo.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <fieldset
              className="trade-fieldset"
              disabled={
                sending ||
                uncertain ||
                loading ||
                loginRequired ||
                Boolean(loadError)
              }
            >
              <div className="trade-fields">
                <label>
                  Marca
                  <input
                    name="brand"
                    placeholder="Samsung, Apple, Motorola…"
                    maxLength={80}
                    required
                  />
                </label>

                <label>
                  Modelo
                  <input
                    name="model"
                    placeholder="Galaxy S22"
                    maxLength={120}
                    required
                  />
                </label>

                <label>
                  Almacenamiento en GB
                  <input
                    name="storageGb"
                    type="number"
                    min={1}
                    max={8192}
                    step={1}
                    placeholder="128"
                    required
                  />
                </label>

                <label>
                  Color
                  <input
                    name="color"
                    placeholder="Negro"
                    maxLength={60}
                    required
                  />
                </label>
              </div>

              <label className="trade-full-field">
                IMEI
                <input
                  name="imei"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{15}"
                  minLength={15}
                  maxLength={15}
                  placeholder="15 dígitos, sin espacios"
                  aria-describedby="trade-imei-help"
                  required
                />
              </label>

              <p className="trade-help" id="trade-imei-help">
                Puedes consultarlo marcando *#06# en el teléfono.
                Si tiene dos IMEI, registra el principal en este formulario.
              </p>

              <label className="trade-full-field">
                Estado físico
                <textarea
                  name="conditionDescription"
                  placeholder="Describe la pantalla, carcasa, cámaras y cualquier golpe o rayón visible."
                  minLength={20}
                  maxLength={2000}
                  rows={4}
                  required
                />
              </label>

              <p className="trade-help">
                Entre 20 y 2000 caracteres.
              </p>

              <label className="trade-full-field">
                Fallas conocidas
                <textarea
                  name="functionalIssues"
                  placeholder="Describe problemas de batería, carga, audio o funcionamiento. Si no conoces fallas, escribe Ninguna."
                  minLength={2}
                  maxLength={2000}
                  rows={3}
                  required
                />
              </label>
            </fieldset>

            <div className="trade-explanation">
              Enviar estos datos no confirma un precio ni reserva otro
              celular. La cotización estará sujeta a revisión del equipo.
            </div>

            {submitError && (
              <p className="warranty-error" role="alert">
                {submitError}
              </p>
            )}

            {uncertain && (
              <p className="claim-info">
                No pudimos confirmar el resultado. Reintenta el envío:
                conservaremos los mismos datos y la misma clave para
                evitar duplicados.
              </p>
            )}

            <button
              type="submit"
              className="trade-submit"
              disabled={
                sending ||
                loading ||
                loginRequired ||
                Boolean(loadError)
              }
            >
              <ArrowRightLeft size={18} aria-hidden="true" />
              {sending
                ? "Enviando…"
                : uncertain
                  ? "Reintentar envío"
                  : "Enviar solicitud de canje"}
            </button>
          </form>
        </section>

        <section className="trade-history">
          <div className="trade-history-heading">
            <div>
              <h2>Mis solicitudes</h2>
              <p>Las 50 más recientes.</p>
            </div>

            <button
              type="button"
              className="claim-refresh"
              disabled={loading || sending}
              onClick={() => setRevision((value) => value + 1)}
              aria-label="Actualizar solicitudes de canje"
            >
              <RefreshCw size={17} aria-hidden="true" />
            </button>
          </div>

          {loading && (
            <p className="claim-muted" role="status">
              Cargando tus solicitudes…
            </p>
          )}

          {!loading &&
            !loadError &&
            !loginRequired &&
            requests.length === 0 && (
              <div className="trade-empty">
                <Smartphone size={32} aria-hidden="true" />
                <h3>Aquí comienza tu primer canje</h3>
                <p>
                  Registra tu equipo y encontrarás aquí el estado de
                  tu solicitud.
                </p>
              </div>
            )}

          {!loading && !loadError && !loginRequired && (
            <div className="trade-request-list">
              {requests.map((item) => (
                <article className="trade-request-card" key={item.id}>
                  <div className="trade-request-heading">
                    <span
                      className={`trade-status trade-status--${item.status.toLowerCase()}`}
                    >
                      {tradeInStatusLabels[item.status]}
                    </span>

                    <time dateTime={item.createdAt}>
                      {formatDate(item.createdAt)}
                    </time>
                  </div>

                  <h3>
                    {item.brand} {item.model}
                  </h3>

                  <p className="trade-device-meta">
                    {item.storageGb} GB · {item.color}
                  </p>

                  <p className="trade-device-imei">
                    IMEI <code>{item.imei}</code>
                  </p>

                  <details className="warranty-terms">
                    <summary>Ver datos enviados</summary>

                    <h4>Estado físico</h4>
                    <p>{item.conditionDescription}</p>

                    <h4>Fallas conocidas</h4>
                    <p>{item.functionalIssues}</p>
                  </details>
                  <TradeInPhotosPanel
                    key={item.id}
                    tradeInId={item.id}
                    status={item.status}
                    />
                    {item.status !== "SUBMITTED" && (
                    <TradeInQuotePanel
                        key={`quote-${item.id}`}
                        tradeInId={item.id}
                        status={item.status}
                        onResponded={() => {
                        setNotice("Tu respuesta a la cotización quedó registrada.");
                        setRevision((value) => value + 1);
                        }}
                    />
                    )}
                    {["ACCEPTED", "RECEIVED", "CONFIRMED"].includes(item.status) && (
                        <TradeInReceiptPanel
                            key={`receipt-${item.id}`}
                            tradeInId={item.id}
                            status={item.status}
                        />
                        )}

                        {["RECEIVED", "CONFIRMED"].includes(item.status) && (
                        <TradeInInspectionPanel
                            key={`inspection-${item.id}`}
                            tradeInId={item.id}
                            status={item.status}
                        />
                        )}
                        {["RECEIVED", "CONFIRMED"].includes(item.status) && (
                        <TradeInCreditPanel
                            key={`credit-${item.id}`}
                            tradeInId={item.id}
                            status={item.status}
                        />
                        )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}