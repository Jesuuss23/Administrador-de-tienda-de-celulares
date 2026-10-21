import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowRightLeft, RefreshCw } from "lucide-react";

import AdminTradeInPhotos from "../components/AdminTradeInPhotos";
import TradeInQuotePanel from "../components/TradeInQuotePanel";
import TradeInReceiptPanel from "../components/TradeInReceiptPanel";
import TradeInInspectionPanel from "../components/TradeInInspectionPanel";
import TradeInCreditPanel from "../components/TradeInCreditPanel";
import TradeInInventoryStatusPanel from '../components/TradeInInventoryStatusPanel'
import {
  getAdminTradeIns,
  startTradeInReview,
} from "../lib/adminTradeIns";

import type { AdminTradeIn } from "../lib/adminTradeIns";
import { tradeInStatusLabels } from "../lib/tradeIns";
import type { TradeInStatus } from "../lib/tradeIns";

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

export default function AdminTradeInsPage() {
  const [requests, setRequests] = useState<AdminTradeIn[]>([]);
  const [filter, setFilter] = useState<TradeInStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);

  const actionInProgress = useRef(false);
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

    getAdminTradeIns()
      .then((data) => {
        if (!active) {
          return;
        }

        setRequests(data);

        setSelectedId((current) =>
          current && data.some((item) => item.id === current)
            ? current
            : null
        );
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

  const query = search.trim().toLocaleLowerCase("es");

  const visibleRequests = requests.filter((item) => {
    const matchesStatus = filter === "ALL" || item.status === filter;

    const searchableText = [
      item.id,
      item.customerName,
      item.customerEmail,
      item.brand,
      item.model,
      item.imei,
    ]
      .join(" ")
      .toLocaleLowerCase("es");

    return matchesStatus && (!query || searchableText.includes(query));
  });

  const selected =
    requests.find((item) => item.id === selectedId) ?? null;

  const submittedCount = requests.filter(
    (item) => item.status === "SUBMITTED"
  ).length;

  const reviewCount = requests.filter(
    (item) => item.status === "UNDER_REVIEW"
  ).length;

  const incompleteCount = requests.filter(
    (item) => item.status === "SUBMITTED" && item.photoCount < 4
  ).length;
    async function copyTradeInId(id: string) {
    try {
        await navigator.clipboard.writeText(id)
        setActionError('')
        setNotice('Identificador del canje copiado.')
    } catch {
        setActionError(
        'No se pudo copiar automáticamente. Selecciona el identificador y cópialo.',
        )
    }
    }
  function refresh() {
    setActionError("");
    setNotice("");
    setRevision((value) => value + 1);
  }

  async function handleStartReview(item: AdminTradeIn) {
    if (actionInProgress.current) {
      return;
    }

    actionInProgress.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");

    try {
      const result = await startTradeInReview(item.id);

      if (!mounted.current) {
        return;
      }

      setNotice(result.message);
      setRevision((value) => value + 1);
    } catch (cause: unknown) {
      if (mounted.current) {
        setActionError(
          `${messageOf(cause)} Actualiza la bandeja antes de reintentar.`
        );
      }
    } finally {
      actionInProgress.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  return (
    <main className="admin-trades-page">
      <header className="admin-trades-header">
        <div>
          <Link to="/admin/productos" className="trade-back">
            ← Administración
          </Link>

          <h1>
            <ArrowRightLeft aria-hidden="true" />
            Solicitudes de canje
          </h1>

          <p>
            Revisa el equipo declarado por el cliente y su evidencia
            fotográfica antes de evaluarlo.
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

      {loading && (
        <p className="claim-muted" role="status">
          Cargando bandeja de canjes…
        </p>
      )}

      {!loading && !loadError && (
        <>
          <div className="admin-trades-metrics">
            <div>
              <span>Enviadas</span>
              <strong>{submittedCount}</strong>
            </div>
            <div>
              <span>En revisión</span>
              <strong>{reviewCount}</strong>
            </div>
            <div>
              <span>Enviadas con fotos pendientes</span>
              <strong>{incompleteCount}</strong>
            </div>
          </div>

          <p className="claim-muted">
            Los contadores, filtros y búsqueda corresponden a las 100
            solicitudes más recientes.
          </p>

          <div className="admin-trades-filters">
            <label>
              Buscar solicitud
              <input
                type="search"
                placeholder="Cliente, correo, equipo, IMEI o identificador"
                value={search}
                disabled={busy}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label>
              Estado
              <select
                value={filter}
                disabled={busy}
                onChange={(event) =>
                  setFilter(event.target.value as TradeInStatus | "ALL")
                }
              >
                <option value="ALL">Todos</option>
                {Object.entries(tradeInStatusLabels).map(
                  ([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>
          </div>

          <div className="admin-trades-layout">
            <section aria-label="Lista de solicitudes">
              {visibleRequests.length === 0 && (
                <p className="warranty-empty">
                  No hay solicitudes que coincidan en la lista cargada.
                </p>
              )}

              <div className="admin-trades-list">
                {visibleRequests.map((item) => (
                  <button
                    type="button"
                    className={`admin-trade-row ${
                      selectedId === item.id ? "is-selected" : ""
                    }`}
                    key={item.id}
                    disabled={busy}
                    aria-pressed={selectedId === item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      setActionError("");
                      setNotice("");
                    }}
                  >
                    <span className={`trade-status trade-status--${item.status.toLowerCase()}`}>
                      {tradeInStatusLabels[item.status]}
                    </span>

                    <strong>
                      {item.brand} {item.model}
                    </strong>

                    <span>{item.customerName}</span>

                    <span className="admin-trade-row-meta">
                      {item.storageGb} GB · {item.color}
                    </span>

                    <span className="admin-trade-row-footer">
                      <span>{item.photoCount}/4 fotos</span>
                      <time dateTime={item.createdAt}>
                        {formatDate(item.createdAt)}
                      </time>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="admin-trade-detail">
              {!selected ? (
                <div className="trade-empty">
                  <ArrowRightLeft size={32} aria-hidden="true" />
                  <h3>Selecciona una solicitud</h3>
                  <p>
                    Aquí encontrarás los datos del equipo y sus fotografías.
                  </p>
                </div>
              ) : (
                <>
                  <div className="admin-trade-detail-heading">
                    <span className={`trade-status trade-status--${selected.status.toLowerCase()}`}>
                      {tradeInStatusLabels[selected.status]}
                    </span>

                    <h2>
                      {selected.brand} {selected.model}
                    </h2>

                    <p>
                      {selected.storageGb} GB · {selected.color}
                    </p>
                  </div>

                  <dl className="admin-trade-data">
                    <div>
                    <dt>Identificador del canje</dt>
                    <dd>
                        <code style={{ overflowWrap: 'anywhere' }}>
                        {selected.id}
                        </code>

                        <button
                        type="button"
                        className="text-button"
                        onClick={() => void copyTradeInId(selected.id)}
                        >
                        Copiar identificador
                        </button>
                    </dd>
                    </div>
                    <div>
                      <dt>Cliente</dt>
                      <dd>{selected.customerName}</dd>
                    </div>
                    <div>
                      <dt>Correo</dt>
                      <dd>{selected.customerEmail}</dd>
                    </div>
                    <div>
                      <dt>IMEI declarado</dt>
                      <dd><code>{selected.imei}</code></dd>
                    </div>
                    <div>
                      <dt>Enviada</dt>
                      <dd>{formatDate(selected.createdAt)}</dd>
                    </div>
                  </dl>
                  <div className="admin-trade-description">
                    <h3>Estado físico declarado</h3>
                    <p>{selected.conditionDescription}</p>

                    <h3>Fallas conocidas declaradas</h3>
                    <p>{selected.functionalIssues}</p>
                  </div>

                  <AdminTradeInPhotos
                    key={`${selected.id}-${revision}`}
                    tradeInId={selected.id}
                  />

                  {selected.status === "SUBMITTED" && (
                    <div className="admin-trade-review-box">
                      {selected.photoCount < 4 ? (
                        <p>
                          Faltan fotografías. El cliente debe completar
                          los cuatro ángulos antes de iniciar la revisión.
                        </p>
                      ) : (
                        <p>
                          Al iniciar la revisión, el cliente ya no podrá
                          reemplazar las fotografías. Esto no aprueba el
                          equipo ni establece una cotización.
                        </p>
                      )}

                      <button
                        type="button"
                        className="claim-send-button"
                        disabled={busy || selected.photoCount !== 4}
                        onClick={() => void handleStartReview(selected)}
                      >
                        {busy ? "Guardando…" : "Iniciar revisión"}
                      </button>
                    </div>
                  )}

                  {selected.status === "UNDER_REVIEW" && (
                    <p className="claim-info">
                      La solicitud está en revisión y sus fotografías
                      quedaron bloqueadas para cambios del cliente.
                    </p>
                  )}
                  {selected.status !== "SUBMITTED" && (
                    <TradeInQuotePanel
                        key={`quote-${selected.id}`}
                        tradeInId={selected.id}
                        status={selected.status}
                        admin
                        onCreated={() => {
                        setNotice("Cotización emitida y disponible para el cliente.");
                        setRevision((value) => value + 1);
                        }}
                    />
                    )}
                    {["ACCEPTED", "RECEIVED", "CONFIRMED"].includes(selected.status) && (
                    <TradeInReceiptPanel
                        key={`receipt-${selected.id}`}
                        tradeInId={selected.id}
                        status={selected.status}
                        admin
                        onReceived={() => {
                        setNotice("Recepción del equipo registrada correctamente.");
                        setRevision((value) => value + 1);
                        }}
                    />
                    )}
                    {["RECEIVED", "CONFIRMED"].includes(selected.status) && (
                    <TradeInInspectionPanel
                        key={`inspection-${selected.id}`}
                        tradeInId={selected.id}
                        status={selected.status}
                        admin
                    />
                    )}
                    {["RECEIVED", "CONFIRMED"].includes(selected.status) && (
                    <TradeInCreditPanel
                        key={`credit-${selected.id}`}
                        tradeInId={selected.id}
                        status={selected.status}
                        admin
                        onConfirmed={() => {
                        setNotice("Canje confirmado y crédito registrado.");
                        setRevision((value) => value + 1);
                        }}
                    />
                    )}
                    {selected.status === 'CONFIRMED' && (
                    <TradeInInventoryStatusPanel
                        key={`inventory-${selected.id}-${revision}`}
                        tradeInId={selected.id}
                    />
                    )}
                </>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}