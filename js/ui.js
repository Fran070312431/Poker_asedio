/* ===== Pantalla y controles =====
   G guarda lo que la interfaz necesita recordar. render() pinta la mesa tal como queda DESPUÉS de cada jugada.
   Las animaciones van encima, en la capa #fx: primero se tapan los huecos afectados con su aspecto de ANTES
   ("tapas"), luego vuela la carta, golpea, se gira la torre, baja el número... y al final se quitan las tapas.
   Las cartas se juegan tocando carta y luego destino, o arrastrándolas. */
const $ = id => document.getElementById(id);
const app = $('app'), modalBox = $('modal'), fxl = $('fx'), stage = $('stage');
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const MENU_CARDS = ['AS', 'KH', 'QC', 'JD'];
const G = {
  screen: 'intro', mode: null, me: 0, s: null, sel: null, busy: false,
  code: '', ref: null, unsub: null, id: null, net: '', err: '', modal: null,
  gid: 0, seenV: null, wasMine: false, confirmReset: false,
  fxq: [], prevHand: [], prevTop: null, dragging: false, noClickUntil: 0,
  src: null, animating: false, pending: 0, oPick: null,
  stats: { loot: 0, lost: false, dmg: 0, felled: 0, turns: 0 }
};

/* ---------- Avisos (solo logros y errores) ---------- */
const toasts = [];
let toastBusy = false;
function toast(text) {
  toasts.push(text);
  if (toastBusy) return;
  toastBusy = true;
  const el = $('toast');
  (function next() {
    if (!toasts.length) { el.hidden = true; toastBusy = false; return; }
    el.textContent = toasts.shift(); el.hidden = false;
    setTimeout(next, 2600);
  })();
}
Achievements.listen(a => { toast('Logro: ' + a.name); Sound.sfx('achv', 0.3); });

/* ---------- Piezas de HTML ---------- */
const spr = cls => `<span class="spr ${cls}"></span>`;
const nameOf = q => q === G.me ? 'Tú' : (G.mode === 'ai' ? 'IA' : 'Rival');
/* Carta de póker: arriba el número y su valor (hp lo cambia: vida de la torre o total del escudo). */
function face(c, cls = '', hp) {
  const s = su(c), base = val(c), v = hp == null ? base : hp;
  return `<div class="card ${'HD'.includes(s) ? 'red' : ''} ${cls}"><div class="in">
    <div class="hd"><span class="rk">${rk(c)}</span><span class="val ${v < base ? 'low' : v > base ? 'high' : ''}">${v}</span></div>
    <div class="art">${spr('su-' + s)}</div></div></div>`;
}
const BACK = `<div class="card back"><div class="in"><div class="art">${spr('ic-sigil')}</div></div></div>`;
const myTurn = () => G.s && ['play', 'discard', 'prep'].includes(G.s.phase) && actor(G.s) === G.me && !G.busy;
const canAct = () => myTurn() && !G.animating;
const selCard = () => G.sel == null ? null : G.s.players[G.me].hand[G.sel];
const slotEl = (o, t, row) => app.querySelector(`.slot.${row}[data-o="${o}"][data-i="${t}"]`);

function curTargets() {
  if (!canAct() || (G.s.phase !== 'play' && G.s.phase !== 'prep') || G.sel == null) return [];
  return targets(G.s, G.me, selCard());
}
const isTgt = (tg, o, i) => tg.some(x => x[0] === o && x[1] === i);
function towerHTML(o, i, tg) {
  const T = G.s.players[o].towers[i], mine = o === G.me;
  const attrs = `data-act="slot" data-o="${o}" data-i="${i}" aria-label="Torre ${i + 1} ${mine ? 'tuya' : 'rival'}"`;
  const cls = `slot tower ${mine ? '' : 'foe'}`;    // las torres nunca son destino: se juega en la casilla de delante
  if (!T) return `<button class="${cls} empty" ${attrs}>${spr('ic-rubble')}</button>`;
  const inner = T.up ? face(T.c, '', hpOf(T)) : T.k[G.me] ? face(T.c, 'peek', hpOf(T)) : BACK;
  return `<button class="${cls}" ${attrs}>${inner}</button>`;
}
function laneHTML(o, i, tg) {
  const F = G.s.players[o].front[i];
  const attrs = `data-act="slot" data-o="${o}" data-i="${i}" aria-label="Fila de delante ${i + 1} ${o === G.me ? 'tuya' : 'rival'}"`;
  const cls = `slot lane ${isTgt(tg, o, i) ? 'tgt' : ''}`;
  if (!F) return `<button class="${cls} empty" ${attrs}></button>`;
  const under = F.cs.slice(0, -1).map((c, n, a) => `<span class="under" style="--n:${a.length - n}">${face(c)}</span>`).join('');
  return `<button class="${cls}" ${attrs}>${under}<span class="topc">${face(F.cs[F.cs.length - 1], '', shHp(F))}</span></button>`;
}

/* ---------- Pantalla final: victoria con rayos y confeti; derrota con brasas y letras que se desploman ---------- */
function endHTML(win) {
  const word = win ? 'VICTORIA' : 'DERROTA', rnd = (a, b) => a + Math.random() * (b - a);
  const letters = [...word].map((ch, i) =>
    `<span style="--i:${i};--r:${rnd(-14, 14).toFixed(0)}deg;--y:${rnd(2, 12).toFixed(0)}px">${ch}</span>`).join('');
  const towers = G.s.players[G.me].towers.map((T, i) => T
    ? `<span class="em" style="--i:${i}">${face(T.c, '', hpOf(T))}</span>`
    : `<span class="em gone" style="--i:${i}">${spr('ic-rubble')}</span>`).join('');
  const bits = Array.from({ length: win ? 36 : 26 }, () => win
    ? `<i class="conf" style="left:${rnd(0, 100)}%;background:${['#e8a33d', '#c4554a', '#e6dcc0', '#ffd58a'][Math.floor(rnd(0, 4))]};animation-duration:${rnd(2.4, 4.4).toFixed(1)}s;animation-delay:${rnd(-4, 0).toFixed(1)}s"></i>`
    : `<i class="ash" style="left:${rnd(0, 100)}%;--dx:${rnd(-40, 40).toFixed(0)}px;background:${Math.random() < 0.3 ? '#c4554a' : '#6b5a50'};animation-duration:${rnd(4, 8).toFixed(1)}s;animation-delay:${rnd(-8, 0).toFixed(1)}s"></i>`).join('');
  const st = G.stats, rival = G.mode === 'ai' ? 'la IA' : 'tu rival';
  return `<div class="end ${win ? 'win' : 'lose'}" role="dialog" aria-label="${word}">
    <div class="rays"></div>${bits}
    <div class="endbox">
      ${spr('end-ic ' + (win ? 'ic-trophy' : 'ic-rubble'))}
      <h2 class="endt">${letters}</h2>
      <p class="ends">${win ? `Las cuatro torres de ${rival} han caído.` : 'Tus cuatro torres han caído.'}</p>
      <div class="endtw">${towers}</div>
      <div class="endst"><span><b>${st.dmg}</b>daño</span><span><b>${st.felled}</b>torres</span><span><b>${st.turns}</b>turnos</span></div>
      <div class="acts"><button class="btn primary small" data-act="again">Revancha</button><button class="btn small" data-act="menu">Menú</button></div>
    </div></div>`;
}

/* ---------- Ventanas: reglas, ajustes, logros ---------- */
function modalHTML() {
  if (G.modal === 'rules') return `<h2>Reglas</h2>
    <p>Tumba las 4 torres del rival para ganar. Cada torre es una carta boca abajo y su vida es su valor.</p>
    <ul>
    <li>Al empezar, cada uno tiene un turno de preparación: pon los escudos ♣ que quieras y pulsa Listo.</li>
    <li>Tu turno: robas 1 carta y juegas 1, descartas 1 o pasas.</li>
    <li>Las cartas se juegan en las casillas de delante de las torres, nunca encima de una torre.</li>
    <li>♠ Ataque: se pone en la casilla del rival de esa columna, tenga carta o no, y golpea. Primero rompe el escudo; lo que sobra se lo quita a la torre, que se desvela. Con 0 de vida, cae.</li>
    <li>♣ Refuerzo: en una casilla vacía tuya, como escudo de tu torre. Absorbe daño.</li>
    <li>♥ Curar: en tu casilla de esa columna, aunque tenga escudo; pasa a la torre y le devuelve vida, sin pasar de su valor. Una torre caída no vuelve.</li>
    <li>♦ Botín: llévala al mazo y robas 2 cartas.</li>
    <li>Valores: As 1, números su valor, J 11, Q 12, K 13.</li>
    <li>Gana quien tumbe las 4 torres del rival. Si se acaba el mazo, se baraja el descarte.</li>
    </ul>`;
  if (G.modal === 'settings') {
    const v = Settings.v;
    const check = (key, label) => `<label class="opt" for="set-${key}">${label}<input type="checkbox" id="set-${key}" data-set="${key}" ${v[key] ? 'checked' : ''}></label>`;
    const range = (key, label) => `<label class="opt sub" for="set-${key}">${label}<input type="range" id="set-${key}" data-set="${key}" min="0" max="100" value="${Math.round(v[key] * 100)}"></label>`;
    return `<h2>Ajustes</h2>
      ${check('music', 'Música')}${range('musicVol', 'Volumen')}
      ${check('sfx', 'Efectos de sonido')}${range('sfxVol', 'Volumen')}
      ${check('crt', 'Filtro retro CRT')}${range('crtAmt', 'Intensidad')}
      ${check('vibra', 'Vibración en el móvil')}
      <div class="opt">Logros: ${Achievements.count()} de ${Achievements.LIST.length}
        <button class="btn small" data-act="reset">${G.confirmReset ? '¿Seguro? Pulsa otra vez' : 'Borrar logros'}</button></div>`;
  }
  if (G.modal === 'achv') return `<h2>Logros ${Achievements.count()}/${Achievements.LIST.length}</h2>` +
    Achievements.LIST.map(a => {
      const ok = Achievements.has(a.id);
      return `<div class="achv ${ok ? '' : 'off'}">${spr(ok ? 'ic-trophy' : 'ic-trophy-off')}<div><b>${a.name}</b><span>${a.desc}</span></div></div>`;
    }).join('');
  return '';
}
/* Los paneles salen del lateral como una pestaña: Reglas por la izquierda; Ajustes y Logros por la derecha. */
function renderModal() {
  const side = G.modal === 'rules' ? 'left' : 'right';
  modalBox.innerHTML = G.modal
    ? `<div class="scrim" data-act="close"></div><aside class="drawer ${side}" role="dialog">${modalHTML()}<div class="acts"><button class="btn primary small" data-act="close">Cerrar</button></div></aside>`
    : '';
}
function openModal(name) {
  const d = modalBox.querySelector('.drawer');
  if (!name && d) {                                      // cerrar: el panel se esconde por su lado
    d.classList.add('out'); modalBox.querySelector('.scrim').classList.add('out');
    setTimeout(() => { if (!G.modal) modalBox.innerHTML = ''; }, 200);
    G.modal = null; return;
  }
  G.modal = name; G.confirmReset = false; renderModal();
}

/* ---------- Pantallas ---------- */
function render() {
  requestAnimationFrame(Scene.draw);
  document.body.classList.toggle('intro', G.screen === 'intro');
  // Música: piano en intro y menú; bucle oscuro en la partida; al acabar, victoria o derrota.
  Sound.music(G.screen === 'game' && G.s
    ? (G.s.phase === 'over' && !G.animating ? (G.s.winner === G.me ? 'win' : 'lose') : 'game')
    : 'menu');
  if (G.screen === 'intro') {
    app.className = 'app intro';
    app.innerHTML = `
    <p style="--k:0">La noche cae sobre el valle.</p>
    <p style="--k:1">Dos reyes. Ocho torres.</p>
    <p style="--k:2">Una sola baraja.</p>
    <h1 class="brand"><img class="logo" src="img/logo.png" alt="Asedio"></h1>
    <span class="tap">Toca para empezar</span>`;
    return;
  }
  if (G.screen === 'menu') {
    app.className = 'app menu';
    app.innerHTML = `
    <h1 class="brand"><img class="logo" src="img/logo.png" alt="Asedio"></h1>
    <div class="mfan"><div class="mfan-in" id="mfan">${MENU_CARDS.map((c, i) =>
      `<button class="mc" data-act="mcard" data-i="${i}" style="--d:${i - 1.5};--k:${i}" aria-label="${show(c)}"><span class="mcf"><span class="mct"><span class="mci">${face(c)}</span></span></span></button>`).join('')}</div></div>
    <div class="plate">
      <div class="stack">
        <button class="btn primary" data-act="ai">Jugar contra la IA</button>
        <button class="btn" data-act="create">Crear partida online</button>
        <form class="join" id="joinForm"><input id="codeIn" maxlength="4" placeholder="CODE" aria-label="Código de partida" autocomplete="off">
          <button class="btn" type="submit">Unirse</button></form>
        <div class="trio">
          <button class="btn" data-act="open" data-m="achv">${spr('ic-trophy')}Logros</button>
          <button class="btn" data-act="open" data-m="settings">${spr('ic-gear')}Ajustes</button>
          <button class="btn" data-act="open" data-m="rules">${spr('ic-book')}Reglas</button>
        </div>
      </div>
      ${G.err ? `<div class="note err">${G.err}</div>` : ''}
    </div>`;
    return;
  }
  if (G.screen === 'lobby') {
    app.className = 'app menu';
    const waiting = G.joining || !G.s;                     // aún conectando (quien se une, o quien crea)
    app.innerHTML = `<h1>${G.joining ? 'UNIRSE' : 'PARTIDA<br>CREADA'}</h1>
    <div class="plate">
      <p>${G.joining ? 'Entrando en la partida' : waiting ? 'Preparando la partida…' : 'Pasa este código a tu rival. Tiene que abrir el juego y pulsar Unirse.'}</p>
      <div class="code">${waiting && !G.joining ? '····' : G.code}</div>
      <div class="note">${G.net || 'Esperando a tu rival…'}</div>
      <div class="stack"><button class="btn small" data-act="menu">Cancelar</button></div></div>`;
    return;
  }

  const s = G.s, me = G.me, op = 1 - me, P = s.players[me], O = s.players[op];
  if (G.sel != null && (G.sel >= P.hand.length || !myTurn())) G.sel = null;
  const tg = curTargets(), mine = myTurn(), c = selCard();
  const lootSel = canAct() && s.phase === 'play' && c && kind(c) === 'loot';
  const top = s.discard[s.discard.length - 1] || null;
  G.prevTop = top;

  let dlg = '';
  if (s.phase === 'over' && !G.animating) dlg = endHTML(s.winner === me);

  const n = P.hand.length, on = O.hand.length;
  let fresh = 0;
  const handH = P.hand.map((card, i) => {
    const isNew = !G.prevHand.includes(card);
    const cls = ['hc', G.sel === i ? 'sel' : '', mine ? '' : 'dim', isNew ? 'new' : '', G.dragging && G.sel === i ? 'ghosted' : ''].join(' ');
    return `<button data-act="hand" data-i="${i}" class="${cls}" style="--d:${i - (n - 1) / 2};--k:${isNew ? fresh++ : 0}" ${mine ? '' : 'disabled'} aria-label="${show(card)}"><span class="hci">${face(card)}</span></button>`;
  }).join('');
  G.prevHand = P.hand.slice();
  // Mientras se anima su jugada, la mano del rival se pinta como estaba antes de jugar.
  const oN = G.oPick ? G.oPick.n : on;
  const ohandH = Array.from({ length: oN }, (x, i) => `<span class="oc" style="--d:${i - (oN - 1) / 2}"><span class="oci">${BACK}</span></span>`).join('');

  // Un solo botón: pasa el turno, o descarta la carta elegida.
  const mustDiscard = s.phase === 'discard';
  const prep = s.phase === 'prep';
  const btnLabel = prep ? 'Listo' : G.sel != null || mustDiscard ? 'Descartar' : 'Pasar';
  const btnOff = !mine || (mustDiscard && G.sel == null);
  const cols = [0, 1, 2, 3];

  app.className = 'app';
  app.innerHTML = `
  ${G.net ? `<div class="note err">${G.net}</div>` : ''}
  <div class="ohand" id="ohand" style="${fanVars(oN)}" aria-label="${nameOf(op)}: ${on} cartas">${ohandH}</div>
  <div class="row" id="rowOp">${cols.map(i => towerHTML(op, i, tg)).join('')}</div>
  <div class="lanes" id="laneOp">${cols.map(i => laneHTML(op, i, tg)).join('')}</div>
  <div class="mid" data-drop="play">
    <div class="side">
      <button class="btn icon" data-act="menu" aria-label="Volver al menú">${spr('ic-door')}</button>
      <button class="btn icon" data-act="open" data-m="rules" aria-label="Reglas">${spr('ic-book')}</button>
      ${G.mode === 'online' ? `<span class="who">${G.code}</span>` : ''}
    </div>
    <div class="center">
      <button class="pile ${lootSel ? 'tgt' : ''}" id="deck" data-act="deck" aria-label="Mazo: ${s.deck.length} cartas">${s.deck.length ? BACK : '<div class="none"></div>'}<span class="count">${s.deck.length}</span></button>
      <button class="btn small" id="passBtn" data-act="pass" ${btnOff ? 'disabled' : ''}>${btnLabel}</button>
      <div class="pile ${canAct() && mustDiscard ? 'tgt' : ''}" id="discard" data-drop="discard" aria-label="Descarte">${top ? face(top) : '<div class="none"></div>'}</div>
    </div>
    <div class="side">
      <button class="btn icon" data-act="open" data-m="settings" aria-label="Ajustes">${spr('ic-gear')}</button>
      <button class="btn icon" data-act="open" data-m="achv" aria-label="Logros">${spr('ic-trophy')}</button>
    </div>
  </div>
  <div class="lanes" id="laneMe">${cols.map(i => laneHTML(me, i, tg)).join('')}</div>
  <div class="row" id="rowMe">${cols.map(i => towerHTML(me, i, tg)).join('')}</div>
  <div class="hand" style="${fanVars(n)}">${handH}</div>
  ${dlg}`;
  playFx();
}

/* Abanico de la mano: separación (--m) y giro (--a) según cuántas cartas haya, para que siempre quepan.
   El giro también abre el abanico hacia los lados, así que se descuenta del ancho disponible. */
function fanVars(n) {
  const W = Math.min(innerWidth, 480) - 32;
  const card = Math.max(36, Math.min(74, (innerHeight - 290) / 7.2));     // igual que --h en el CSS
  n = Math.max(n, 1);
  const a = n > 1 ? Math.min(5, 14 / (n - 1)) : 0;                       // grados por carta
  const spread = 1.5 * card * 1.4 * Math.sin((n - 1) / 2 * a * Math.PI / 180) * 2;
  const step = n > 1 ? Math.min(card - 16, (W - card - spread) / (n - 1)) : card;
  return `--m:${Math.floor((step - card) / 2)}px;--a:${a.toFixed(2)}deg`;
}

/* ======================================================================
   Animaciones ("juice")
   ====================================================================== */
const sleep = ms => new Promise(r => setTimeout(r, REDUCED ? Math.min(ms, 40) : ms));
const anim = (el, kf, opt) =>
  el.animate(kf, Object.assign({ fill: 'forwards' }, opt, REDUCED ? { duration: Math.min(opt.duration, 60) } : {})).finished.catch(() => {});
function toStage(r) { const S = stage.getBoundingClientRect(); return { x: r.left - S.left, y: r.top - S.top, w: r.width }; }
const rectOf = el => el ? toStage(el.getBoundingClientRect()) : null;
function place(d, r) { d.style.left = r.x + 'px'; d.style.top = r.y + 'px'; d.style.width = r.w + 'px'; }
/* Crea un elemento en la capa de efectos, encima de la mesa. */
function ov(html, r, cls = '') {
  const d = document.createElement('div');
  d.className = 'ov ' + cls; place(d, r); d.innerHTML = html;
  fxl.appendChild(d);
  return d;
}
function center(el) { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }

function burst(el, n, colors, spread) {
  if (REDUCED || !el) return;
  const [x, y] = center(el);
  for (let k = 0; k < n; k++) {
    const p = document.createElement('i'), a = Math.random() * 6.283, d = (spread || 60) * (0.35 + Math.random() * 0.65);
    p.className = 'pt';
    p.style.cssText = `left:${x}px;top:${y}px;background:${colors[k % colors.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 18}px`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 650);
  }
}
function floatAt(el, text, color) {
  if (!el) return;
  const [x, y] = center(el), f = document.createElement('div');
  f.className = 'float'; f.textContent = text;
  f.style.cssText = `left:${x}px;top:${y}px;color:${color}`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1050);
}
function shake(big) {
  if (REDUCED) return;
  stage.classList.remove('shake', 'shake-big');
  void stage.offsetWidth;                       // reinicia la animación
  stage.classList.add(big ? 'shake-big' : 'shake');
}
const STONE = ['#7d6b4f', '#b39c70', '#54452f', '#e8a33d'];
const PAPER = ['#cdb98a', '#e0cfa2', '#8a7a5a'];

/* Vuelo de una carta hasta un rectángulo, con un pequeño giro. */
async function fly(d, r, ms, rot = -8) {
  await anim(d, [
    { left: d.style.left, top: d.style.top, width: d.style.width, transform: `rotate(${rot}deg) scale(1.05)` },
    { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', transform: 'none' }
  ], { duration: ms, easing: 'cubic-bezier(.25,.8,.3,1)' });
  place(d, r); d.getAnimations().forEach(a => a.cancel());
}
/* Embestida: la carta toma impulso, golpea el objetivo y vuelve. Devuelve en el momento del impacto. */
async function lunge(d, r) {
  Sound.sfx('slash');
  const a = rectOf(d), dx = (r.x + r.w / 2 - (a.x + a.w / 2)) * 0.8, dy = (r.y + r.w * 0.7 - (a.y + a.w * 0.7)) * 0.8;
  anim(d, [
    { transform: 'none' },
    { transform: `translate(${-dx * 0.15}px,${-dy * 0.15}px) scale(1.04) rotate(-4deg)`, offset: 0.35 },
    { transform: `translate(${dx}px,${dy}px) scale(1.15)`, offset: 0.62 },
    { transform: 'none' }
  ], { duration: 360, easing: 'ease-in-out' });
  await sleep(225);
}
/* Giro de carta: se pone de canto, cambia de cara y vuelve con rebote. */
async function flip(d, html) {
  Sound.sfx('flip');
  await anim(d, [{ transform: 'none' }, { transform: 'rotateY(90deg) scale(1.12)' }], { duration: 130, easing: 'ease-in' });
  d.innerHTML = html;
  await anim(d, [{ transform: 'rotateY(-90deg) scale(1.12)' }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  d.getAnimations().forEach(a => a.cancel());
}
/* El número del valor sube o baja de uno en uno. */
async function tick(d, from, to, base) {
  const v = d.querySelector('.val');
  if (!v || from === to) return;
  const step = from > to ? -1 : 1, wait = Math.max(28, Math.min(80, 480 / Math.abs(to - from)));
  let k = 0;
  for (let x = from + step; ; x += step) {
    v.textContent = Math.max(0, x);
    v.classList.toggle('low', x < base); v.classList.toggle('high', x > base);
    anim(v, [{ transform: 'scale(1.8)' }, { transform: 'none' }], { duration: 140 });
    // Bajar: ficha. Subir: cristal, cada punto un poco más agudo.
    if (step > 0) Sound.sfx('tickUp', 0, Math.min(2, 1 + 0.06 * k++)); else Sound.sfx('tick');
    await sleep(wait);
    if (x === to) break;
  }
}
function land(d) {
  anim(d, [{ transform: 'scale(1.25) rotate(-3deg)', filter: 'brightness(1.6)' }, { transform: 'none', filter: 'none' }],
    { duration: 260, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  burst(d, 6, ['#e6dcc0', '#9a8a6a'], 34);
}
function hitFlash(d) {
  anim(d, [{ filter: 'brightness(3) saturate(0)', transform: 'scale(1.08) rotate(2deg)' }, { filter: 'none', transform: 'none' }],
    { duration: 260, easing: 'ease-out' });
}
async function crumble(d, colors) {
  Sound.sfx('fall'); shake(true); burst(d, 28, colors, 105);
  if (Settings.v.vibra) { try { navigator.vibrate && navigator.vibrate(140); } catch (x) {} }
  await anim(d, [
    { transform: 'none', opacity: 1 },
    { transform: 'translateX(-4px) rotate(-4deg)', opacity: 1, offset: 0.2 },
    { transform: 'translateX(4px) rotate(3deg)', opacity: 1, offset: 0.4 },
    { transform: 'translateY(22px) rotate(10deg) scale(.4)', opacity: 0 }
  ], { duration: 460, easing: 'ease-in' });
  d.remove();
}
function popPile(id) { const p = $(id); if (p) anim(p, [{ transform: 'scale(1.18)' }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,1.6,.4,1)' }); }

/* Prepara la animación de un evento. Las tapas se crean YA (antes de que se vea la mesa nueva);
   devuelve una función que reproduce la animación cuando le toque. */
function prepare(f) {
  const me = G.me, mineEv = f.by === me;
  const R = el => rectOf(el);
  const oh = R($('ohand'));
  // Carta del rival que se juega: la que estaba en su mano en la posición f.hi.
  const oc = !mineEv && f.hi != null && $('ohand') ? $('ohand').children[f.hi] : null;
  const src = f.src ? toStage(f.src) : oc ? rectOf(oc.querySelector('.oci')) : { x: oh.x + oh.w / 2 - 33, y: oh.y - 40, w: 66 };
  const discR = R($('discard')), deckR = R($('deck'));
  const coverDiscard = () => discR && ov(f.dTop ? face(f.dTop) : '<div class="none" style="aspect-ratio:5/7;border:2px dashed rgba(154,138,106,.45)"></div>', discR, 'cover');
  // Las cartas del rival salen boca abajo y se giran al dejar su mano (salvo una torre nueva, que sigue oculta).
  let reveal = null;
  const flyCard = html => { if (oc && html !== BACK) { reveal = html; html = BACK; } return ov(html, src, 'fly wait'); };
  /* Antes de jugar: el rival duda entre un par de cartas y baja la elegida, como haces tú al levantarla. */
  const go = async card => {
    if (oc) {
      const kids = [...oc.parentNode.children];
      for (let k = 0; k < 2 && kids.length > 1; k++) {
        const h = kids[Math.floor(Math.random() * kids.length)];
        h.classList.add('hov'); Sound.sfx('hover'); await sleep(240); h.classList.remove('hov'); await sleep(60);
      }
      oc.classList.add('sel'); Sound.sfx('lift');
      await sleep(460);
      place(card, rectOf(oc.querySelector('.oci')));
      oc.style.visibility = 'hidden';
      card.classList.remove('wait');
      if (reveal) await flip(card, reveal);
    } else { card.classList.remove('wait'); Sound.sfx('lift'); }
  };

  switch (f.k) {
    case 'atk': {
      const lr = R(slotEl(f.o, f.t, 'lane')), tr = R(slotEl(f.o, f.t, 'tower'));
      const hidden = f.tw && f.tw.hidden[me];
      const shCov = f.sh ? ov(face(f.sh.top, '', f.sh.before), lr, 'cover') : null;
      const twCov = f.tw ? ov(hidden ? BACK : face(f.tw.c, '', f.tw.before), tr, 'cover') : null;
      const dCov = coverDiscard(), card = flyCard(face(f.c));
      return async () => {
        await go(card);
        // Se coloca en la casilla del rival de esa columna. Si hay escudo, queda medio montada encima.
        const toward = f.o === me ? -1 : 1;                       // hacia el lado de quien ataca
        const spot = shCov ? { x: lr.x, y: lr.y + toward * lr.w * 0.55, w: lr.w } : lr;
        await fly(card, spot, 320, f.o === me ? 10 : -10);
        land(card); Sound.sfx('drop');
        await sleep(220);
        if (shCov) {                                  // 1) golpe al escudo
          await lunge(card, lr);
          Sound.sfx('resist'); shake(false); hitFlash(shCov);
          burst(shCov, 10, ['#ffffff', '#e6dcc0', '#b39c70'], 50);
          floatAt(shCov, '-' + (f.sh.before - f.sh.after), '#e6dcc0');
          await tick(shCov, f.sh.before, f.sh.after, val(f.sh.top));
          if (f.sh.broke) await crumble(shCov, PAPER); else { await sleep(160); shCov.remove(); }
        }
        if (twCov) {                                  // 2) la torre se desvela y recibe el daño
          if (hidden) { await sleep(60); await flip(twCov, face(f.tw.c, '', f.tw.before)); await sleep(160); }
          await lunge(card, tr);
          Sound.sfx('hit'); shake(f.tw.fall); hitFlash(twCov);
          burst(twCov, 14, ['#ffffff', '#c4554a', '#e8a33d'], 60);
          floatAt(twCov, '-' + f.tw.hit, '#e0503f');
          await tick(twCov, f.tw.before, f.tw.after, val(f.tw.c));
          await sleep(240);
          if (f.tw.fall) await crumble(twCov, STONE); else twCov.remove();
        }
        await sleep(120);
        await fly(card, discR, 260, 12);
        popPile('discard'); card.remove(); dCov && dCov.remove();
      };
    }
    case 'shield': {
      const lr = R(slotEl(f.o, f.t, 'lane'));
      const cov = ov(f.prev ? face(f.prev, '', f.before) : '<div class="lane-look"></div>', lr, 'cover');
      const card = flyCard(face(f.c));
      return async () => {
        await go(card);
        await fly(card, lr, 320, mineEv ? -8 : 8);
        Sound.sfx('reinf'); land(card); cov.remove();
        if (f.before) { floatAt(card, '+' + val(f.c), '#e6dcc0'); await sleep(140); await tick(card, val(f.c), f.after, val(f.c)); }
        await sleep(300); card.remove();
      };
    }
    case 'heal': {
      const lr = R(slotEl(f.o, f.t, 'lane')), tr = R(slotEl(f.o, f.t, 'tower'));
      const cov = ov(face(f.tw.c, '', f.tw.before), tr, 'cover');   // la ♥ se funde con la torre y le da vida
      const card = flyCard(face(f.c));
      return async () => {
        await go(card);
        await fly(card, lr, 300, mineEv ? -8 : 8);
        await sleep(220);
        Sound.sfx('heal');
        await anim(card, [{ transform: 'none', opacity: 1 }, { transform: `translateY(${tr.y - lr.y}px) scale(.3)`, opacity: 0 }],
          { duration: 260, easing: 'ease-in' });
        card.remove();
        burst(cov, 12, ['#c4554a', '#e6dcc0'], 50);
        floatAt(cov, '+' + (f.tw.after - f.tw.before), '#7fd18a');
        await tick(cov, f.tw.before, f.tw.after, val(f.tw.c));
        await sleep(240); cov.remove();
      };
    }
    case 'loot': {
      const dCov = coverDiscard(), card = flyCard(face(f.c));
      return async () => {
        await go(card);
        await fly(card, deckR, 300, -10);
        Sound.sfx('loot'); land(card); popPile('deck');
        floatAt(card, '+2', '#e8a33d');
        await sleep(300);
        await fly(card, discR, 240, 10);
        popPile('discard'); card.remove(); dCov && dCov.remove();
      };
    }
    case 'discard': {
      const dCov = coverDiscard(), card = flyCard(face(f.c));
      return async () => {
        await go(card);
        await fly(card, discR, 300, 14);
        Sound.sfx('discard'); popPile('discard'); card.remove(); dCov && dCov.remove();
      };
    }
    case 'reshuffle':
      return async () => { Sound.sfx('shuffle'); popPile('deck'); floatAt($('deck'), 'BARAJA', '#e8a33d'); await sleep(400); };
    case 'ready':
      return async () => { Sound.sfx('ready'); floatAt(mineEv ? $('passBtn') : $('ohand'), 'LISTO', '#e8a33d'); await sleep(500); };
    case 'go':
      return async () => { Sound.sfx('go'); shake(false); floatAt(app, '¡AL ASALTO!', '#e8a33d'); await sleep(900); };
    case 'prepme':
      return async () => { Sound.sfx('turn'); floatAt(app, 'PON TUS ESCUDOS', '#e6dcc0'); await sleep(700); };
    case 'pass':
      return async () => { Sound.sfx('discard'); floatAt(mineEv ? $('passBtn') : $('ohand'), 'PASA', '#e6dcc0'); await sleep(450); };
    case 'over':
      return async () => {
        await sleep(250);
        const win = f.winner === me;
        if (win) for (let k = 0; k < 4; k++) { burst(app, 16, ['#e8a33d', '#c4554a', '#e6dcc0'], 160); await sleep(140); }
        await sleep(300);
      };
    case 'turn':
      return async () => { Sound.sfx('turn'); };
  }
  return null;
}

/* Reproduce en orden los eventos pendientes. Mientras dura, no se puede jugar. */
let fxChain = Promise.resolve();
function playFx() {
  const q = G.fxq; G.fxq = [];
  if (!q.length) return;
  const beats = q.map(prepare).filter(Boolean);
  fxChain = fxChain
    .then(async () => { for (const b of beats) { try { await b(); } catch (e) {} } })
    .then(() => {
      if (--G.pending > 0) return;
      G.animating = false; G.oPick = null;
      fxl.querySelectorAll('.ov').forEach(x => x.remove());
      render();
    });
}

/* ---------- Lo que ha pasado en la última jugada: logros, y a la cola de animaciones ---------- */
function processEvents(s) {
  const me = G.me;
  const evs = (s.ev || []).filter(e => e.k !== 'start');
  if ((s.ev || []).some(e => e.k === 'start')) { G.stats = { loot: 0, lost: false, dmg: 0, felled: 0, turns: 0 }; G.prevHand = []; }
  // Datos para la pantalla final: daño que has hecho, torres que has tumbado y turnos jugados.
  evs.forEach(e => {
    if (e.by !== me) return;
    if (['atk', 'heal', 'loot', 'discard', 'pass'].includes(e.k) || (e.k === 'shield' && s.phase !== 'prep')) G.stats.turns++;
    if (e.k === 'atk') {
      G.stats.dmg += (e.sh ? e.sh.before - e.sh.after : 0) + (e.tw ? e.tw.hit : 0);
      if (e.tw && e.tw.fall) G.stats.felled++;
    }
  });
  evs.forEach(e => {
    const mine = e.by === me;
    switch (e.k) {
      case 'atk':
        if (e.tw && e.tw.fall) {
          if (mine) { Achievements.unlock('sangre'); if (e.exact) Achievements.unlock('exacto'); }
          else G.stats.lost = true;
        }
        break;
      case 'shield': if (mine && s.players[me].front.every(F => F)) Achievements.unlock('obras'); break;
      case 'heal': if (mine && e.tw.after === val(e.tw.c)) Achievements.unlock('fenix'); break;
      case 'loot': if (mine && ++G.stats.loot >= 3) Achievements.unlock('saqueador'); break;
      case 'over':
        if (e.winner === me) {
          Achievements.unlock('victoria');
          if (!G.stats.lost) Achievements.unlock('intacta');
          if (s.players[me].towers.filter(T => T).length === 1) Achievements.unlock('ultima');
          if (Achievements.addWin() >= 5) Achievements.unlock('veterano');
        }
        if (G.mode === 'online') Achievements.unlock('online');
        break;
    }
    if (!mine && e.hi != null) G.oPick = { n: e.hn, i: e.hi };
    G.fxq.push(Object.assign({}, e, { src: mine ? G.src : null, dTop: G.prevTop }));
  });
  G.src = null;
  const nowMine = (s.phase === 'play' || s.phase === 'prep') && actor(s) === me;
  if (nowMine && !G.wasMine) G.fxq.push({ k: s.phase === 'prep' ? 'prepme' : 'turn' });
  G.wasMine = nowMine;
  if (G.fxq.length) { G.animating = true; G.pending++; }
}

/* ---------- Flujo de la partida ---------- */
/* Tras cada acción: sube la versión, encola las animaciones y, según el modo, envía o hace jugar a la IA. */
async function commit() {
  G.sel = null; G.s.v++;
  processEvents(G.s); G.seenV = G.s.v;
  if (G.mode === 'online') {
    G.busy = true; render();
    try { await sendState(G.s); }
    catch (e) {
      toast(e && e.code === 'invalid_argument' ? 'No tienes permiso para escribir en esta partida.'
        : e && e.code === 'offline' ? 'Tu rival no está conectado: verá tu jugada cuando vuelva a entrar.'
        : 'No se pudo enviar la jugada. Inténtalo otra vez.');
    }
    G.busy = false; render();
  } else {
    render();
    if (G.s.phase !== 'over' && actor(G.s) === 1) {
      const gid = G.gid;
      fxChain.then(() => setTimeout(() => {
        if (gid !== G.gid || G.mode !== 'ai' || !G.s || G.s.phase === 'over' || actor(G.s) !== 1) return;
        G.s.ev = []; aiAct(G.s, 1); commit();
      }, 550));
    }
  }
}
/* Ejecuta una acción del jugador sobre el estado y la confirma. */
function act(fn) { G.s.ev = []; fn(G.s); return commit(); }

function leave() {
  if (G.unsub) { try { G.unsub(); } catch (e) {} }
  netClose();
  G.joining = false;
  fxl.querySelectorAll('.ov').forEach(x => x.remove());
  Object.assign(G, { unsub: null, ref: null, s: null, mode: null, net: '', busy: false, seenV: null, wasMine: false,
    fxq: [], prevHand: [], prevTop: null, sel: null, animating: false, pending: 0, oPick: null, screen: 'menu' });
  fxChain = Promise.resolve();
  G.gid++;
}
function startAI() {
  leave(); G.mode = 'ai'; G.me = 0; G.err = ''; G.screen = 'game';
  G.s = newGame(['you', 'ai']); begin(G.s); G.s.v = 0;
  commit();
}
function again() {
  if (G.mode === 'ai') return startAI();
  const old = G.s, s = newGame(old.players.map(p => p.id));
  begin(s); s.v = old.v; G.s = s;
  commit();
}

/* ---------- Jugadas del jugador (valen para tocar y para arrastrar) ---------- */
/* Origen de la carta que se juega: donde se soltó o, si se tocó, su sitio en la mano. */
function srcFromHand() {
  const b = app.querySelector(`.hc[data-i="${G.sel}"]`);
  return b ? b.getBoundingClientRect() : null;
}
function chooseSlot(o, i) {
  if (!curTargets().some(x => x[0] === o && x[1] === i)) return false;
  const sel = G.sel;
  if (!G.src) G.src = srcFromHand();
  Sound.sfx('drop');
  act(st => play(st, G.me, sel, i));
  return true;
}
function useLoot() {
  if (!canAct() || G.s.phase !== 'play' || G.sel == null || kind(selCard()) !== 'loot') return false;
  const sel = G.sel;
  if (!G.src) G.src = srcFromHand();
  Sound.sfx('drop'); act(st => play(st, G.me, sel));
  return true;
}
function discardSel() {
  if (!canAct() || G.sel == null || G.s.phase === 'prep') return false;
  const sel = G.sel;
  if (!G.src) G.src = srcFromHand();
  act(st => discardCard(st, G.me, sel));
  return true;
}
/* El botón: con carta elegida la descarta; sin carta, pasa el turno. */
function passOrDiscard() {
  if (!canAct()) return;
  if (G.s.phase === 'prep') { G.sel = null; return act(st => passTurn(st, G.me)); }
  if (G.sel != null) return discardSel();
  if (G.s.phase === 'play') act(st => passTurn(st, G.me));
}

/* ---------- Elegir carta ---------- */
function selectCard(i) {
  Sound.sfx(i == null ? 'discard' : 'lift');
  G.sel = i; render();
}
/* La carta que tiene el ratón encima se inclina hacia él; al salir, vuelve a quedarse recta. */
let tilted = null;
function untilt() { if (tilted) { tilted.style.removeProperty('--tx'); tilted.style.removeProperty('--ty'); tilted = null; } }
app.addEventListener('pointermove', e => {
  if (drag || e.pointerType !== 'mouse') return;
  const b = e.target.closest('.hc');
  if (b !== tilted) untilt();
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect();
  const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
  const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
  b.style.setProperty('--ty', (dx * 16).toFixed(1) + 'deg');
  b.style.setProperty('--tx', (-dy * 14).toFixed(1) + 'deg');
  tilted = b;
});
app.addEventListener('pointerleave', untilt);

/* ---------- Arrastrar y soltar ---------- */
let drag = null;
function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  return el.closest('.slot.tgt') || el.closest('[data-drop="discard"]') || el.closest('[data-drop="play"]');
}
app.addEventListener('pointerdown', e => {
  const b = e.target.closest('.hc');
  if (!b || b.disabled || !canAct()) return;
  drag = { i: +b.dataset.i, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, lastX: e.clientX, tilt: 0, ghost: null, over: null, home: b.getBoundingClientRect() };
});
document.addEventListener('pointermove', e => {
  if (G.screen === 'menu') tiltMenu(e);
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.on) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
    // Empieza el arrastre: la carta se levanta y aparece una copia que sigue al dedo.
    drag.on = true; G.sel = drag.i; G.dragging = true;
    document.body.classList.add('dragging');
    render();
    const g = document.createElement('div');
    g.className = 'ghost'; g.innerHTML = face(selCard());
    document.body.appendChild(g); drag.ghost = g;
    Sound.sfx('lift');
  }
  const g = drag.ghost;
  drag.tilt = drag.tilt * 0.7 + Math.max(-20, Math.min(20, (e.clientX - drag.lastX) * 2)) * 0.3;   // se inclina hacia donde se mueve
  drag.lastX = e.clientX;
  g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; g.style.setProperty('--tilt', drag.tilt + 'deg');
  const t = dropTarget(e.clientX, e.clientY), hot = t && !t.matches('[data-drop="play"]') ? t : null;
  if (hot !== drag.over) {
    if (drag.over) drag.over.classList.remove('over');
    if (hot) { hot.classList.add('over'); Sound.sfx('hover'); }
    drag.over = hot;
  }
});
function endDrag(e, cancelled) {
  const d = drag; drag = null;
  if (!d || !d.on) return;
  G.dragging = false; G.noClickUntil = performance.now() + 300;
  document.body.classList.remove('dragging');
  const t = cancelled ? null : dropTarget(e.clientX, e.clientY);
  const gb = d.ghost.getBoundingClientRect();
  G.src = { left: gb.left + gb.width / 2 - 37, top: gb.top + gb.height / 2 - 52, width: 74, height: 104 };
  let done = false;
  if (t && t.matches('.slot')) done = chooseSlot(+t.dataset.o, +t.dataset.i);
  else if (t && t.matches('[data-drop="discard"]')) done = discardSel();
  else if (t && t.matches('[data-drop="play"]')) done = useLoot();
  if (done) { d.ghost.remove(); return; }
  // No era un sitio válido: la carta vuelve a la mano.
  G.src = null;
  d.ghost.classList.add('back');
  d.ghost.style.left = d.home.left + d.home.width / 2 + 'px'; d.ghost.style.top = d.home.top + d.home.height / 2 + 'px';
  setTimeout(() => d.ghost.remove(), 170);
  render();
}
document.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) endDrag(e, false); });
document.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) endDrag(e, true); });

/* ---------- Menú: las cartas se inclinan hacia el puntero y se giran al tocarlas ---------- */
function tiltMenu(e) {
  const f = $('mfan');
  if (!f || REDUCED) return;
  const b = f.getBoundingClientRect(), nx = (e.clientX - (b.left + b.width / 2)) / innerWidth, ny = (e.clientY - (b.top + b.height / 2)) / innerHeight;
  f.style.setProperty('--ry', (nx * 26).toFixed(1) + 'deg');
  f.style.setProperty('--rx', (-ny * 20).toFixed(1) + 'deg');
}
async function menuFlip(btn, i) {
  const c = btn.querySelector('.mci');
  if (!c || c.dataset.busy) return;
  c.dataset.busy = '1';
  const up = 'translateY(-34px)';
  Sound.sfx('flip');
  await anim(c, [{ transform: 'none' }, { transform: up + ' rotateY(90deg) scale(1.1)' }], { duration: 150, easing: 'ease-in' });
  c.innerHTML = BACK;
  await anim(c, [{ transform: up + ' rotateY(-90deg) scale(1.1)' }, { transform: up + ' scale(1.1)' }], { duration: 160, easing: 'ease-out' });
  await sleep(380);
  Sound.sfx('flip');
  await anim(c, [{ transform: up + ' scale(1.1)' }, { transform: up + ' rotateY(90deg) scale(1.1)' }], { duration: 150, easing: 'ease-in' });
  c.innerHTML = face(MENU_CARDS[i]);
  await anim(c, [{ transform: up + ' rotateY(-90deg) scale(1.1)' }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  Sound.sfx('drop');
  c.getAnimations().forEach(a => a.cancel());
  delete c.dataset.busy;
}

/* ---------- Otras entradas ---------- */
document.addEventListener('pointerdown', () => Sound.init());     // el audio necesita un primer toque
document.addEventListener('keydown', e => {
  Sound.init();
  if (G.screen === 'intro' && (e.key === 'Enter' || e.key === ' ')) { G.screen = 'menu'; render(); }
});
let lastHover = -1;
app.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse' || drag) return;
  const b = e.target.closest('.hc,.mc');
  const i = b && !b.disabled ? b.className + b.dataset.i : -1;
  if (i !== lastHover) { lastHover = i; if (b && !b.disabled) Sound.sfx('hover'); }
});

app.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'joinForm') joinOnline($('codeIn').value); });

modalBox.addEventListener('input', e => {
  const key = e.target.dataset.set;
  if (!key) return;
  Sound.init();
  Settings.set(key, e.target.type === 'checkbox' ? e.target.checked : e.target.value / 100);
  if (key.startsWith('sfx')) Sound.sfx('select');
});
modalBox.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'close') { Sound.sfx('close'); return openModal(null); }
  if (el.dataset.act === 'reset') {
    if (!G.confirmReset) { G.confirmReset = true; return renderModal(); }
    Achievements.reset(); G.confirmReset = false; renderModal(); toast('Logros borrados');
  }
});

app.addEventListener('click', e => {
  if (G.screen === 'intro') { Sound.sfx('select'); G.screen = 'menu'; return render(); }   // cualquier toque salta la intro
  if (performance.now() < G.noClickUntil) return;     // ese clic era el final de un arrastre
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, i = +el.dataset.i;
  if (a === 'mcard') return menuFlip(el, i);
  if (a === 'open') { Sound.sfx('open'); return openModal(el.dataset.m); }
  if (a === 'ai') return startAI();
  if (a === 'create') return createOnline();
  if (a === 'menu') { leave(); G.err = ''; return render(); }
  if (a === 'again') return again();
  if (!canAct()) return;
  if (a === 'hand') { selectCard(G.sel === i ? null : i); return; }
  if (a === 'pass') return passOrDiscard();
  if (a === 'deck') return useLoot();
  if (a === 'slot') return chooseSlot(+el.dataset.o, i);
});

/* ---------- Arranque ---------- */
Sprites.load();
Settings.apply();
render();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(Scene.draw));
