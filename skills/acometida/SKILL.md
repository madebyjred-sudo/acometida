---
name: acometida
description: Use when turning any online source (an official bulletin, a law or rules site, a portal with a search box, a PDF that keeps updating) into a connector a chat can query and cite with the real date of the data. Probes the link, writes the connector, keeps a local copy fresh and serves it over MCP.
---

# acometida

Convierte un link en una fuente que tu chat consulta y cita: con su origen, la fecha real de cada dato y lo que
cubre la copia. Una acometida es el tramo que une la red de la calle con tu edificio; aquí, la fuente con tu chat.

Si `acometida` no está en el PATH: clona el repo, `cd acometida && npm link` (Node 22.13 o más; sin dependencias
salvo `undici` si una fuente sale por proxy). Todo vive en una carpeta del proyecto, por defecto `./acometida`:
`fuentes/<nombre>.mjs` (un conector por fuente), `acometida.db` (SQLite), `crudo/` (lo bajado, con su hash).

```
acometida nuevo <url>       sondea el link y escribe la ficha de la fuente
acometida correr [fuente]   trae lo nuevo, lo guarda y dice verde, amarillo o rojo con motivo
acometida estado            el medidor; sale con 2 si algo está viejo, rojo o sin medir
acometida servir            MCP: cada fuente es una herramienta para tu chat
acometida instalar          lo programa (--hora 06:00 o --cada 6h; --quitar)
```

## La regla: el conector no miente
- **Nunca fechar con «ahora».** La fecha sale del documento o queda nula y se cuenta. «Ahora» concentra todo lo que
  no tiene fecha en el día que más se mira y fabrica un pico.
- **Verde exige prueba.** Filas nuevas, o una respuesta de la fuente que diga que no publicó (el día sin boletín, el
  `count: 0`), o haber releído y encontrado solo lo guardado. Una corrida vacía sin prueba es amarilla.
- **Un 5xx no es «vacío».** Es «todavía no»: vuelve en la próxima y el cursor no pasa por encima.
- **Lo no medido dice «sin medir».** El medidor no da verde por defecto.
- **Los umbrales salen de la fuente.** Con 14 fechas de publicación o más, el umbral de silencio queda sobre su mayor
  hueco real; antes de eso, «sin medir».
- **El chat dice de dónde y de cuándo.** «Copia guardada, datos al…» o «consulta en vivo»; un vacío es «no consta
  en lo cargado», nunca «no existe».

## El método, en orden
1. **Sondear.** `acometida nuevo <url>`. Lee el informe `fuentes/<nombre>.md` entero: tipo de fuente, cabeceras que
   pide, si cambia con UA de navegador, certificado, país de salida y lo que quedó «sin medir». No escribas el lector
   antes de leerlo.
2. **Elegir la entrada más estable** (de mejor a peor): API pública → feed RSS/Atom → sitemap → la API interna que usa
   la propia página (XHR) → formulario con estado (ASP.NET WebForms) → HTML → PDF con modelo. Detalle por tipo en
   `references/tipos-de-fuente.md`.
3. **Medir qué es una fila y si el pasado crece.** Baja un día y el rango completo: si la suma de días no da el rango,
   la fila no es lo que crees. Vuelve a contar la misma semana días después: si los días viejos siguen creciendo, el
   conector relee una ventana móvil en cada corrida y versiona por contenido; un cursor por fecha perdería lo tardío.
4. **La ficha.** `fuente`, `nombre`, `cuandoUsar` y `cuandoNo` (el chat elige la herramienta por esas dos frases),
   `acceso` (salida, UA, cabeceras, ritmo prudente), `frescura.cadaHoras`, y un **canario**: un documento real
   conocido y los campos que el lector tiene que sacar llenos.
5. **`descubrir(cursor, ctx)`.** Devuelve pendientes en orden, cada uno con el cursor que valdría si él y los
   anteriores quedan guardados. El día de hoy va sin cursor (si aún no salió, se pide de nuevo). La primera vez,
   rellena hacia atrás lo suficiente para medir (30 días en un boletín diario).
6. **`leer(crudo, ctx, pendiente)`.** Puro, probado con el crudo real guardado como fixture. Clave natural de la
   fuente, nunca el id interno de una fila del sitio. Fecha de la fuente o nula. Nada de truncar en silencio: si un
   documento no entra, se parte o se marca incompleto. Un número suelto no es una ley ni un expediente sin su rótulo.
7. **`traer` solo si hace falta.** Por defecto el motor baja `pendiente.url`. Escríbelo cuando la fuente responde algo
   que significa «no hubo» (un 404 de un día sin boletín) o necesita POST o sesión.
8. **`enVivo(args, ctx)` solo si la fuente tiene buscador** y responde en segundos. Se usa cuando la copia no alcanza.
9. **Probar.** Test con el fixture real; `acometida correr <fuente>` dos veces (la segunda debe salir verde por
   relectura); altera el fixture del canario y confirma que falla.
10. **Servir.** `claude mcp add acometida -- acometida servir --dir <carpeta>` (o el equivalente de tu cliente MCP).
    Haz 3 a 5 preguntas reales por fuente, variando fecha, clave y forma de preguntar: cada respuesta debe traer
    enlace, fecha del dato y origen. Una pregunta fuera de la cobertura debe decir «no consta en lo cargado».
11. **Instalar.** `acometida instalar --hora 06:00`. Mañana revisa `acometida estado`: lo manual de una vez no cuenta.

## Cuando algo sale amarillo o rojo
| Señal | Qué es | Qué hacer |
|---|---|---|
| `todavía no` (5xx, 429, timeout, red) | la fuente no respondió | nada: vuelve sola; si dura días, revisa ritmo y salida |
| falla de la fuente (4xx, HTML por archivo, certificado) | respondió mal | lee el crudo; nunca apagues la verificación TLS |
| lector en rojo o canario que falla | cambió la forma del sitio | sondea otra vez, guarda un fixture nuevo, arregla `leer`, sube `leidoCon` |
| sin filas y sin prueba | no se sabe si publicó | haz que `descubrir` o `leer` llamen `ctx.probarSinPublicaciones` con la respuesta real |
| la fuente calla más que su mayor hueco | se secó o cambió de lugar | compara con el sitio a mano antes de tocar nada |
| salida por país sin proxy | la fuente bloquea afuera | `references/salida-por-pais.md` |

## Documentos sin estructura
`ctx.leerConModelo({ bytes, contentType, campos })` lee un PDF o un HTML desordenado con tu llave de OpenRouter
(`OPENROUTER_API_KEY`; modelo en `ACOMETIDA_MODELO`; tope diario en `ACOMETIDA_TOPE_USD_DIA`). Valida que cada fecha
esté en el documento y anota el modelo en `leido_con` para poder releer el crudo con otro.

## Casos
`casos/` trae conectores completos para copiar a `fuentes/`: BOE (España, sumario diario por API), Federal Register
(EE. UU., API con buscador en vivo), legislation.gov.uk (feed Atom) y Ley Chile. Cada uno con su fixture y su canario.

## Guía de lectura por fuente
Cuando un experto del tema use la fuente, pídele la guía de lectura (`references/guia-de-lectura.md`): qué significa
cada campo, qué está siempre atrasado, qué nombre usa la gente para las cosas. Va en `fuentes/<nombre>.md` y alimenta
`cuandoUsar` y `cuandoNo`.
