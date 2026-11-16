/* ===== Motor de reglas (sin pantalla) =====
   El estado de la partida es un objeto plano "s" que se puede convertir a JSON.
   Cada función cambia "s" y deja en s.ev lo que ha pasado (con los valores de antes y después),
   para que la pantalla pueda animarlo.
   Cartas: texto rango+palo, por ejemplo "10S", "KH". Palos: S♠ C♣ H♥ D♦.

   Mesa de cada jugador:
   - towers: 4 torres. Cada torre es una carta normal; su vida es su valor. Una torre caída no vuelve.
   - front:  la fila de delante de las torres. Ahí se ponen los escudos (♣).
   Las cartas actúan por su palo: ♠ Ataque, ♣ Refuerzo (escudo), ♥ Curar, ♦ Botín. */
const SUITS = ['S', 'C', 'H', 'D'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SYM = { S: '♠', C: '♣', H: '♥', D: '♦' };

const rk = c => c.slice(0, -1);
const su = c => c.slice(-1);
const show = c => rk(c) + SYM[su(c)];
/* Valor: As 1, números su valor, J 11, Q 12, K 13. */
const val = c => { const r = rk(c); return r === 'A' ? 1 : r === 'J' ? 11 : r === 'Q' ? 12 : r === 'K' ? 13 : +r; };
const kind = c => ({ S: 'atk', C: 'reinf', H: 'heal', D: 'loot' }[su(c)]);
/* Vida que le queda a una torre, y escudo que queda en un hueco de la fila de delante. */
const hpOf = T => val(T.c) - T.dmg;
const shHp = F => F ? F.cs.reduce((a, c) => a + val(c), 0) - F.dmg : 0;
const actor = s => s.turn;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function emit(s, e) { (s.ev = s.ev || []).push(e); }

/* La mano siempre va ordenada: primero por palo, de izquierda a derecha ♦ ♥ ♣ ♠, y dentro de cada palo de menor a mayor. */
const HAND_ORDER = ['D', 'H', 'C', 'S'];
const sortHand = H => H.sort((a, b) => HAND_ORDER.indexOf(su(a)) - HAND_ORDER.indexOf(su(b)) || val(a) - val(b));

/* Cuando el mazo se acaba, se baraja el descarte y se sigue robando. */
function draw(s, p, n) {
  for (let k = 0; k < n; k++) {
    if (!s.deck.length) {
      if (!s.discard.length) break;
      s.deck = shuffle(s.discard); s.discard = [];
      emit(s, { k: 'reshuffle' });
    }
    s.players[p].hand.push(s.deck.pop());
  }
  sortHand(s.players[p].hand);
}

/* Torre: { c: carta, up: a la vista, dmg: daño recibido, k: [la conoce J0, la conoce J1] }
   Escudo: { cs: cartas ♣ apiladas, dmg: daño absorbido } */
function newGame(ids) {
  const deck = shuffle(SUITS.flatMap(x => RANKS.map(r => r + x)));
  const players = [0, 1].map(i => ({ id: ids[i] || null, hand: [], towers: [], front: [null, null, null, null] }));
  for (const P of players) {
    for (let i = 0; i < 4; i++) P.towers.push({ c: deck.pop(), up: false, dmg: 0, k: [false, false] });
    for (let i = 0; i < 5; i++) P.hand.push(deck.pop());
    sortHand(P.hand);
  }
  return { v: 1, deck, discard: [], players, turn: Math.random() < 0.5 ? 0 : 1, phase: 'lobby', winner: null, ev: [] };
}
/* La partida empieza con un turno de preparación para cada uno: solo se pueden poner escudos ♣
   (los que quieras) y se termina con "Listo". Después empieza el asedio normal. */
function begin(s) {
  s.phase = 'prep'; s.first = s.turn; s.prepLeft = 2;
  emit(s, { k: 'start' });
}
function ready(s, p) {
  emit(s, { k: 'ready', by: p });
  if (--s.prepLeft > 0) { s.turn = 1 - p; return; }
  s.phase = 'play'; s.turn = s.first;
  emit(s, { k: 'go' });
  draw(s, s.turn, 1);
}

/* Casillas donde se puede jugar una carta (nunca encima de una torre). Devuelve [jugador, columna].
   El Botín no usa casilla.
   - ♠ se pone en la casilla del RIVAL de esa columna, tenga carta o no, si allí hay escudo o torre.
   - ♥ va a tu casilla de esa columna, tenga escudo o no, si la torre está dañada.
   - ♣ va a una casilla VACÍA de tu propia fila.
   El escudo ♣ se queda delante de la torre; la ♥ pasa a la torre y le devuelve la vida que le falta. */
function targets(s, p, c) {
  const o = 1 - p, k = kind(c), P = s.players[p], O = s.players[o], out = [];
  if (s.phase === 'prep' && k !== 'reinf') return out;       // en la preparación solo hay escudos
  for (let i = 0; i < 4; i++) {
    if (k === 'atk' && (O.towers[i] || O.front[i])) out.push([o, i]);   // ♠ va a la casilla del rival, ocupada o no
    if (k === 'heal' && P.towers[i] && P.towers[i].dmg > 0) out.push([p, i]);  // ♥ también con escudo delante
    if (k === 'reinf' && P.towers[i] && !P.front[i]) out.push([p, i]);   // ♣ solo en casilla vacía
  }
  return out;
}

function endTurn(s) {
  s.turn = 1 - s.turn; s.phase = 'play';
  draw(s, s.turn, 1);
}
/* Después de jugar: gana quien deje al rival sin ninguna torre. Si no, pasa el turno. No hay límite de mano. */
function afterPlay(s) {
  for (const q of [0, 1]) {
    if (s.players[q].towers.every(T => !T)) {
      s.phase = 'over'; s.winner = 1 - q;
      emit(s, { k: 'over', winner: 1 - q });
      return;
    }
  }
  endTurn(s);
}

/* Juega la carta i de la mano de p en la columna a (el Botín no necesita columna). */
function play(s, p, i, a) {
  const P = s.players[p], o = 1 - p, O = s.players[o], hn = P.hand.length, c = P.hand.splice(i, 1)[0], k = kind(c);

  if (k === 'atk') {
    // El daño golpea primero el escudo de esa columna y lo que sobra, la torre.
    let dmg = val(c);
    const F = O.front[a], T = O.towers[a], e = { k: 'atk', by: p, o, t: a, c };
    if (F) {
      const before = shHp(F), absorbed = Math.min(dmg, before);
      F.dmg += absorbed; dmg -= absorbed;
      e.sh = { top: F.cs[F.cs.length - 1], before, after: before - absorbed };
      if (e.sh.after <= 0) { s.discard.push(...F.cs); O.front[a] = null; e.sh.broke = true; }
    }
    if (T && dmg > 0) {
      const before = hpOf(T), hit = Math.min(dmg, before);
      e.tw = { c: T.c, before, after: before - hit, hit, hidden: [!T.up && !T.k[0], !T.up && !T.k[1]] };
      T.up = true; T.dmg += hit;                         // al recibir daño, la torre se desvela
      if (e.tw.after <= 0) { e.tw.fall = true; e.exact = dmg === before; s.discard.push(T.c); O.towers[a] = null; }
    }
    s.discard.push(c);
    emit(s, e);
  } else if (k === 'reinf') {
    // Escudo en la casilla vacía de delante de la torre.
    P.front[a] = { cs: [c], dmg: 0 };
    emit(s, { k: 'shield', by: p, o: p, t: a, c, prev: null, before: 0, after: val(c), n: 1 });
  } else if (k === 'heal') {
    const T = P.towers[a], before = hpOf(T);             // le devuelve vida, sin pasar de su valor
    T.dmg -= Math.min(val(c), T.dmg);
    s.discard.push(c);
    emit(s, { k: 'heal', by: p, o: p, t: a, c, tw: { c: T.c, before, after: hpOf(T) } });
  } else if (k === 'loot') {
    s.discard.push(c); draw(s, p, 2);
    emit(s, { k: 'loot', by: p, c });
  }
  Object.assign(s.ev[s.ev.length - 1], { hi: i, hn });   // qué carta de la mano era, para animarla
  if (s.phase === 'prep') return;                          // en la preparación se sigue poniendo escudos
  afterPlay(s);
}

function discardCard(s, p, i) {
  const P = s.players[p], hn = P.hand.length, c = P.hand.splice(i, 1)[0];
  s.discard.push(c);
  emit(s, { k: 'discard', by: p, c, hi: i, hn });
  afterPlay(s);
}

/* Termina el turno sin jugar carta (en la preparación, es "Listo"). */
function passTurn(s, p) {
  if (s.phase === 'prep') return ready(s, p);
  emit(s, { k: 'pass', by: p });
  afterPlay(s);
}
