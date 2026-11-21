# 🎲 Juegos con Amigos

App de juegos de mesa para jugar **hasta 6 personas, cada una en su móvil**. Colorida, con figuritas, animaciones y sonidos.

## 📲 Descargar la APK
Cada vez que se sube un cambio, GitHub compila la app sola:
**Releases → la versión más reciente → `JuegosConAmigos.apk`**. Ábrela en el móvil e instálala
(si Android lo pide, permite "instalar apps de origen desconocido"). Las versiones nuevas se instalan encima de la anterior.

## 🎮 Juegos
| Juego | Jugadores | Extras |
|---|---|---|
| 🎲 **Parchís** | 2-4 / parejas | Tableros: clásico, primavera, verano, otoño, invierno · comefichas y fuegos artificiales |
| 🁫 **Dominó** | 2-4 / parejas | A 100 puntos, fichas ocultas para los demás |
| 🦢 **La Oca** | 2-6 | Tablero ilustrado en espiral, animación en cada casilla especial |
| 🃏 **Parejas** | 2-6 | 12/20/30/40 cartas, tiempo por turno |
| ⚓ **Hundir la flota** | 2-4 / equipos | Bombas en arco, salpicaduras, explosiones, barcos que se hunden |
| 🏎️ **Mini Bólidos** | 1-6 + máquina | Carreras en tiempo real, 3 circuitos |
| 🧱 **Muros** | 2-4 / equipos | ■ cuadrada como la torre, ● redonda en L, 💥 rompe-muros opcional |
| 🏙️ **Gran Ciudad** | 2-6 | Comprar calles, alquileres, casas y hoteles, cartas Sorpresa/Caja, cárcel |
| 🔢 **Rumi** | 2-4 | Fichas de números y colores, series y grupos, mesa reordenable |
| ⭕ **Tres en raya** / 🔴 **Cuatro en raya** | 2 | A 1, 3 o 5 victorias |
| ⚪ **Damas** | 2 | Reglas españolas: comer obligatorio y la dama vuela |
| ♞ **Ajedrez** | 2 | Completo: enroque, al paso, coronación, mate y tablas |
| 🗡️ **Brisca** | 2-4 / parejas | Baraja española dibujada, cambio del 7/2 de triunfo |
| 🤥 **Mentiroso** | 2-6 | Echa cartas boca abajo… o miente |
| ♠️ **Póker** | 2-6 | Texas Hold'em con fichas, ciegas, botes y faroles |
| 🂡 **Solitario** | 1-6 | Todos con las mismas cartas: ¿quién lo acaba antes? |
| 🧠 **Sabelotodo** | 2-6 / equipos | Rueda de preguntas en 6 categorías y estrellas |
| ✋ **¡Stop!** | 2-6 | Letra al azar, categorías, votación de respuestas |
| 🎨 **Dibuja y adivina** | 2-6 | Dibujo en directo con el dedo, adivinar sin escribir |

Todos los juegos tienen **jugadores máquina** 🤖 para jugar solo o completar la mesa (también en salas por internet).

Fichas a elegir: peón, chapas de botellín, canicas, gominolas o tazos. Cada juego tiene **instrucciones y una partida de ejemplo animada**.

## ✨ Funciones
- **Crear sala** → sale un código de 4 letras + QR. Los demás pulsan **Unirme** y escriben el código.
- **Invitar**: por WhatsApp, compartir enlace, QR o **invitación directa a amigos guardados** (les salta un aviso si tienen la app abierta).
- **Amigos**: cada móvil tiene un código de amigo; quien juega contigo se guarda solo.
- **Equipos**: interruptor en la sala, tocas el equipo de cada jugador o "Al azar".
- **Jugar todos en este móvil**: modo pasar-el-móvil, sin conexión.
- **Pestaña Juegos**: lista de juegos disponibles y tu lista personal para **apuntar juegos nuevos** que quieras añadir.
- Si alguien pierde la conexión, se reconecta solo y conserva su sitio.

## 🌐 Cómo se conectan los móviles
Por **internet (wifi o datos)** con WebRTC: los móviles hablan directamente entre ellos; un servidor gratuito (PeerJS)
solo sirve para presentarlos con el código. Se eligió esto en vez de Bluetooth porque Bluetooth no aguanta bien 6 móviles a la vez
y obligaría a emparejarlos uno a uno.
El móvil que crea la sala hace de "mesa": debe tener la app abierta durante la partida.

Las invitaciones llevan el enlace de descarga de la APK (Releases), para pasársela a quien no la tenga.

## 🛠️ Para desarrolladores
```
www/                 la app (HTML/CSS/JS sin compilar)
  js/app.js          pantallas, salas, amigos, invitaciones
  js/net.js          red (PeerJS / BroadcastChannel para pruebas)
  js/games/*.js      un archivo por juego: reglas + dibujo
test/                simulación de miles de partidas para validar las reglas
.github/workflows/   compilación de la APK y web
```
- `npm install && npm test` — prueba los motores de juego.
- `npm run serve` — abre http://localhost:8080 (añade `?net=local` para probar varias pestañas sin internet).
- **Añadir un juego**: crea `www/js/games/mijuego.js` con `setup`, `action`, `turnOf`, `isOver` y `render`
  (mira `oca.js`, el más sencillo) y regístralo en `www/js/games/index.js`.

El anfitrión es la autoridad: valida cada jugada con el motor del juego y envía el estado a todos; así nadie puede hacer trampas
ni desincronizarse.
