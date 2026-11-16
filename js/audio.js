/* ===== Sonido: archivos reales (CC0) =====
   Efectos de cartas, golpes e interfaz de Kenney, y música de OpenGameArt. Ver audio/CREDITOS.md.
   Se usa Web Audio: los archivos se descargan al cargar la página y se descodifican tras el primer toque
   (el navegador no deja sonar antes). Si la página se abre como archivo local (file://), fetch no funciona
   y se usan elementos <audio> como plan B.
   API: Sound.init(), Sound.apply(), Sound.sfx(nombre, retraso), Sound.music(pista). */
const Sound = (() => {
  const SFX_DIR = 'audio/sfx/', MUSIC_DIR = 'audio/music/';
  /* Cada efecto del juego: archivos entre los que se elige uno al azar, y volumen. */
  /* Volumen de cada efecto según su importancia (1 = los golpes grandes). Ver LEVEL más abajo. */
  const SFX = {
    hover:   [['hover'], 0.12],                                   // roce de carta al pasar el ratón
    tick:    [['tick'], 0.18],                                    // la vida baja, como fichas
    tickUp:  [['tickup'], 0.22],                                  // la vida sube: toque de cristal (sube de tono)
    select:  [['select'], 0.3],                                   // toque en la madera de la mesa (botones)
    open:    [['open'], 0.35],                                    // pasar hoja: se abre un panel
    close:   [['close'], 0.35],                                   // cerrar libro: se cierra el panel
    turn:    [['turn'], 0.35],                                    // te toca: hoja que pasa
    lift:    [['lift1', 'lift2', 'lift3', 'lift4'], 0.4],         // coger carta
    flip:    [['flip1', 'flip2'], 0.45],                          // girar carta
    discard: [['discard1', 'discard2', 'discard3'], 0.45],        // carta empujada al descarte
    drop:    [['drop1', 'drop2', 'drop3', 'drop4'], 0.5],         // dejar carta en la mesa
    shuffle: [['shuffle'], 0.45],                                 // barajar el descarte
    ready:   [['latch'], 0.5],                                    // "Listo": cerrojo
    loot:    [['coins1', 'coins2'], 0.55],                        // ♦ botín: monedas
    reinf:   [['shield1', 'shield2', 'shield3'], 0.55],           // ♣ escudo colocado: placa de metal
    slash:   [['slash1', 'slash2'], 0.5],                         // ♠ embiste: tajo de espada
    heal:    [['heal'], 0.6],                                     // ♥ cura: acorde de cristal que sube
    achv:    [['achv'], 0.55],                                    // logro: cuerdas que suben
    resist:  [['shieldhit1', 'shieldhit2', 'shieldhit3'], 0.7],   // golpe contra el escudo
    hit:     [['hit1', 'hit2', 'hit3'], 0.75],                    // golpe contra la piedra de la torre
    go:      [['bell'], 0.7],                                     // empieza la batalla: campana
    fall:    [['fall1', 'fall2'], 1]                              // la torre se derrumba
  };
  /* Corrección por archivo, medida al preparar el audio: con ella todos los archivos llegan al mismo
     nivel en su momento más fuerte, y el volumen de arriba decide cuál suena más. */
  const LEVEL = {"achv": 1.05, "bell": 1.37, "close": 1.47, "coins1": 2.71, "coins2": 1.78, "discard1": 2.33, "discard2": 3.21, "discard3": 2.23, "drop1": 1.76, "drop2": 3.58, "drop3": 2.96, "drop4": 2.38, "fall1": 1.05, "fall2": 1.05, "flip1": 2.76, "flip2": 2.98, "heal": 1.54, "hit1": 1.05, "hit2": 1.05, "hit3": 1.05, "hover": 1.54, "latch": 2.1, "lift1": 1.78, "lift2": 1.73, "lift3": 1.75, "lift4": 2.12, "open": 3.53, "select": 1.66, "shield1": 1.67, "shield2": 1.79, "shield3": 1.78, "shieldhit1": 1.64, "shieldhit2": 1.43, "shieldhit3": 1.51, "shuffle": 1.36, "slash1": 1.09, "slash2": 1.15, "tick": 2.64, "tickup": 1.56, "turn": 3.9};
  const TRACKS = { menu: true, game: true, win: false, lose: false };   // true = en bucle
  const files = [...new Set(Object.values(SFX).flatMap(([l, , extra]) => extra ? [...l, extra] : l))];

  let ctx = null, sfxBus, musicBus, fallback = false;
  const raw = {}, buf = {}, els = {};
  let current = null, currentName = null, wanted = null;

  /* Descarga anticipada: los bytes se guardan hasta que haya contexto de audio. */
  const load = (name, url) => fetch(url).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
    .then(b => { raw[name] = b; if (ctx) decode(name); })
    .catch(() => { fallback = true; });
  files.forEach(f => load(f, SFX_DIR + f + '.mp3'));
  Object.keys(TRACKS).forEach(t => load('m_' + t, MUSIC_DIR + t + '.mp3'));

  function decode(name) {
    const b = raw[name];
    if (!b || buf[name]) return Promise.resolve();
    delete raw[name];
    return ctx.decodeAudioData(b).then(d => { buf[name] = d; if (name === 'm_' + wanted) music(wanted, true); }).catch(() => {});
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      try {
        ctx = new AC();
        sfxBus = ctx.createGain(); musicBus = ctx.createGain();
        // Limitador al final: si coinciden varios golpes fuertes, no satura.
        const lim = ctx.createDynamicsCompressor();
        lim.threshold.value = -6; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2;
        sfxBus.connect(lim); musicBus.connect(lim); lim.connect(ctx.destination);
        Object.keys(raw).forEach(decode);
      } catch (e) { ctx = null; }
    }
    apply();
    if (wanted) music(wanted, true);
  }

  function apply() {
    const s = Settings.v;
    if (ctx) {
      sfxBus.gain.value = s.sfx ? s.sfxVol : 0;
      musicBus.gain.value = s.music ? s.musicVol * 0.55 : 0;
    }
    Object.values(els).forEach(a => { if (a.dataset.music) a.volume = s.music ? s.musicVol * 0.55 : 0; });
  }

  /* Elemento <audio> para el plan B (archivo local). */
  function el(name, url) {
    if (!els[name]) { els[name] = new Audio(url); els[name].preload = 'auto'; }
    return els[name];
  }

  function playOne(name, vol, delay, pitch) {
    vol *= LEVEL[name] || 1;
    const rate = pitch || 0.94 + Math.random() * 0.12;      // un poco de variación de tono en cada golpe
    if (ctx && buf[name]) {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf[name]; src.playbackRate.value = rate; g.gain.value = vol;
      src.connect(g); g.connect(sfxBus);
      src.start(ctx.currentTime + (delay || 0));
      return;
    }
    if (!fallback || !Settings.v.sfx) return;
    setTimeout(() => {
      const a = el(name, SFX_DIR + name + '.mp3').cloneNode();
      a.volume = Math.min(1, vol * Settings.v.sfxVol);   // en el plan B el volumen no puede pasar de 1
      a.preservesPitch = false; a.playbackRate = rate;
      a.play().catch(() => {});
    }, (delay || 0) * 1000);
  }

  /* pitch (opcional) fija el tono: lo usa la vida que sube, para que cada punto suene más agudo. */
  function sfx(name, delay, pitch) {
    const d = SFX[name];
    if (!d || !Settings.v.sfx) return;
    const [list, vol] = d;
    playOne(list[Math.floor(Math.random() * list.length)], vol, delay, pitch);
  }

  /* Cambia la música con un fundido. menu y game suenan en bucle; win y lose, una vez. */
  function music(name, force) {
    if (name === currentName && !force) return;
    wanted = name;
    if (!ctx && !fallback) return;                           // se pondrá en init(), tras el primer toque
    if (name === currentName && current) return;
    const old = current;
    current = null; currentName = name;
    if (old) old.stop();
    if (!name) return;
    if (ctx && buf['m_' + name]) {
      const src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime;
      src.buffer = buf['m_' + name]; src.loop = TRACKS[name];
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 1.2);
      src.connect(g); g.connect(musicBus); src.start(t);
      current = { stop() { const n = ctx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + 0.8); src.stop(n + 0.85); } };
    } else if (fallback) {
      const a = el('m_' + name, MUSIC_DIR + name + '.mp3');
      a.dataset.music = '1'; a.loop = TRACKS[name]; a.currentTime = 0;
      a.volume = Settings.v.music ? Settings.v.musicVol * 0.55 : 0;
      a.play().catch(() => {});
      current = { stop() { a.pause(); } };
    } else currentName = null;                               // aún descodificando: se pondrá al terminar
  }

  // Silencio al cambiar de pestaña o bloquear el móvil.
  document.addEventListener('visibilitychange', () => {
    if (ctx) { if (document.hidden) ctx.suspend(); else ctx.resume(); }
    Object.values(els).forEach(a => { if (a.dataset.music && document.hidden) a.pause(); });
    if (!document.hidden && fallback && currentName && els['m_' + currentName]) els['m_' + currentName].play().catch(() => {});
  });

  return { init, apply, sfx, music };
})();
