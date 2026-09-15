import { NavLink } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import './NavBar.css'
import Avatar from './Avatar'
import Icon, { type IconName } from './Icon'

/* One suit per tab. Profile shows your own avatar instead — `user` is only the
   fallback for the moment between signing out and the redirect to /signin. */
const TABS: { to: string; label: string; icon: IconName; exact: boolean }[] = [
  { to: '/',         label: 'Feed',     icon: 'heart',   exact: true },
  { to: '/rankings', label: 'Rankings', icon: 'club',    exact: false },
  { to: '/search',   label: 'Search',   icon: 'diamond', exact: false },
  { to: '/compose',  label: 'Post',     icon: 'spade',   exact: false },
  { to: '/profile',  label: 'Profile',  icon: 'user',    exact: false },
]

export default function NavBar() {
  const { currentUser } = useApp()
  const pending = currentUser?.pendingFollowerIds.length ?? 0

  return (
    <nav className="navbar" aria-label="Primary">
      <div className="navbar-brand">
        <span className="navbar-logo" aria-hidden="true">♠</span>
        <span className="navbar-wordmark">4suit</span>
      </div>
      <ul className="navbar-tabs">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.exact}
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''} ${t.to === '/compose' ? 'nav-tab-post' : ''}`}
            >
              <span className="nav-icon" aria-hidden="true">
                {t.to === '/profile' && currentUser ? (
                  <span className="nav-avatar">
                    <Avatar user={currentUser} size={24} link={false} />
                  </span>
                ) : (
                  <Icon name={t.icon} size={t.to === '/compose' ? 17 : 21} />
                )}
              </span>
              <span className="nav-label">{t.label}</span>
              {t.to === '/profile' && pending > 0 && (
                <span className="nav-dot" aria-label={`${pending} follow requests`} />
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
