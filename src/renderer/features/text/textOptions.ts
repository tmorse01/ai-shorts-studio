// The labels the text controls show for the palette names. Pure, so the controls and any test read the same
// words.
import type { TextColorName } from '@shared/text/textStyles'
import type { TextMotion } from '@shared/text/textItem'

// The labels for the entry and exit motions. Slides are named by the edge the text comes from or leaves to.
export const TEXT_MOTION_LABELS: Record<TextMotion, string> = {
  none: 'None',
  fade: 'Fade',
  'slide-left': 'Slide from left',
  'slide-right': 'Slide from right',
  'slide-top': 'Slide from top',
  'slide-bottom': 'Slide from bottom',
  pop: 'Pop',
  typewriter: 'Typewriter'
}

export const TEXT_COLOUR_LABELS: Record<TextColorName, string> = {
  void: 'Void black',
  white: 'Galactic white',
  ivory: 'Aged ivory',
  sage: 'Undead sage'
}
