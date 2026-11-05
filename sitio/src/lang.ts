import { useSyncExternalStore } from 'react'

// The page comes in two languages, one HTML entry each: index.html (es) and
// en/index.html (en). The entry sets <html lang> and the page starts there;
// after that the switch changes the language in place, without a reload.
export type Lang = 'es' | 'en'

let actual: Lang = document.documentElement.lang === 'en' ? 'en' : 'es'
const oyentes = new Set<() => void>()

export const idioma = () => actual

export function cambiarIdioma(l: Lang) {
  if (l === actual) return
  actual = l
  document.documentElement.lang = l
  oyentes.forEach((f) => f())
}

export function useIdioma() {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    idioma,
  )
}

/** The string (or list, or node) for the page's language, read when it's called. */
export const t = <T,>(es: T, en: T): T => (actual === 'en' ? en : es)

/** One decimal, with the language's separator: 81,4 or 81.4. */
export const decimal = (n: number) => t(n.toFixed(1).replace('.', ','), n.toFixed(1))
