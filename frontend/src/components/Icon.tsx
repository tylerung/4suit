import type { ReactNode } from 'react'
import './Icon.css'

export type IconName =
  | 'heart' | 'club' | 'diamond' | 'spade' | 'search' | 'user'
  | 'chat' | 'pin' | 'camera' | 'no-media' | 'lock' | 'globe'
  | 'monitor' | 'moon' | 'sun' | 'list'

/* The four suits are solid shapes — that is how they read on a card — while
   everything else is a 24×24 line icon. Both paint in currentColor, so an icon
   takes the palette colour, and the hover / active colour, of whatever it sits
   in. The red suits stay monochrome for the same reason. */
const SUIT = { fill: 'currentColor', stroke: 'none' } as const

const GLYPHS: Record<IconName, ReactNode> = {
  heart: (
    <path
      {...SUIT}
      d="M12 21C10.2 18.2 3 13.6 3 8.6 3 5.8 5 4 7.4 4c2 0 3.7 1.2 4.6 3 .9-1.8 2.6-3 4.6-3C19 4 21 5.8 21 8.6c0 5-7.2 9.6-9 12.4z"
    />
  ),
  club: (
    <g {...SUIT}>
      <circle cx="12" cy="7.3" r="3.9" />
      <circle cx="7.3" cy="13.2" r="3.9" />
      <circle cx="16.7" cy="13.2" r="3.9" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 12.5c0 3.9-1 6.5-2.8 8.5h5.6c-1.8-2-2.8-4.6-2.8-8.5z" />
    </g>
  ),
  diamond: (
    <path {...SUIT} d="M12 2.5Q14.9 8.1 19 12 14.9 15.9 12 21.5 9.1 15.9 5 12 9.1 8.1 12 2.5z" />
  ),
  spade: (
    <path
      {...SUIT}
      d="M12 2.5C9.5 6 4.5 8.5 4.5 13a4 4 0 0 0 6.7 2.9L10 21h4l-1.2-5.1A4 4 0 0 0 19.5 13c0-4.5-5-7-7.5-10.5z"
    />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.9-3.9 3.9-6 7.5-6s6.6 2.1 7.5 6" />
    </>
  ),
  chat: <path d="M20.5 11.5a8 8 0 0 1-11.9 7L4 19.8l1.3-4.4a8 8 0 1 1 15.2-3.9z" />,
  pin: (
    <>
      <path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.5h3.2l1.8-2.8h7l1.8 2.8h3.2v10.5h-17z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </>
  ),
  'no-media': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8.5 20h7M12 16v4" />
    </>
  ),
  moon: <path d="M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.2 6.2 0 0 0 9.7 9.7z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
}

interface Props {
  name: IconName
  size?: number
  /** Give the icon a spoken name. Omit when adjacent text already says it. */
  label?: string
  className?: string
}

/**
 * Monochrome interface icon. These replaced colour emoji in the app's chrome:
 * an emoji paints its own colours, so a gold trophy stayed gold on a blue
 * active tab. An icon in currentColor cannot drift off the palette.
 */
export default function Icon({ name, size = 18, label, className = '' }: Props) {
  return (
    <svg
      className={`icon icon-${name} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  )
}
