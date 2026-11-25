const hand = [
  ['##', '#o#', '#o#', '#o###', '#o#o###', '#ooooo#', '#o#ooo#', '.#ooo#', '.#ooo#', '..###'],
  ['##', '#o#', '#o#', '#o##', '#oo####', '#ooooo#', '#oo#oo#', '.#ooo#', '.#ooo#', '..###'],
  ['##', '#o#', '#o#', '#o#', '#o##', '#ooo##', '#ooooo#', '.#ooo#', '.#ooo#', '..###'],
];
const sword = [
  '###',
  '#oo#',
  '#ooo#',
  '.#ooo#',
  '..#ooo#',
  '...#ooo#',
  '....#o#',
  '....###g#',
  '.....#g#',
  '....#g#',
  '...###',
];

export function createGameCursor(game: HTMLCanvasElement) {
  const overlay = document.createElement('canvas');
  overlay.id = 'game-cursor';
  overlay.width = overlay.height = 13;
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  game.after(overlay);
  const ctx = overlay.getContext('2d');
  let previous: string[] | undefined;
  return {
    hide() {
      overlay.hidden = true;
      game.classList.remove('has-game-cursor');
    },
    draw(x: number, y: number, armed: boolean, time: number) {
      if (!ctx) return;
      const frame = armed ? sword : hand[Math.floor(time / 170) % hand.length];
      if (frame !== previous) {
        previous = frame;
        ctx.clearRect(0, 0, 13, 13);
        frame.forEach((row, y) =>
          [...row].forEach((pixel, x) => {
            if (pixel === '.') return;
            ctx.fillStyle = pixel === '#' ? '#221c26' : pixel === 'g' ? '#d5aa56' : '#eee0c0';
            ctx.fillRect(x, y, 1, 1);
          }),
        );
      }
      overlay.dataset.mode = armed ? 'sword' : 'hand';
      overlay.style.transform = `translate(${Math.round(x) - 2}px, ${Math.round(y) - 2}px)`;
      overlay.hidden = false;
      game.classList.add('has-game-cursor');
    },
  };
}
