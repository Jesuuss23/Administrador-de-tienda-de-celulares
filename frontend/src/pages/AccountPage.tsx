import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import {
  ArrowRight,
  ArrowRightLeft,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'

import {
  ApiError,
  getCurrentUser,
  login,
  logout,
  register,
} from '../lib/auth'
import type { User } from '../lib/auth'

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'No pudimos completar la operación. Revisa la conexión e inténtalo otra vez.'
}

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState('')
  const [attempt, setAttempt] = useState(0)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true

    async function restoreSession() {
      setLoading(true)
      setConnectionError('')

      try {
        const currentUser = await getCurrentUser()

        if (active) {
          setUser(currentUser)
        }
      } catch (err) {
        if (active) {
          setConnectionError(errorMessage(err))
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void restoreSession()

    return () => {
      active = false
    }
  }, [attempt])

  function switchMode() {
    setMode(mode === 'login' ? 'register' : 'login')
    setError('')
    setNotice('')
    setFieldErrors({})
    setPassword('')
    setShowPassword(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setError('')
    setNotice('')
    setFieldErrors({})

    if (
      mode === 'register' &&
      new TextEncoder().encode(password).length > 72
    ) {
      setFieldErrors({
        password: 'La contraseña debe ocupar como máximo 72 bytes.',
      })
      return
    }

    setBusy(true)

    try {
      if (mode === 'register') {
        await register({ fullName, email, password })

        setMode('login')
        setNotice('Tu cuenta está lista. Inicia sesión para continuar.')
        setPassword('')
        setShowPassword(false)
      } else {
        const currentUser = await login(email, password)
        setUser(currentUser)
        setPassword('')
        setShowPassword(false)
      }
    } catch (err) {
      setError(errorMessage(err))

      if (err instanceof ApiError) {
        setFieldErrors(err.fields)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    setBusy(true)
    setError('')

    try {
      await logout()
      setUser(null)
      setMode('login')
      setPassword('')
      setNotice('Has cerrado sesión correctamente.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading || connectionError) {
    return (
      <main className="status-screen">
        <div className="status-card">
          <div className="brand-icon">
            <Smartphone size={26} />
          </div>

          <h1>CELU-CANJE</h1>

          {loading ? (
            <p role="status">Preparando tu espacio…</p>
          ) : (
            <>
              <p role="alert">{connectionError}</p>
              <button
                className="primary-button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Volver a intentar
              </button>
            </>
          )}
        </div>
      </main>
    )
  }

  if (user) {
    const roleLabels: Record<string, string> = {
      CUSTOMER: 'Cliente',
      OPERATOR: 'Operador',
      ADMIN: 'Administrador',
    }

    return (
      <div className="account-page">
        <header className="account-header">
        <div className="brand">
            <span className="brand-icon">
            <Smartphone size={23} />
            </span>
            CELU-CANJE
        </div>

        <Link className="text-button" to="/">
            Ver catálogo
        </Link>
        <Link className="text-button" to="/canjes">
        Canjea tu celular
        </Link>
        <Link className="secondary-button" to="/admin/demanda">
        Demanda del catálogo
        </Link>
        {user.roles.includes('ADMIN') && (
            <Link className="secondary-button" to="/admin/productos">
            Administración
            </Link>
        )}

        <button
            className="secondary-button"
            onClick={handleLogout}
            disabled={busy}
        >
            <LogOut size={17} />
            {busy ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
        </header>

        <main className="account-content">
          <span className="eyebrow">MI CUENTA</span>
          <Link className="secondary-button" to="/carrito">
            Mi carrito
            </Link>
            <Link className="secondary-button" to="/pedidos">
            Mis pedidos
            </Link>
          <h1>Hola, {user.fullName.split(' ')[0]}.</h1>
          <p className="muted">
            Este es tu espacio personal en CELU-CANJE.
          </p>

          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}

          <section className="profile-card">
            <div className="avatar">
              {user.fullName.charAt(0).toUpperCase()}
            </div>

            <div className="profile-details">
              <h2>{user.fullName}</h2>
              <p>{user.email}</p>
              <div className="role-list">
                {user.roles.map((role) => (
                  <span className="badge" key={role}>
                    {roleLabels[role] ?? role}
                  </span>
                ))}
              </div>
            </div>

            <span className="session-badge">
              <Check size={16} />
              Sesión activa
            </span>
          </section>

          <section className="next-card">
            <span className="feature-icon">
              <ArrowRightLeft size={24} />
            </span>
            <div>
              <h2>Tu próxima renovación empieza aquí</h2>
              <p>
                En las siguientes entregas conectaremos el catálogo,
                tus solicitudes de canje y el seguimiento de tus compras.
              </p>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <main className="auth-layout">
      <section className="brand-panel">
        <div className="brand">
          <span className="brand-icon">
            <Smartphone size={25} />
          </span>
          CELU-CANJE
        </div>

        <div className="brand-content">
          <span className="brand-tag">DALE PASO A LO NUEVO</span>

          <h1>
            Tu próximo celular.
            <br />
            <span>Una nueva historia.</span>
          </h1>

          <p className="brand-description">
            Un espacio para comprar, vender y darle una segunda
            oportunidad a tu celular.
          </p>

          <div className="device-scene" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />

            <div className="phone phone-back">
              <div className="camera-module">
                <i />
                <i />
                <i />
              </div>
            </div>

            <div className="phone phone-front">
              <div className="phone-island" />
              <span>Un nuevo</span>
              <strong>comienzo.</strong>
              <div className="phone-glow" />
            </div>

            <div className="trade-chip">
              <ArrowRightLeft size={18} />
              Renueva a tu manera
            </div>
          </div>

          <div className="brand-footer">
            <ShieldCheck size={20} />
            Tu cuenta, tus equipos, tus oportunidades.
          </div>
        </div>
      </section>

      <section className="form-panel">
        <div className="form-top">
            <Link className="text-button" to="/">
            Volver al catálogo
            </Link>
            
          <span>¿{mode === 'login' ? 'Primera vez aquí' : 'Ya tienes cuenta'}?</span>
          <button
            type="button"
            className="text-button"
            onClick={switchMode}
            disabled={busy}
          >
            {mode === 'login' ? 'Crear una cuenta' : 'Iniciar sesión'}
            <ArrowRight size={16} />
          </button>
        </div>

        <div className="form-container">
          <span className="eyebrow">
            {mode === 'login' ? 'BIENVENIDO DE NUEVO' : 'EMPIEZA AQUÍ'}
          </span>

          <h2>
            {mode === 'login' ? 'Qué bueno verte.' : 'Tu cuenta, tu próximo paso.'}
          </h2>

          <p className="form-description">
            {mode === 'login'
              ? 'Ingresa a tu cuenta y continúa donde lo dejaste.'
              : 'Crea tu perfil para empezar a explorar CELU-CANJE.'}
          </p>

          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}

          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <fieldset disabled={busy}>
              {mode === 'register' && (
                <div className="field">
                  <label htmlFor="fullName">Nombre completo</label>
                  <input
                    id="fullName"
                    name="fullName"
                    autoComplete="name"
                    placeholder="¿Cómo te llamas?"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    maxLength={120}
                    required
                    aria-invalid={Boolean(fieldErrors.fullName)}
                    aria-describedby={
                      fieldErrors.fullName ? 'fullName-error' : undefined
                    }
                  />
                  {fieldErrors.fullName && (
                    <small id="fullName-error" className="field-error">
                      {fieldErrors.fullName}
                    </small>
                  )}
                </div>
              )}

              <div className="field">
                <label htmlFor="email">Correo electrónico</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@correo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  required
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={
                    fieldErrors.email ? 'email-error' : undefined
                  }
                />
                {fieldErrors.email && (
                  <small id="email-error" className="field-error">
                    {fieldErrors.email}
                  </small>
                )}
              </div>

              <div className="field">
                <label htmlFor="password">Contraseña</label>

                <div className="password-field">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    placeholder={
                      mode === 'login'
                        ? 'Ingresa tu contraseña'
                        : 'Crea una contraseña de 12 caracteres o más'
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={mode === 'register' ? 12 : undefined}
                    maxLength={mode === 'register' ? 72 : undefined}
                    required
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={
                      fieldErrors.password ? 'password-error' : undefined
                    }
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                    }
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>

                {fieldErrors.password && (
                  <small id="password-error" className="field-error">
                    {fieldErrors.password}
                  </small>
                )}
              </div>

              <button className="primary-button" type="submit">
                {busy ? (
                  <>
                    <LoaderCircle size={18} className="spinner" />
                    Procesando…
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Iniciar sesión' : 'Crear mi cuenta'}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </fieldset>
          </form>

          <div className="security-note">
            <ShieldCheck size={17} />
            Tu contraseña se almacena de forma protegida.
          </div>
        </div>

        <footer className="form-footer">
          CELU-CANJE · Una nueva vida para cada equipo.
        </footer>
      </section>
    </main>
  )
}