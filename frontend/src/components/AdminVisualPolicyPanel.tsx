import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { LoaderCircle, Save, SlidersHorizontal } from 'lucide-react'

import {
  getVisualPolicies,
  saveVisualPolicy,
} from '../lib/visualPolicies'

import type {
  SaveVisualPolicyInput,
  VisualPolicy,
} from '../lib/visualPolicies'

type WeightKey = keyof SaveVisualPolicyInput['weights']

const fields: {
  key: WeightKey
  code: string
  label: string
}[] = [
  { key: 'front', code: 'FRONT', label: 'Frente' },
  { key: 'back', code: 'BACK', label: 'Parte posterior' },
  { key: 'left', code: 'LEFT', label: 'Lateral izquierdo' },
  { key: 'right', code: 'RIGHT', label: 'Lateral derecho' },
]

export default function AdminVisualPolicyPanel() {
  const [activeId, setActiveId] = useState('')
  const [version, setVersion] = useState(0)
  const [name, setName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [weights, setWeights] = useState<Record<WeightKey, string>>({
    front: '40',
    back: '30',
    left: '15',
    right: '15',
  })

  const [history, setHistory] = useState<VisualPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)

  const saving = useRef(false)

  function fillForm(policy: VisualPolicy) {
    setActiveId(policy.id)
    setVersion(policy.version)
    setName(policy.name)
    setInstructions(policy.instructions)

    setWeights({
      front: String(
        policy.criteria.find((item) => item.code === 'FRONT')?.weight ?? 0,
      ),
      back: String(
        policy.criteria.find((item) => item.code === 'BACK')?.weight ?? 0,
      ),
      left: String(
        policy.criteria.find((item) => item.code === 'LEFT')?.weight ?? 0,
      ),
      right: String(
        policy.criteria.find((item) => item.code === 'RIGHT')?.weight ?? 0,
      ),
    })
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    getVisualPolicies()
      .then((data) => {
        if (!active) return

        setHistory(data.history)

        if (data.active) {
          fillForm(data.active)
        } else {
          setActiveId('')
          setError(
            'No existe una política activa. Revisa la migración inicial de políticas.',
          )
        }
      })
      .catch((cause: unknown) => {
        if (!active) return

        setError(
          cause instanceof Error
            ? cause.message
            : 'No pudimos consultar las políticas.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [revision])

  const numericWeights = {
    front: Number(weights.front),
    back: Number(weights.back),
    left: Number(weights.left),
    right: Number(weights.right),
  }

  const values = Object.values(numericWeights)
  const total = values.reduce((sum, value) => sum + value, 0)

  const validWeights =
    Object.values(weights).every((value) => value.trim() !== '') &&
    values.every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 100,
    ) &&
    total === 100

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (saving.current || !activeId) return

    if (!validWeights) {
      setError('Los pesos deben ser enteros positivos y sumar 100.')
      return
    }

    saving.current = true
    setBusy(true)
    setError('')
    setMessage('')

    try {
      const policy = await saveVisualPolicy({
        expectedActiveId: activeId,
        name: name.trim(),
        instructions: instructions.trim(),
        weights: numericWeights,
      })

      fillForm(policy)

      setHistory((previous) =>
        [
          policy,
          ...previous.map((item) => ({ ...item, active: false })),
        ].slice(0, 50),
      )

      setMessage(
        `Versión ${policy.version} activada. Se aplicará a los nuevos análisis.`,
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo confirmar el guardado. Recarga las políticas para comprobarlo.',
      )
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <section className="visual-policy-panel">
      <div className="visual-policy-heading">
        <div>
          <h3>
            <SlidersHorizontal size={20} aria-hidden="true" />
            Criterios de evaluación
          </h3>
          <p>
            Configuración global: se aplica a los nuevos análisis de todos
            los canjes.
          </p>
        </div>

        {activeId && (
          <span className="badge">Versión activa: {version}</span>
        )}
      </div>

      {error && (
        <div className="alert error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="text-button"
            disabled={loading || busy}
            onClick={() => {
              setMessage('')
              setRevision((value) => value + 1)
            }}
          >
            Recargar política y descartar cambios del formulario
          </button>
        </div>
      )}

      {message && (
        <div className="alert success" role="status">
          {message}
        </div>
      )}

      {loading ? (
        <p role="status">Cargando criterios…</p>
      ) : activeId ? (
        <form onSubmit={handleSave}>
          <fieldset className="visual-policy-fields" disabled={busy}>
            <label>
              Nombre de la política
              <input
                type="text"
                value={name}
                required
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label>
              Instrucciones para la evaluación visual
              <textarea
                value={instructions}
                required
                maxLength={20000}
                rows={7}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </label>

            <p className="claim-muted">
              Describe cómo evaluar daños visibles, reflejos, accesorios y
              fotografías insuficientes. El análisis no comprueba batería,
              funcionamiento interno ni bloqueo del IMEI.
            </p>

            <div className="visual-policy-weights">
              {fields.map((field) => (
                <label key={field.key}>
                  {field.label} (%)
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    required
                    value={weights[field.key]}
                    onChange={(event) =>
                      setWeights((previous) => ({
                        ...previous,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>

            <p
              className={
                validWeights
                  ? 'visual-policy-total valid'
                  : 'visual-policy-total invalid'
              }
              aria-live="polite"
            >
              Total: {Number.isFinite(total) ? total : '—'} / 100 %
            </p>

            <button
              type="submit"
              className="primary-button"
              disabled={
                busy ||
                !validWeights ||
                !name.trim() ||
                !instructions.trim()
              }
            >
              {busy ? (
                <LoaderCircle
                  size={18}
                  className="spinner"
                  aria-hidden="true"
                />
              ) : (
                <Save size={18} aria-hidden="true" />
              )}
              {busy ? 'Guardando…' : 'Guardar y activar nueva versión'}
            </button>

            <p className="claim-muted">
              Los informes anteriores conservarán la política que utilizaron.
            </p>
          </fieldset>
        </form>
      ) : null}

      <details className="visual-policy-history">
        <summary>Historial de versiones ({history.length})</summary>

        {history.map((policy) => (
          <details className="visual-policy-version" key={policy.id}>
            <summary>
              Versión {policy.version} · {policy.name}
              {policy.active ? ' · Activa' : ''}
            </summary>

            <p className="claim-muted">
              {new Date(policy.createdAt).toLocaleString('es-PE')}
            </p>

            <p className="visual-policy-instructions">
              {policy.instructions}
            </p>

            <div className="visual-policy-tags">
              {policy.criteria.map((criterion) => (
                <span className="badge" key={criterion.code}>
                  {fields.find((field) => field.code === criterion.code)
                    ?.label ?? criterion.code}
                  : {criterion.weight} %
                </span>
              ))}
            </div>
          </details>
        ))}
      </details>
    </section>
  )
}