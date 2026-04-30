export const MAX_BET = 100;
export const MIN_BET = 1;
export const HOUSE_EDGE = 0.01; // 1% house edge, 99% RTP
export const MAX_SKIPS = 10;
export const DEFAULT_BALANCE = 1000;

// Ace is LOW (1), King is HIGH (13) — matches Rainbet
export const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
export type Rank = typeof RANKS[number];

export const SUITS = ['hearts','diamonds','clubs','spades'] as const;
export type Suit = typeof SUITS[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

// Ace=1, 2=2, ..., 10=10, J=11, Q=12, K=13
export const RANK_VALUES: Record<Rank, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
};
