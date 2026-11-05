/**
 * BOE · Boletín Oficial del Estado (España), sumario diario por la API de datos abiertos.
 * Medido el 4-nov-2026: sin `Accept` responde 400; con `Accept: application/json`, 200.
 * Un día sin BOE (domingo) responde 404 «La información solicitada no existe»: para un día pasado eso
 * prueba que no hubo publicación; para hoy es «todavía no».
 */
const API = 'https://www.boe.es/datosabiertos/api/boe/sumario';
const ZONA = 'Europe/Madrid';
const RELLENO_DIAS = 30;

const lista = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

export default {
  fuente: 'boe',
  nombre: 'BOE · Boletín Oficial del Estado (España), sumario diario',
  leidoCon: 'boe@1',
  cuandoUsar: 'leyes, reales decretos, órdenes, resoluciones, nombramientos, oposiciones y anuncios publicados en el BOE de España',
  cuandoNo: 'normas de otros países, boletines autonómicos ni el texto consolidado vigente de una ley',
  acceso: { salida: 'directa', cabeceras: { Accept: 'application/json' }, ritmo: { porMinuto: 20 } },
  frescura: { cadaHoras: 24 },
  canario: { pendiente: { id: '20261103', url: `${API}/20261103`, meta: { dia: '2026-11-03', pasado: true } }, campos: ['clave', 'titulo', 'fecha', 'url'], minRegistros: 50 },

  async *descubrir(cursor, ctx) {
    const { diaEn, diasEntre, sumarDias } = ctx.ayudas;
    const hoy = diaEn(ZONA, ctx.ahora);
    const desde = cursor?.dia ? sumarDias(cursor.dia, 1) : sumarDias(hoy, -RELLENO_DIAS);
    for (const dia of diasEntre(desde, hoy)) {
      const pasado = dia < hoy;
      // hoy no mueve el cursor: si todavía no salió, se vuelve a pedir en la próxima corrida
      yield { id: dia, url: `${API}/${dia.replaceAll('-', '')}`, cursor: pasado ? { dia } : undefined, meta: { dia, pasado } };
    }
  },

  async traer(p, ctx) {
    try {
      return await ctx.traer(p.url, { esperado: 'json' });
    } catch (e) {
      if (e.status !== 404) throw e;
      if (!p.meta.pasado) throw new ctx.errores.TodaviaNo(`BOE del ${p.meta.dia} todavía no publicado`, 404);
      return { bytes: '', url: p.url, sinBoletin: true };
    }
  },

  leer(crudo, ctx, p) {
    if (crudo.sinBoletin) { ctx.probarSinPublicaciones(`el BOE respondió que no hubo sumario el ${p.meta.dia}`); return []; }
    const s = JSON.parse(crudo.texto()).data.sumario;
    const f = s.metadatos.fecha_publicacion; // AAAAMMDD
    const out = [];
    for (const diario of lista(s.diario)) {
      for (const sec of lista(diario.seccion)) {
        for (const dep of lista(sec.departamento)) {
          const grupos = [...lista(dep.epigrafe).map((e) => ({ epigrafe: e.nombre, items: lista(e.item) })), { epigrafe: null, items: lista(dep.item) }];
          for (const g of grupos) {
            for (const it of g.items) {
              out.push({
                clave: it.identificador,
                titulo: it.titulo,
                fecha: f,
                url: it.url_html ?? it.url_pdf?.texto,
                texto: [it.titulo, sec.nombre, dep.nombre, g.epigrafe].filter(Boolean).join(' · '),
                datos: { seccion: sec.codigo, departamento: dep.nombre, epigrafe: g.epigrafe, pdf: it.url_pdf?.texto ?? null, xml: it.url_xml ?? null, boletin: diario.numero },
              });
            }
          }
        }
      }
    }
    return out;
  },
};
