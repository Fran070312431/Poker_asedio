# Asedio

Juego de cartas para 2 jugadores con la baraja de póker de 52 cartas. Tumba las 4 torres del rival.

## Reglas

- Cada jugador tiene 4 torres boca abajo y 5 cartas en la mano. Cada torre es una carta normal: su vida es su valor.
- Delante de las torres hay una fila de casillas. Las cartas se juegan en las casillas, nunca encima de una torre.
- Al empezar, cada uno tiene un turno de preparación: pone los escudos ♣ que quiera y pulsa Listo.
- En tu turno robas 1 carta y juegas 1, descartas 1 o pasas. No hay límite de cartas en la mano.
- ♠ Ataque: se pone en la casilla del rival de esa columna, tenga carta o no, y golpea. Primero rompe el escudo; lo que sobra se lo quita a la torre, que se desvela. Con 0 de vida, cae.
- ♣ Refuerzo: en una casilla vacía tuya, como escudo de tu torre. Absorbe daño.
- ♥ Curar: en tu casilla de esa columna, aunque tenga escudo; pasa a la torre y le devuelve vida, sin pasar de su valor. Una torre caída no vuelve.
- ♦ Botín: robas 2 cartas.
- Valores: As 1, números su valor, J 11, Q 12, K 13.
- Gana quien tumbe las 4 torres del rival. Si se acaba el mazo, se baraja el descarte y se sigue.

## Cómo abrirlo

Abre `index.html` en el navegador (doble clic o con la extensión Live Server de VS Code).
No necesita instalar nada.

## Estructura

| Archivo | Qué contiene |
| --- | --- |
| `index.html` | La página y el orden de carga de los scripts |
| `css/style.css` | Todo el estilo: mesa oscura, cartas de pergamino, intro, filtro retro (CRT) |
| `js/settings.js` | Ajustes y guardado en el navegador |
| `js/sprites.js` | Pixel art de palos e iconos, dibujado como rejillas de texto |
| `js/scene.js` | Fondo: mesa de madera con losas de piedra bajo las torres, en un canvas |
| `js/audio.js` | Reproduce la música y los efectos de la carpeta `audio` |
| `audio/` | Efectos (Kenney) y música (OpenGameArt), todos CC0. Créditos en `audio/CREDITOS.md` |
| `js/achievements.js` | Lista de logros y su guardado |
| `js/engine.js` | Reglas del juego, sin nada de pantalla |
| `js/ai.js` | Decisiones de la IA |
| `js/online.js` | Partidas online con código (PeerJS en la web; almacenamiento de Claude en Claude) |
| `js/vendor/peerjs.min.js` | Librería PeerJS 1.5.4 (MIT) para conectar los dos móviles |
| `js/ui.js` | Pantallas, clics, arrastrar y soltar, animaciones (capa #fx) y flujo de la partida |

## Modo online

Funciona desde cualquier web (por ejemplo, itch.io), sin cuentas ni servidor propio:

1. Un jugador pulsa **Crear partida online** y le sale un código de 4 letras.
2. El otro abre el juego en su móvil, escribe el código y pulsa **Unirse**.

Los dos móviles se conectan directamente entre sí con PeerJS (`js/vendor/peerjs.min.js`, licencia MIT).
El servidor gratuito de PeerJS solo sirve para que se encuentren; las jugadas viajan de un móvil al otro.

- Quien crea la partida tiene que mantener el juego abierto: la partida vive en los dos navegadores.
- Si el que se unió pierde la conexión, puede volver a entrar con el mismo código desde el mismo navegador.
- Algunas redes muy cerradas (ciertas redes móviles o de empresa) no dejan la conexión directa. Si no conecta, probad con wifi.
- Abierto como archivo local (doble clic en `index.html`) no hay online. En VS Code usa la extensión **Live Server** (clic derecho en `index.html` → *Open with Live Server*) o súbelo a una web.
- Si una red no conecta, en `js/online.js` puedes añadir un servidor TURN propio en la lista `ICE`.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub (por ejemplo, `asedio`) y sube **el contenido** de esta carpeta: `index.html` tiene que quedar en la raíz.
2. En el repositorio: **Settings → Pages**.
3. En *Source* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`. Pulsa **Save**.
4. Espera 1–2 minutos. Tu juego estará en `https://TU-USUARIO.github.io/asedio/`.
5. Abre ese enlace en los dos móviles: uno pulsa **Crear partida online** y el otro escribe el código.

El archivo `.nojekyll` le dice a GitHub que sirva los archivos tal cual.
- En la página publicada en Claude, el online usa el almacenamiento de Claude en lugar de PeerJS.
