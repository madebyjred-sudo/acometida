// The flyer's two pictures, drawn in ASCII like the rest of the family:
// the technician with his wrench and toolbox, and the round rubber stamp.
// Both are originals; no clip art, no cut from a real card.

/** Center `s` in a run of `n` characters. */
const centrar = (s: string, n: number) => {
  const izq = Math.floor((n - s.length) / 2)
  return ' '.repeat(Math.max(0, izq)) + s + ' '.repeat(Math.max(0, n - s.length - izq))
}

// The technician, running in with the open-ended spanner up and the toolbox
// in hand, the way every flyer's mascot does.
// The first two lines carry his hard hat, the one orange on the page; the
// flyer paints them apart (volante.tsx), so they're exported on their own.
// The open jaws, narrow shaft and ring end keep the spanner from reading as
// a second hard hat or a closed box, even at the card's phone size.
export const CASCO = [
  ['  _   _         ', '____'],
  [' / \\ / \\      ', '_/____\\_'],
] as const
export const TECNICO = [
  ' |  V  |       (o  o)',
  '  \\   /        \\ - /',
  "   | |    ___.--'---'--.",
  '  /   \\       |  [ A ]  |\\',
  ' |  o  |      |         | \\__',
  '  \\___/       |_________|  [##]',
  '      \\        |   |   |   [##]',
  '       \\_______|   |   |',
  '              __|   |   |__',
  '             (___)     (___)',
].join('\n')

/** The round stamp: two words on the ring, two on the band across it. */
export function sello(arriba: [string, string], banda: [string, string]) {
  const l = [
    `        .-~~~~~~~~~-.`,
    `     .-'${centrar(arriba[0], 13)}'-.`,
    `   .'${centrar(arriba[1], 19)}'.`,
    `  /  .-~~~~~~~~~~~~~~~-.  \\`,
    ` |   |${centrar(banda[0], 17)}|   |`,
    ` |   |${centrar(banda[1], 17)}|   |`,
    `  \\  '-~~~~~~~~~~~~~~~-'  /`,
    `   '.${centrar('* * * * *', 19)}.'`,
    `     '-.             .-'`,
    `        '-~~~~~~~~~-'`,
  ]
  return l.join('\n')
}
