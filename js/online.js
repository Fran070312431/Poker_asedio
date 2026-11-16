/* ===== Partidas online con código =====
   Dos formas de conectar, según dónde esté abierta la página:

   1) En cualquier web (itch.io, tu propio hosting...): PeerJS (js/vendor/peerjs.min.js, licencia MIT).
      Los dos móviles se conectan directamente entre sí (WebRTC). El servidor gratuito de PeerJS
      (0.peerjs.com) solo sirve para que se encuentren: quien crea la partida se registra con el
      nombre "asedio-CODIGO" y quien se une llama a ese nombre.
      Quien crea es el jugador 0 y quien se une el jugador 1. La partida vive en los dos navegadores:
      después de cada jugada, quien juega envía el estado completo al otro.

   2) En la página publicada en Claude: el almacenamiento compartido de Claude (claude.use('db')),
      porque allí el navegador no deja conectar con servidores externos.

   Usa G, render, processEvents y leave, que están en ui.js. */
const PREFIX = 'asedio-game-';
const NO_ONLINE = 'No se puede jugar online desde aquí: abre el juego desde una web (por ejemplo, itch.io).';
const NO_WRITE = 'No tienes permiso para escribir en esta página. El dueño debe invitarte con permiso para editar.';
const Net = { mode: null, peer: null, conn: null };

/* Servidores que ayudan a que dos móviles se encuentren a través de routers y redes móviles.
   STUN: averigua tu dirección pública (gratis, varios por si uno falla).
   TURN: hace de puente cuando la conexión directa está bloqueada (los gratuitos de PeerJS).
   Si alguna red no conecta, puedes añadir aquí un TURN propio (por ejemplo, una cuenta gratis de Metered). */
const ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' }
];
const PEER_OPTS = { debug: 0, config: { iceServers: ICE } };
const NO_DIRECT = 'Habéis encontrado la partida, pero vuestra red no deja conectar los móviles. Probad los dos con wifi.';
let netTimer;

/* Identificador de este jugador, guardado en el navegador para poder volver a entrar. */
function myId() {
  if (!G.id) {
    G.id = Store.get('pa_id', null);
    if (!G.id) { G.id = 'g' + Math.random().toString(36).slice(2, 10); Store.set('pa_id', G.id); }
  }
  return G.id;
}
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';                 // sin O/0 ni I/1, que se confunden
  return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

/* Llega un estado de la partida (del rival o del almacenamiento): se aplica si es más nuevo. */
function receive(ns) {
  clearTimeout(netTimer); G.net = '';
  if (G.busy && G.s && ns.v < G.s.v) return;
  if (!G.s || ns.v >= G.s.v) {
    const fresh = G.seenV != null && ns.v > G.seenV;            // jugada nueva del rival
    G.s = ns; G.me = ns.players[0].id === G.id ? 0 : 1;
    if (fresh) processEvents(ns);
    G.seenV = Math.max(G.seenV || 0, ns.v);
  }
  G.joining = false;
  G.screen = G.s.phase === 'lobby' ? 'lobby' : 'game';
  render();
}

/* Envía el estado después de una jugada. */
async function sendState(s) {
  if (Net.mode === 'claude') return G.ref.set(pack(s));
  if (Net.conn && Net.conn.open) { Net.conn.send({ t: 'state', s }); return; }
  throw { code: 'offline' };
}

/* Cierra la conexión al salir de la partida (lo llama leave() en ui.js). */
function netClose() {
  clearTimeout(netTimer);
  if (Net.peer) { try { Net.peer.destroy(); } catch (e) {} }
  Net.mode = null; Net.peer = null; Net.conn = null;
}

function fail(msg) { leave(); G.err = msg; render(); }

/* ---------- Crear partida ---------- */
async function createOnline() {
  if (window.Peer && !(await claudeDb())) return peerCreate();
  const db = await claudeDb();
  if (!db) return fail(NO_ONLINE);
  return claudeCreate(db);
}

function peerCreate(tries = 0) {
  leave(); myId();
  G.mode = 'online'; Net.mode = 'peer';
  const code = newCode(), peer = new Peer(PREFIX + code.toLowerCase(), PEER_OPTS);
  Net.peer = peer;
  G.net = 'Creando la partida…'; G.code = code; G.screen = 'lobby'; render();
  netTimer = setTimeout(() => fail('No se pudo conectar con el servidor online. Comprueba tu conexión e inténtalo otra vez.'), 15000);

  peer.on('open', () => {
    clearTimeout(netTimer);
    G.s = newGame([G.id, null]); G.me = 0; G.seenV = G.s.v; G.net = ''; G.err = '';
    render();
  });
  peer.on('connection', conn => {
    conn.on('data', d => hostData(conn, d));
    conn.on('close', () => {
      if (conn !== Net.conn) return;
      Net.conn = null;
      if (G.mode === 'online') { G.net = 'Tu rival se ha desconectado. Puede volver a entrar con el código.'; render(); }
    });
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });   // se cayó el servidor de encuentro: la partida sigue
  peer.on('error', e => {
    if (e.type === 'unavailable-id' && tries < 5) return peerCreate(tries + 1);  // código ya usado: otro
    if (!G.s || e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error')
      return fail('No se pudo conectar con el servidor online. Comprueba tu conexión e inténtalo otra vez.');
  });
}

/* Mensajes que recibe quien creó la partida. */
function hostData(conn, d) {
  if (!d || !G.s) return;
  if (d.t === 'hello') {
    const s = G.s, guest = s.players[1].id;
    if (guest && guest !== d.id) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 400); return; }
    if (Net.conn && Net.conn !== conn) { try { Net.conn.close(); } catch (e) {} }
    Net.conn = conn;
    if (!guest) {                                                // entra el rival por primera vez: empieza
      s.players[1].id = d.id; s.ev = [];
      begin(s); s.v++;
      processEvents(s); G.seenV = s.v;
      G.screen = 'game';
    }
    G.net = '';
    conn.send({ t: 'state', s: G.s });
    render();
  } else if (d.t === 'state') receive(d.s);
}

/* ---------- Unirse a una partida ---------- */
async function joinOnline(code) {
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) { G.err = 'El código tiene 4 letras o números.'; return render(); }
  if (window.Peer && !(await claudeDb())) return peerJoin(code);
  const db = await claudeDb();
  if (!db) return fail(NO_ONLINE);
  return claudeJoin(db, code);
}

function peerJoin(code) {
  leave(); myId();
  G.mode = 'online'; Net.mode = 'peer'; G.code = code; G.joining = true;
  G.net = 'Entrando en la partida…'; G.screen = 'lobby'; render();
  const peer = new Peer(PEER_OPTS);
  Net.peer = peer;
  netTimer = setTimeout(() => fail('No se pudo entrar en la partida ' + code + '. Comprueba el código y tu conexión.'), 15000);

  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true });
    Net.conn = conn;
    // Ya hablamos con el servidor: si en 12 s no se abre el canal, es la red la que lo bloquea.
    clearTimeout(netTimer);
    netTimer = setTimeout(() => fail(NO_DIRECT), 12000);
    conn.on('open', () => conn.send({ t: 'hello', id: G.id }));
    conn.on('data', d => {
      if (d && d.t === 'state') receive(d.s);
      else if (d && d.t === 'full') fail('Esa partida ya tiene dos jugadores.');
    });
    conn.on('close', () => {
      if (G.mode !== 'online' || conn !== Net.conn) return;
      Net.conn = null;
      G.net = 'Se ha perdido la conexión con tu rival. Vuelve al menú y entra otra vez con el código.'; render();
    });
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
  peer.on('error', e => {
    if (e.type === 'peer-unavailable') return fail('No hay ninguna partida con el código ' + code + '.');
    if (!G.s) return fail('No se pudo conectar con el servidor online. Comprueba tu conexión e inténtalo otra vez.');
  });
}

/* ======================================================================
   Modo Claude: almacenamiento compartido de la página publicada
   ====================================================================== */
async function claudeDb() {
  if (!window.claude || !claude.use) return null;
  let db = null;
  try { db = await claude.use('db'); } catch (e) {}
  if (!db) return null;
  myId();      // un identificador por dispositivo: así puedes probar con tu misma cuenta en el PC y en el móvil
  return db;
}

const pack = s => ({ s: JSON.stringify(s), v: s.v });

function subscribe() {
  G.net = 'Conectando con la partida…';
  clearTimeout(netTimer);
  netTimer = setTimeout(() => { G.net = 'Todavía no se puede conectar con la partida. Comprueba tu conexión.'; render(); }, 10000);
  G.unsub = G.ref.onSnapshot(snap => {
    if (!snap.exists) { clearTimeout(netTimer); G.net = 'Esta partida ya no existe.'; render(); return; }
    let ns;
    try { ns = JSON.parse(snap.data().s); } catch (e) { return; }
    receive(ns);
  }, () => {
    clearTimeout(netTimer);
    G.net = 'Se ha perdido la conexión con la partida. Vuelve al menú y entra otra vez con el código.';
    render();
  });
}

async function claudeCreate(db) {
  leave(); G.mode = 'online'; Net.mode = 'claude';
  G.code = newCode();
  const s = newGame([G.id, null]);
  G.ref = db.doc('games/' + G.code);
  try { await G.ref.set(pack(s)); }
  catch (e) { return fail(e && e.code === 'invalid_argument' ? NO_WRITE : 'No se pudo crear la partida. Inténtalo otra vez.'); }
  G.s = s; G.me = 0; G.seenV = s.v; G.err = ''; G.screen = 'lobby';
  subscribe(); render();
}

async function claudeJoin(db, code) {
  leave();
  const ref = db.doc('games/' + code);
  let snap;
  try { snap = await ref.get(); } catch (e) { G.err = 'No se pudo buscar la partida. Inténtalo otra vez.'; return render(); }
  if (!snap.exists) { G.err = 'No hay ninguna partida con el código ' + code + '.'; return render(); }
  let s;
  try { s = JSON.parse(snap.data().s); } catch (e) { G.err = 'Esa partida está dañada. Crea una nueva.'; return render(); }

  const ids = s.players.map(p => p.id);
  let joinedNow = false;
  if (!ids.includes(G.id)) {
    if (ids[1]) { G.err = 'Esa partida ya tiene dos jugadores.'; return render(); }
    s.players[1].id = G.id; s.ev = [];
    if (s.phase === 'lobby') begin(s);
    s.v++;
    try { await ref.set(pack(s)); }
    catch (e) { G.err = e && e.code === 'invalid_argument' ? NO_WRITE : 'No se pudo entrar en la partida. Inténtalo otra vez.'; return render(); }
    joinedNow = true;
  }
  G.mode = 'online'; Net.mode = 'claude'; G.code = code; G.ref = ref; G.s = s; G.err = '';
  G.me = s.players[0].id === G.id ? 0 : 1;
  if (joinedNow) processEvents(s);
  G.seenV = s.v;
  G.screen = s.phase === 'lobby' ? 'lobby' : 'game';
  subscribe(); render();
}
