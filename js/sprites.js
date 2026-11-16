/* ===== Pixel art =====
   Cada sprite es una rejilla de texto: un carácter = un píxel.
   La paleta dice qué color pinta cada carácter ('.' = transparente).
   Se dibujan en un canvas diminuto y se usan en el CSS como --spr-nombre. */
const Sprites = (() => {
  const INK = '#17110b', BLOOD = '#8e1f1f', AMBER = '#e8a33d', BONE = '#e6dcc0';
  const BLACK = { X: INK, o: '#5a4a34' };                      // ♠ ♣ en tinta negra
  const RED = { X: BLOOD, o: '#c4554a', d: '#5c1010' };        // ♥ ♦ en tinta roja
  const UI = { X: BONE, o: AMBER, d: '#8a7a5a' };
  const STONE = { K: '#0a0806', S: '#7d6b4f', L: '#b39c70', D: '#54452f', W: '#0a0806', R: BLOOD };

  const ART = {
    S: [BLACK, [
      '.....X.....',
      '....XXX....',
      '...XoXXX...',
      '..XoXXXXX..',
      '.XoXXXXXXX.',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXX.X.XXXX',
      '.XX..X..XX.',
      '....XXX....',
      '...XXXXX...']],
    C: [BLACK, [
      '....XXX....',
      '...XoXXX...',
      '...XXXXX...',
      '....XXX....',
      '.XX.XXX.XX.',
      'XoXXXXXXoXX',
      'XXXXXXXXXXX',
      '.XX..X..XX.',
      '.....X.....',
      '....XXX....',
      '...XXXXX...']],
    H: [RED, [
      '..XX...XX..',
      '.XooX.XXXX.',
      'XoXXXXXXXXX',
      'XXXXXXXXXXd',
      'XXXXXXXXXXd',
      '.XXXXXXXXd.',
      '..XXXXXXd..',
      '...XXXXd...',
      '....XXd....',
      '.....d.....']],
    D: [RED, [
      '.....X.....',
      '....XXX....',
      '....XoX....',
      '...XoXXX...',
      '..XoXXXXX..',
      '.XXXXXXXXX.',
      '..XXXXXXd..',
      '...XXXXd...',
      '....XXd....',
      '....XXd....',
      '.....d.....']],
    tower: [STONE, [
      '......KRR.......',
      '......KRRR......',
      '.KKK..KKK..KKK..',
      '.KLK..KLK..KLK..',
      '.KLKKKKLKKKKLK..',
      '.KLLLLLLLLLLSK..',
      '.KLSSSSSSSSSDK..',
      '..KSSSSSSSSDK...',
      '..KLSSKKSSSDK...',
      '..KLSKWWKSSDK...',
      '..KLSKWWKSSDK...',
      '..KLSSSSSSSDK...',
      '..KLSSKKKSSDK...',
      '..KLSKWWWKSDK...',
      '..KLSKWWWKSDK...',
      '.KKKKKKKKKKKKK..']],
    rubble: [STONE, [
      '................',
      '.....KK.........',
      '....KLSK...KK...',
      '..KKKSDSK.KLSK..',
      '.KLSKSSDKKSDSK..',
      'KLDSSKSSKLSSDSK.',
      'KSSDSSKSSDSSSDK.',
      'KKKKKKKKKKKKKKK.']],
    sigil: [{ X: AMBER, o: '#ffd58a', d: '#a26c1e' }, [
      '.....X.....',
      '....XoX....',
      '...X.o.X...',
      '..X..d..X..',
      '.X.XXXXX.X.',
      'XdXoXXXoXdX',
      '.X.XXXXX.X.',
      '..X..d..X..',
      '...X.o.X...',
      '....XoX....',
      '.....X.....']],
    arrow: [{ X: AMBER, d: '#a26c1e' }, [
      '...X...',
      '..XXX..',
      '.XXXXX.',
      'XXXXXXX',
      '..XXd..',
      '..XXd..',
      '..XXd..']],
    gear: [UI, [
      '....XXX....',
      '.XX.XXX.XX.',
      '.XXXXXXXXX.',
      '..XXX.XXX..',
      'XXXX...XXXX',
      'XXX.....XXX',
      'XXXX...XXXX',
      '..XXX.XXX..',
      '.XXXXXXXXX.',
      '.XX.XXX.XX.',
      '....XXX....']],
    door: [UI, [
      '..XXXXXXX..',
      '.XXdddddXX.',
      '.XdddddddX.',
      '.XdddddddX.',
      '.XdddddddX.',
      '.XdddddooX.',
      '.XdddddddX.',
      '.XdddddddX.',
      '.XdddddddX.',
      '.XdddddddX.',
      'XXXXXXXXXXX']],
    book: [UI, [
      '.XXXXXXXXX.',
      'XXdddddddXX',
      'XXdXXXXXdXX',
      'XXdddddddXX',
      'XXdXXXXXdXX',
      'XXdddddddXX',
      'XXdXXXdddXX',
      'XXdddddddXX',
      'XXXXXXXXXXX',
      'XoooooooooX',
      '.XXXXXXXXX.']],
    trophy: [{ X: AMBER, o: '#ffd58a', d: '#a26c1e' }, [
      '.XXXXXXXXX.',
      'XXoXXXXXdXX',
      'X.XoXXXXd.X',
      'X.XoXXXXd.X',
      '.XXXXXXXd..',
      '..XXXXXd...',
      '...XXXd....',
      '....Xd.....',
      '....Xd.....',
      '...XXXd....',
      '..XXXXXd...']]
  };
  // El mismo trofeo apagado para los logros bloqueados.
  ART['trophy-off'] = [{ X: '#4a3a26', o: '#5a4a34', d: '#2a1e13' }, ART.trophy[1]];

  function toDataURL(rows, palette) {
    const canvas = document.createElement('canvas');
    canvas.width = rows[0].length;
    canvas.height = rows.length;
    const ctx = canvas.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (palette[ch]) { ctx.fillStyle = palette[ch]; ctx.fillRect(x, y, 1, 1); }
    }));
    return canvas.toDataURL();
  }

  function load() {
    for (const name in ART) {
      const [palette, rows] = ART[name];
      document.documentElement.style.setProperty('--spr-' + name, `url(${toDataURL(rows, palette)})`);
    }
  }
  return { ART, load };
})();
