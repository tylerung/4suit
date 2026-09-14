import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROLES, type Role } from '../types'
import { resetDB, updateProfile } from '../lib/api'
import { formatDate } from '../lib/geo'
import { useApp } from '../state/AppContext'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import ScreenHeader from '../components/ScreenHeader'
import { useToast } from '../components/Toast'
import './SettingsScreen.css'
import Icon, { type IconName } from '../components/Icon'

/* ------------------------------------------------------------------ theme */

type ThemeChoice = 'system' | 'dark' | 'light'

const THEME_KEY = 'railbird:theme'
const LIGHT_QUERY = '(prefers-color-scheme: light)'

const THEME_OPTIONS: { id: ThemeChoice; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'monitor' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'light', label: 'Light', icon: 'sun' },
]

function readStoredTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw === 'system' || raw === 'dark' || raw === 'light') return raw
  } catch {
    /* storage unavailable — fall through to the default */
  }
  return 'system'
}

/** Dark is the stylesheet default, so only 'light' needs an attribute. */
function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'dark') {
    root.dataset.theme = 'dark'
    return
  }
  if (choice === 'light') {
    root.dataset.theme = 'light'
    return
  }
  const prefersLight =
    typeof window.matchMedia === 'function' && window.matchMedia(LIGHT_QUERY).matches
  if (prefersLight) root.dataset.theme = 'light'
  else delete root.dataset.theme
}

/* App.tsx imports every screen eagerly, so restoring the saved choice at module
   load is what makes the theme survive a reload on any route, not just here. */
applyTheme(readStoredTheme())

/* --------------------------------------------------------------- screen */

export default function SettingsScreen() {
  const { revision, currentUser: me, signOutNow } = useApp()
  const navigate = useNavigate()
  const [toastNode, showToast] = useToast()
  const [theme, setTheme] = useState<ThemeChoice>('system')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const stored = readStoredTheme()
    setTheme(stored)
    applyTheme(stored)
  }, [])

  useEffect(() => {
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(LIGHT_QUERY)
    const sync = () => applyTheme('system')
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [theme])

  const pendingCount = useMemo(() => {
    void revision
    return me ? me.pendingFollowerIds.length : 0
  }, [me, revision])

  if (!me) {
    return (
      <>
        <ScreenHeader title="Settings" back />
        <EmptyState
          icon="♠️"
          title="Nobody is seated"
          body="Settings belong to an account. Pick a demo player and everything here becomes yours to change."
          action={<Link className="btn btn-primary" to="/signin">Pick an account</Link>}
        />
      </>
    )
  }

  const chooseTheme = (next: ThemeChoice) => {
    setTheme(next)
    applyTheme(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* storage unavailable — the choice still applies for this session */
    }
  }

  const togglePrivate = () => {
    const next = !me.isPrivate
    const waiting = me.pendingFollowerIds.length
    const err = updateProfile(me.id, { isPrivate: next })
    if (err) {
      setError(err)
      return
    }
    setError(null)
    if (next) showToast('Account is private')
    else if (waiting > 0) {
      showToast(`Public — ${waiting} request${waiting === 1 ? '' : 's'} approved`)
    } else showToast('Account is public')
  }

  const toggleRole = (role: Role) => {
    const roles = me.roles.includes(role)
      ? me.roles.filter((r) => r !== role)
      : [...me.roles, role]
    const err = updateProfile(me.id, { roles })
    setError(err)
  }

  const handleSignOut = () => {
    signOutNow()
    navigate('/signin', { replace: true })
  }

  const handleReset = () => {
    const ok = window.confirm(
      'Reset Railbird to the seeded demo data?\n\n'
        + 'Every post, rating, list and follow you have made in this browser is deleted. '
        + 'This cannot be undone.',
    )
    if (!ok) return
    resetDB()
    setError(null)
    showToast('Demo data restored')
  }

  return (
    <>
      <ScreenHeader title="Settings" subtitle={`@${me.username}`} back />

      <div className="set-body">
        {error && <p className="set-error" role="alert">{error}</p>}

        {/* ------------------------------------------------------- account */}
        <section className="card set-card" aria-labelledby="set-h-account">
          <h2 className="section-title" id="set-h-account">Account</h2>
          <div className="set-account">
            <Avatar user={me} size={52} link={false} />
            <div className="set-account-main">
              <div className="set-account-name">
                <span className="set-truncate">{me.displayName}</span>
                {me.verified && <span className="set-verified" title="Verified">✓</span>}
              </div>
              <div className="faint set-account-line">@{me.username}</div>
              <div className="faint set-account-line">
                {me.location} · joined {formatDate(me.joinedAt)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm set-account-btn"
              onClick={() => navigate('/profile')}
            >
              Edit profile
            </button>
          </div>
        </section>

        {/* ------------------------------------------------------- privacy */}
        <section className="card set-card" aria-labelledby="set-h-privacy">
          <h2 className="section-title" id="set-h-privacy">Privacy</h2>

          <div className="set-switch-row">
            <div className="set-switch-text">
              <div className="set-label" id="set-private-label">Private account</div>
              <p className="field-hint set-hint">
                {me.isPrivate
                  ? 'Only approved followers see your posts, ratings and lists. Anyone new has to be approved before they can follow you.'
                  : 'Anyone on Railbird can see your posts, ratings and lists. Turn this on and new followers have to be approved first.'}
                {me.isPrivate && pendingCount > 0 && (
                  <>
                    {' '}
                    <span className="set-warn">
                      Turning it back off approves all {pendingCount} waiting
                      {' '}request{pendingCount === 1 ? '' : 's'} at once — there is no way to
                      leave them pending.
                    </span>
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={me.isPrivate}
              aria-labelledby="set-private-label"
              className="set-switch"
              onClick={togglePrivate}
            >
              <span className="set-switch-knob" aria-hidden="true" />
            </button>
          </div>

          <hr className="set-sep" />

          <Link className="set-link-row" to="/profile">
            <span className="set-label">Follow requests</span>
            <span className="set-link-right">
              {pendingCount > 0
                ? <span className="set-badge num">{pendingCount} waiting</span>
                : <span className="faint set-link-note">None waiting</span>}
              <span className="set-chevron" aria-hidden="true">›</span>
            </span>
          </Link>
          <p className="field-hint set-hint">
            Requests are approved or declined on your profile.
          </p>
        </section>

        {/* ---------------------------------------------------- appearance */}
        <section className="card set-card" aria-labelledby="set-h-theme">
          <h2 className="section-title" id="set-h-theme">Appearance</h2>
          <div className="set-theme" role="group" aria-label="Theme">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="set-theme-btn"
                aria-pressed={theme === opt.id}
                onClick={() => chooseTheme(opt.id)}
              >
                <span className="set-theme-emoji" aria-hidden="true"><Icon name={opt.icon} size={16} /></span>
                {opt.label}
              </button>
            ))}
          </div>
          <p className="field-hint set-hint">
            Railbird runs dark — it gets used in card rooms at 2am. System follows your device and
            only flips to light when your OS asks for it. Saved on this browser, not to your account.
          </p>
        </section>

        {/* --------------------------------------------------------- roles */}
        <section className="card set-card" aria-labelledby="set-h-roles">
          <h2 className="section-title" id="set-h-roles">Roles</h2>
          <div className="set-roles">
            {ROLES.map((role) => (
              <button
                key={role.id}
                type="button"
                className="chip set-role"
                aria-pressed={me.roles.includes(role.id)}
                title={role.blurb}
                onClick={() => toggleRole(role.id)}
              >
                <span aria-hidden="true">{role.emoji}</span>
                {role.label}
                {role.staff && <span className="set-role-staff">staff</span>}
              </button>
            ))}
          </div>
          <p className="field-hint set-hint">
            {me.roles.length === 0
              ? 'No roles picked — your name shows up bare next to your posts.'
              : `${me.roles.length} picked. The first two show next to your name.`}
            {' '}Staff roles say you work in a room rather than play in one.
          </p>
        </section>

        {/* ----------------------------------------------------- your data */}
        <section className="card set-card" aria-labelledby="set-h-data">
          <h2 className="section-title" id="set-h-data">Your data</h2>
          <p className="field-hint set-hint">
            Railbird keeps the whole demo — accounts, posts, ratings, lists and follows — in this
            browser&rsquo;s localStorage. Signing out just empties the seat; nothing is deleted.
          </p>
          <div className="set-actions">
            <button type="button" className="btn set-action-btn" onClick={handleSignOut}>
              Sign out
            </button>
            <button
              type="button"
              className="btn btn-danger set-action-btn"
              onClick={handleReset}
            >
              Reset demo data
            </button>
          </div>
          <p className="field-hint set-hint">
            Reset throws away everything written in this browser and deals the seeded rooms,
            players and posts again. There is no undo.
          </p>
        </section>

        {/* --------------------------------------------------------- about */}
        <section className="card set-card" aria-labelledby="set-h-about">
          <h2 className="section-title" id="set-h-about">About</h2>
          <p className="set-about">
            Railbird is a local-first demo. There is no server and no real account: every post,
            rating, list and follow lives in this browser&rsquo;s localStorage, and nothing is
            uploaded anywhere. Clear your site data and the app deals a fresh table.
          </p>
          <p className="set-about set-about-dim">
            Rooms, rake and stakes are written for the demo. Do not plan a trip around them.
          </p>
        </section>
      </div>

      {toastNode}
    </>
  )
}
