// A game driver plays a round of a game and reports what happened.
// StandInDriver animates fake rounds so the whole pipeline can be tested. The real driver for the House Games
// has the same two methods (switchGame, playRound) and replaces it once the demo endpoint is known.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createStandInDriver({ send, rand = Math.random, speed = 1 }) {
  const crashPoint = () => Math.max(1, Math.floor(100 * 0.99 / (1 - rand())) / 100);
  return {
    name: 'stand-in',
    async switchGame(game) { send({ t: 'game', game: { id: game.id, name: game.name } }); await sleep(600 / speed); },
    async playRound(game) {
      send({ t: 'round', phase: 'start', game: { id: game.id, name: game.name } });
      let out;
      if (game.id === 'dice') {
        const target = 20 + Math.floor(rand() * 60), roll = Math.floor(rand() * 100), win = roll < target;
        out = { win, mult: win ? 99 / target : 0, target, roll };
      } else if (game.id === 'mines') {
        const steps = 1 + Math.floor(rand() * 6), win = rand() < 0.68 ** (steps / 3);
        out = { win, mult: win ? 1.1 + steps * 0.45 : 0, steps };
      } else if (game.id === 'crash') {
        const cp = crashPoint(), cash = 1.3 + rand() * 2, win = cp >= cash;
        out = { win, mult: win ? cash : cp };
      } else {
        const win = rand() < 0.46; out = { win, mult: win ? 1 + rand() * (rand() < 0.1 ? 40 : 3) : 0 };
      }
      await sleep((4200 + rand() * 2200) / speed);
      send({ t: 'round', phase: 'result', game: { id: game.id, name: game.name }, outcome: out });
      const multiplier = out.win ? Number(out.mult.toFixed(2)) : 0;
      const summary = out.win ? `a win at ${multiplier}x` : game.id === 'mines' ? 'hit a mine and lost the round' : game.id === 'crash' ? `it crashed at ${out.mult.toFixed(2)}x before cashing out` : 'a loss this round';
      return { win: out.win, multiplier, big: multiplier >= 10, summary };
    },
  };
}
