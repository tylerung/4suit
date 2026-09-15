import {
  createContext, useCallback, useContext, useMemo, useState,
  type ReactNode,
} from 'react'
import { getCurrentUser, signIn, signOut } from '../lib/api'
import { useQuery, useStoreRevision } from '../hooks/useQuery'
import { METROS, type Coords, type Metro, type User } from '../types'

export { useStoreRevision }

const LOCATION_KEY = '4suit:metro'

export interface AppContextValue {
  /** Bumps whenever a write invalidates server state; queries depend on it. */
  revision: number
  currentUser: User | null
  /** False until the API has answered who, if anyone, is signed in. */
  ready: boolean
  signInAs: (userId: string) => Promise<void>
  signOutNow: () => Promise<void>

  /** The place "near me" is measured from. */
  metro: Metro
  setMetroId: (id: string) => void
  /** Live device coordinates when the user granted permission, else null. */
  deviceCoords: Coords | null
  usingDevice: boolean
  requestDeviceLocation: () => void
  clearDeviceLocation: () => void
  /** Whichever origin is active — device coords win over the picked metro. */
  origin: Coords
  originLabel: string
  geoError: string | null
}

const AppContext = createContext<AppContextValue | null>(null)

function readStoredMetro(): Metro {
  try {
    const id = localStorage.getItem(LOCATION_KEY)
    const found = METROS.find((m) => m.id === id)
    if (found) return found
  } catch { /* storage unavailable */ }
  return METROS[0]
}

export function AppProvider({ children }: { children: ReactNode }) {
  const revision = useStoreRevision()
  const [metro, setMetro] = useState<Metro>(readStoredMetro)
  const [deviceCoords, setDeviceCoords] = useState<Coords | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)

  /**
   * Who is signed in is the server's answer to the bearer token this browser is
   * holding, not something the client can decide. It refetches on every
   * invalidation, so editing your own profile updates the nav bar avatar too.
   */
  const { data: currentUser, loaded } = useQuery<User | null>(
    () => getCurrentUser(),
    [],
    null,
  )

  const signInAs = useCallback(async (userId: string) => { await signIn(userId) }, [])
  const signOutNow = useCallback(async () => { await signOut() }, [])

  const setMetroId = useCallback((id: string) => {
    const found = METROS.find((m) => m.id === id)
    if (!found) return
    setMetro(found)
    setDeviceCoords(null)
    // The geo error tells the user to pick a city. Once they have, the message
    // is stale advice contradicting the UI, so it goes away with the action.
    setGeoError(null)
    try { localStorage.setItem(LOCATION_KEY, id) } catch { /* ignore */ }
  }, [])

  const requestDeviceLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('This browser does not support location.')
      return
    }
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setGeoError(err.code === err.PERMISSION_DENIED
        ? 'Location permission denied — pick a city instead.'
        : 'Could not get your location.'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    )
  }, [])

  const value = useMemo<AppContextValue>(() => ({
    revision,
    currentUser,
    ready: loaded,
    signInAs,
    signOutNow,
    metro,
    setMetroId,
    deviceCoords,
    usingDevice: deviceCoords !== null,
    requestDeviceLocation,
    clearDeviceLocation: () => { setDeviceCoords(null); setGeoError(null) },
    origin: deviceCoords ?? { lat: metro.lat, lng: metro.lng },
    originLabel: deviceCoords ? 'Your location' : metro.label,
    geoError,
  }), [
    revision, currentUser, loaded, signInAs, signOutNow, metro, deviceCoords, geoError,
    setMetroId, requestDeviceLocation,
  ])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

/** Convenience for screens that require a signed-in user. */
export function useCurrentUser(): User | null {
  return useApp().currentUser
}
