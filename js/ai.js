/* ===== Rival IA =====
   aiAct hace UNA acción por llamada para el jugador p, probando jugadas por orden de prioridad.
   Solo usa lo que un jugador real sabría: torres desveladas, escudos (están a la vista)
   y sus propias torres reconstruidas. Una torre boca abajo la estima en 7,5 de vida. */
function aiAct(s, p) {
  const P = s.players[p], o = 1 - p, O = s.players[o], H = P.hand;
  const known = T => T.up || T.k[p];
  const life = T => known(T) ? hpOf(T) : 7.5;
  const hurt = [0, 1, 2, 3].filter(i => P.towers[i] && P.towers[i].dmg > 0)
    .sort((a, b) => P.towers[b].dmg - P.towers[a].dmg);

  /* Carta menos útil: un ♥ que no puede curar nada sobra antes que nada; después, la de menor valor. */
  const worst = () => {
    let bi = 0, bs = 1e9;
    H.forEach((c, i) => {
      const score = kind(c) === 'heal' && !hurt.length ? val(c) - 20 : val(c);
      if (score < bs) { bs = score; bi = i; }
    });
    return bi;
  };

  const of = (k, desc) => H.map((c, i) => i).filter(i => kind(H[i]) === k)
    .sort((x, y) => desc ? val(H[y]) - val(H[x]) : val(H[x]) - val(H[y]));
  const spades = of('atk'), hearts = of('heal', true), clubs = of('reinf', true), loot = of('loot');
  // Preparación: pone escudos de 4 o más en torres sin escudo, y luego "Listo".
  if (s.phase === 'prep') {
    const free = [0, 1, 2, 3].filter(i => P.towers[i] && !P.front[i]);
    if (clubs.length && free.length && val(H[clubs[0]]) >= 4) return play(s, p, clubs[0], free[Math.floor(Math.random() * free.length)]);
    return passTurn(s, p);
  }
  const cols = [0, 1, 2, 3].filter(i => O.towers[i]);
  const cost = i => shHp(O.front[i]) + life(O.towers[i]);       // daño que haría falta para tumbarla
  const easiest = () => cols.slice().sort((a, b) => cost(a) - cost(b))[0];

  // 1. Tumbar seguro: conozco la vida de la torre y mi ♠ llega. Uso el más pequeño que baste.
  for (const i of spades) for (const t of cols) {
    if (known(O.towers[t]) && val(H[i]) >= cost(t)) return play(s, p, i, t);
  }
  // 2. Curar una torre muy dañada.
  if (hurt.length && hearts.length && P.towers[hurt[0]].dmg >= 4) return play(s, p, hearts[0], hurt[0]);
  // 3. Atacar con el ♠ más alto a la columna más débil.
  if (spades.length && cols.length) return play(s, p, spades[spades.length - 1], easiest());
  // 4. Robar cartas.
  if (loot.length && s.deck.length >= 2) return play(s, p, loot[0]);
  // 5. Escudo delante de la torre más débil.
  if (clubs.length) {
    const mine = [0, 1, 2, 3].filter(i => P.towers[i] && !P.front[i])
      .sort((a, b) => (shHp(P.front[a]) + life(P.towers[a])) - (shHp(P.front[b]) + life(P.towers[b])));
    if (mine.length) return play(s, p, clubs[0], mine[0]);
  }
  // 6. Curar lo que haya.
  if (hurt.length && hearts.length) return play(s, p, hearts[0], hurt[0]);
  // 7. Nada útil: con muchas cartas tira la peor; si no, pasa.
  if (H.length >= 7) return discardCard(s, p, worst());
  return passTurn(s, p);
}
