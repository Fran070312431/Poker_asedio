/* ===== Logros =====
   Se guardan en este navegador. ui.js llama a Achievements.unlock(id)
   cuando el motor avisa de que ha pasado algo (ver processEvents). */
const Achievements = (() => {
  const LIST = [
    { id: 'sangre',    name: 'Primera sangre',     desc: 'Tumba una torre rival.' },
    { id: 'exacto',    name: 'Golpe justo',        desc: 'Deja una torre justo en 0 de vida.' },
    { id: 'saqueador', name: 'Saqueador',          desc: 'Usa 3 Botines en una partida.' },
    { id: 'obras',     name: 'Maestro de obras',   desc: 'Ten un escudo ♣ delante de tus 4 torres a la vez.' },
    { id: 'fenix',     name: 'Ave fénix',          desc: 'Cura una torre hasta su vida máxima con ♥.' },
    { id: 'victoria',  name: 'Señor del asedio',   desc: 'Gana una partida.' },
    { id: 'intacta',   name: 'Muralla intacta',    desc: 'Gana sin perder ninguna torre.' },
    { id: 'ultima',    name: 'Última piedra',      desc: 'Gana con una sola torre en pie.' },
    { id: 'veterano',  name: 'Veterano',           desc: 'Gana 5 partidas.' },
    { id: 'online',    name: 'Duelo a distancia',  desc: 'Termina una partida online.' }
  ];
  let done = Store.get('pa_achv', {});
  let wins = Store.get('pa_wins', 0);
  let onUnlock = () => {};

  return {
    LIST,
    has: id => !!done[id],
    count: () => LIST.filter(a => done[a.id]).length,
    /* Devuelve true solo la primera vez que se consigue. */
    unlock(id) {
      if (done[id]) return false;
      const a = LIST.find(x => x.id === id);
      if (!a) return false;
      done[id] = true;
      Store.set('pa_achv', done);
      onUnlock(a);
      return true;
    },
    addWin() { wins++; Store.set('pa_wins', wins); return wins; },
    reset() { done = {}; wins = 0; Store.set('pa_achv', done); Store.set('pa_wins', 0); },
    listen(fn) { onUnlock = fn; }
  };
})();
