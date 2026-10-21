import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ClipboardCheck, RefreshCw } from "lucide-react";

import {
  createTradeInInspection,
  getTradeInInspections,
  inspectionResultLabels,
  inspectionTestLabels,
} from "../lib/tradeInInspections";

import type {
  CreateTradeInInspection,
  InspectionTestResult,
  TradeInInspection,
} from "../lib/tradeInInspections";

import type { TradeInStatus } from "../lib/tradeIns";

interface Props {
  tradeInId: string;
  status: TradeInStatus;
  admin?: boolean;
}

const tests = [
  { key: "screenTest", label: "Pantalla" },
  { key: "touchTest", label: "Respuesta táctil" },
  { key: "camerasTest", label: "Cámaras" },
  { key: "audioTest", label: "Audio" },
  { key: "chargingTest", label: "Carga" },
  { key: "connectivityTest", label: "Conectividad" },
] as const;

const confirmations = [
  {
    key: "imeiMatches",
    label: "¿El IMEI coincide con el equipo registrado?",
  },
  {
    key: "accountLocksRemoved",
    label: "¿El equipo está libre de bloqueos de cuenta o activación?",
  },
  {
    key: "conditionMatches",
    label: "¿El estado físico coincide con lo declarado y cotizado?",
  },
] as const;

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

export default function TradeInInspectionPanel({
  tradeInId,
  status,
  admin = false,
}: Props) {
  const [inspections, setInspections] = useState<TradeInInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);

  const pendingAttempt = useRef<CreateTradeInInspection | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);

  const canInspect = admin && status === "RECEIVED";

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

    getTradeInInspections(tradeInId, admin)
      .then((data) => {
        if (active) {
          setInspections(data);
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
  }, [tradeInId, admin, revision]);

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

      const readTest = (key: string): InspectionTestResult => {
        const value = String(data.get(key) ?? "");

        if (
          value !== "PASS" &&
          value !== "FAIL" &&
          value !== "NOT_TESTED"
        ) {
          throw new Error("Selecciona el resultado de las seis pruebas.");
        }

        return value;
      };

      const readBoolean = (key: string): boolean => {
        const value = String(data.get(key) ?? "");

        if (value !== "true" && value !== "false") {
          throw new Error("Responde las tres comprobaciones adicionales.");
        }

        return value === "true";
      };

      try {
        const notes = String(data.get("notes") ?? "").trim();

        if (notes.length < 20 || notes.length > 3000) {
          throw new Error(
            "Las observaciones deben tener entre 20 y 3000 caracteres."
          );
        }

        pendingAttempt.current = {
          requestKey: crypto.randomUUID(),
          screenTest: readTest("screenTest"),
          touchTest: readTest("touchTest"),
          camerasTest: readTest("camerasTest"),
          audioTest: readTest("audioTest"),
          chargingTest: readTest("chargingTest"),
          connectivityTest: readTest("connectivityTest"),
          imeiMatches: readBoolean("imeiMatches"),
          accountLocksRemoved: readBoolean("accountLocksRemoved"),
          conditionMatches: readBoolean("conditionMatches"),
          notes,
        };
      } catch (cause: unknown) {
        setSubmitError(messageOf(cause));
        return;
      }
    }

    submitting.current = true;
    setSending(true);

    try {
      const created = await createTradeInInspection(
        tradeInId,
        pendingAttempt.current
      );

      if (!mounted.current) {
        return;
      }

      pendingAttempt.current = null;
      setUncertain(false);

      setInspections((current) =>
        [
          created,
          ...current.filter((item) => item.id !== created.id),
        ].slice(0, 50)
      );

      form.reset();
      setFormOpen(false);

      setNotice(
        `Inspección registrada: ${inspectionResultLabels[created.result]}.`
      );
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
      className="inspection-panel"
      aria-busy={loading || sending}
    >
      <div className="trade-photos-heading">
        <div>
          <h4>
            <ClipboardCheck size={20} aria-hidden="true" />
            Inspección física
          </h4>
          <p>Pruebas registradas y observaciones del equipo recibido.</p>
        </div>

        <button
          type="button"
          className="claim-refresh"
          disabled={loading || sending}
          aria-label="Actualizar inspecciones"
          onClick={() => setRevision((value) => value + 1)}
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

      {loading && (
        <p className="claim-muted" role="status">
          Cargando inspecciones…
        </p>
      )}

      {!loading && !loadError && inspections.length === 0 && (
        <p className="claim-muted">
          Todavía no se ha registrado una inspección física.
        </p>
      )}

      {canInspect && !formOpen && (
        <button
          type="button"
          className="claim-send-button"
          disabled={loading || Boolean(loadError)}
          onClick={() => {
            setFormOpen(true);
            setSubmitError("");
            setNotice("");
          }}
        >
          {inspections.length === 0
            ? "Registrar inspección"
            : "Registrar nueva inspección"}
        </button>
      )}

      {canInspect && formOpen && (
        <form className="inspection-form" onSubmit={handleSubmit}>
          <fieldset
            className="trade-fieldset"
            disabled={
              sending ||
              uncertain ||
              loading ||
              Boolean(loadError)
            }
          >
            <h5>Pruebas de funcionamiento</h5>

            <div className="inspection-test-fields">
              {tests.map((test) => (
                <label key={test.key}>
                  {test.label}

                  <select name={test.key} defaultValue="" required>
                    <option value="" disabled>
                      Selecciona un resultado
                    </option>
                    <option value="PASS">Aprobada</option>
                    <option value="FAIL">Con falla</option>
                    <option value="NOT_TESTED">No realizada</option>
                  </select>
                </label>
              ))}
            </div>

            <h5>Comprobaciones adicionales</h5>

            <div className="inspection-confirmation-fields">
              {confirmations.map((confirmation) => (
                <label key={confirmation.key}>
                  {confirmation.label}

                  <select
                    name={confirmation.key}
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Selecciona una respuesta
                    </option>
                    <option value="true">Sí, comprobado</option>
                    <option value="false">
                      No, o todavía no comprobado
                    </option>
                  </select>
                </label>
              ))}
            </div>

            <label className="trade-full-field">
              Observaciones de la inspección
              <textarea
                name="notes"
                rows={5}
                minLength={20}
                maxLength={3000}
                placeholder="Describe las pruebas realizadas, fallas, discrepancias y cualquier comprobación pendiente."
                required
              />
            </label>

            <p className="trade-help">
              El cliente podrá leer estas observaciones. No incluyas
              contraseñas ni códigos de desbloqueo.
            </p>
          </fieldset>

          <p className="trade-explanation">
            El sistema calculará el resultado. Una prueba pendiente,
            una falla o una comprobación negativa hará que el informe
            requiera revisión. Los informes anteriores se conservarán.
          </p>

          {submitError && (
            <p className="warranty-error" role="alert">
              {submitError}
            </p>
          )}

          {uncertain && (
            <p className="claim-info">
              No pudimos confirmar el resultado. Reintenta el mismo
              envío o actualiza el historial para comprobar si se guardó.
            </p>
          )}

          <div className="claim-form-actions">
            <button
              type="submit"
              className="claim-send-button"
              disabled={sending || loading || Boolean(loadError)}
            >
              {sending
                ? "Guardando…"
                : uncertain
                  ? "Reintentar registro"
                  : "Guardar inspección"}
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

      {!loading && !loadError && inspections.length > 0 && (
        <div className="inspection-history">
          <p className="trade-help">
            Se muestran los 50 informes más recientes, del más nuevo
            al más antiguo.
          </p>

          {inspections.map((inspection, index) => (
            <article className="inspection-card" key={inspection.id}>
              <div className="inspection-card-heading">
                <span
                  className={`inspection-result inspection-result--${inspection.result.toLowerCase()}`}
                >
                  {inspectionResultLabels[inspection.result]}
                </span>

                {index === 0 && (
                  <span className="inspection-latest">
                    Más reciente
                  </span>
                )}
              </div>

              <p className="inspection-author">
                {inspection.inspectedByName}
                {" · "}
                {formatDate(inspection.inspectedAt)}
              </p>

              <dl className="inspection-results">
                {tests.map((test) => (
                  <div key={test.key}>
                    <dt>{test.label}</dt>
                    <dd
                      className={`inspection-test-result inspection-test-result--${inspection[test.key].toLowerCase()}`}
                    >
                      {inspectionTestLabels[inspection[test.key]]}
                    </dd>
                  </div>
                ))}
              </dl>

              <dl className="inspection-confirmations">
                {confirmations.map((confirmation) => (
                  <div key={confirmation.key}>
                    <dt>{confirmation.label}</dt>
                    <dd>
                      {inspection[confirmation.key]
                        ? "Sí, comprobado"
                        : "No o no comprobado"}
                    </dd>
                  </div>
                ))}
              </dl>

              <h5>Observaciones</h5>
              <p className="inspection-notes">{inspection.notes}</p>
            </article>
          ))}

          <p className="trade-explanation">
            Estos informes registran comprobaciones técnicas. No generan
            por sí solos un saldo de compra ni incorporan el equipo
            al inventario.
          </p>
        </div>
      )}
    </section>
  );
}