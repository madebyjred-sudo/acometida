// The kit is copied as is (without kit/brands); scenes import its parts from
// here instead of kit/index.ts, which re-exports the brand registry. Only the
// parts the scenes use, so the page doesn't carry the rest of the kit's CSS.
export { Stage } from '../kit/stage'
export type { Act } from '../kit/act'
export { Window, Text, Prompt, Caret, Bar } from '../kit/window'
export { Count } from '../kit/motion/Count'
export { Collapse } from '../kit/motion/Collapse'
export { Stream } from '../kit/motion/Stream'
export { Field } from '../kit/controls/Field'

/** The scenes' accent for the kit (selection, focus): grafito, PANTONE Cool
 * Gray 11 C. The kit takes a color string, so it can't read paleta.css. */
export const ACENTO = '#53565a'
