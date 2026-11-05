/**
 * Lector con modelo (BYO): lee un documento sin forma (PDF, HTML desordenado) con OpenRouter y devuelve
 * registros validados contra el texto del propio documento. El modelo propone; el texto decide.
 *  - Sin OPENROUTER_API_KEY: Error de nombre «SinLlave». Es un Error común a propósito: la fuente respondió bien,
 *    así que no es FalloFuente; el motor lo cuenta como falla del lector (rojo, cursor quieto) con el motivo dicho.
 *  - Red, timeout, 429 y 5xx de OpenRouter: TodaviaNo, el motor reintenta en la próxima corrida.
 *  - Tope de gasto diario: TopeDeGasto, subclase de TodaviaNo: no llama y al día siguiente vuelve a leer solo.
 *  - Fecha que no está en el texto: nula con motivo. Título que no está en el texto: se marca.
 *  - PDF: va como archivo y OpenRouter lo pasa a texto (motor `cloudflare-ai` por defecto) para que ese texto
 *    vuelva en las anotaciones y se pueda validar. Con `native` no vuelve texto: pasa `texto` o las fechas quedan nulas.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TodaviaNo } from './errores.mjs';
import { fecha as normalizarFecha } from './fecha.mjs';
import { causaDeRed } from './traer.mjs';

export const MODELO_POR_DEFECTO = 'google/gemini-2.5-flash';
export const MOTOR_PDF_POR_DEFECTO = 'cloudflare-ai';
export const TOPE_TEXTO = 100_000; // caracteres de texto/HTML que se mandan al modelo; lo demás se declara incompleto
const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const ESPERA_MS = 120_000;

export class TopeDeGasto extends TodaviaNo {
  constructor(mensaje) { super(mensaje); this.name = 'TopeDeGasto'; }
}

const error = (name, mensaje) => Object.assign(new Error(mensaje), { name });

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Para comparar: sin acentos, sin guiones (los cortes de línea «dispo-\nsición»), solo letras y números. */
export const normalizar = (s) => sinAcentos(String(s ?? '')).replace(/[-‐-–]\s*/g, '').replace(/[^a-z0-9ñ]+/g, ' ').trim();

const COMBINA = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧' };
const ENTIDADES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", laquo: '«', raquo: '»', ordm: 'º', ordf: 'ª', ndash: '-', mdash: '-' };
export function limpiarHtml(h) {
  return h
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|article|section|header|footer|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&([a-z])(acute|grave|circ|tilde|uml|cedil);/gi, (_, l, t) => (l + COMBINA[t.toLowerCase()]).normalize('NFC'))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
    .replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/** Todas las fechas que aparecen escritas en el texto, en AAAA-MM-DD. Las numéricas ambiguas cuentan en los dos órdenes. */
export function fechasEnTexto(texto, hoy = new Date()) {
  const s = sinAcentos(texto).replace(/\s+/g, ' ');
  const out = new Set();
  const sumar = (v, o) => { const f = normalizarFecha(v, { hoy, ...o }); if (f) out.add(f); };
  for (const m of s.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) sumar(m[0]);
  for (const m of s.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) { sumar(m[0]); sumar(m[0], { orden: 'mda' }); }
  for (const m of s.matchAll(/\b(\d{1,2})\s*[º°]?\s+(?:de\s+)?([a-z]+)\.?,?\s+(?:de\s+|del\s+)?(\d{4})\b/g)) sumar(`${m[1]} de ${m[2]} de ${m[3]}`);
  for (const m of s.matchAll(/\b([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) sumar(`${m[1]} ${m[2]}, ${m[3]}`);
  return out;
}

function tituloEnTexto(titulo, textoNorm) {
  const t = normalizar(titulo);
  if (!t) return false;
  if (textoNorm.includes(t)) return true;
  const palabras = t.split(' ').filter((p) => p.length >= 3);
  if (!palabras.length) return false;
  const hay = new Set(textoNorm.split(' '));
  return palabras.filter((p) => hay.has(p)).length / palabras.length >= 0.9;
}

/** El gasto del día vive en <proyecto>/gasto/<AAAA-MM-DD>.json; nunca guarda la llave. */
function libroDeGasto(env, dia) {
  const ruta = join(resolve(env.ACOMETIDA_DIR ?? 'acometida'), 'gasto', `${dia}.json`);
  const leer = () => {
    let crudo;
    try { crudo = readFileSync(ruta, 'utf8'); } catch (e) {
      if (e.code === 'ENOENT') return { dia, usd: 0, llamadas: 0, sin_costo: 0 };
      throw e;
    }
    try { return JSON.parse(crudo); } catch { throw error('GastoIlegible', `${ruta} no es JSON: no se llama al modelo sin saber cuánto se gastó hoy`); }
  };
  const sumar = (usd) => {
    const g = leer();
    g.llamadas += 1;
    if (typeof usd === 'number' && Number.isFinite(usd)) g.usd = Math.round((g.usd + usd) * 1e8) / 1e8;
    else g.sin_costo += 1;
    mkdirSync(join(ruta, '..'), { recursive: true });
    writeFileSync(`${ruta}.tmp`, JSON.stringify(g, null, 2) + '\n');
    renameSync(`${ruta}.tmp`, ruta);
    return g;
  };
  return { ruta, leer, sumar };
}

const esPdf = (bytes, contentType) => /pdf/i.test(contentType ?? '') || (bytes && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-');
const esHtml = (texto, contentType) => /html|xml/i.test(contentType ?? '') || /^\s*<(!doctype|html|body|div|article|section|table|p)\b/i.test(texto.slice(0, 200));

function esquema(campos) {
  const datos = Object.fromEntries(Object.entries(campos).map(([k, d]) => [k, { type: 'string', description: String(d) }]));
  return {
    type: 'object', additionalProperties: false, required: ['registros'],
    properties: {
      registros: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['titulo', 'fecha', 'texto', 'datos'],
          properties: {
            titulo: { type: 'string', description: 'título copiado tal cual del documento' },
            fecha: { type: 'string', description: 'fecha copiada tal como está escrita en el documento; cadena vacía si no está' },
            texto: { type: 'string', description: 'el texto del registro copiado del documento, hasta 2000 caracteres' },
            datos: { type: 'object', additionalProperties: false, required: Object.keys(campos), properties: datos },
          },
        },
      },
    },
  };
}

const SISTEMA = 'Lees documentos y extraes registros. Copias solo lo que está escrito en el documento, sin completar ni deducir. '
  + 'Si un dato no está, devuelves cadena vacía. Las fechas van tal como están escritas en el documento. '
  + 'Respondes solo con JSON: {"registros":[{"titulo","fecha","texto","datos":{...}}]}.';

function contenidoDe(json) {
  const c = json?.choices?.[0]?.message?.content;
  const s = Array.isArray(c) ? c.map((p) => p?.text ?? '').join('') : c;
  if (typeof s !== 'string' || !s.trim()) throw error('RespuestaInvalida', 'el modelo no devolvió contenido');
  const limpio = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(limpio); } catch {
    const i = limpio.indexOf('{'), j = limpio.lastIndexOf('}');
    try { return JSON.parse(limpio.slice(i, j + 1)); } catch { throw error('RespuestaInvalida', 'el modelo no devolvió JSON válido'); }
  }
}

/** Texto que OpenRouter sacó del PDF (anotaciones de tipo file), si vino. */
const textoDeAnotaciones = (json) => (json?.choices?.[0]?.message?.annotations ?? [])
  .filter((a) => a?.type === 'file')
  .flatMap((a) => a.file?.content ?? [])
  .filter((p) => p?.type === 'text').map((p) => p.text).join('\n');

/**
 * @param {{ bytes?: Uint8Array|Buffer, texto?: string, contentType?: string, campos: Record<string,string>, instrucciones?: string, url?: string }} args
 *   `campos`: nombre → descripción; si uno se llama `clave`, su valor es la clave del registro.
 *   Con `bytes` de PDF, `texto` opcional es el texto para validar (si el conector ya lo tiene).
 * @param {{ env?: object, fuente: string, fetchImpl?: typeof fetch, ahora?: Date }} deps
 * @returns {Promise<Array<{ clave?: string, titulo: string|null, texto: string|null, fecha: string|null, url: string|null, datos: object, leidoCon: string }>>}
 */
export async function leerConModelo(args, deps) {
  const env = deps.env ?? process.env;
  const llave = env.OPENROUTER_API_KEY;
  if (!llave) throw error('SinLlave', 'falta OPENROUTER_API_KEY; el resto de Acometida corre sin ella');
  const campos = args.campos ?? {};
  if (typeof campos !== 'object' || Array.isArray(campos)) throw new Error('`campos` es un objeto nombre → descripción');
  const modelo = env.ACOMETIDA_MODELO || MODELO_POR_DEFECTO;
  const ahora = deps.ahora ?? new Date();
  const fetchImpl = deps.fetchImpl ?? fetch;

  const tope = Number(env.ACOMETIDA_TOPE_USD_DIA ?? 1);
  if (!Number.isFinite(tope) || tope < 0) throw new Error(`ACOMETIDA_TOPE_USD_DIA no es un número: ${env.ACOMETIDA_TOPE_USD_DIA}`);
  const gasto = libroDeGasto(env, ahora.toISOString().slice(0, 10));
  const hoy = gasto.leer();
  if (hoy.usd >= tope) throw new TopeDeGasto(`tope de gasto del día alcanzado (${hoy.usd} de ${tope} USD); vuelve mañana o sube ACOMETIDA_TOPE_USD_DIA`);

  const bytes = args.bytes == null ? null : typeof args.bytes === 'string' ? Buffer.from(args.bytes, 'utf8') : Buffer.from(args.bytes);
  const pdf = bytes && esPdf(bytes, args.contentType);
  let textoDoc = args.texto ?? (bytes && !pdf ? bytes.toString('utf8') : '');
  if (textoDoc && esHtml(textoDoc, pdf ? '' : args.contentType)) textoDoc = limpiarHtml(textoDoc);

  const motivosComunes = [];
  let incompleto = false;
  const pedido = `Campos de "datos":\n${Object.entries(campos).map(([k, d]) => `- ${k}: ${d}`).join('\n') || '(ninguno)'}`
    + (args.instrucciones ? `\n\nInstrucciones de la fuente:\n${args.instrucciones}` : '');
  const partes = [{ type: 'text', text: pedido }];
  const cuerpo = {
    model: modelo, temperature: 0, max_tokens: 8000,
    response_format: { type: 'json_schema', json_schema: { name: 'registros', strict: true, schema: esquema(campos) } },
  };
  if (pdf) {
    partes.push({ type: 'file', file: { filename: String(args.url ?? '').split(/[?#]/)[0].split('/').pop() || 'documento.pdf', file_data: `data:application/pdf;base64,${bytes.toString('base64')}` } });
    cuerpo.plugins = [{ id: 'file-parser', pdf: { engine: env.ACOMETIDA_PDF_MOTOR || MOTOR_PDF_POR_DEFECTO } }];
  } else {
    if (!textoDoc.trim()) throw new Error('documento vacío: no hay texto que leer');
    let enviado = textoDoc;
    if (enviado.length > TOPE_TEXTO) {
      enviado = enviado.slice(0, TOPE_TEXTO);
      incompleto = true;
      motivosComunes.push(`texto recortado a ${TOPE_TEXTO} de ${textoDoc.length} caracteres`);
    }
    partes.push({ type: 'text', text: `Documento:\n${enviado}` });
  }
  cuerpo.messages = [{ role: 'system', content: SISTEMA }, { role: 'user', content: partes }];

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ESPERA_MS);
  let r;
  try {
    r = await fetchImpl(URL_OPENROUTER, {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json', 'X-Title': 'Acometida' },
      body: JSON.stringify(cuerpo),
    });
  } catch (e) {
    throw new TodaviaNo(e?.name === 'AbortError' ? 'OpenRouter: timeout' : `OpenRouter: red (${causaDeRed(e)})`);
  } finally { clearTimeout(t); }

  if (r.status === 408 || r.status === 429 || r.status >= 500) {
    await r.body?.cancel().catch(() => {});
    throw new TodaviaNo(`OpenRouter: HTTP ${r.status}`, r.status);
  }
  let json;
  try { json = await r.json(); } catch { json = null; }
  if (r.status >= 400) {
    const m = String(json?.error?.message ?? '').slice(0, 200);
    throw error('ErrorDelModelo', `OpenRouter: HTTP ${r.status}${r.status === 402 ? ' (sin crédito)' : ''}${m ? `: ${m}` : ''}`);
  }
  gasto.sumar(json?.usage?.cost);
  if (json?.error) {
    const code = Number(json.error.code);
    const m = `OpenRouter: ${String(json.error.message ?? 'error').slice(0, 200)}`;
    if (code === 429 || code >= 500) throw new TodaviaNo(m, code);
    throw error('ErrorDelModelo', m);
  }

  const salida = contenidoDe(json);
  if (!Array.isArray(salida?.registros)) throw error('RespuestaInvalida', 'el modelo no devolvió una lista de registros');
  if (pdf && !args.texto) textoDoc = textoDeAnotaciones(json);
  const textoNorm = normalizar(textoDoc);
  const compacto = textoNorm.replace(/ /g, '');
  const fechas = textoDoc ? fechasEnTexto(textoDoc, ahora) : new Set();
  const leidoCon = `${deps.fuente}+${modelo}`;
  const nulo = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  return salida.registros.map((x) => {
    const motivos = [...motivosComunes];
    const datos = {};
    for (const k of Object.keys(campos)) {
      const v = nulo(x?.datos?.[k]);
      datos[k] = v;
      if (v && /\d/.test(v) && v.length <= 80 && textoNorm && !compacto.includes(normalizar(v).replace(/ /g, ''))) motivos.push(`${k} no está en el documento`);
    }
    const titulo = nulo(x?.titulo);
    if (titulo && !textoNorm) motivos.push('sin texto del documento para validar el título');
    else if (titulo && !tituloEnTexto(titulo, textoNorm)) motivos.push('título no está en el documento');

    let f = null;
    const fechaDicha = nulo(x?.fecha);
    if (fechaDicha) {
      const iso = normalizarFecha(fechaDicha, { hoy: ahora });
      if (!iso) motivos.push(`fecha ilegible: «${fechaDicha.slice(0, 40)}»`);
      else if (!textoDoc) motivos.push('sin texto del documento para validar la fecha');
      else if (!fechas.has(iso)) motivos.push('fecha no está en el documento');
      else f = iso;
    }
    const reg = { titulo, texto: nulo(x?.texto), fecha: f, url: args.url ?? null, datos: { ...datos, motivos }, leidoCon };
    if (incompleto) reg.datos.incompleto = true;
    if (datos.clave) reg.clave = datos.clave;
    return reg;
  });
}
