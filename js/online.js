/* ===== Partidas online con código =====
   Dos formas de conectar, según dónde esté abierta la página:

   1) En cualquier web (GitHub Pages, itch.io, Live Server...): un servidor MQTT público y gratuito
      (js/vendor/mqtt.min.js, licencia MIT). MQTT es un "tablón de mensajes": cada partida es un tema
      (topic) con su código, y el servidor guarda siempre el último estado de la partida.
      Los dos jugadores escriben y leen ese tema, así que funciona en cualquier red (wifi o datos),
      y si alguien cierra el juego puede volver a entrar con el mismo código.

   2) En la página publicada en Claude: el almacenamiento compartido de Claude (claude.use('db')),
      porque allí el navegador no deja conectar con servidores externos.

   Usa G, render, processEvents y leave, que están en ui.js. */

/* Servidores MQTT públicos (conexión segura wss). Si el primero falla se prueba el siguiente. */
const BROKERS = window.ASEDIO_BROKERS || [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt'
];
const TOPIC = 'asedio-juego-v1/partida/';          // + código de 4 letras
const NO_ONLINE = 'No se puede jugar online desde aquí: abre el juego desde una web (por ejemplo, GitHub Pages).';
const NO_WRITE = 'No tienes permiso para escribir en esta página. El dueño debe invitarte con permiso para editar.';
const NO_SERVER = 'No se pudo conectar con el servidor online. Comprueba tu conexión a internet e inténtalo otra vez.';
const Net = { mode: null, client: null };
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

/* Llega un estado de la partida: se aplica si es más nuevo que el que tenemos. */
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
  if (!G.ref) throw { code: 'offline' };
  return G.ref.set(pack(s));
}

/* Cierra la conexión al salir de la partida (lo llama leave() en ui.js). */
function netClose() {
  clearTimeout(netTimer);
  if (Net.client) { try { Net.client.end(true); } catch (e) {} }
  Net.mode = null; Net.client = null;
}

function fail(msg) { leave(); G.err = msg; render(); }

/* ======================================================================
   Modo web: servidor MQTT
   ====================================================================== */

/* Conecta con un servidor (el número i de la lista). Devuelve el cliente o null si no responde. */
function brokerConnect(i) {
  return new Promise(res => {
    if (!window.mqtt || i >= BROKERS.length) return res(null);
    const c = mqtt.connect(BROKERS[i], {
      clientId: 'asedio_' + Math.random().toString(36).slice(2, 12),
      connectTimeout: 6000, reconnectPeriod: 0, keepalive: 30, clean: true
    });
    let done = false;
    const end = ok => { if (done) return; done = true; clearTimeout(t); if (!ok) { try { c.end(true); } catch (e) {} } res(ok ? c : null); };
    const t = setTimeout(() => end(false), 7000);
    c.on('connect', () => { c.options.reconnectPeriod = 2000; end(true); });   // ya dentro: si se cae, reconecta solo
    c.on('error', () => end(false));
    c.on('close', () => end(false));                                            // no responde: probar el siguiente
  });
}

/* Lee el último estado guardado de una partida (o null si no existe). */
function peek(c, code, wait = 2500) {
  return new Promise(res => {
    const topic = TOPIC + code;
    let t;
    const onMsg = (tp, buf) => {
      if (tp !== topic) return;
      clearTimeout(t); c.removeListener('message', onMsg); c.unsubscribe(topic);
      try { res(buf.length ? JSON.parse(buf.toString()) : null); } catch (e) { res(null); }
    };
    c.on('message', onMsg);
    c.subscribe(topic, { qos: 1 }, err => {
      if (err) { c.removeListener('message', onMsg); return res(null); }
      t = setTimeout(() => { c.removeListener('message', onMsg); c.unsubscribe(topic); res(null); }, wait);
    });
  });
}

/* Se suscribe a la partida: cada vez que alguien publica un estado, llega aquí. */
function mqttListen(c, code) {
  const topic = TOPIC + code;
  G.ref = {
    set: data => new Promise((ok, ko) =>
      c.publish(topic, JSON.stringify(data), { qos: 1, retain: true }, err => err ? ko(err) : ok()))
  };
  c.on('message', (tp, buf) => {
    if (tp !== topic || !buf.length) return;
    let d; try { d = JSON.parse(buf.toString()); } catch (e) { return; }
    let ns; try { ns = JSON.parse(d.s); } catch (e) { return; }
    receive(ns);
  });
  c.on('offline', () => { if (G.mode === 'online') { G.net = 'Sin conexión. Reconectando…'; render(); } });
  c.on('connect', () => { if (G.mode === 'online' && G.net) { G.net = ''; render(); } });
  c.subscribe(topic, { qos: 1 });
}

async function mqttCreate() {
  leave(); myId();
  G.mode = 'online'; Net.mode = 'mqtt'; G.net = 'Creando la partida…'; G.screen = 'lobby'; render();
  const gid = G.gid;
  let c = null;
  for (let i = 0; i < BROKERS.length && !c; i++) c = await brokerConnect(i);
  if (gid !== G.gid) { if (c) c.end(true); return; }               // canceló mientras conectaba
  if (!c) return fail(NO_SERVER);
  Net.client = c;
  let code;
  for (let k = 0; k < 5; k++) { code = newCode(); if (!(await peek(c, code, 1200))) break; }   // código libre
  if (gid !== G.gid) return;
  const s = newGame([G.id, null]);
  G.code = code;
  mqttListen(c, code);
  try { await G.ref.set(pack(s)); } catch (e) { return fail(NO_SERVER); }
  G.s = s; G.me = 0; G.seenV = s.v; G.net = ''; G.err = '';
  render();
}

async function mqttJoin(code) {
  leave(); myId();
  G.mode = 'online'; Net.mode = 'mqtt'; G.code = code; G.joining = true;
  G.net = 'Buscando la partida…'; G.screen = 'lobby'; render();
  const gid = G.gid;
  // Se busca la partida en cada servidor, por si quien la creó usa otro.
  let c = null, data = null, reached = false;
  for (let i = 0; i < BROKERS.length; i++) {
    c = await brokerConnect(i);
    if (gid !== G.gid) { if (c) c.end(true); return; }
    if (!c) continue;
    reached = true;
    data = await peek(c, code);
    if (data) break;
    c.end(true); c = null;
  }
  if (gid !== G.gid) { if (c) c.end(true); return; }
  if (!data) return fail(reached ? 'No hay ninguna partida con el código ' + code + '.' : NO_SERVER);
  Net.client = c;
  let s;
  try { s = JSON.parse(data.s); } catch (e) { return fail('Esa partida está dañada. Crea una nueva.'); }

  const ids = s.players.map(p => p.id);
  mqttListen(c, code);
  if (!ids.includes(G.id)) {
    if (ids[1]) return fail('Esa partida ya tiene dos jugadores.');
    s.players[1].id = G.id; s.ev = [];
    if (s.phase === 'lobby') begin(s);
    s.v++;
    try { await G.ref.set(pack(s)); } catch (e) { return fail(NO_SERVER); }
    G.s = s; G.me = 1; G.seenV = s.v; G.joining = false; G.err = ''; G.net = '';
    processEvents(s);
    G.screen = 'game'; render();
    return;
  }
  receive(s);                                                  // vuelves a una partida tuya
}

/* ---------- Botones del menú ---------- */
async function createOnline() {
  const db = await claudeDb();
  if (db) return claudeCreate(db);
  if (window.mqtt) return mqttCreate();
  fail(NO_ONLINE);
}
async function joinOnline(code) {
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) { G.err = 'El código tiene 4 letras o números.'; return render(); }
  const db = await claudeDb();
  if (db) return claudeJoin(db, code);
  if (window.mqtt) return mqttJoin(code);
  fail(NO_ONLINE);
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
