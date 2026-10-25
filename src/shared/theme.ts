// Must match --color-bg in src/renderer/theme/tokens.css. tests/theme-tokens.test.ts checks this.
// The main process needs it for the window background, so it cannot read the CSS file.
export const APP_BACKGROUND = '#0b0d0c'

// The window's title strip colours and height, used by titleBarOverlay in main. They must match
// --color-titlebar, --color-text and --titlebar-h in tokens.css. tests/theme-tokens.test.ts checks
// this.
export const TITLE_BAR_COLOR = '#050606'
export const TITLE_BAR_SYMBOL_COLOR = '#f5f5f0'
export const TITLE_BAR_HEIGHT = 32
