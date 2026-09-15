import { useNavigate } from 'react-router-dom'
import type { User } from '../types'
import { listUsers } from '../lib/api'
import { useQuery } from '../hooks/useQuery'
import { formatCount } from '../lib/geo'
import { useApp } from '../state/AppContext'
import Avatar from '../components/Avatar'
import RoleBadge from '../components/RoleBadge'
import './SignInScreen.css'
import Icon from '../components/Icon'

/** The seeded "you" account — always dealt the first seat. */
const YOU_HANDLE = '4suiter'

const NO_ACCOUNTS: User[] = []

export default function SignInScreen() {
  const { currentUser, signInAs } = useApp()
  const navigate = useNavigate()

  const { data: accounts, loaded, error } = useQuery<User[]>(
    async () => {
      const all = await listUsers()
      return [
        ...all.filter((u) => u.username === YOU_HANDLE),
        ...all.filter((u) => u.username !== YOU_HANDLE),
      ]
    },
    [],
    NO_ACCOUNTS,
  )

  const take = (userId: string) => {
    // Navigate only once the token is in hand, or the feed would render for
    // nobody and bounce straight back here.
    void signInAs(userId).then(() => navigate('/', { replace: true }))
  }

  return (
    <div className="signin-wrap">
      <div className="signin-inner">
        <header className="signin-hero">
          <h1 className="signin-mark">
            <span className="signin-spade" aria-hidden="true">♠</span>
            4suit
          </h1>
          <p className="signin-tag">Rank the rooms. Follow the players.</p>
          <p className="signin-explain">
            No password, no email, no waiting list. Pick any demo account below and you are in the
            seat — every post, rating and follow is kept by the 4suit API.
          </p>
        </header>

        <section aria-labelledby="signin-accounts">
          <h2 className="section-title signin-title" id="signin-accounts">
            {!loaded ? 'Shuffling up…' : `${accounts.length} seats open`}
          </h2>

          {error && <p className="load-error" role="alert">{error}</p>}

          <div className="signin-grid">
            {accounts.map((u) => {
              const isYou = u.username === YOU_HANDLE
              const seated = currentUser?.id === u.id
              const badge = seated ? 'Seated' : isYou ? 'Start here' : null
              return (
                <button
                  key={u.id}
                  type="button"
                  className={`signin-card${isYou ? ' is-you' : ''}`}
                  onClick={() => take(u.id)}
                >
                  {badge && <span className="signin-badge">{badge}</span>}

                  <span className="signin-card-top">
                    <Avatar user={u} size={44} link={false} />
                    <span className="signin-card-id">
                      <span className="signin-card-name">
                        <span className="sr-only">Sign in as </span>
                        <span className="signin-name-text">{u.displayName}</span>
                        {u.verified && (
                          <span className="signin-verified" role="img" aria-label="Verified">✓</span>
                        )}
                        {u.isPrivate && (
                          <span className="signin-lock" role="img" aria-label="Private account">
                            <Icon name="lock" size={12} />
                          </span>
                        )}
                      </span>
                      <span className="signin-card-handle faint">@{u.username}</span>
                    </span>
                  </span>

                  <span className="signin-card-loc faint">{u.location}</span>

                  {u.roles.length > 0 && (
                    <span className="signin-card-roles">
                      {u.roles.slice(0, 2).map((r) => (
                        <RoleBadge key={r} role={r} size="sm" />
                      ))}
                    </span>
                  )}

                  <span className="signin-card-foot">
                    <span>
                      <span className="signin-followers num">
                        {formatCount(u.followerIds.length)}
                      </span>
                      {' '}follower{u.followerIds.length === 1 ? '' : 's'}
                    </span>
                    <span className="signin-go" aria-hidden="true">Take seat ›</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <p className="signin-foot faint">
          4suit is a demo. Everyone signed in sees the same rooms and posts, and Settings can
          deal the whole dataset again whenever you have made a mess of it.
        </p>
      </div>
    </div>
  )
}
