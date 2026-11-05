/**
 * El fetch común. El conector nunca decide proxy, reintento ni ritmo: lo dice la ficha y lo hace esto.
 *  - 5xx, 429, timeout, red → reintento con espera creciente; agotado → TodaviaNo.
 *  - otro 4xx, certificado inválido, HTML donde iba un archivo → FalloFuente.
 *  - salida por país sin proxy configurado → FalloFuente del ítem. Nunca sale directo en silencio.
 */
import { FalloFuente, TodaviaNo } from './errores.mjs';

export const UA_NAVEGADOR = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
export const UA_ACOMETIDA = 'acometida/0.1 (+https://github.com/madebyjred-sudo/acometida)';

const ERRORES_TLS = /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/i;

/** El proxy de la ficha: `salida: 'mx'` lee ACOMETIDA_PROXY_MX. */
export function proxyDe(salida, env) {
  if (!salida || salida === 'directa') return null;
  return env[`ACOMETIDA_PROXY_${String(salida).toUpperCase()}`] || null;
}

export function pareceHtml(bytes) {
  const cab = Buffer.from(bytes.subarray(0, 512)).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
  return cab.startsWith('<!doctype html') || cab.startsWith('<html') || /^<\?xml[^>]*>\s*<html/.test(cab);
}

/** Causa legible de un error de fetch (undici esconde el código en `cause`). */
export function causaDeRed(err) {
  const c = err?.cause;
  return c?.code || c?.name || err?.code || err?.message || 'red';
}

const ultimoPedido = new Map();
async function respetarRitmo(fuente, porMinuto, dormir) {
  if (!porMinuto || porMinuto <= 0) return;
  const intervalo = 60_000 / porMinuto;
  const ahora = Date.now();
  const prox = (ultimoPedido.get(fuente) ?? 0) + intervalo;
  ultimoPedido.set(fuente, Math.max(ahora, prox));
  if (prox > ahora) await dormir(prox - ahora);
}

const despachadores = new Map();
async function despachadorDe(proxy, caIntermedios = []) {
  const k = proxy ? `p:${proxy}` : caIntermedios.length ? `ca:${caIntermedios.join('|')}` : null;
  if (!k) return undefined;
  if (!despachadores.has(k)) {
    const undici = await import('undici').catch(() => { throw new FalloFuente('la salida por proxy o con certificados intermedios necesita undici: npm install undici'); });
    if (proxy) despachadores.set(k, { dispatcher: new undici.ProxyAgent({ uri: proxy }), fetch: undici.fetch });
    else {
      const { rootCertificates } = await import('node:tls');
      // cadena incompleta del sitio: raíces + intermedios de la ficha; la verificación sigue activa
      despachadores.set(k, { dispatcher: new undici.Agent({ connect: { ca: [...rootCertificates, ...caIntermedios] } }), fetch: undici.fetch });
    }
  }
  return despachadores.get(k);
}

/**
 * @param {{ fuente: string, acceso?: object }} ficha
 * @param {{ env?: object, fetchImpl?: typeof fetch, dormir?: (ms:number)=>Promise<void>, retardoBaseMs?: number }} [deps]
 */
export function crearTraer(ficha, deps = {}) {
  const a = ficha.acceso ?? {};
  const env = deps.env ?? process.env;
  const dormir = deps.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const fetchImpl = deps.fetchImpl ?? fetch;
  const proxy = proxyDe(a.salida, env);
  const sinProxy = a.salida && a.salida !== 'directa' && !proxy;
  const avisos = sinProxy ? [`la fuente sale por ${a.salida} y no hay ACOMETIDA_PROXY_${String(a.salida).toUpperCase()}: cada ítem falla, no se sale directo`] : [];
  const intentos = a.intentos ?? 3;
  const base = deps.retardoBaseMs ?? 2_000;

  async function traer(url, o = {}) {
    const etiqueta = `${o.method ?? 'GET'} ${url}`;
    if (sinProxy) throw new FalloFuente(`${etiqueta}: sin proxy de salida por ${a.salida}`);
    const desp = await despachadorDe(proxy, a.caIntermedios);
    // con proxy o certificados propios se usa el fetch de undici: su despachador no cruza versiones con el fetch global
    const pedir = desp && !deps.fetchImpl ? desp.fetch : fetchImpl;
    let ultimo;
    for (let n = 0; n < intentos; n++) {
      if (n > 0) await dormir(base * 2 ** (n - 1));
      await respetarRitmo(ficha.fuente, a.ritmo?.porMinuto ?? 30, dormir);
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), a.timeoutMs ?? 30_000);
      try {
        const init = {
          method: o.method ?? 'GET',
          headers: { 'User-Agent': a.uaNavegador ? UA_NAVEGADOR : UA_ACOMETIDA, ...(a.cabeceras ?? {}), ...(o.headers ?? {}) },
          body: o.body,
          signal: ctl.signal,
          redirect: 'follow',
        };
        if (desp) init.dispatcher = desp.dispatcher;
        const r = await pedir(url, init);
        if (r.status === 429 || r.status >= 500) {
          await r.body?.cancel().catch(() => {});
          ultimo = new TodaviaNo(`${etiqueta}: HTTP ${r.status}`, r.status);
          continue;
        }
        if (r.status >= 400) {
          await r.body?.cancel().catch(() => {});
          throw new FalloFuente(`${etiqueta}: HTTP ${r.status}`, r.status);
        }
        const bytes = new Uint8Array(await r.arrayBuffer());
        const contentType = r.headers.get('content-type') ?? '';
        const esperado = o.esperado ?? 'cualquiera';
        if (esperado === 'archivo' && (pareceHtml(bytes) || /text\/html/i.test(contentType))) {
          throw new FalloFuente(`${etiqueta}: llegó HTML donde se esperaba un archivo`, r.status);
        }
        return { status: r.status, url: r.url || url, contentType, bytes, texto: () => Buffer.from(bytes).toString('utf8') };
      } catch (e) {
        if (e instanceof FalloFuente) throw e;
        if (e?.name === 'AbortError') { ultimo = new TodaviaNo(`${etiqueta}: timeout`); continue; }
        const causa = causaDeRed(e);
        if (ERRORES_TLS.test(causa)) throw new FalloFuente(`${etiqueta}: certificado inválido (${causa}); no se apaga la verificación`);
        ultimo = new TodaviaNo(`${etiqueta}: red (${causa})`);
      } finally {
        clearTimeout(t);
      }
    }
    throw ultimo ?? new TodaviaNo(`${etiqueta}: sin respuesta`);
  }
  return { traer, avisos };
}
