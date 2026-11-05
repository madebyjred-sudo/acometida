/**
 * Ley Chile (Biblioteca del Congreso Nacional), últimas leyes publicadas.
 * La página es una SPA: el HTML es el mismo cascarón para toda ruta y los datos llegan por XHR.
 * Medido el 4-nov-2026 leyendo su bundle: el servicio es `https://nuevo.leychile.cl/servicios`, y
 * `/portada/get_ultimas_leyes_publicadas?cantidad=N` responde 401 sin agente de navegador y 200 con él.
 * Es una ventana móvil (las últimas N): se relee entera en cada corrida y la clave es `idNorma`.
 */
const SERVICIO = 'https://nuevo.leychile.cl/servicios/portada/get_ultimas_leyes_publicadas';
const VENTANA = 100;

export default {
  fuente: 'ley_chile',
  nombre: 'Ley Chile · últimas leyes publicadas (Chile)',
  leidoCon: 'ley_chile@1',
  cuandoUsar: 'leyes de Chile publicadas en el último año: número, fecha de publicación, organismo y título',
  cuandoNo: 'decretos o reglamentos chilenos, el texto completo vigente de una ley, ni leyes de otros países',
  acceso: { salida: 'directa', uaNavegador: true, ritmo: { porMinuto: 10 } },
  frescura: { cadaHoras: 24 },
  canario: { pendiente: { id: 'ultimas', url: `${SERVICIO}?cantidad=5` }, campos: ['clave', 'titulo', 'fecha', 'url'], minRegistros: 5 },

  async *descubrir() {
    yield { id: 'ultimas', url: `${SERVICIO}?cantidad=${VENTANA}` };
  },

  async traer(p, ctx) {
    return ctx.traer(p.url, { esperado: 'json' });
  },

  leer(crudo) {
    return JSON.parse(crudo.texto()).map((n) => ({
      clave: n.idNorma,
      titulo: `${n.tipo_norma} ${n.nro_norma}: ${n.titulo_norma}`,
      fecha: n.fecha_publicacion, // DD-MM-AAAA
      url: `https://www.bcn.cl/leychile/navegar?idNorma=${n.idNorma}`,
      texto: [n.titulo_norma, n.identif_norma, n.organismo].filter(Boolean).join(' · '),
      datos: { tipo: n.tipo_norma, numero: n.nro_norma, organismo: n.organismo, historia: n.historia_ley ?? null },
    }));
  },
};
