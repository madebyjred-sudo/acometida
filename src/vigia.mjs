/**
 * El medidor. Por fuente: si corre, si su forma sigue igual, desde cuándo son sus datos y si calla más que nunca.
 * Lo que no se pudo medir dice «sin medir». Nunca verde por defecto.
 */
const DIA = 86_400_000;
const ORDEN = { verde: 0, 'sin medir': 1, amarillo: 2, rojo: 3 };
const peor = (a, b) => (ORDEN[b] > ORDEN[a] ? b : a);

/** Datos al: el fin de la última corrida verde. La hora de la pregunta nunca es la fecha del dato. */
export function datosAl(base, fuente) {
  return base.corridas(fuente, 200).find((c) => c.semaforo === 'verde')?.fin ?? null;
}

/**
 * Umbral de silencio medido sobre las fechas de publicación guardadas: queda por encima del mayor hueco
 * observado en los últimos 120 días de historia. Con menos de 14 fechas distintas no hay medición.
 */
export function calibrar(fechas, { minimo = 14, ventanaDias = 120, margen = 1.5 } = {}) {
  if (fechas.length < minimo) return { umbralDias: null, muestras: fechas.length, motivo: `${fechas.length} fechas de publicación; hacen falta ${minimo} para medir` };
  const t = fechas.map((f) => Date.parse(`${f}T00:00:00Z`)).sort((a, b) => a - b);
  const corte = t[t.length - 1] - ventanaDias * DIA;
  const ventana = t.filter((x) => x >= corte);
  let mayor = 0;
  for (let i = 1; i < ventana.length; i++) mayor = Math.max(mayor, (ventana[i] - ventana[i - 1]) / DIA);
  return { umbralDias: Math.max(1, Math.ceil(mayor * margen)), mayorHueco: mayor, muestras: ventana.length };
}

/** @returns {{ fuente: string, nombre: string, semaforo: string, lineas: string[], datosAl: string|null }} */
export function estadoFuente(base, c, ahora = new Date()) {
  const lineas = [];
  let s = 'verde';
  const corridas = base.corridas(c.fuente, 200);
  const ultima = corridas[0];
  const cadaHoras = c.frescura?.cadaHoras ?? 24;

  if (!ultima) { s = peor(s, 'sin medir'); lineas.push('nunca corrió'); }
  else {
    const horas = (ahora - Date.parse(ultima.fin)) / 3_600_000;
    if (ultima.semaforo === 'rojo') { s = peor(s, 'rojo'); lineas.push(`última corrida en rojo: ${ultima.motivo}`); }
    else if (ultima.semaforo === 'amarillo') { s = peor(s, 'amarillo'); lineas.push(`última corrida en amarillo: ${ultima.motivo}`); }
    if (horas > 4 * cadaHoras) { s = peor(s, 'rojo'); lineas.push(`no corre hace ${Math.round(horas)} h (se espera cada ${cadaHoras} h)`); }
    else if (horas > 2 * cadaHoras) { s = peor(s, 'amarillo'); lineas.push(`no corre hace ${Math.round(horas)} h (se espera cada ${cadaHoras} h)`); }
  }

  const al = datosAl(base, c.fuente);
  if (ultima && !al) { s = peor(s, 'amarillo'); lineas.push('nunca tuvo una corrida verde: no hay fecha de datos confiable'); }

  const can = base.ultimoCanario(c.fuente);
  if (!can) { s = peor(s, 'sin medir'); lineas.push('forma sin medir: el canario no ha corrido'); }
  else if (!can.ok) { s = peor(s, 'rojo'); lineas.push(`canario: ${can.motivo}`); }
  else if ((ahora - Date.parse(can.en)) / DIA > 2) { s = peor(s, 'amarillo'); lineas.push(`canario viejo: último el ${can.en.slice(0, 10)}`); }

  const cal = calibrar(base.fechas(c.fuente));
  const cob = base.cobertura(c.fuente);
  if (cal.umbralDias == null) { s = peor(s, 'sin medir'); lineas.push(`silencio sin medir: ${cal.motivo}`); }
  else if (cob.hasta) {
    const calla = Math.floor((ahora - Date.parse(`${cob.hasta}T00:00:00Z`)) / DIA);
    if (calla > cal.umbralDias) { s = peor(s, 'amarillo'); lineas.push(`la fuente no publica hace ${calla} días; su mayor hueco medido es ${cal.mayorHueco} (umbral ${cal.umbralDias})`); }
  }

  if (s === 'verde') lineas.push(`al día: ${cob.n} registros, última publicación ${cob.hasta ?? 's/f'}`);
  return { fuente: c.fuente, nombre: c.nombre ?? c.fuente, semaforo: s, lineas, datosAl: al, cobertura: cob, umbral: cal };
}
