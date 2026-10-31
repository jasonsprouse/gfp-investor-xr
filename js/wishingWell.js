/**
 * Good Faith Paradigm WebXR — Theophany Wishing Well & Medallion Credit System
 * Connects 2 oz Gold, Silver, and Copper medallion purchases via HTTP 402,
 * tracks 50% Yield-Bearing Asset Pool & 50% Precious Metal Prize Pool economics,
 * and executes 5-credit kinetic wishes yielding Theophany oracle verses.
 */

import { web3Payment } from './web3Payment.js';

export class WishingWell {
  constructor({ onNotify, onVerseRevealed } = {}) {
    this.onNotify = onNotify || ((msg) => console.log('[WishingWell]', msg));
    this.onVerseRevealed = onVerseRevealed || (() => {});
    this.isOpen = false;
    this.state = {
      credit_balance: 0,
      wishes_available: 0,
      wishing_well_economics: {
        total_deposited_usd: 0,
        yield_pool_principal_usd: 0,
        yield_pool_apy_pct: 14.5,
        estimated_annual_yield_usd: 0,
        metal_prize_pool_contributed_usd: 0,
        metal_coverage_per_wish_usd: 0.125
      },
      metal_odds: {},
      unclaimed_wins: [],
      claimed_wins: [],
      lastVerse: null
    };

    this._injectStyles();
    this._injectDOM();
    this.refresh();
  }

  async refresh() {
    try {
      const res = await fetch('/api/credits/balance', {
        headers: web3Payment.getAuthHeaders('/api/credits/balance')
      });
      if (res.ok) {
        const data = await res.json();
        Object.assign(this.state, data);
        this.render();
      }
    } catch (e) {
      console.warn('[WishingWell] Failed to fetch balance:', e);
    }
  }

  async purchaseMedallionCredits(metalKey = 'gold') {
    const metal = String(metalKey).toLowerCase().replace(/^coin:/, '');
    const valid = ['gold', 'silver', 'copper'];
    const chosen = valid.includes(metal) ? metal : 'gold';

    try {
      const res = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...web3Payment.getAuthHeaders('/api/credits/purchase')
        },
        body: JSON.stringify({ medallion: chosen, quantity: 1 })
      });

      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        const creditsMap = { gold: 500, silver: 100, copper: 25 };
        const usdMap = { gold: 50.00, silver: 10.00, copper: 2.50 };
        const satsMap = { gold: 50000, silver: 10000, copper: 2500 };

        const challenge = {
          payment_id: data.payment_id,
          amount: data.amount || satsMap[chosen],
          amount_usd: data.amount_usd || usdMap[chosen],
          currency: data.currency || 'SATS',
          description: data.description || `2 oz ${chosen.toUpperCase()} Medallion (${creditsMap[chosen]} Credits)`,
          invoice: data.invoice || '',
          macaroon: data.macaroon || '',
          resource: '/api/credits/purchase'
        };

        web3Payment.showPaymentModal(challenge, async (settleResult) => {
          this.onNotify(`⚡ Settled! Claiming ${creditsMap[chosen]} Wishing Well credits...`);
          // Re-query or claim credits
          await this.refresh();
          this.onNotify(`🪙 +${creditsMap[chosen]} Credits added! Balance: ${this.state.credit_balance} credits (${this.state.wishes_available} wishes).`);
          this.open();
        });
      } else if (res.ok) {
        await this.refresh();
        this.onNotify(`🪙 Medallion demo credits updated!`);
      }
    } catch (e) {
      this.onNotify(`Error purchasing credits: ${e.message}`);
    }
  }

  async tossWish(wishText = 'Evolving toward a Type I Cosmic Civilization') {
    if (this.state.credit_balance < 5) {
      this.onNotify('⚠️ Insufficient credits: 5 credits ($0.25) required per wish. Select a medallion demo to add credits.');
      this.open();
      return;
    }

    const tossBtn = document.getElementById('well-toss-btn');
    if (tossBtn) tossBtn.disabled = true;

    try {
      const res = await fetch('/api/credits/toss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...web3Payment.getAuthHeaders('/api/credits/toss')
        },
        body: JSON.stringify({
          wishes: 1,
          wish: wishText || 'Evolving toward a Type I Cosmic Civilization',
          target_metal: 'all'
        })
      });

      if (res.ok) {
        const tossData = await res.json();
        this.state.credit_balance = tossData.credit_balance;
        this.state.wishes_available = tossData.wishes_available;
        this.state.lastVerse = {
          title: tossData.title || 'Sacred Theophany Revelation',
          verse: tossData.verse || '',
          reflection: tossData.reflection || tossData.theophany_reflection || ''
        };

        this.render();
        this.renderVerseModal(this.state.lastVerse);
        this.onVerseRevealed(this.state.lastVerse);
        this.onNotify('✨ Quantum wave-function collapse: Wish tossed into Theophany Well!');
      } else if (res.status === 402 || res.status === 400) {
        const err = await res.json().catch(() => ({}));
        this.onNotify(`⚠️ Insufficient credits: ${err.message || '5 credits required'}`);
        this.open();
      }
    } catch (e) {
      this.onNotify(`Toss error: ${e.message}`);
    } finally {
      if (tossBtn) tossBtn.disabled = false;
    }
  }

  open() {
    this.isOpen = true;
    const modal = document.getElementById('wishing-well-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
    this.refresh();
  }

  close() {
    this.isOpen = false;
    const modal = document.getElementById('wishing-well-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  render() {
    const balCountEl = document.getElementById('well-balance-count');
    if (balCountEl) balCountEl.textContent = this.state.credit_balance || '0';

    const modalBalEl = document.getElementById('well-modal-balance');
    const modalWishesEl = document.getElementById('well-modal-wishes');
    if (modalBalEl) modalBalEl.textContent = this.state.credit_balance || '0';
    if (modalWishesEl) modalWishesEl.textContent = `${this.state.wishes_available || 0} Available`;

    const tvlEl = document.getElementById('well-tvl-usd');
    if (tvlEl && this.state.wishing_well_economics) {
      tvlEl.textContent = `$${(this.state.wishing_well_economics.yield_pool_principal_usd || 0).toFixed(2)}`;
    }
  }

  renderVerseModal(verseObj) {
    let verseBox = document.getElementById('well-verse-box');
    if (!verseBox) return;

    verseBox.innerHTML = `
      <div class="well-verse-card">
        <div class="well-verse-header">
          <i class="fas fa-sparkles" style="color:#ffc400;"></i>
          <span>${verseObj.title}</span>
        </div>
        <div class="well-verse-quote">${verseObj.verse}</div>
        <div class="well-verse-reflection">${verseObj.reflection}</div>
      </div>
    `;
    verseBox.style.display = 'block';
  }

  _injectStyles() {
    if (document.getElementById('wishing-well-styles')) return;
    const style = document.createElement('style');
    style.id = 'wishing-well-styles';
    style.textContent = `
      .well-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(3, 7, 18, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 99995;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .well-modal-backdrop.hidden {
        display: none !important;
      }
      .well-card {
        background: linear-gradient(135deg, rgba(16, 24, 39, 0.96), rgba(9, 14, 28, 0.98));
        border: 1px solid rgba(255, 196, 0, 0.35);
        box-shadow: 0 0 40px rgba(255, 196, 0, 0.2);
        border-radius: 14px;
        width: 100%;
        max-width: 520px;
        color: #f1f5f9;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 24px;
        position: relative;
        overflow: hidden;
      }
      .well-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0; height: 3px;
        background: linear-gradient(90deg, #ffc400, #00f0ff, #ff007f);
      }
      .well-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .well-badge {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1.5px;
        color: #ffc400;
        background: rgba(255, 196, 0, 0.12);
        border: 1px solid rgba(255, 196, 0, 0.3);
        padding: 4px 10px;
        border-radius: 20px;
      }
      .well-balance-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(255, 196, 0, 0.08);
        border: 1px solid rgba(255, 196, 0, 0.25);
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 16px;
      }
      .well-bal-num {
        font-size: 24px;
        font-weight: 800;
        color: #ffc400;
      }
      .well-bal-label {
        font-size: 12px;
        color: #94a3b8;
      }
      .well-medallions-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-bottom: 16px;
      }
      .well-medal-card {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 12px 8px;
        text-align: center;
        cursor: pointer;
        transition: transform 0.15s, border-color 0.15s;
      }
      .well-medal-card:hover {
        transform: translateY(-2px);
        border-color: #00f0ff;
        background: rgba(0, 240, 255, 0.08);
      }
      .well-medal-name {
        font-size: 12px;
        font-weight: 700;
        margin-top: 4px;
      }
      .well-medal-credits {
        font-size: 14px;
        font-weight: 800;
        color: #00f0ff;
        margin: 4px 0;
      }
      .well-medal-price {
        font-size: 11px;
        color: #94a3b8;
      }
      .well-toss-section {
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 14px;
        margin-bottom: 14px;
      }
      .well-toss-input {
        width: 100%;
        box-sizing: border-box;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        color: #e2e8f0;
        font-size: 13px;
        padding: 8px 10px;
        margin-bottom: 10px;
      }
      .well-btn-toss {
        width: 100%;
        background: linear-gradient(135deg, #ffc400, #ff8800);
        color: #020617;
        font-weight: 700;
        font-size: 14px;
        padding: 10px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 4px 15px rgba(255, 196, 0, 0.3);
      }
      .well-btn-toss:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .well-verse-card {
        background: rgba(255, 196, 0, 0.06);
        border-left: 3px solid #ffc400;
        padding: 12px 14px;
        border-radius: 0 8px 8px 0;
        margin-top: 12px;
      }
      .well-verse-header {
        font-size: 12px;
        font-weight: 700;
        color: #ffc400;
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .well-verse-quote {
        font-size: 13px;
        font-style: italic;
        color: #f1f5f9;
        margin-bottom: 6px;
        line-height: 1.4;
      }
      .well-verse-reflection {
        font-size: 12px;
        color: #94a3b8;
        line-height: 1.4;
      }
      .well-economics-note {
        font-size: 11px;
        color: #64748b;
        text-align: center;
        margin-top: 10px;
        line-height: 1.4;
      }
      .btn-well-hud {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(255, 196, 0, 0.12);
        border: 1px solid rgba(255, 196, 0, 0.35);
        color: #ffc400;
        border-radius: 20px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn-well-hud:hover {
        background: rgba(255, 196, 0, 0.25);
        box-shadow: 0 0 12px rgba(255, 196, 0, 0.4);
      }
    `;
    document.head.appendChild(style);
  }

  _injectDOM() {
    if (document.getElementById('wishing-well-modal')) return;

    // 1. Inject Top HUD Wishing Well Button
    const hudActions = document.querySelector('.hud-actions');
    if (hudActions) {
      const btn = document.createElement('button');
      btn.id = 'btn-wishing-well';
      btn.className = 'btn-well-hud';
      btn.title = 'Theophany Wishing Well & Medallion Credits';
      btn.innerHTML = `<i class="fas fa-coins"></i> Well (<span id="well-balance-count">0</span> cr)`;
      btn.onclick = () => this.toggle();
      hudActions.prepend(btn);
    }

    // 2. Inject Modal
    const modal = document.createElement('div');
    modal.id = 'wishing-well-modal';
    modal.className = 'well-modal-backdrop hidden';
    modal.innerHTML = `
      <div class="well-card">
        <div class="well-header">
          <span class="well-badge"><i class="fas fa-coins"></i> THEOPHANY WISHING WELL</span>
          <button id="well-close-btn" class="basket-close">&times;</button>
        </div>

        <div class="well-balance-banner">
          <div>
            <div id="well-modal-balance" class="well-bal-num">0</div>
            <div class="well-bal-label">Wishing Well Credits</div>
          </div>
          <div style="text-align:right;">
            <div id="well-modal-wishes" style="font-size:16px; font-weight:700; color:#00f0ff;">0 Available</div>
            <div class="well-bal-label">Wishes (5 cr / wish)</div>
          </div>
        </div>

        <div style="font-size:12px; font-weight:700; color:#94a3b8; margin-bottom:8px;">
          2 OZ MEDALLION DEMO PURCHASES (HTTP 402):
        </div>

        <div class="well-medallions-grid">
          <div class="well-medal-card" data-metal="gold">
            <i class="fas fa-medal" style="color:#d4af37; font-size:20px;"></i>
            <div class="well-medal-name">2 oz Gold</div>
            <div class="well-medal-credits">+500 cr</div>
            <div class="well-medal-price">$50.00 / 50k sats</div>
          </div>
          <div class="well-medal-card" data-metal="silver">
            <i class="fas fa-medal" style="color:#c8cfd9; font-size:20px;"></i>
            <div class="well-medal-name">2 oz Silver</div>
            <div class="well-medal-credits">+100 cr</div>
            <div class="well-medal-price">$10.00 / 10k sats</div>
          </div>
          <div class="well-medal-card" data-metal="copper">
            <i class="fas fa-medal" style="color:#b87333; font-size:20px;"></i>
            <div class="well-medal-name">2 oz Copper</div>
            <div class="well-medal-credits">+25 cr</div>
            <div class="well-medal-price">$2.50 / 2.5k sats</div>
          </div>
        </div>

        <div class="well-toss-section">
          <input type="text" id="well-wish-input" class="well-toss-input" placeholder="Make a wish: e.g. Coherent Light & Type I Transition...">
          <button id="well-toss-btn" class="well-btn-toss">
            <i class="fas fa-hand-sparkles"></i> Toss Wish (5 Credits = $0.25)
          </button>
        </div>

        <div id="well-verse-box" style="display:none;"></div>

        <div class="well-economics-note">
          50% ($0.125) splits to Yield-Bearing Asset Pool (14.5% APY) • 50% ($0.125) covers 2 oz Gold/Silver/Copper prize pool.
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById('well-close-btn');
    if (closeBtn) closeBtn.onclick = () => this.close();

    modal.querySelectorAll('.well-medal-card').forEach(card => {
      card.onclick = () => {
        const metal = card.getAttribute('data-metal');
        this.purchaseMedallionCredits(metal);
      };
    });

    const tossBtn = document.getElementById('well-toss-btn');
    if (tossBtn) {
      tossBtn.onclick = () => {
        const inp = document.getElementById('well-wish-input');
        const text = inp ? inp.value : '';
        this.tossWish(text);
      };
    }
  }
}
