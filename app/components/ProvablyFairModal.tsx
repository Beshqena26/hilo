'use client';

import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ProvablyFairModal({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'seeds' | 'verify'>('seeds');
  const [clientSeed, setClientSeed] = useState(() => 'hilo_' + Math.random().toString(36).slice(2, 10));
  const serverHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleRegen = () => {
    setClientSeed('hilo_' + Math.random().toString(36).slice(2, 10));
  };

  return (
    <div
      className={`modal-overlay${open ? ' show' : ''}`}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal">
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2>Provably Fair</h2>
        <p className="pf-desc">
          This game uses <strong>Provably Fair</strong> technology to generate each
          card draw. You can verify that every outcome is fair and unmanipulated.
        </p>

        <div className="pf-toggle-row">
          <button
            className={`pf-toggle-btn${activeTab === 'seeds' ? ' active' : ''}`}
            onClick={() => setActiveTab('seeds')}
          >Seeds</button>
          <button
            className={`pf-toggle-btn${activeTab === 'verify' ? ' active' : ''}`}
            onClick={() => setActiveTab('verify')}
          >Verify</button>
        </div>

        {activeTab === 'seeds' && (
          <>
            <div className="pf-section">
              <div className="pf-label">
                <span className="pf-icon">&#x1F5A5;</span> Client Seed
              </div>
              <div className="pf-sublabel">Generated on your side — you control this</div>
              <div className="pf-input-row">
                <input type="text" value={clientSeed} onChange={e => setClientSeed(e.target.value)} />
                <button className="pf-btn-sm" title="Copy" onClick={() => handleCopy(clientSeed, 'client')}>
                  {copied === 'client' ? '\u2713' : 'CP'}
                </button>
                <button className="pf-btn-sm" title="Regenerate" onClick={handleRegen}>R</button>
              </div>
            </div>
            <div className="pf-section">
              <div className="pf-label">
                <span className="pf-icon">&#x1F512;</span> Server Seed SHA256
              </div>
              <div className="pf-sublabel">Committed before you bet — revealed after</div>
              <div className="pf-hash-box">{serverHash}</div>
              <div className="pf-cp-row">
                <button className="pf-btn-sm" title="Copy" onClick={() => handleCopy(serverHash, 'hash')}>
                  {copied === 'hash' ? '\u2713' : 'CP'}
                </button>
              </div>
              <p className="pf-note">
                This hash is committed <strong>before</strong> you bet. After the game,
                the server seed is revealed so you can verify SHA256(seed) matches.
              </p>
            </div>
          </>
        )}

        {activeTab === 'verify' && (
          <div className="pf-how">
            <div className="pf-how-title">How HiLo Provably Fair Works</div>
            <ol>
              <li>Server generates a secret seed and shows you its SHA256 hash</li>
              <li>You set your client seed (your influence on the randomness)</li>
              <li>You place a bet and a starting card is dealt</li>
              <li>Each card draw: HMAC-SHA256(server_seed, client_seed:nonce) mapped to one of 52 cards</li>
              <li>You choose Higher, Lower, or Same — if correct, multiplier compounds</li>
              <li>Cash out anytime to lock in winnings</li>
              <li>Server reveals the seed — verify SHA256 matches the pre-committed hash</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
