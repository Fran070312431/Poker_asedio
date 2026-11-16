/* ===== Ajustes y guardado local =====
   localStorage puede fallar (modo privado, vista previa): por eso todo va en try/catch. */
const Store = {
  get(key, def) {
    try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); }
    catch (e) { return def; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
};

const Settings = {
  v: Object.assign(
    { music: true, musicVol: 0.5, sfx: true, sfxVol: 0.7, crt: true, crtAmt: 0.6, vibra: true },
    Store.get('pa_settings', {})
  ),
  set(key, value) {
    this.v[key] = value;
    Store.set('pa_settings', this.v);
    this.apply();
  },
  /* Lleva los ajustes a la pantalla y al sonido. */
  apply() {
    document.body.classList.toggle('crt', this.v.crt);
    document.documentElement.style.setProperty('--crt', this.v.crtAmt);
    if (typeof Sound !== 'undefined') Sound.apply();
  }
};

/* ===== Pantalla responsive =====
   En el navegador del móvil hay barras arriba y abajo que tapan parte de la pantalla, y "100vh"
   cuenta también lo que tapan. Aquí medimos el alto que de verdad se ve y lo guardamos en --vh:
   el CSS calcula con él el tamaño de las cartas y las torres. Se vuelve a medir al girar el móvil
   o cuando las barras aparecen y desaparecen. */
function visibleHeight() {
  return Math.round(window.visualViewport ? visualViewport.height : innerHeight);
}
function fitScreen() {
  document.documentElement.style.setProperty('--vh', visibleHeight() + 'px');
}
fitScreen();
