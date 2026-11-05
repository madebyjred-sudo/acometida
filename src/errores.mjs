/** 5xx, 429, timeout o red tras agotar reintentos: vuelve en la próxima corrida. Nunca es «vacío». */
export class TodaviaNo extends Error {
  constructor(mensaje, status = null) { super(mensaje); this.name = 'TodaviaNo'; this.status = status; }
}

/** La fuente respondió mal (4xx, HTML donde iba un archivo, certificado inválido). Tampoco se salta. */
export class FalloFuente extends Error {
  constructor(mensaje, status = null) { super(mensaje); this.name = 'FalloFuente'; this.status = status; }
}
