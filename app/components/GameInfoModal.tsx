'use client';

import { HOUSE_EDGE, MIN_BET, MAX_BET, MAX_SKIPS } from '../lib/constants';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function GameInfoModal({ open, onClose }: Props) {
  const rtp = ((1 - HOUSE_EDGE) * 100).toFixed(1);

  return (
    <div
      className={`modal-overlay${open ? ' show' : ''}`}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal">
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2>Game Info</h2>
        <div className="modal-payout-box">
          <span className="label">Bet Range</span>
          <span className="value">${MIN_BET.toFixed(2)} — ${MAX_BET.toFixed(2)}</span>
        </div>
        <div className="modal-payout-box">
          <span className="label">Max Skips</span>
          <span className="value">{MAX_SKIPS} per round</span>
        </div>
        <div className="modal-payout-box">
          <span className="label">RTP</span>
          <span className="value">{rtp}%</span>
        </div>
        <div className="info-box">
          <span className="info-icon">&#x2660;</span>
          <p>
            HiLo is a card guessing game. A card is dealt and you predict whether
            the next card will be Higher, Lower, or the Same. Correct guesses
            multiply your winnings — cash out anytime or keep pushing!
          </p>
        </div>
        <h3>How to Play</h3>
        <ol>
          <li><strong>Place your bet</strong> — enter the amount you want to wager.</li>
          <li><strong>A card is dealt</strong> — Ace (low) through King (high).</li>
          <li><strong>Choose Higher or Same / Lower or Same</strong> — riskier guesses pay higher multipliers. Same rank always wins.</li>
          <li><strong style={{ color: '#0ECC68' }}>Correct!</strong> — your multiplier grows. Cash out or continue.</li>
          <li><strong style={{ color: '#ED4163' }}>Wrong!</strong> — you lose your entire bet.</li>
          <li><strong>Skip</strong> — don{"'"}t like the odds? Skip up to {MAX_SKIPS} times per round.</li>
        </ol>
        <h3>Multiplier Examples</h3>
        <div className="mult-table-wrap">
          <table className="mult-table">
            <tbody>
              <tr><th>Card</th><th>Higher/Same</th><th>Lower/Same</th><th>Chance H</th><th>Chance L</th></tr>
              <tr><td>Ace (1)</td><td>0.99x</td><td>12.87x</td><td>100%</td><td>7.7%</td></tr>
              <tr><td>4</td><td>1.28x</td><td>3.21x</td><td>76.9%</td><td>30.8%</td></tr>
              <tr><td>7</td><td>1.83x</td><td>1.83x</td><td>53.8%</td><td>53.8%</td></tr>
              <tr><td>10</td><td>3.21x</td><td>1.28x</td><td>30.8%</td><td>76.9%</td></tr>
              <tr><td>King (13)</td><td>12.87x</td><td>0.99x</td><td>7.7%</td><td>100%</td></tr>
            </tbody>
          </table>
        </div>
        <h3>Card Ranking</h3>
        <div className="info-box">
          <span className="info-icon">&#x2666;</span>
          <p>
            Ace is the <strong>lowest</strong> card (1). King is the <strong>highest</strong> (13).
            Order: A, 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K.
            Each draw uses an infinite deck — every card has the same probability regardless
            of previous draws.
          </p>
        </div>
        <h3>House Edge &amp; RTP</h3>
        <div className="info-box">
          <span className="info-icon">&#x1F4CA;</span>
          <p>
            <strong>RTP: {rtp}%</strong> — House edge is {(HOUSE_EDGE * 100).toFixed(1)}%.
            Multiplier = 0.99 / probability. Every outcome is provably fair — tap
            Fair Play to verify.
          </p>
        </div>
      </div>
    </div>
  );
}
