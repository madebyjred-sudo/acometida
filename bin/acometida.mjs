#!/usr/bin/env node
// node:sqlite avisa que es experimental en cada arranque; ese aviso no le sirve a nadie aquí.
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.error(w.message); });

const AYUDA = `acometida nuevo <url>       sondea el link y escribe la ficha de la fuente
acometida correr [fuente]   trae lo nuevo, lo guarda y dice verde, amarillo o rojo con motivo
acometida estado            el medidor; sale con 2 si algo está viejo, rojo o sin medir
acometida servir            MCP: cada fuente es una herramienta para tu chat
acometida instalar          lo programa (--hora 06:00 o --cada 6h; --quitar)

opciones: --dir <carpeta> (por defecto ./acometida)`;

function leerArgs(argv) {
  const pos = [], op = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) op[k] = true; else { op[k] = v; i++; }
    } else pos.push(a);
  }
  return { pos, op };
}

const COLOR = { verde: 32, amarillo: 33, rojo: 31, 'sin medir': 90 };
const pintar = (s) => (process.stdout.isTTY ? `\x1b[${COLOR[s] ?? 0}m${s}\x1b[0m` : s);

async function main() {
  const [cmd, ...resto] = process.argv.slice(2);
  const { pos, op } = leerArgs(resto);

  if (!cmd || cmd === 'ayuda' || cmd === '--help' || cmd === '-h') { console.log(AYUDA); return 0; }

  if (cmd === 'nuevo') {
    if (!pos[0]) { console.error('falta la url: acometida nuevo <url>'); return 1; }
    const { nuevo } = await import('../src/sonda.mjs');
    const { carpetaDe } = await import('../src/proyecto.mjs');
    await nuevo(pos[0], { dir: carpetaDe(op.dir), nombre: op.nombre, proxy: op.proxy });
    return 0;
  }

  if (cmd === 'instalar') {
    const { instalar } = await import('../src/instalar.mjs');
    const { carpetaDe } = await import('../src/proyecto.mjs');
    const r = instalar({ carpeta: carpetaDe(op.dir), hora: op.hora, cada: op.cada, quitar: !!op.quitar, seco: !!op.seco });
    console.log(`${r.hecho} (${r.plataforma}): ${r.detalle}`);
    return 0;
  }

  const { abrirProyecto } = await import('../src/proyecto.mjs');
  const p = await abrirProyecto(op.dir);

  if (cmd === 'servir') {
    const { servir } = await import('../src/servir.mjs');
    servir(p);
    return null; // queda escuchando
  }

  if (!p.fuentes.length) { console.error(`no hay fuentes en ${p.carpeta}/fuentes: empieza con acometida nuevo <url>`); return 1; }

  if (cmd === 'correr') {
    const { correrCanario, correrConector } = await import('../src/motor.mjs');
    const { tomarCandado } = await import('../src/candado.mjs');
    const tope = Number(op.tope ?? 60);
    setTimeout(() => { console.error(`tope de ${tope} min alcanzado: se corta`); process.exit(3); }, tope * 60_000).unref();
    const elegidas = pos[0] ? p.fuentes.filter((c) => c.fuente === pos[0]) : p.fuentes;
    if (!elegidas.length) { console.error(`no existe la fuente ${pos[0]}`); return 1; }
    let peor = 0;
    for (const c of elegidas) {
      const candado = tomarCandado(p.carpeta, c.fuente);
      if (!candado) { console.log(`${c.fuente}: otra corrida en curso, se salta`); continue; }
      try {
        const r = await correrConector(c, { base: p.base, almacen: p.almacen });
        const can = await correrCanario(c, { base: p.base });
        console.log(`${c.fuente}: ${pintar(r.semaforo)} · ${r.motivo}\n  canario: ${can.ok ? 'forma bien' : can.motivo}`);
        if (r.semaforo === 'rojo' || !can.ok) peor = 2;
      } finally { candado.soltar(); }
    }
    return peor;
  }

  if (cmd === 'estado') {
    const { estadoFuente } = await import('../src/vigia.mjs');
    const estados = p.fuentes.map((c) => estadoFuente(p.base, c));
    if (op.json) console.log(JSON.stringify(estados, null, 2));
    else for (const e of estados) console.log(`${e.fuente}: ${pintar(e.semaforo)} · datos al ${e.datosAl?.slice(0, 16).replace('T', ' ') ?? 'sin corrida verde'}\n  ${e.lineas.join('\n  ')}`);
    return estados.every((e) => e.semaforo === 'verde') ? 0 : 2;
  }

  console.error(`no conozco «${cmd}»\n\n${AYUDA}`);
  return 1;
}

main().then((c) => { if (c !== null) process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
