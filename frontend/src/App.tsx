import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import NavBar from './components/NavBar'
import { useApp } from './state/AppContext'
import FeedScreen from './screens/FeedScreen'
import RankingsScreen from './screens/RankingsScreen'
import SearchScreen from './screens/SearchScreen'
import ComposeScreen from './screens/ComposeScreen'
import ProfileScreen from './screens/ProfileScreen'
import VenueDetailScreen from './screens/VenueDetailScreen'
import PostDetailScreen from './screens/PostDetailScreen'
import ListDetailScreen from './screens/ListDetailScreen'
import SettingsScreen from './screens/SettingsScreen'
import SignInScreen from './screens/SignInScreen'
import NotFoundScreen from './screens/NotFoundScreen'

export default function App() {
  const { currentUser, ready } = useApp()
  const location = useLocation()

  // Until the API has answered who is signed in, "nobody" is not yet true —
  // redirecting on it would bounce a signed-in user to the sign-in screen on
  // every reload.
  if (!ready) {
    return (
      <div className="app-shell">
        <main className="app-main" id="main">
          <p className="app-booting faint" role="status">Dealing in…</p>
        </main>
      </div>
    )
  }

  if (!currentUser && location.pathname !== '/signin') {
    return <Navigate to="/signin" replace />
  }

  return (
    <div className="app-shell">
      <main className="app-main" id="main">
        <Routes>
          <Route path="/" element={<FeedScreen />} />
          <Route path="/rankings" element={<RankingsScreen />} />
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/compose" element={<ComposeScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/u/:username" element={<ProfileScreen />} />
          <Route path="/venue/:venueId" element={<VenueDetailScreen />} />
          <Route path="/post/:postId" element={<PostDetailScreen />} />
          <Route path="/list/:listId" element={<ListDetailScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/signin" element={<SignInScreen />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Routes>
      </main>
      {currentUser && <NavBar />}
    </div>
  )
}
