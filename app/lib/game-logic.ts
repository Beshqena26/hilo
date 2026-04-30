import { RANKS, SUITS, RANK_VALUES, HOUSE_EDGE, type Card, type Rank } from './constants';

/** Draw a random card from an infinite deck */
export function drawCard(): Card {
  const arr = new Uint32Array(2);
  crypto.getRandomValues(arr);
  const rankIdx = arr[0] % 13;
  const suitIdx = arr[1] % 4;
  return { rank: RANKS[rankIdx], suit: SUITS[suitIdx] };
}

/** Get numeric value for a rank (2-14, 2=lowest, Ace=14 highest) */
export function rankValue(rank: Rank): number {
  return RANK_VALUES[rank];
}

/**
 * Probability of drawing higher OR same.
 * Each rank has 1/13 chance. "Same" counts as win.
 */
export function probHigherOrSame(rank: Rank): number {
  const v = rankValue(rank);
  const higherCount = 14 - v; // ranks strictly above (max is 14)
  return (higherCount + 1) / 13; // +1 for same
}

/** Probability of drawing lower OR same */
export function probLowerOrSame(rank: Rank): number {
  const v = rankValue(rank);
  const lowerCount = v - 2; // ranks strictly below (min is 2)
  return (lowerCount + 1) / 13; // +1 for same
}

/** Calculate multiplier: (1 - HOUSE_EDGE) / probability */
export function calcMultiplier(probability: number): number {
  if (probability <= 0) return 0;
  if (probability >= 1) return 1;
  const mult = (1 - HOUSE_EDGE) / probability;
  return Math.floor(mult * 100) / 100;
}

export function higherMultiplier(rank: Rank): number {
  return calcMultiplier(probHigherOrSame(rank));
}

export function lowerMultiplier(rank: Rank): number {
  return calcMultiplier(probLowerOrSame(rank));
}

/** Check if guess is correct. Same rank wins for both. */
export function checkGuess(
  currentRank: Rank,
  nextRank: Rank,
  guess: 'higher' | 'lower'
): boolean {
  const curr = rankValue(currentRank);
  const next = rankValue(nextRank);
  if (next === curr) return true; // same always wins
  if (guess === 'higher') return next > curr;
  return next < curr;
}

/** Description text for higher option */
export function higherDesc(rank: Rank): string {
  const v = rankValue(rank);
  if (v === 14) return 'ACE OR SAME';
  const idx = RANKS.indexOf(rank);
  const nextRank = RANKS[idx + 1];
  if (v === 13) return `${nextRank} BEING THE HIGHEST`;
  return `${nextRank} OR HIGHER`;
}

/** Description text for lower option */
export function lowerDesc(rank: Rank): string {
  const v = rankValue(rank);
  if (v === 2) return '2 OR SAME';
  const idx = RANKS.indexOf(rank);
  const prevRank = RANKS[idx - 1];
  if (v === 3) return `${prevRank} BEING THE LOWEST`;
  return `${prevRank} OR LOWER`;
}

export function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
