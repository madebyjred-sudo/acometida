/**
 * Programa `acometida correr` a la hora que digas: launchd en macOS, cron en Linux, Programador de tareas en Windows.
 * Un solo trabajo por carpeta de proyecto. El candado por fuente evita que dos corridas se pisen.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = resolve(fileURLToPath(new URL('../bin/acometida.mjs', import.meta.url)));

export function etiquetaDe(carpeta) {
  return `com.acometida.${createHash('sha256').update(carpeta).digest('hex').slice(0, 10)}`;
}

/** «06:00» → { h: 6, m: 0 }; «6h» → { cadaSeg: 21600 }. */
export function leerHorario(hora = '06:00', cada) {
  if (cada) {
    const m = /^(\d+)\s*(h|m)$/.exec(String(cada).trim());
    if (!m) throw new Error('--cada va como 6h o 30m');
    const seg = Number(m[1]) * (m[2] === 'h' ? 3600 : 60);
    if (seg < 300) throw new Error('--cada mínimo 5m');
    return { cadaSeg: seg };
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora).trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('--hora va como 06:00');
  return { h: Number(m[1]), m: Number(m[2]) };
}

export function plistDe({ etiqueta, carpeta, horario, node = process.execPath }) {
  const prog = [node, '--no-warnings', BIN, 'correr', '--dir', carpeta].map((a) => `    <string>${a}</string>`).join('\n');
  const cuando = horario.cadaSeg
    ? `  <key>StartInterval</key><integer>${horario.cadaSeg}</integer>`
    : `  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>${horario.h}</integer><key>Minute</key><integer>${horario.m}</integer></dict>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${etiqueta}</string>
  <key>ProgramArguments</key><array>
${prog}
  </array>
${cuando}
  <key>WorkingDirectory</key><string>${carpeta}</string>
  <key>StandardOutPath</key><string>${join(carpeta, 'correr.log')}</string>
  <key>StandardErrorPath</key><string>${join(carpeta, 'correr.log')}</string>
</dict></plist>
`;
}

export function lineaCron({ carpeta, horario, node = process.execPath }) {
  const cuando = horario.cadaSeg
    ? (horario.cadaSeg % 3600 === 0 ? `0 */${horario.cadaSeg / 3600} * * *` : `*/${Math.round(horario.cadaSeg / 60)} * * * *`)
    : `${horario.m} ${horario.h} * * *`;
  return `${cuando} ${node} --no-warnings ${BIN} correr --dir ${carpeta} >> ${join(carpeta, 'correr.log')} 2>&1 # acometida ${carpeta}`;
}

/**
 * @param {{ carpeta: string, hora?: string, cada?: string, quitar?: boolean, seco?: boolean, plataforma?: string }} o
 * @returns {{ plataforma: string, hecho: string, detalle: string }}
 */
export function instalar(o) {
  const carpeta = resolve(o.carpeta);
  const plataforma = o.plataforma ?? process.platform;
  const etiqueta = etiquetaDe(carpeta);
  const horario = o.quitar ? null : leerHorario(o.hora, o.cada);

  if (plataforma === 'darwin') {
    const ruta = join(homedir(), 'Library', 'LaunchAgents', `${etiqueta}.plist`);
    const dominio = `gui/${process.getuid()}`;
    if (o.seco) return { plataforma, hecho: 'seco', detalle: o.quitar ? `quitaría ${ruta}` : `${ruta}\n${plistDe({ etiqueta, carpeta, horario })}` };
    if (existsSync(ruta)) { try { execFileSync('launchctl', ['bootout', `${dominio}/${etiqueta}`], { stdio: 'ignore' }); } catch {} }
    if (o.quitar) { rmSync(ruta, { force: true }); return { plataforma, hecho: 'quitado', detalle: ruta }; }
    mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
    writeFileSync(ruta, plistDe({ etiqueta, carpeta, horario }));
    execFileSync('launchctl', ['bootstrap', dominio, ruta]);
    return { plataforma, hecho: 'instalado', detalle: ruta };
  }

  if (plataforma === 'win32') {
    const tarea = `acometida-${etiqueta.slice(-10)}`;
    const args = o.quitar
      ? ['/Delete', '/TN', tarea, '/F']
      : ['/Create', '/F', '/TN', tarea, '/TR', `"${process.execPath}" --no-warnings "${BIN}" correr --dir "${carpeta}"`,
        ...(horario.cadaSeg ? ['/SC', 'MINUTE', '/MO', String(Math.round(horario.cadaSeg / 60))] : ['/SC', 'DAILY', '/ST', `${String(horario.h).padStart(2, '0')}:${String(horario.m).padStart(2, '0')}`])];
    if (o.seco) return { plataforma, hecho: 'seco', detalle: `schtasks ${args.join(' ')}` };
    execFileSync('schtasks', args, { stdio: 'inherit' });
    return { plataforma, hecho: o.quitar ? 'quitado' : 'instalado', detalle: tarea };
  }

  // Linux y demás: cron del usuario. Reemplaza la línea de esta carpeta, no toca las otras.
  const marca = `# acometida ${carpeta}`;
  let actual = '';
  try { actual = execFileSync('crontab', ['-l'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch {}
  const otras = actual.split('\n').filter((l) => l && !l.endsWith(marca));
  const nueva = o.quitar ? otras : [...otras, lineaCron({ carpeta, horario })];
  if (o.seco) return { plataforma, hecho: 'seco', detalle: o.quitar ? `quitaría: ${marca}` : nueva[nueva.length - 1] };
  execFileSync('crontab', ['-'], { input: `${nueva.join('\n')}\n` });
  return { plataforma, hecho: o.quitar ? 'quitado' : 'instalado', detalle: o.quitar ? marca : nueva[nueva.length - 1] };
}
