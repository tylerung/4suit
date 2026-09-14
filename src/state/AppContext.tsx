import {
  createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore,
  type ReactNode,
} from 'react'
import { getRevision, subscribe } from '../lib/storage'
import { getCurrentUser, signIn, signOut } from '../lib/api'
import { METROS, type Coords, type Metro, type User } from '../types'

/**
 * Re-renders every consumer whenever the store mutates. Screens read data by
 * calling `api.*` during render — this hook is what makes that safe.
 */
export function useStoreRevision(): number {
  return useSyncExternalStore(subscribe, getRevision, getRevision)
}

const LOCATION_KEY = 'railbird:metro'

export interface AppContextValue {
  /** Bumps on every store mutation; depend on it to recompute derived data. */
  revision: number
  currentUser: User | null
  signInAs: (userId: string) => void
  signOutNow: () => void

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

  const currentUser = useMemo(() => {
    void revision
    return getCurrentUser()
  }, [revision])

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
    signInAs: signIn,
    signOutNow: signOut,
    metro,
    setMetroId,
    deviceCoords,
    usingDevice: deviceCoords !== null,
    requestDeviceLocation,
    clearDeviceLocation: () => { setDeviceCoords(null); setGeoError(null) },
    origin: deviceCoords ?? { lat: metro.lat, lng: metro.lng },
    originLabel: deviceCoords ? 'Your location' : metro.label,
    geoError,
  }), [revision, currentUser, metro, deviceCoords, geoError, setMetroId, requestDeviceLocation])

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
