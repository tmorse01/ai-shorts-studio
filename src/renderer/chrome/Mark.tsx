/**
 * App mark: a 9:16 frame holding three stacked cuts. Frame and cuts take the current text colour and
 * the cut tokens, so the mark follows the theme. Used in the title bar and as the source for the app icon.
 */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="8" y="3" width="16" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="11.5" y="8" width="9" height="3.5" rx="1.75" style={{ fill: 'var(--cut-1)' }} />
      <rect x="11.5" y="14.25" width="9" height="3.5" rx="1.75" style={{ fill: 'var(--cut-2)' }} />
      <rect x="11.5" y="20.5" width="9" height="3.5" rx="1.75" style={{ fill: 'var(--cut-3)' }} />
    </svg>
  )
}
