'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AudioEngine } from '../lib/audio';
import {
  drawCard,
  higherDesc,
  lowerDesc,
  fmt,
} from '../lib/game-logic';
import {
  SUIT_SYMBOLS, type Card, type Rank,
} from '../lib/constants';
import GameInfoModal from './GameInfoModal';
import ProvablyFairModal from './ProvablyFairModal';
import {
  initDemo,
  getState,
  placeBet,
  actGuess,
  actSkip,
  cashout as apiCashout,
  type RankInfo,
  type BetResponse,
} from '../lib/rgs';

type Phase = 'connecting' | 'idle' | 'playing' | 'result';
type Guess = 'higher' | 'lower';

interface HistoryEntry {
  card: Card;
  guess: Guess | 'skip' | 'start';
  correct: boolean;
  mult?: number; // step multiplier
}

export default function HiLoApp() {
  // --- Server-driven state ---
  const [phase, setPhase] = useState<Phase>('connecting');
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState('USD');
  const [minBet, setMinBet] = useState(1);
  const [maxBet, setMaxBet] = useState(100);
  const [maxSkips, setMaxSkips] = useState(10);
  const [rankInfo, setRankInfo] = useState<Record<string, RankInfo>>({});
  const [rtp, setRTP] = useState('0.965');

  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState(0);
  const [totalMultiplier, setTotalMultiplier] = useState(1);
  const [skipsUsed, setSkipsUsed] = useState(0);

  // --- UI state ---
  const [betStr, setBetStr] = useState('10.00');
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [streak, setStreak] = useState<HistoryEntry[]>([]);
  const [lastResult, setLastResult] = useState<'win' | 'lose' | null>(null);
  const [lastPayout, setLastPayout] = useState(0);
  const [showCashout, setShowCashout] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [cardAnim, setCardAnim] = useState<'enter' | 'deal' | ''>('');
  const [prevCard, setPrevCard] = useState<Card | null>(null);
  const [gameHistory, setGameHistory] = useState<{ won: boolean; payout: number; mult: number }[]>([]);

  const [gameInfoOpen, setGameInfoOpen] = useState(false);
  const [pfModalOpen, setPfModalOpen] = useState(false);

  const audioRef = useRef<AudioEngine | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [alert, setAlert] = useState<string | null>(null);

  const showAlertMsg = useCallback((msg: string) => {
    setAlert(msg);
    setTimeout(() => setAlert(null), 2500);
  }, []);

  // --- Boot: init demo session + initial state ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDemo();
        const state = await getState();
        if (cancelled) return;

        setBalance(parseFloat(state.balance));
        setCurrency(state.currency);
        setMinBet(parseFloat(state.config.min_bet));
        setMaxBet(parseFloat(state.config.max_bet));
        setRTP(state.config.rtp);

        if (state.game_data) {
          setMaxSkips(state.game_data.max_skips);
          const map: Record<string, RankInfo> = {};
          for (const r of state.game_data.rank_info) map[r.rank] = r;
          setRankInfo(map);
        }

        // Pre-bet decorative card
        setCurrentCard(drawCard());
        setPhase('idle');
      } catch (e) {
        if (!cancelled) {
          showAlertMsg('Failed to connect: ' + (e as Error).message);
          setPhase('idle');
          setCurrentCard(drawCard());
        }
      }
    })();
    return () => { cancelled = true; };
  }, [showAlertMsg]);

  useEffect(() => {
    const audio = new AudioEngine();
    audio.loadCardSound();
    audioRef.current = audio;
  }, []);

  const getBet = useCallback((): number => {
    const b = parseFloat(betStr);
    if (isNaN(b) || b < minBet) return minBet;
    if (b > maxBet) return maxBet;
    return Math.floor(b * 100) / 100;
  }, [betStr, minBet, maxBet]);

  // Step multipliers & probabilities for the current card.
  const ri = currentCard ? rankInfo[currentCard.rank] : undefined;
  const hMult = ri ? parseFloat(ri.higher_multiplier) : 0;
  const lMult = ri ? parseFloat(ri.lower_multiplier) : 0;
  const hProb = ri ? parseFloat(ri.higher_probability) : 0;
  const lProb = ri ? parseFloat(ri.lower_probability) : 0;
  const hDesc = currentCard ? higherDesc(currentCard.rank as Rank) : '';
  const lDesc = currentCard ? lowerDesc(currentCard.rank as Rank) : '';

  const isRed = (suit: Card['suit']) => suit === 'hearts' || suit === 'diamonds';

  const profit = useMemo(() => Math.floor(betAmount * totalMultiplier * 100) / 100, [betAmount, totalMultiplier]);

  const cardFromResponse = (c: unknown): Card | null => {
    if (!c || typeof c !== 'object') return null;
    const obj = c as { rank?: string; suit?: string };
    if (!obj.rank || !obj.suit) return null;
    return { rank: obj.rank as Card['rank'], suit: obj.suit as Card['suit'] };
  };

  const transitionCard = useCallback((nextCard: Card, cb: () => void) => {
    setIsAnimating(true);
    setPrevCard(currentCard);
    setCurrentCard(nextCard);
    setCardAnim('deal');
    audioRef.current?.sndCard();
    setTimeout(() => {
      setCardAnim('');
      setPrevCard(null);
      setIsAnimating(false);
      cb();
    }, 650);
  }, [currentCard]);

  // --- Actions backed by the RGS ---

  const startGame = useCallback(async () => {
    if (phase === 'connecting' || isAnimating) return;
    const bet = getBet();
    if (bet > balance) { showAlertMsg('Insufficient balance'); return; }

    try {
      audioRef.current?.sndBet();
      const r = await placeBet(bet);
      const gd = r.game_data as { current_card?: unknown; max_skips?: number };
      const card = cardFromResponse(gd.current_card);
      if (!card) {
        showAlertMsg('Server returned invalid card');
        return;
      }
      setBalance(parseFloat(r.balance));
      setActiveRoundId(r.round_id);
      setBetAmount(bet);
      setTotalMultiplier(1);
      setSkipsUsed(0);
      if (typeof gd.max_skips === 'number') setMaxSkips(gd.max_skips);
      setCurrentCard(card);
      setStreak([{ card, guess: 'start', correct: true }]);
      setLastResult(null);
      setShowCashout(false);
      setPrevCard(null);
      setPhase('playing');
    } catch (e) {
      showAlertMsg((e as Error).message || 'Bet failed');
    }
  }, [phase, isAnimating, getBet, balance, showAlertMsg]);

  const applyTerminal = useCallback((r: BetResponse, win: boolean) => {
    setBalance(parseFloat(r.balance));
    const payout = parseFloat(r.total_payout);
    setLastPayout(payout);
    setLastResult(win ? 'win' : 'lose');
    setActiveRoundId(null);
    setPhase('result');
    if (win) audioRef.current?.sndCashout(); else audioRef.current?.sndLose();
    const mult = totalMultiplier;
    setGameHistory(prev => [{ won: win, payout, mult }, ...prev].slice(0, 50));
  }, [totalMultiplier]);

  const makeGuess = useCallback(async (guess: Guess) => {
    if (phase !== 'playing' || !currentCard || isAnimating || !activeRoundId) return;
    try {
      const r = await actGuess(activeRoundId, guess);
      const gd = r.game_data as {
        new_card?: unknown;
        correct?: boolean;
        step_multiplier?: string;
        total_multiplier?: string;
        current_payout?: string;
      };
      const newCard = cardFromResponse(gd.new_card);
      if (!newCard) {
        showAlertMsg('Server returned invalid card');
        return;
      }
      const correct = gd.correct === true;
      const stepMult = parseFloat(gd.step_multiplier ?? '0');
      const newTotal = parseFloat(gd.total_multiplier ?? '0');

      transitionCard(newCard, () => {
        setStreak(prev => [...prev, { card: newCard, guess, correct, mult: stepMult }]);
        if (correct && !r.finished) {
          setTotalMultiplier(newTotal);
          setShowCashout(true);
          if (newTotal >= 10) audioRef.current?.sndBigWin();
          else audioRef.current?.sndWin();
        } else if (correct && r.finished) {
          // Auto-cashout (max payout cap)
          setTotalMultiplier(newTotal);
          applyTerminal(r, true);
        } else {
          // Bust
          applyTerminal(r, false);
        }
      });
    } catch (e) {
      showAlertMsg((e as Error).message || 'Guess failed');
    }
  }, [phase, currentCard, isAnimating, activeRoundId, transitionCard, showAlertMsg, applyTerminal]);

  const cashout = useCallback(async () => {
    if (phase !== 'playing' || !showCashout || isAnimating || !activeRoundId) return;
    try {
      const r = await apiCashout(activeRoundId);
      applyTerminal(r, true);
    } catch (e) {
      showAlertMsg((e as Error).message || 'Cashout failed');
    }
  }, [phase, showCashout, isAnimating, activeRoundId, applyTerminal, showAlertMsg]);

  const newGame = useCallback(() => {
    setPhase('idle'); setStreak([]);
    setLastResult(null); setShowCashout(false); setTotalMultiplier(1);
    setPrevCard(null); setCardAnim(''); setSkipsUsed(0);
  }, []);

  const skipCard = useCallback(async () => {
    if (isAnimating) return;

    // Pre-bet / result phase: purely cosmetic shuffle, no server call.
    if (phase !== 'playing') {
      if (phase === 'result') newGame();
      const nextCard = drawCard();
      audioRef.current?.sndSkip();
      setIsAnimating(true);
      setPrevCard(currentCard);
      setCurrentCard(nextCard);
      setCardAnim('deal');
      setTimeout(() => {
        setCardAnim('');
        setPrevCard(null);
        setIsAnimating(false);
      }, 650);
      return;
    }

    if (skipsUsed >= maxSkips) { showAlertMsg(`Max ${maxSkips} skips per round`); return; }
    if (!activeRoundId) return;
    try {
      const r = await actSkip(activeRoundId);
      const gd = r.game_data as { new_card?: unknown; skips_used?: number };
      const newCard = cardFromResponse(gd.new_card);
      if (!newCard) {
        showAlertMsg('Server returned invalid card');
        return;
      }
      audioRef.current?.sndSkip();
      transitionCard(newCard, () => {
        setStreak(prev => [...prev, { card: newCard, guess: 'skip', correct: true }]);
        setSkipsUsed(gd.skips_used ?? skipsUsed + 1);
      });
    } catch (e) {
      showAlertMsg((e as Error).message || 'Skip failed');
    }
  }, [phase, currentCard, skipsUsed, maxSkips, isAnimating, activeRoundId, transitionCard, newGame, showAlertMsg]);

  const handlePrimary = () => {
    if (phase === 'idle' || phase === 'result') {
      if (phase === 'result') newGame();
      startGame();
    } else if (phase === 'playing' && showCashout && !isAnimating) {
      cashout();
    }
  };

  const primaryLabel =
    phase === 'connecting' ? 'CONNECTING…' :
    phase === 'playing' && showCashout ? `CASH OUT ${fmt(profit)}` :
    phase === 'playing' ? 'PLAYING...' : 'BET';
  const primaryDisabled =
    phase === 'connecting' ||
    (phase === 'playing' && (!showCashout || isAnimating));

  return (
    <>
      <div className="app">
        {/* HEADER */}
        <div className="header">
          <div className="header-left">
            <div className="game-name">
              <span className="ico">{'♠'}</span>
              <span>HiLo</span>
            </div>
          </div>
          <div className="header-balance">
            <span className="header-bal-icon">{'💰'}</span>
            <span className="header-bal-value">{fmt(balance)} {currency}</span>
          </div>
          <div className="header-right">
            <div className="fairplay" onClick={() => setPfModalOpen(true)}>Fair Play</div>
            <div className="info" onClick={() => setGameInfoOpen(true)}>i</div>
          </div>
        </div>

        {/* CARD TRAIL */}
        <div className="history-bar">
          {streak.length === 0 ? (
            <span className="history-empty">No cards yet</span>
          ) : (
            streak.map((entry, i) => (
              <div key={i} className={`trail-group ${i === streak.length - 1 ? 'trail-new' : ''}`}>
                {/* Tag */}
                <div className={`trail-tag ${entry.guess} ${!entry.correct ? 'bust' : ''}`}>
                  {entry.guess === 'start' && 'Start'}
                  {entry.guess === 'skip' && 'Skip'}
                  {entry.guess === 'higher' && (
                    <><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M12 19V5M5 12l7-7 7 7"/></svg>{entry.mult?.toFixed(2)}x</>
                  )}
                  {entry.guess === 'lower' && (
                    <><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>{entry.mult?.toFixed(2)}x</>
                  )}
                </div>
                {/* Card + arrow */}
                <div className="trail-row">
                  <div className={`trail-chip ${isRed(entry.card.suit) ? 'tc-red' : 'tc-black'} ${!entry.correct ? 'trail-bust' : ''}`}>
                    <span className="tc-suit">{SUIT_SYMBOLS[entry.card.suit]}</span>
                    <span className="tc-rank">{entry.card.rank}</span>
                  </div>
                  {i < streak.length - 1 && (
                    <span className="trail-arrow">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M13 5l7 7-7 7M6 5l7 7-7 7"/></svg>
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* GAME AREA */}
        <main className="board">
          <div className="arc-bg" />

          {/* Left option - Lower or Same */}
          <div className="side-option">
            <button className="option-card" onClick={() => makeGuess('lower')} disabled={phase !== 'playing' || isAnimating}>
              <div className="opt-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
              </div>
              <span className="opt-label">LOWER</span>
              <span className="opt-sub">or Same</span>
              <span className="opt-mult">{currentCard ? `x${lMult.toFixed(2)}` : '—'}</span>
            </button>
            <span className="opt-desc">
              {currentCard ? lDesc : ' '}
            </span>
          </div>

          {/* Center card with deck */}
          <div className="center-col">
            <div className="deck-wrap">
              {/* Dark card frame */}
              <div className="card-frame">
                {/* New card (revealed underneath, stays on deck) */}
                <div className={`main-card ${currentCard ? (isRed(currentCard.suit) ? 'mc-red' : 'mc-black') : 'mc-empty'} ${cardAnim === 'enter' ? 'card-enter' : ''}`}>
                  {currentCard ? (
                    <>
                      <span className="mc-rank">{currentCard.rank}</span>
                      <span className="mc-suit">{SUIT_SYMBOLS[currentCard.suit]}</span>
                    </>
                  ) : (
                    <span className="mc-placeholder">?</span>
                  )}
                </div>

                {/* Old card (slides off the deck) */}
                {prevCard && cardAnim === 'deal' && (
                  <div className={`main-card card-out ${isRed(prevCard.suit) ? 'mc-red' : 'mc-black'}`}>
                    <span className="mc-rank">{prevCard.rank}</span>
                    <span className="mc-suit">{SUIT_SYMBOLS[prevCard.suit]}</span>
                  </div>
                )}
              </div>

              {/* Deck edge lines at bottom */}
              <div className="deck-edges">
                <div className="deck-edge" />
                <div className="deck-edge" />
                <div className="deck-edge" />
                <div className="deck-edge" />
                <div className="deck-edge" />
              </div>

              {/* Skip icon button */}
              <button className="skip-btn-icon" onClick={skipCard} disabled={isAnimating || (phase === 'playing' && skipsUsed >= maxSkips)} title="Skip Card">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M13 5l7 7-7 7M6 5l7 7-7 7"/></svg>
              </button>
            </div>

            <button className="skip-btn-text" onClick={skipCard} disabled={isAnimating || (phase === 'playing' && skipsUsed >= maxSkips)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M13 5l7 7-7 7M6 5l7 7-7 7"/></svg>
              Skip Card {phase === 'playing' ? `(${maxSkips - skipsUsed})` : ''}
            </button>
          </div>

          {/* Right option - Higher or Same */}
          <div className="side-option">
            <button className="option-card" onClick={() => makeGuess('higher')} disabled={phase !== 'playing' || isAnimating}>
              <div className="opt-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              </div>
              <span className="opt-label">HIGHER</span>
              <span className="opt-sub">or Same</span>
              <span className="opt-mult">{currentCard ? `x${hMult.toFixed(2)}` : '—'}</span>
            </button>
            <span className="opt-desc">
              {currentCard ? hDesc : ' '}
            </span>
          </div>

          <div className="bg-decor">
            <div className="bg-card bg-card-1">{SUIT_SYMBOLS.spades}</div>
            <div className="bg-card bg-card-2">{SUIT_SYMBOLS.hearts}</div>
            <div className="bg-card bg-card-3">{SUIT_SYMBOLS.diamonds}</div>
            <div className="bg-card bg-card-4">{SUIT_SYMBOLS.clubs}</div>
          </div>

          {/* Result badge - absolute to board */}
          <div className={`result-badge ${phase === 'result' && lastResult ? lastResult : 'hidden'}`}>
            {lastResult === 'win' ? `CASHED OUT ${fmt(lastPayout)}` : lastResult === 'lose' ? 'BUST!' : ' '}
          </div>
        </main>

        {/* BOTTOM PANEL */}
        <div className="bottom-panel">
          {/* Probability buttons */}
          <div className="prob-row">
            <button className="prob-btn prob-lower" onClick={() => makeGuess('lower')} disabled={phase !== 'playing' || isAnimating}>
              <span className="prob-text">Lower / Same</span>
              <span className="prob-pct">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                {currentCard ? `${(lProb * 100).toFixed(2)}%` : '—'}
              </span>
            </button>
            <button className="prob-btn prob-higher" onClick={() => makeGuess('higher')} disabled={phase !== 'playing' || isAnimating}>
              <span className="prob-pct">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                {currentCard ? `${(hProb * 100).toFixed(2)}%` : '—'}
              </span>
              <span className="prob-text">Higher / Same</span>
            </button>
          </div>

          {/* Bet controls row */}
          <div className="bet-row">
            <div className="input-row bet-input-row">
              <span className="currency">$</span>
              <input
                type="number"
                value={betStr}
                onChange={e => setBetStr(e.target.value)}
                disabled={phase === 'playing' || phase === 'connecting'}
                min={minBet}
                max={maxBet}
                step="0.01"
              />
              <div className="chips">
                <button className="chip" onClick={() => setBetStr((getBet() / 2).toFixed(2))} disabled={phase === 'playing' || phase === 'connecting'}>&frac12;</button>
                <button className="chip" onClick={() => setBetStr(Math.min(getBet() * 2, maxBet).toFixed(2))} disabled={phase === 'playing' || phase === 'connecting'}>2x</button>
                <button className="chip" onClick={() => setBetStr(Math.min(maxBet, balance).toFixed(2))} disabled={phase === 'playing' || phase === 'connecting'}>Max</button>
              </div>
            </div>

            <button
              className={`place-btn ${phase === 'playing' && showCashout ? 'cashout-mode' : ''}`}
              onClick={handlePrimary}
              disabled={primaryDisabled}
            >
              {primaryLabel}
            </button>

            <div className="streak-box">
              <span className="stat-label">Multiplier</span>
              <span className="stat-val accent">{totalMultiplier > 1 ? `${totalMultiplier.toFixed(2)}x` : '0x'}</span>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="bottom">
          <div className="bottom-icons">
            <div className={`ic sound-toggle${!soundOn ? ' muted' : ''}`} title="Toggle Sound"
              onClick={() => { const on = audioRef.current?.toggle() ?? true; setSoundOn(on); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path className="sound-waves" d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" style={{ display: soundOn ? undefined : 'none' }} />
              </svg>
            </div>
            <div className="ic" title="Settings">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div className="ic" title="Fullscreen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
              </svg>
            </div>
            <div className="ic" title="Favorite">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
          </div>
          <div className="bottom-logo">MYBC · RTP {(parseFloat(rtp) * 100).toFixed(1)}% · {gameHistory.length > 0 ? `${gameHistory.filter(h => h.won).length}/${gameHistory.length} won` : ''}</div>
        </div>
      </div>

      {alert && !gameInfoOpen && !pfModalOpen && (
        <div className="alert-toast">
          <span className="alert-icon">&#x26A0;</span>
          {alert}
        </div>
      )}

      <GameInfoModal open={gameInfoOpen} onClose={() => setGameInfoOpen(false)} />
      <ProvablyFairModal open={pfModalOpen} onClose={() => setPfModalOpen(false)} />
    </>
  );
}
