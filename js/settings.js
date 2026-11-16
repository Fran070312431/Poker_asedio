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
