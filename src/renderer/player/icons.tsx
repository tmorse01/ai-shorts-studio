/** Minimal line icons for the player controls. All are 16px and inherit the current text colour. */

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false
}

export function PlayIcon() {
  return (
    <svg {...base}>
      <path d="M5 3.2v9.6L13 8 5 3.2z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PauseIcon() {
  return (
    <svg {...base}>
      <rect x="4" y="3" width="2.8" height="10" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="9.2" y="3" width="2.8" height="10" rx="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SkipBackIcon() {
  return (
    <svg {...base}>
      <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
      <path d="M2.5 2.8v3.2h3.2" />
    </svg>
  )
}

export function SkipForwardIcon() {
  return (
    <svg {...base}>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.8v3.2H10.3" />
    </svg>
  )
}

export function VolumeIcon() {
  return (
    <svg {...base}>
      <path d="M2.5 6.2h2.2L8 3.5v9L4.7 9.8H2.5z" />
      <path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8" />
    </svg>
  )
}

export function MuteIcon() {
  return (
    <svg {...base}>
      <path d="M2.5 6.2h2.2L8 3.5v9L4.7 9.8H2.5z" />
      <path d="M10.8 6l3.4 4M14.2 6l-3.4 4" />
    </svg>
  )
}

export function FullscreenIcon() {
  return (
    <svg {...base}>
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
    </svg>
  )
}

export function ExitFullscreenIcon() {
  return (
    <svg {...base}>
      <path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" />
    </svg>
  )
}
