/**
 * Good Faith Paradigm WebXR — Multi-Tier Subscription UI & Expiration Monitor
 * Manages Free ("Pilgrim"), Limited-time Freemium ("VIP Trial" 24h), and Paid ("Pneumatic Investor") tiers.
 */

import { web3Payment } from './web3Payment.js';

export class SubscriptionUI {
  constructor({ onNotify, onTierChange } = {}) {
    this.onNotify = onNotify || ((msg) => console.log('[SubscriptionUI]', msg));
    this.onTierChange = onTierChange || (() => {});
    this.status = {
      tier: 'free',
      name: 'Pilgrim (Free Tier)',
      is_active: true,
      expires_at: null,
      features: ['skyport_walkthrough', 'public_booths']
    };
    this.timerInterval = null;

    this._injectStyles();
    this._injectDOM();
    this.refresh();
    this.startCountdownTimer();
  }

  async refresh() {
    try {
      const res = await fetch('/api/subscriptions/status', {
        headers: web3Payment.getAuthHeaders('/api/subscriptions/status')
      });
      if (res.ok) {
        this.status = await res.json();
        this.render();
        this.onTierChange(this.status);
      }
    } catch (e) {
      console.warn('[SubscriptionUI] Status fetch failed:', e);
    }
  }

  async upgrade(targetTier) {
    if (targetTier === 'freemium') {
      try {
        const res = await fetch('/api/subscriptions/upgrade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...web3Payment.getAuthHeaders('/api/subscriptions/upgrade')
          },
          body: JSON.stringify({ target_tier: 'freemium' })
        });
        if (res.ok) {
          this.status = await res.json();
          this.render();
          this.closeModal();
          this.onNotify('✨ 24-Hour VIP Freemium Trial Activated! Executive Dossier Unlocked.');
          this.onTierChange(this.status);
        } else {
          const err = await res.json().catch(() => ({}));
          this.onNotify(`Upgrade error: ${err.message || 'Could not activate trial'}`);
        }
      } catch (e) {
        this.onNotify(`Network error: ${e.message}`);
      }
      return;
    }

    if (targetTier === 'paid') {
      try {
        const res = await fetch('/api/subscriptions/upgrade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...web3Payment.getAuthHeaders('/api/subscriptions/upgrade')
          },
          body: JSON.stringify({ target_tier: 'paid' })
        });

        if (res.status === 402) {
          const data = await res.json().catch(() => ({}));
          const challenge = {
            payment_id: data.payment_id,
            amount: data.amount || 20000,
            amount_usd: data.amount_usd || 19.99,
            currency: data.currency || 'SATS',
            description: data.description || 'Pneumatic Investor Monthly Subscription Upgrade ($19.99)',
            invoice: data.invoice || '',
            macaroon: data.macaroon || '',
            resource: '/api/subscriptions/upgrade'
          };

          web3Payment.showPaymentModal(challenge, async (settleResult) => {
            // Re-check status with settled token
            await this.refresh();
            this.closeModal();
            this.onNotify('👑 Welcome, Pneumatic Investor! Permanent VIP Patron status confirmed.');
          });
        } else if (res.ok) {
          this.status = await res.json();
          this.render();
          this.closeModal();
          this.onNotify('👑 Subscription active!');
        }
      } catch (e) {
        this.onNotify(`Upgrade error: ${e.message}`);
      }
    }
  }

  startCountdownTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.status.tier === 'freemium' && this.status.expires_at) {
        const remaining = this.status.expires_at - Math.floor(Date.now() / 1000);
        if (remaining <= 0) {
          // Expired!
          this.refresh();
        } else {
          this.updateBadgeCountdown(remaining);
        }
      }
    }, 1000);
  }

  updateBadgeCountdown(remainingSec) {
    const hours = Math.floor(remainingSec / 3600);
    const mins = Math.floor((remainingSec % 3600) / 60);
    const secs = remainingSec % 60;
    const badgeTextEl = document.getElementById('sub-badge-text');
    if (badgeTextEl && this.status.tier === 'freemium') {
      badgeTextEl.textContent = `VIP Trial (${hours}h ${mins}m ${secs}s)`;
    }
  }

  openModal() {
    const modal = document.getElementById('subscription-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      this.refresh();
    }
  }

  closeModal() {
    const modal = document.getElementById('subscription-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  render() {
    const badgeEl = document.getElementById('btn-sub-tier');
    const badgeTextEl = document.getElementById('sub-badge-text');
    if (!badgeEl || !badgeTextEl) return;

    badgeEl.className = 'btn-sub-badge';

    if (this.status.tier === 'paid') {
      badgeEl.classList.add('tier-paid');
      badgeEl.innerHTML = `<i class="fas fa-crown" style="color:#ffc400;"></i> <span id="sub-badge-text">Pneumatic Investor</span>`;
    } else if (this.status.tier === 'freemium') {
      const now = Math.floor(Date.now() / 1000);
      if (this.status.expires_at && now >= this.status.expires_at) {
        badgeEl.classList.add('tier-expired');
        badgeEl.innerHTML = `<i class="fas fa-triangle-exclamation" style="color:#ef4444;"></i> <span id="sub-badge-text">VIP Expired</span>`;
      } else {
        badgeEl.classList.add('tier-freemium');
        const rem = Math.max(0, (this.status.expires_at || 0) - now);
        const hours = Math.floor(rem / 3600);
        const mins = Math.floor((rem % 3600) / 60);
        badgeEl.innerHTML = `<i class="fas fa-stopwatch" style="color:#00ff88;"></i> <span id="sub-badge-text">VIP Trial (${hours}h ${mins}m)</span>`;
      }
    } else {
      badgeEl.classList.add('tier-free');
      badgeEl.innerHTML = `<i class="fas fa-user"></i> <span id="sub-badge-text">Pilgrim (Free)</span>`;
    }

    // Update modal cards active indicators
    const freeCardBtn = document.getElementById('sub-btn-free');
    const freemiumCardBtn = document.getElementById('sub-btn-freemium');
    const paidCardBtn = document.getElementById('sub-btn-paid');

    if (freeCardBtn) {
      freeCardBtn.textContent = this.status.tier === 'free' ? 'CURRENT TIER' : 'Standard Access';
      freeCardBtn.disabled = this.status.tier === 'free';
    }
    if (freemiumCardBtn) {
      if (this.status.tier === 'freemium') {
        freemiumCardBtn.textContent = 'ACTIVE TRIAL';
        freemiumCardBtn.disabled = true;
      } else {
        freemiumCardBtn.textContent = 'START 24H TRIAL';
        freemiumCardBtn.disabled = false;
      }
    }
    if (paidCardBtn) {
      if (this.status.tier === 'paid') {
        paidCardBtn.textContent = 'ACTIVE INVESTOR';
        paidCardBtn.disabled = true;
      } else {
        paidCardBtn.textContent = 'UPGRADE ($19.99 / 20k SATS)';
        paidCardBtn.disabled = false;
      }
    }
  }

  _injectStyles() {
    if (document.getElementById('subscription-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'subscription-ui-styles';
    style.textContent = `
      .btn-sub-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #f1f5f9;
        border-radius: 20px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn-sub-badge:hover {
        background: rgba(255, 255, 255, 0.16);
      }
      .btn-sub-badge.tier-free {
        border-color: rgba(148, 163, 184, 0.4);
        color: #cbd5e1;
      }
      .btn-sub-badge.tier-freemium {
        background: rgba(0, 255, 136, 0.12);
        border-color: rgba(0, 255, 136, 0.4);
        color: #00ff88;
        box-shadow: 0 0 10px rgba(0, 255, 136, 0.2);
      }
      .btn-sub-badge.tier-expired {
        background: rgba(239, 68, 68, 0.15);
        border-color: rgba(239, 68, 68, 0.45);
        color: #f87171;
      }
      .btn-sub-badge.tier-paid {
        background: rgba(255, 196, 0, 0.15);
        border-color: rgba(255, 196, 0, 0.5);
        color: #ffc400;
        box-shadow: 0 0 12px rgba(255, 196, 0, 0.3);
      }
      .sub-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(3, 7, 18, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 99996;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .sub-modal-backdrop.hidden {
        display: none !important;
      }
      .sub-card {
        background: linear-gradient(135deg, rgba(16, 24, 39, 0.96), rgba(9, 14, 28, 0.98));
        border: 1px solid rgba(0, 240, 255, 0.35);
        box-shadow: 0 0 40px rgba(0, 240, 255, 0.2);
        border-radius: 14px;
        width: 100%;
        max-width: 680px;
        color: #f1f5f9;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 24px;
        position: relative;
        overflow: hidden;
      }
      .sub-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0; height: 3px;
        background: linear-gradient(90deg, #94a3b8, #00ff88, #ffc400);
      }
      .sub-tiers-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px;
        margin-top: 18px;
      }
      .sub-tier-box {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 16px 14px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
      }
      .sub-tier-box.highlight {
        border-color: rgba(255, 196, 0, 0.4);
        background: rgba(255, 196, 0, 0.04);
      }
      .sub-tier-name {
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      .sub-tier-price {
        font-size: 18px;
        font-weight: 800;
        margin-bottom: 12px;
      }
      .sub-tier-features {
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.5;
        margin-bottom: 16px;
        flex: 1;
      }
      .sub-tier-features li {
        margin-bottom: 4px;
        list-style: none;
        position: relative;
        padding-left: 14px;
      }
      .sub-tier-features li::before {
        content: '✓';
        position: absolute;
        left: 0;
        color: #00ff88;
        font-weight: bold;
      }
      .sub-btn-action {
        width: 100%;
        padding: 9px;
        border-radius: 6px;
        border: none;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
        transition: transform 0.15s;
      }
      .sub-btn-action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-free-tier {
        background: rgba(255, 255, 255, 0.1);
        color: #f1f5f9;
      }
      .btn-freemium-tier {
        background: linear-gradient(135deg, #00ff88, #00aa55);
        color: #020617;
      }
      .btn-paid-tier {
        background: linear-gradient(135deg, #ffc400, #ff8800);
        color: #020617;
        box-shadow: 0 4px 15px rgba(255, 196, 0, 0.3);
      }
    `;
    document.head.appendChild(style);
  }

  _injectDOM() {
    if (document.getElementById('subscription-modal')) return;

    // 1. Inject Top HUD Badge
    const hudActions = document.querySelector('.hud-actions');
    if (hudActions) {
      const btn = document.createElement('button');
      btn.id = 'btn-sub-tier';
      btn.className = 'btn-sub-badge tier-free';
      btn.title = 'View Multi-Tier Subscription';
      btn.innerHTML = `<i class="fas fa-user"></i> <span id="sub-badge-text">Pilgrim (Free)</span>`;
      btn.onclick = () => this.openModal();
      hudActions.prepend(btn);
    }

    // 2. Inject Modal
    const modal = document.createElement('div');
    modal.id = 'subscription-modal';
    modal.className = 'sub-modal-backdrop hidden';
    modal.innerHTML = `
      <div class="sub-card">
        <div class="well-header">
          <span class="well-badge"><i class="fas fa-crown"></i> INVESTOR SUBSCRIPTION TIERS</span>
          <button id="sub-close-btn" class="basket-close">&times;</button>
        </div>

        <div style="font-size:13px; color:#94a3b8; line-height:1.4;">
          Choose your level of participation in the Good Faith Paradigm ecosystem. Gated via the Web3 HTTP 402 protocol standard.
        </div>

        <div class="sub-tiers-grid">
          <!-- Free Tier -->
          <div class="sub-tier-box">
            <div>
              <div class="sub-tier-name" style="color:#94a3b8;">PILGRIM</div>
              <div class="sub-tier-price" style="color:#cbd5e1;">Free</div>
              <ul class="sub-tier-features">
                <li>Skyport observation deck</li>
                <li>Public exhibit booths</li>
                <li>Live cinema stream</li>
              </ul>
            </div>
            <button id="sub-btn-free" class="sub-btn-action btn-free-tier" disabled>CURRENT TIER</button>
          </div>

          <!-- Freemium VIP Trial -->
          <div class="sub-tier-box">
            <div>
              <div class="sub-tier-name" style="color:#00ff88;">VIP TRIAL</div>
              <div class="sub-tier-price" style="color:#00ff88;">Free <span style="font-size:11px; color:#94a3b8;">(24 Hours)</span></div>
              <ul class="sub-tier-features">
                <li>All Pilgrim features</li>
                <li>Executive pitch dossier</li>
                <li>Adventure Corridor deep dive</li>
                <li>Strict timestamp expiry</li>
              </ul>
            </div>
            <button id="sub-btn-freemium" class="sub-btn-action btn-freemium-tier">START 24H TRIAL</button>
          </div>

          <!-- Paid Patron Tier -->
          <div class="sub-tier-box highlight">
            <div>
              <div class="sub-tier-name" style="color:#ffc400;">PNEUMATIC INVESTOR</div>
              <div class="sub-tier-price" style="color:#ffc400;">$19.99 <span style="font-size:11px; color:#94a3b8;">/ mo</span></div>
              <ul class="sub-tier-features">
                <li>Permanent full VIP access</li>
                <li>Executive investor dossier</li>
                <li>VIP Museum Tour Pass</li>
                <li>Wishing Well yield boost</li>
                <li>Autonomous eVTOL flight</li>
              </ul>
            </div>
            <button id="sub-btn-paid" class="sub-btn-action btn-paid-tier">UPGRADE ($19.99)</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById('sub-close-btn');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();

    const freemiumBtn = document.getElementById('sub-btn-freemium');
    if (freemiumBtn) {
      freemiumBtn.onclick = () => this.upgrade('freemium');
    }

    const paidBtn = document.getElementById('sub-btn-paid');
    if (paidBtn) {
      paidBtn.onclick = () => this.upgrade('paid');
    }
  }
}
