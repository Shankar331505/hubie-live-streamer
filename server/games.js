// The games Hubie can play. PLACEHOLDER list: replace ids/aliases/rules after the recon of housebets.com/games (demo mode).
export const GAMES = [
  { id: 'dice', name: 'Dice', aliases: ['dice', 'roll'], rules: 'pick a target number and roll; the lower the target, the bigger the payout and the rarer the win' },
  { id: 'mines', name: 'Mines', aliases: ['mines', 'minesweeper', 'bomb', 'bombs'], rules: 'open tiles on a grid and avoid the hidden mines; every safe tile raises the multiplier, and you can cash out any time' },
  { id: 'plinko', name: 'Plinko', aliases: ['plinko', 'ball', 'pachinko'], rules: 'drop a ball through pegs; where it lands decides the multiplier' },
  { id: 'crash', name: 'Crash', aliases: ['crash', 'rocket', 'aviator'], rules: 'a multiplier climbs until it crashes; cash out before it does' },
  { id: 'coinflip', name: 'Coin Flip', aliases: ['coin', 'coinflip', 'flip', 'heads', 'tails'], rules: 'call heads or tails and flip' },
];

// The real House Games available on housebets.com (zero-stake play). Add a game here only once its driver exists in housebets_driver.js.
export const REAL_GAMES = [
  { id: 'dice', name: 'Dice', aliases: ['dice', 'roll'], rules: 'a number from zero to one hundred is rolled; you slide the target to choose how likely a win is, and a rarer win pays a bigger multiplier' },
  { id: 'limbo', name: 'Limbo', aliases: ['limbo'], rules: 'pick a target multiplier, then the game draws a random multiplier; you win if the draw reaches your target, and a higher target is rarer' },
  { id: 'wheel', name: 'Wheel', aliases: ['wheel', 'spin'], rules: 'spin a wheel of coloured segments, each with a multiplier; the risk setting decides how many segments pay and how big the top one is' },
  { id: 'plinko', name: 'Plinko', aliases: ['plinko', 'ball', 'pachinko'], rules: 'a ball drops through rows of pegs and lands in a bucket that sets the multiplier; the edge buckets pay the most and the middle the least' },
  { id: 'coin-flip', name: 'Coin Flip', aliases: ['coin', 'coinflip', 'flip', 'heads', 'tails'], rules: 'call heads or tails and flip the coin, which here has Hubie himself on it; it is a pure fifty-fifty' },
  { id: 'max-win', name: 'Max Win', aliases: ['maxwin', 'slot', 'jackpot'], rules: 'a three-reel slot with one enormous target, a thousand times the stake at about a one in a thousand chance' },

  { id: 'blackjack', name: 'Blackjack', aliases: ['blackjack', 'bj', '21'], rules: 'beat the dealer to twenty-one without going over: hit to take a card, stand to stay' },
  { id: 'keno', name: 'Keno', aliases: ['keno'], rules: 'ten lucky numbers are picked from forty, then balls are drawn, and the more that match the bigger the prize' },
  { id: 'hilo', name: 'Hilo', aliases: ['hilo', 'highlow'], rules: 'guess whether the next card is higher or lower, and each right guess grows the multiplier until you cash out' },
  { id: 'dragon-tower', name: 'Dragon Tower', aliases: ['dragon', 'dragons', 'tower'], rules: 'climb a castle tower floor by floor, picking a safe tile each time while avoiding the trap, and cash out whenever you like' },
  { id: 'baccarat', name: 'Baccarat', aliases: ['baccarat', 'baccara'], rules: 'a fancy card game: call player, banker or tie and see whose hand gets closest to nine' },
  { id: 'roulette', name: 'Roulette', aliases: ['roulette'], rules: 'a ball spins around a wheel and lands on a number; you pick a colour, odd or even, or a lucky number' },
  { id: 'mines', name: 'Mines', aliases: ['mines', 'minesweeper', 'bomb', 'bombs'], rules: 'open tiles on a grid and find gems while avoiding the hidden mines; every gem raises the multiplier, and you cash out whenever you like' },
  { id: 'hubie-s-road', name: "Hubie's Road", aliases: ['road', 'hubiesroad', 'surf', 'shark', 'crossing'], rules: 'a game starring Hubie himself: cross lane after lane of sea while a shark lurks, and cash out before it gets you' },
];

// Every game in the House Games library, so a viewer who asks for one that Hubie is not set up to play (or that is not in tonight's list)
// gets a cheerful, honest answer instead of silence. The director only flags a game here that is NOT in the playable list.
export const LIBRARY_ONLY = [
  { id: 'blackjack', name: 'Blackjack', aliases: ['blackjack', 'bj'] },
  { id: 'keno', name: 'Keno', aliases: ['keno'] },
  { id: 'hilo', name: 'Hilo', aliases: ['hilo'] },
  { id: 'mines', name: 'Mines', aliases: ['mines', 'minesweeper'] },
  { id: 'dragon-tower', name: 'Dragon Tower', aliases: ['dragon', 'dragons', 'tower'] },
  { id: 'baccarat', name: 'Baccarat', aliases: ['baccarat'] },
  { id: 'roulette', name: 'Roulette', aliases: ['roulette'] },
];
