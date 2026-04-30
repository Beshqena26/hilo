'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioEngine } from '../lib/audio';
import {
  drawCard,
  higherMultiplier,
  lowerMultiplier,
  probHigherOrSame,
  probLowerOrSame,
  checkGuess,
  higherDesc,
  lowerDesc,
  fmt,
} from '../lib/game-logic';
import {
  MAX_BET, MIN_BET, MAX_SKIPS, DEFAULT_BALANCE,
  SUIT_SYMBOLS, type Card,
} from '../lib/constants';
import GameInfoModal from './GameInfoModal';
import ProvablyFairModal from './ProvablyFairModal';

type Phase = 'idle' | 'playing' | 'result';
type Guess = 'higher' | 'lower';

interface HistoryEntry {
  card: Card;
  guess: Guess | 'skip' | 'start';
  correct: boolean;
  mult?: number; // multiplier for this step
}

export default function HiLoApp() {
  const [balance, setBalance] = useState(DEFAULT_BALANCE);
  const balRef = useRef(DEFAULT_BALANCE);
  const [betStr, setBetStr] = useState('10.00');
  const [phase, setPhase] = useState<Phase>('idle');

  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!mounted) {
      setCurrentCard(drawCard());
      setMounted(true);
    }
  }, [mounted]);
  const [streak, setStreak] = useState<HistoryEntry[]>([]);
  const [totalMultiplier, setTotalMultiplier] = useState(1);
  const [skipsUsed, setSkipsUsed] = useState(0);
  const [betAmount, setBetAmount] = useState(0);
  const [lastResult, setLastResult] = useState<'win' | 'lose' | null>(null);
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

  useEffect(() => {
    const audio = new AudioEngine();
    audio.loadCardSound();
    audioRef.current = audio;
  }, []);

  const updateBal = useCallback((v: number) => { balRef.current = v; setBalance(v); }, []);

  const getBet = useCallback((): number => {
    const b = parseFloat(betStr);
    if (isNaN(b) || b < MIN_BET) return MIN_BET;
    if (b > MAX_BET) return MAX_BET;
    return Math.floor(b * 100) / 100;
  }, [betStr]);

  const showAlertMsg = useCallback((msg: string) => {
    setAlert(msg);
    setTimeout(() => setAlert(null), 2500);
  }, []);

  const profit = Math.floor(betAmount * totalMultiplier * 100) / 100;

  const hMult = currentCard ? higherMultiplier(currentCard.rank) : 0;
  const lMult = currentCard ? lowerMultiplier(currentCard.rank) : 0;
  const hProb = currentCard ? probHigherOrSame(currentCard.rank) : 0;
  const lProb = currentCard ? probLowerOrSame(currentCard.rank) : 0;
  const hDesc = currentCard ? higherDesc(currentCard.rank) : '';
  const lDesc = currentCard ? lowerDesc(currentCard.rank) : '';

  const isRed = (suit: Card['suit']) => suit === 'hearts' || suit === 'diamonds';

  const startGame = useCallback(() => {
    const bet = getBet();
    if (bet > balRef.current) { showAlertMsg('Insufficient balance'); return; }
    audioRef.current?.sndBet();
    updateBal(balRef.current - bet);
    setBetAmount(bet);
    const card = currentCard || drawCard();
    // Only set card if it changed (avoids re-render flash)
    if (card !== currentCard) setCurrentCard(card);
    setStreak([{ card, guess: 'start', correct: true }]);
    setTotalMultiplier(1);
    setSkipsUsed(0);
    setLastResult(null);
    setShowCashout(false);
    setIsAnimating(false);
    setPrevCard(null);
    setPhase('playing');
  }, [getBet, showAlertMsg, updateBal, currentCard]);

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

  const makeGuess = useCallback((guess: Guess) => {
    if (phase !== 'playing' || !currentCard || isAnimating) return;
    const nextCard = drawCard();
    const correct = checkGuess(currentCard.rank, nextCard.rank, guess);
    const mult = guess === 'higher'
      ? higherMultiplier(currentCard.rank)
      : lowerMultiplier(currentCard.rank);

    transitionCard(nextCard, () => {
      if (correct) {
        const newTotal = Math.floor(totalMultiplier * mult * 100) / 100;
        setTotalMultiplier(newTotal);
        setStreak(prev => [...prev, { card: nextCard, guess, correct: true, mult }]);
        setShowCashout(true);
        newTotal >= 10 ? audioRef.current?.sndBigWin() : audioRef.current?.sndWin();
      } else {
        setStreak(prev => [...prev, { card: nextCard, guess, correct: false, mult: 0 }]);
        setLastResult('lose');
        setPhase('result');
        audioRef.current?.sndLose();
        setGameHistory(prev => [{ won: false, payout: 0, mult: totalMultiplier }, ...prev].slice(0, 50));
      }
    });
  }, [phase, currentCard, totalMultiplier, isAnimating, transitionCard]);

  const cashout = useCallback(() => {
    if (phase !== 'playing' || !showCashout || isAnimating) return;
    const payout = Math.floor(betAmount * totalMultiplier * 100) / 100;
    updateBal(balRef.current + payout);
    setLastResult('win');
    setPhase('result');
    audioRef.current?.sndCashout();
    setGameHistory(prev => [{ won: true, payout, mult: totalMultiplier }, ...prev].slice(0, 50));
  }, [phase, betAmount, totalMultiplier, showCashout, updateBal, isAnimating]);

  const newGame = useCallback(() => {
    setPhase('idle'); setStreak([]);
    setLastResult(null); setShowCashout(false); setTotalMultiplier(1);
    setPrevCard(null); setCardAnim(''); setSkipsUsed(0);
  }, []);

  const skipCard = useCallback(() => {
    if (isAnimating) return;
    if (skipsUsed >= MAX_SKIPS) { showAlertMsg(`Max ${MAX_SKIPS} skips per round`); return; }
    const nextCard = drawCard();
    audioRef.current?.sndSkip();

    if (phase === 'result') {
      newGame();
    }

    if (phase !== 'playing') {
      // Same slide-out animation even when not playing
      setIsAnimating(true);
      setPrevCard(currentCard);
      setCurrentCard(nextCard);
      setCardAnim('deal');
      setTimeout(() => {
        setCardAnim('');
        setPrevCard(null);
        setIsAnimating(false);
        setSkipsUsed(prev => prev + 1);
      }, 650);
      return;
    }
    transitionCard(nextCard, () => {
      setStreak(prev => [...prev, { card: nextCard, guess: 'skip', correct: true }]);
      setSkipsUsed(prev => prev + 1);
    });
  }, [phase, currentCard, skipsUsed, showAlertMsg, isAnimating, transitionCard, newGame]);

  const handlePrimary = () => {
    if (phase === 'idle' || phase === 'result') {
      if (phase === 'result') newGame();
      startGame();
    } else if (phase === 'playing' && showCashout && !isAnimating) {
      cashout();
    }
  };

  const primaryLabel = phase === 'playing' && showCashout
    ? `CASH OUT ${fmt(profit)}`
    : phase === 'playing' ? 'PLAYING...' : 'BET';
  const primaryDisabled = phase === 'playing' && (!showCashout || isAnimating);

  return (
    <>
      <div className="app">
        {/* HEADER */}
        <div className="header">
          <div className="header-left">
            <div className="game-name">
              <span className="ico">{'\u2660'}</span>
              <span>HiLo</span>
            </div>
          </div>
          <div className="header-balance">
            <span className="header-bal-icon">{'\uD83D\uDCB0'}</span>
            <span className="header-bal-value">{fmt(balance)}</span>
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
                  {entry.guess === 'higher' && !entry.correct && (
                    <><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M12 19V5M5 12l7-7 7 7"/></svg>{entry.mult?.toFixed(2)}x</>
                  )}
                  {entry.guess === 'higher' && entry.correct && (
                    <><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M12 19V5M5 12l7-7 7 7"/></svg>{entry.mult?.toFixed(2)}x</>
                  )}
                  {entry.guess === 'lower' && !entry.correct && (
                    <><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>{entry.mult?.toFixed(2)}x</>
                  )}
                  {entry.guess === 'lower' && entry.correct && (
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
              <span className="opt-mult">{currentCard ? `x${lMult.toFixed(2)}` : '\u2014'}</span>
            </button>
            <span className="opt-desc">
              {currentCard ? lDesc : '\u00A0'}
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
              <button className="skip-btn-icon" onClick={skipCard} disabled={isAnimating || skipsUsed >= MAX_SKIPS} title="Skip Card">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M13 5l7 7-7 7M6 5l7 7-7 7"/></svg>
              </button>
            </div>

            <button className="skip-btn-text" onClick={skipCard} disabled={isAnimating || skipsUsed >= MAX_SKIPS}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M13 5l7 7-7 7M6 5l7 7-7 7"/></svg>
              Skip Card ({MAX_SKIPS - skipsUsed})
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
              <span className="opt-mult">{currentCard ? `x${hMult.toFixed(2)}` : '\u2014'}</span>
            </button>
            <span className="opt-desc">
              {currentCard ? hDesc : '\u00A0'}
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
            {lastResult === 'win' ? `CASHED OUT ${fmt(profit)}` : lastResult === 'lose' ? 'BUST!' : '\u00A0'}
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
                {currentCard ? `${(lProb * 100).toFixed(2)}%` : '\u2014'}
              </span>
            </button>
            <button className="prob-btn prob-higher" onClick={() => makeGuess('higher')} disabled={phase !== 'playing' || isAnimating}>
              <span className="prob-pct">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                {currentCard ? `${(hProb * 100).toFixed(2)}%` : '\u2014'}
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
                disabled={phase === 'playing'}
                min={MIN_BET}
                max={MAX_BET}
                step="0.01"
              />
              <div className="chips">
                <button className="chip" onClick={() => setBetStr((getBet() / 2).toFixed(2))} disabled={phase === 'playing'}>&frac12;</button>
                <button className="chip" onClick={() => setBetStr(Math.min(getBet() * 2, MAX_BET).toFixed(2))} disabled={phase === 'playing'}>2x</button>
                <button className="chip" onClick={() => setBetStr(Math.min(MAX_BET, balRef.current).toFixed(2))} disabled={phase === 'playing'}>Max</button>
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
              <span className="stat-label">Streak</span>
              <span className="stat-val">{streak.length > 0 ? streak.length - 1 : 0}</span>
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
          <div className="bottom-logo">MYBC</div>
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
