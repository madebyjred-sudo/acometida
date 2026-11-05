# Cierre C1

Fecha: 5 de noviembre de 2026. Rama: `main`.

## Resultado

Quedó lista la versión local para que la dirección publique. No se hizo push, deploy, DNS, SSH ni `npm publish`.

- S1/A1: la sonda cuenta los 240 ítems del sumario del BOE, con prueba.
- A2/L1: volante y llave ASCII, confirmación y cifras destacadas, morph ES/EN, contraste AA, diez gates y capturas nuevas.
- A3: el lector fue medido con el modelo pedido. Identificador y fecha llegan a 100%; título llega a 10%, por lo que no cumple el criterio de 90% por campo.
- P1: el exportador crea una copia pública de 202 archivos versionados, rechaza destinos existentes y bloquea términos y llaves prohibidas. La copia instala, pasa 73 pruebas y compila el sitio.
- P2: README, clonación, prompt de instalación y enlaces de idioma usan las rutas públicas. La licencia es MIT.
- P3: `Menlo` está antes de `monospace`, también en el kit.
- P4: con ancho 0 el telón queda vacío, con altura 0 y sin errores de página.

## Commits

```text
bc9189b L1.5: verifica las cinco escenas y renueva capturas
576f8a1 L1.4: corrige contraste AA y desborde móvil
e9095c2 P2: enlaza el repositorio y la instalación pública
a047fa4 P1: exporta una copia pública verificada
1eab972 L1.2: destaca la confirmación, la fecha y las cifras
75f4f95 P4: deja el telón vacío sin ancho visible
414a554 P3: incluye Menlo en la pila mono del kit
f3b1bc4 L1.3: iguala el morph de La línea en inglés
04aa8c7 L1.1: redibuja la llave y ajusta el volante
3f47a37 A3: mide el lector con DeepSeek en 20 PDF
673c69e S1: la sonda cuenta los 240 ítems del sumario del BOE
```

## P5: pruebas, build y TypeScript

`npm test` en la raíz, salida real:

```text
ℹ tests 73
ℹ suites 0
ℹ pass 73
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1311.08625
```

`npm --prefix sitio run build` y `npx tsc --noEmit -p sitio`:

```text
✓ 1627 modules transformed.
✓ built in 982ms
build + tsc exit code 0
```

## P5: diez gates de Stageshow

Se sirvió el build con Vite preview en `http://localhost:5483/`. La salida completa está en `sitio/capturas/ensayo/gate.txt`; las diez hojas nuevas están en esa misma carpeta.

| Escena | Ancho | Resultado | Cobertura | Código |
| --- | ---: | --- | --- | ---: |
| orden | 1280 | `rehearsal passed` | inconclusa, mayor pausa 59.2 ms | 2 |
| orden | 390 | `rehearsal passed` | inconclusa, mayor pausa 27.7 ms | 2 |
| linea | 1280 | `rehearsal passed` | inconclusa, mayor pausa 49.4 ms | 2 |
| linea | 390 | `rehearsal passed` | inconclusa, mayor pausa 33.8 ms | 2 |
| medidor | 1280 | `rehearsal passed` | inconclusa, mayor pausa 50.1 ms | 2 |
| medidor | 390 | `rehearsal passed` | inconclusa, mayor pausa 32.8 ms | 2 |
| chat | 1280 | `rehearsal passed` | inconclusa, mayor pausa 34.9 ms | 2 |
| chat | 390 | `rehearsal passed` | inconclusa, mayor pausa 34.6 ms | 2 |
| factura | 1280 | `rehearsal passed` | inconclusa, mayor pausa 42.2 ms | 2 |
| factura | 390 | `rehearsal passed` | inconclusa, mayor pausa 73.8 ms | 2 |

```text
gates con rehearsal failed: 0
```

Los diez procesos terminaron con código 2 porque hubo pausas de muestreo mayores de 27 ms. Esto significa cobertura inconclusa, no `rehearsal failed`; no se declara cobertura completa. Se revisaron las capturas nuevas de chat, factura y medidor a 390: ya no aparecen los cortes de pregunta, el panel vacío ni la cinta pequeña de las corridas anteriores.

Capturas de página nuevas:

```text
sitio/capturas/escritorio-1280.png
sitio/capturas/movil-390.png
```

## P5: Sightline

Comando: `sightline auditar --repo /Volumes/TERA/MAC/acometida/acometida-sitio --tier AA`.

```text
sightline auditar · acometida-sitio (main@576f8a1, sucio) · personal/libre
vistas: 11 (1 paginas), 3 con captura doble, 1 con error
hallazgos: 169 {"transitions":144,"impeccable":6,"sightline":19}
puntaje A 80.5 · AA 73.9 · AAA 73.9 (tier pedido AA: 73.9)
servidor: ya estaba
mapa vertical: ~/sightline-corridas/acometida-sitio-20261105-122852/mapa.html
corrida: ~/sightline-corridas/acometida-sitio-20261105-122852/corrida.json
```

Lectura del JSON de esa corrida:

```text
bloqueantes: 0
contraste: []
severidades: {'info': 2, 'major': 2, 'minor': 157, 'warn': 8}
errores: [('inicio', 'tope alcanzado (vistas 10/25, clics 40/40)')]
```

El árbol estaba sucio porque las capturas y el script portable se commitearon como L1.5 después de iniciar esta corrida. El código auditado es el de `576f8a1`, sin cambios posteriores. Los dos hallazgos `major` son recetas de movimiento de `Badge.css` y `Toast.css` en el kit; Sightline no los clasifica como bloqueantes. El aviso de vista es el tope de exploración, no un bloqueante de la página. La medición responsive casera posterior al ajuste del prompt dio `scrollWidth` 390 a 390 px y 320 a 320 px.

## Morph ES/EN

La prueba en navegador recorrió las siete secciones y observó mutaciones `characterData`:

```text
orden: morph ok · nodos 7/7 · caracteres animados en 24 nodo(s)
linea: morph ok · nodos 7/7 · caracteres animados en 18 nodo(s)
medidor: morph ok · nodos 5/5 · caracteres animados en 14 nodo(s)
chat: morph ok · nodos 5/5 · caracteres animados en 16 nodo(s)
instalar: morph ok · nodos 35/35 · caracteres animados en 17 nodo(s)
factura: morph ok · nodos 3/3 · caracteres animados en 18 nodo(s)
notas: morph ok · nodos 7/7 · caracteres animados en 14 nodo(s)
secciones con fallo: 0
```

## Exportación pública

Primera prueba en `/tmp/acometida-publico` y repetición final en `/tmp/acometida-publico-cierre`:

```text
copia pública lista en /private/tmp/acometida-publico-cierre: 202 archivos versionados
added 1 package, and audited 3 packages in 1s
found 0 vulnerabilities
ℹ tests 73
ℹ pass 73
ℹ fail 0
```

Build adicional del sitio exportado:

```text
added 75 packages, and audited 77 packages in 2s
found 0 vulnerabilities
✓ 1627 modules transformed.
✓ built in 2.24s
```

También se comprobó que una llave ficticia de prueba hace fallar el filtro y que un destino existente se rechaza sin borrar la copia. El exportador conserva los fixtures oficiales, excluye contratos, evidencias, capturas, logs, builds y dependencias, y revisa rutas y archivos de texto sin desactivar la detección de secretos.

Con este informe ya incluido, la exportación de entrega en `/tmp/acometida-publico-entrega` copió 203 archivos y volvió a pasar 73/73 pruebas. Una revisión anterior detectó una ruta personal en este informe y bloqueó la copia; se reemplazó por una ruta `~/...` y se repitió la prueba sin relajar el filtro.

## A3: medición del lector

Modelo: `deepseek/deepseek-v4.1-flash-1017`. Evidencia completa: `docs/evidencia/lector-modelo-2026-11-05.txt`.

```text
boe · deepseek/deepseek-v4.1-flash-1017 · 20 documentos · 0 con error · 0 fecha(s) rechazadas por no estar en el texto
identificador  20/20  100.0%
fecha          20/20  100.0%
titulo         2/20  10.0%
criterio ≥90% por campo: no cumple
```

La corrida terminó con código 1 por no alcanzar el criterio de títulos, no por un fallo de red.

## P4: ancho cero

Prueba en navegador sobre la página servida:

```json
{
  "antes": 3880,
  "despues": { "arte": "", "alto": "0px" },
  "errores": []
}
```

## Lo que no queda hecho

- El lector no alcanza la calidad pedida para títulos: 2/20. No se presenta como resuelto.
- La cobertura temporal de Stageshow quedó inconclusa en los diez gates por pausas de muestreo, aunque los diez imprimen `rehearsal passed`.
- Sightline conserva hallazgos no bloqueantes de movimiento, composición y código del kit, y su exploración llega al tope de clics. No se declara una auditoría sin hallazgos.
- Push, creación del repositorio remoto, DNS y deploy quedan para la dirección, como manda el contrato.
