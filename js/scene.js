/* ===== Fondo en pixel art: la mesa =====
   Dibuja en un canvas pequeño (1 píxel del dibujo = 3 de pantalla) una mesa de madera vieja,
   a oscuras, con una franja de losas de piedra bajo cada fila de torres y una línea tallada
   en el centro que separa los dos bandos. Tu mitad es el reflejo exacto de la del rival. */
const Scene = (() => {
  const P = 3;                    // tamaño de cada píxel del dibujo
  let c, key = '';
  const rnd = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

  /* Tablones horizontales con vetas, nudos y clavos. */
  function planks(W, H) {
    const r = rnd(11), PH = 9;
    for (let y = 0, row = 0; y < H; y += PH, row++) {
      px(0, y, W, PH, row % 2 ? '#1b130c' : '#20160d');
      px(0, y, W, 1, '#0b0805');                                   // junta entre tablones
      px(0, y + 1, W, 1, row % 2 ? '#241a10' : '#291d11');          // canto iluminado
      for (let i = 0; i < W / 6; i++) px(r() * W, y + 2 + Math.floor(r() * (PH - 3)), 3 + Math.floor(r() * 9), 1, row % 2 ? '#160f09' : '#1a120a');
      if (r() < 0.5) { const kx = r() * W, ky = y + 3 + r() * 3; px(kx, ky, 3, 2, '#120c07'); px(kx + 1, ky, 1, 1, '#0b0805'); }
      const off = (row * 37) % 60;                                  // clavos en las uniones
      for (let x = off; x < W; x += 60) { px(x, y + 3, 1, 1, '#3a2c1c'); px(x, y + 6, 1, 1, '#3a2c1c'); px(x - 1, y, 1, PH, '#0e0a06'); }
    }
  }

  /* Franja de losas de piedra bajo una fila de torres. */
  function stoneBand(W, top, bottom) {
    const r = rnd(top * 7 + 3);
    px(0, top - 1, W, 1, '#0a0806'); px(0, bottom, W, 1, '#0a0806');
    px(0, top, W, bottom - top, '#26211c');
    for (let y = top, row = 0; y < bottom; y += 5, row++) {
      px(0, y, W, 1, '#16120f');
      for (let x = (row % 2) * 6; x < W; x += 12) {
        px(x, y, 1, 5, '#16120f');
        px(x + 1, y + 1, 10, 1, r() < 0.5 ? '#2f2924' : '#2b2520');  // borde de luz de cada losa
        if (r() < 0.15) px(x + 3 + r() * 6, y + 2 + r() * 2, 2, 1, '#1d1814');   // grietas
      }
    }
  }

  /* Palos en pixel art (7x7) para los estandartes. */
  const SUIT = {
    S: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '...X...', '..XXX..'],
    C: ['..XXX..', '..XXX..', 'XXXXXXX', 'XXXXXXX', 'XX.X.XX', '...X...', '..XXX..'],
    H: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    D: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']
  };
  function suit(k, x, y, s, col, shade) {
    SUIT[k].forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch !== 'X') return;
      px(x + i * s + 1, y + j * s + 1, s, s, '#1a0606');               // sombra
      px(x + i * s, y + j * s, s, s, j < 2 ? shade : col);
    }));
  }

  /* Estandarte colgado en los laterales del ordenador: barra, tela roja con
     ribete dorado, cola de golondrina y dos palos de la baraja bordados. */
  function banner(cx, top, w, h, a, b) {
    const x = Math.round(cx - w / 2), tail = Math.round(w / 2);
    px(cx, 0, 1, top, '#2a1d10');                                     // cuerda
    px(x - 3, top - 2, w + 6, 3, '#3b2a18'); px(x - 3, top - 2, w + 6, 1, '#5a4326');   // barra
    px(x - 5, top - 3, 3, 5, '#e8a33d'); px(x + w + 2, top - 3, 3, 5, '#e8a33d');       // remates
    for (let y = 0; y < h; y++) {
      // por debajo de h - tail se recorta en V (cola de golondrina)
      const cut = Math.max(0, y - (h - tail));
      for (let side = 0; side < 2; side++) {
        const x0 = side ? x + tail + cut : x, x1 = side ? x + w : x + tail - cut;
        if (x1 <= x0) continue;
        px(x0, top + 1 + y, x1 - x0, 1, '#6e1414');
      }
    }
    // Pliegues y ribete
    for (let i = 3; i < w - 2; i += 6) px(x + i, top + 1, 1, h - tail, '#5c1010');
    px(x, top + 1, w, 1, '#b36a24'); px(x + 1, top + 3, w - 2, 1, '#e8a33d');
    px(x + 1, top + 3, 1, h - tail - 3, '#e8a33d'); px(x + w - 2, top + 3, 1, h - tail - 3, '#e8a33d');
    for (let y = 0; y < tail - 1; y++) {
      px(x + 1 + y, top + h - tail + y, 1, 1, '#e8a33d'); px(x + w - 2 - y, top + h - tail + y, 1, 1, '#e8a33d');
    }
    px(x, top + 1, 1, h - tail, '#3a0a0a'); px(x + w - 1, top + 1, 1, h - tail, '#3a0a0a');
    const s = 2, sw = 7 * s, sx = Math.round(cx - sw / 2);
    suit(a, sx, top + 8, s, '#e8a33d', '#ffd77a');
    suit(b, sx, top + 8 + sw + 6, s, '#e8a33d', '#ffd77a');
  }

  function sides(W, H) {
    const app = document.getElementById('app');
    if (!app) return;
    const aw = Math.ceil(app.getBoundingClientRect().width / P);
    const side = (W - aw) / 2;
    if (side < 34) return;                          // móvil o ventana estrecha: sin estandartes
    const w = Math.min(30, Math.floor(side * 0.5)), h = Math.min(Math.round(w * 2.6), H - 30);
    const top = Math.round(H * 0.16);
    banner(Math.round(side / 2), top, w, h, 'S', 'C');
    banner(Math.round(W - side / 2), top, w, h, 'H', 'D');
  }

  function draw() {
    const cv = document.getElementById('scene');
    if (!cv) return;
    const b = cv.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const W = Math.ceil(b.width / P), H = Math.ceil(b.height / P);
    const rect = id => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round((r.top - b.top) / P), bottom: Math.round((r.bottom - b.top) / P) };
    };
    const op = rect('rowOp'), me = rect('rowMe');
    const k = [W, H, op && op.top, op && op.bottom, me && me.top, me && me.bottom].join();
    if (k === key) return;          // nada ha cambiado de sitio: no se redibuja
    key = k;
    cv.width = W; cv.height = H;
    c = cv.getContext('2d');

    planks(W, H);
    if (!op || !me) { sides(W, H); return; }   // menú e intro: solo la mesa

    // El tablero es simétrico: se dibuja la mitad del rival y se copia en espejo para tu mitad.
    const axis = Math.round((op.top + op.bottom + me.top + me.bottom) / 4);
    stoneBand(W, op.top - 4, op.bottom + 7);       // losas bajo sus torres, incluido el marco y las almenas
    c.save();
    c.translate(0, 2 * axis); c.scale(1, -1);
    c.drawImage(c.canvas, 0, 0, W, axis, 0, 0, W, axis);
    c.restore();
    // Línea tallada en el centro, también simétrica
    px(0, axis - 1, W, 2, '#0a0705'); px(0, axis - 2, W, 1, '#33261a'); px(0, axis + 1, W, 1, '#33261a');
    sides(W, H);
  }

  window.addEventListener('resize', () => requestAnimationFrame(draw));
  return { draw };
})();
