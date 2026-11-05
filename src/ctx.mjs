/** Lo que un conector recibe en `ctx.ayudas` y `ctx.errores`: así `fuentes/*.mjs` no importa nada. */
import { FalloFuente, TodaviaNo } from './errores.mjs';
import { diaEn, diasEntre, fecha, sumarDias } from './fecha.mjs';

let extra = null;
export async function ayudas() {
  if (!extra) extra = await import('./ayudas.mjs').catch(() => ({}));
  return { fecha, diaEn, diasEntre, sumarDias, ...extra };
}

export const errores = { TodaviaNo, FalloFuente };
