/**
 * Normaliza una fecha a AAAA-MM-DD. Si no puede, devuelve null: nunca inventa, nunca cae a «ahora».
 * Quien llama decide qué hacer con el nulo (el motor lo cuenta como «sin fecha»).
 */
const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12,
  jan: 1, apr: 4, aug: 8, dec: 12,
};

const dos = (n) => String(n).padStart(2, '0');

function armar(a, m, d, hoy) {
  a = Number(a); m = Number(m); d = Number(d);
  if (!Number.isInteger(a) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (a < 1800 || a > hoy.getUTCFullYear() + 1) return null; // fecha imposible: se rechaza, no se guarda
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${a}-${dos(m)}-${dos(d)}`;
}

/** @param {unknown} valor @param {{ hoy?: Date, orden?: 'dma' | 'mda' }} [o] @returns {string | null} */
export function fecha(valor, o = {}) {
  const hoy = o.hoy ?? new Date();
  if (valor == null || valor === '') return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : armar(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate(), hoy);
  const s = String(valor).trim().toLowerCase();
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s].*)?$/.exec(s))) return armar(m[1], m[2], m[3], hoy);
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return armar(m[1], m[2], m[3], hoy);
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) {
    return o.orden === 'mda' ? armar(m[3], m[1], m[2], hoy) : armar(m[3], m[2], m[1], hoy);
  }
  // «3 de noviembre de 2026», «3 nov 2026», «Tue, 03 Nov 2026 10:00:00 GMT»
  if ((m = /(\d{1,2})\s+(?:de\s+)?([a-zé]+)\.?,?\s+(?:de\s+|del\s+)?(\d{4})/.exec(s)) && MESES[m[2]]) return armar(m[3], MESES[m[2]], m[1], hoy);
  // «November 3, 2026»
  if ((m = /([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s)) && MESES[m[1]]) return armar(m[3], MESES[m[1]], m[2], hoy);
  return null;
}

/** El día calendario en una zona horaria: `diaEn('Europe/Madrid')` → «2026-11-04». */
export function diaEn(zona, d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Días entre dos fechas AAAA-MM-DD, ambos incluidos. */
export function diasEntre(desde, hasta) {
  const out = [];
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= Date.parse(`${hasta}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export const sumarDias = (dia, n) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
