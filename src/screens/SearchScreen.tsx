import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { rankVenues, search, suggestedUsers } from '../lib/api'
import { useApp } from '../state/AppContext'
import ScreenHeader from '../components/ScreenHeader'
import EmptyState from '../components/EmptyState'
import VenueRow from '../components/VenueRow'
import UserRow from '../components/UserRow'
import PostCard from '../components/PostCard'
import ListCard from '../components/ListCard'
import './SearchScreen.css'
import Icon from '../components/Icon'

type Tab = 'all' | 'rooms' | 'people' | 'posts' | 'lists'

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'people', label: 'People' },
  { id: 'posts', label: 'Posts' },
  { id: 'lists', label: 'Lists' },
]

/** Terms that actually return something in this database — no dead chips. */
const QUICK_SEARCHES = ['PLO', 'rake', 'dealers', 'tournaments', 'Las Vegas', 'comps']

/** Used as the slice limit when a single tab is showing everything it has. */
const ALL_OF_THEM = Number.POSITIVE_INFINITY

export default function SearchScreen() {
  const { revision, currentUser, origin, originLabel } = useApp()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  const query = params.get('q') ?? ''
  const viewerId = currentUser?.id ?? null

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // A new query always drops you back to the mixed view.
  useEffect(() => {
    setTab('all')
  }, [query])

  const setQuery = useCallback(
    (next: string) => {
      const nextParams = new URLSearchParams(params)
      if (next) nextParams.set('q', next)
      else nextParams.delete('q')
      setParams(nextParams, { replace: true })
    },
    [params, setParams],
  )

  const results = useMemo(() => {
    void revision
    return search(query, viewerId, origin)
  }, [query, viewerId, revision, origin])

  const trending = useMemo(() => {
    void revision
    return rankVenues({ origin, sort: 'rating' }).slice(0, 5)
  }, [revision, origin])

  const suggested = useMemo(() => {
    void revision
    return suggestedUsers(viewerId, 5)
  }, [revision, viewerId])

  const counts: Record<Tab, number> = {
    rooms: results.venues.length,
    people: results.users.length,
    posts: results.posts.length,
    lists: results.lists.length,
    all:
      results.venues.length +
      results.users.length +
      results.posts.length +
      results.lists.length,
  }

  const head = (title: string, right: ReactNode) => (
    <div className="srch-section-head">
      <h2 className="section-title">{title}</h2>
      {right}
    </div>
  )

  const seeAll = (target: Tab, total: number, shown: number) =>
    total > shown ? (
      <button className="srch-seeall" onClick={() => setTab(target)}>
        See all {total}
      </button>
    ) : null

  const roomsBlock = (limit: number) =>
    counts.rooms > 0 && (
      <section className="srch-section">
        {head('Rooms', seeAll('rooms', counts.rooms, limit))}
        <div className="srch-rows">
          {results.venues.slice(0, limit).map((row) => (
            <VenueRow key={row.venue.id} row={row} showRank={false} />
          ))}
        </div>
      </section>
    )

  const peopleBlock = (limit: number) =>
    counts.people > 0 && (
      <section className="srch-section">
        {head('People', seeAll('people', counts.people, limit))}
        <div className="srch-rows">
          {results.users.slice(0, limit).map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </div>
      </section>
    )

  const postsBlock = (limit: number) =>
    counts.posts > 0 && (
      <section className="srch-section">
        {head('Posts', seeAll('posts', counts.posts, limit))}
        <div className="srch-rows">
          {results.posts.slice(0, limit).map((item) => (
            <PostCard key={item.post.id} item={item} />
          ))}
        </div>
      </section>
    )

  const listsBlock = (limit: number) =>
    counts.lists > 0 && (
      <section className="srch-section">
        {head('Lists', seeAll('lists', counts.lists, limit))}
        <div className="srch-lists">
          {results.lists.slice(0, limit).map((list) => (
            <ListCard key={list.id} list={list} showOwner />
          ))}
        </div>
      </section>
    )

  const tabEmpty = (label: string) => (
    <div className="srch-empty">
      <EmptyState
        icon="🔎"
        title={`No ${label} match “${query}”`}
        body="The other tabs still have hits for this one."
        action={
          <button className="btn btn-sm" onClick={() => setTab('all')}>
            Show everything
          </button>
        }
      />
    </div>
  )

  return (
    <>
      <ScreenHeader
        title="Search"
        subtitle={
          query
            ? `${counts.all} ${counts.all === 1 ? 'result' : 'results'} for “${query}”`
            : 'Rooms, players, posts and lists'
        }
      />

      <div className="srch-wrap" role="search">
        <div className="srch-field">
          <span className="srch-icon" aria-hidden="true"><Icon name="search" size={17} /></span>
          <input
            ref={inputRef}
            className="srch-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault()
                setQuery('')
              }
            }}
            placeholder="Room, city, player, tag"
            aria-label="Search rooms, people, posts and lists"
            autoComplete="off"
            spellCheck={false}
          />
          {query !== '' && (
            <button className="srch-clear" onClick={() => { setQuery(''); inputRef.current?.focus() }} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        {query !== '' && (
          <div className="chip-row">
            {TABS.map((t) => (
              <button
                key={t.id}
                className="chip"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                <span className="num srch-count">{counts[t.id]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {query === '' ? (
        <div className="srch-landing">
          <section className="srch-section">
            {head('Try one of these', null)}
            <div className="srch-quick-wrap">
              <div className="chip-row">
                {QUICK_SEARCHES.map((term) => (
                  <button key={term} className="chip" onClick={() => setQuery(term)}>
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="srch-section">
            {head(
              'Trending rooms',
              <span className="srch-head-note faint">Best rated · distance from {originLabel}</span>,
            )}
            <div className="srch-rows">
              {trending.map((row) => (
                <VenueRow key={row.venue.id} row={row} />
              ))}
            </div>
            <div className="srch-more-wrap">
              <Link to="/rankings" className="btn btn-sm btn-ghost">
                Open the full leaderboard →
              </Link>
            </div>
          </section>

          {suggested.length > 0 && (
            <section className="srch-section">
              {head('Suggested people', <span className="srch-head-note faint">Most followed</span>)}
              <div className="srch-rows">
                {suggested.map((user) => (
                  <UserRow key={user.id} user={user} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : counts.all === 0 ? (
        <div className="srch-empty">
          <EmptyState
            icon="🃏"
            title={`Nothing for “${query}”`}
            body="No room, player, post or list matched. Room names, cities, handles and post tags all work — plain words, no @ or #."
            action={
              <button className="btn btn-sm btn-primary" onClick={() => setQuery('')}>
                Clear search
              </button>
            }
          />
        </div>
      ) : (
        <div className="srch-results">
          {tab === 'all' && (
            <>
              {roomsBlock(3)}
              {peopleBlock(3)}
              {postsBlock(3)}
              {listsBlock(2)}
            </>
          )}
          {tab === 'rooms' && (counts.rooms > 0 ? roomsBlock(ALL_OF_THEM) : tabEmpty('rooms'))}
          {tab === 'people' && (counts.people > 0 ? peopleBlock(ALL_OF_THEM) : tabEmpty('people'))}
          {tab === 'posts' && (counts.posts > 0 ? postsBlock(ALL_OF_THEM) : tabEmpty('posts'))}
          {tab === 'lists' && (counts.lists > 0 ? listsBlock(ALL_OF_THEM) : tabEmpty('lists'))}
        </div>
      )}
    </>
  )
}
