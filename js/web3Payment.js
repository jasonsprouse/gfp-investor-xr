/**
 * Good Faith Paradigm WebXR — Web3 HTTP 402 Payment Interceptor & Settlement Manager
 * Standards alignment:
 * - RFC 9110 §15.5.3 (HTTP 402 Payment Required)
 * - L402 / LSAT protocol (Macaroons + Lightning invoice settlement)
 * - Automatic 402 challenge detection, modal rendering, and demo settlement faucet
 */

export class Web3Payment {
  constructor({ onNotify } = {}) {
    this.onNotify = onNotify || ((msg) => console.log('[Web3Payment]', msg));
    this.clientId = this._initClientId();
    this.token = localStorage.getItem('gfp_auth_token') || null;
    this.activeChallenge = null;
    this.settleCallbacks = new Map();

    this._injectStyles();
    this._injectModalDOM();
  }

  _initClientId() {
    let cid = localStorage.getItem('gfp_client_id');
    if (!cid) {
      cid = 'client_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('gfp_client_id', cid);
    }
    return cid;
  }

  getClientId() {
    return this.clientId;
  }

  getToken() {
    return this.token;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('gfp_auth_token', token);
      localStorage.setItem('gfp_xr_402_token', token);
    } else {
      localStorage.removeItem('gfp_auth_token');
      localStorage.removeItem('gfp_xr_402_token');
    }
  }

  getAuthHeaders(resource = '') {
    const headers = {
      'X-Client-ID': this.clientId,
      'Accept': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
      headers['X-Payment-Token'] = this.token;
    }
    return headers;
  }

  /**
   * Universal fetch wrapper that intercepts HTTP 402 and prompts settlement.
   */
  async fetchWith402(url, options = {}) {
    const headers = {
      ...this.getAuthHeaders(url),
      ...(options.headers || {})
    };
    const opts = { ...options, headers };

    const res = await fetch(url, opts);
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }

    if (res.status === 402) {
      // Parse 402 challenge metadata
      const authHeader = res.headers.get('WWW-Authenticate') || '';
      const payReqHeader = res.headers.get('Payment-Required');
      let payMeta = {};
      if (payReqHeader) {
        try { payMeta = JSON.parse(payReqHeader); } catch (_) {}
      }

      const challenge = {
        payment_id: data.payment_id || payMeta.payment_id || data.challenge_id,
        amount: data.amount || payMeta.amount || 1000,
        amount_usd: data.amount_usd || payMeta.amount_usd || (data.amount ? data.amount / 1000 : 1.0),
        currency: data.currency || payMeta.currency || 'SATS',
        description: data.description || payMeta.description || 'Payment Required',
        invoice: data.invoice || '',
        macaroon: data.macaroon || '',
        settle_url: data.settle_url || payMeta.settle_url || '/api/402/settle',
        resource: url
      };

      return new Promise((resolve) => {
        this.showPaymentModal(challenge, async (settleResult) => {
          // Re-attempt original request with the fresh settlement token
          const retryHeaders = {
            ...headers,
            'Authorization': `Bearer ${settleResult.token}`,
            'X-Payment-Token': settleResult.token
          };
          const retryRes = await fetch(url, { ...options, headers: retryHeaders });
          let retryData = null;
          try { retryData = await retryRes.json(); } catch (_) { retryData = {}; }
          resolve({ status: retryRes.status, headers: retryRes.headers, data: retryData, settled: true });
        });
      });
    }

    return { status: res.status, headers: res.headers, data, settled: false };
  }

  showPaymentModal(challenge, onSettledCallback) {
    this.activeChallenge = challenge;
    if (onSettledCallback) {
      this.settleCallbacks.set(challenge.payment_id, onSettledCallback);
    }

    const modal = document.getElementById('web3-payment-modal');
    if (!modal) return;

    // Fill in challenge data
    const titleEl = document.getElementById('w3p-desc');
    const amountSatsEl = document.getElementById('w3p-sats');
    const amountUsdEl = document.getElementById('w3p-usd');
    const idEl = document.getElementById('w3p-id');
    const invoiceEl = document.getElementById('w3p-invoice');
    const statusEl = document.getElementById('w3p-status');

    if (titleEl) titleEl.textContent = challenge.description || 'Web3 HTTP 402 Payment Required';
    if (amountSatsEl) amountSatsEl.textContent = (challenge.amount || 0).toLocaleString() + ' ' + (challenge.currency || 'SATS');
    if (amountUsdEl) amountUsdEl.textContent = challenge.amount_usd ? `($${Number(challenge.amount_usd).toFixed(2)} USD)` : '';
    if (idEl) idEl.textContent = challenge.payment_id || '';
    if (invoiceEl) invoiceEl.value = challenge.invoice || `lnbc${challenge.amount}u...${challenge.payment_id}`;
    if (statusEl) {
      statusEl.textContent = 'Challenge active • Ready for settlement';
      statusEl.className = 'w3p-status pending';
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    this.onNotify(`⚡ HTTP 402: Payment required (${challenge.amount} ${challenge.currency})`);
  }

  closeModal() {
    const modal = document.getElementById('web3-payment-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    this.activeChallenge = null;
  }

  async settleDemo() {
    if (!this.activeChallenge) return;
    const pid = this.activeChallenge.payment_id;
    const statusEl = document.getElementById('w3p-status');
    if (statusEl) {
      statusEl.textContent = 'Settling challenge via demo faucet...';
      statusEl.className = 'w3p-status processing';
    }

    try {
      const res = await fetch('/api/402/settle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': this.clientId
        },
        body: JSON.stringify({
          payment_id: pid,
          method: 'demo'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const token = data.token || data.payment_token;
        this.setToken(token);

        if (statusEl) {
          statusEl.textContent = '✓ Payment Settled! Authorization Token Issued';
          statusEl.className = 'w3p-status success';
        }
        this.onNotify('✓ HTTP 402 settled successfully! Unlocked.');

        const cb = this.settleCallbacks.get(pid);
        setTimeout(() => {
          this.closeModal();
          if (cb) {
            this.settleCallbacks.delete(pid);
            cb(data);
          }
        }, 600);
      } else {
        if (statusEl) {
          statusEl.textContent = `Settlement failed: ${data.message || 'Unknown error'}`;
          statusEl.className = 'w3p-status error';
        }
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = `Error settling payment: ${err.message}`;
        statusEl.className = 'w3p-status error';
      }
    }
  }

  async settlePreimage(preimage) {
    if (!this.activeChallenge) return;
    const pid = this.activeChallenge.payment_id;
    const statusEl = document.getElementById('w3p-status');

    try {
      const res = await fetch('/api/402/settle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': this.clientId
        },
        body: JSON.stringify({
          payment_id: pid,
          preimage: preimage.trim(),
          method: 'preimage'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const token = data.token || data.payment_token;
        this.setToken(token);
        this.onNotify('✓ Cryptographic preimage verified! Unlocked.');
        const cb = this.settleCallbacks.get(pid);
        this.closeModal();
        if (cb) {
          this.settleCallbacks.delete(pid);
          cb(data);
        }
      } else {
        if (statusEl) {
          statusEl.textContent = `Preimage rejected: ${data.message || 'Invalid preimage'}`;
          statusEl.className = 'w3p-status error';
        }
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = `Network error: ${err.message}`;
        statusEl.className = 'w3p-status error';
      }
    }
  }

  _injectStyles() {
    if (document.getElementById('web3-payment-styles')) return;
    const style = document.createElement('style');
    style.id = 'web3-payment-styles';
    style.textContent = `
      .w3p-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(3, 7, 18, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 100000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .w3p-backdrop.hidden {
        display: none !important;
      }
      .w3p-card {
        background: linear-gradient(135deg, rgba(16, 24, 39, 0.95), rgba(10, 15, 30, 0.98));
        border: 1px solid rgba(0, 240, 255, 0.35);
        box-shadow: 0 0 40px rgba(0, 240, 255, 0.25), inset 0 0 20px rgba(0, 240, 255, 0.05);
        border-radius: 14px;
        width: 100%;
        max-width: 480px;
        color: #f1f5f9;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 24px;
        position: relative;
        overflow: hidden;
      }
      .w3p-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0; height: 3px;
        background: linear-gradient(90deg, #00f0ff, #ffc400, #ff007f);
      }
      .w3p-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .w3p-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1.5px;
        color: #ffc400;
        background: rgba(255, 196, 0, 0.12);
        border: 1px solid rgba(255, 196, 0, 0.3);
        padding: 4px 10px;
        border-radius: 20px;
      }
      .w3p-close-btn {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 22px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        transition: color 0.15s;
      }
      .w3p-close-btn:hover {
        color: #fff;
      }
      .w3p-desc {
        font-size: 16px;
        font-weight: 600;
        color: #f8fafc;
        margin-bottom: 12px;
        line-height: 1.4;
      }
      .w3p-amount-box {
        background: rgba(0, 240, 255, 0.05);
        border: 1px solid rgba(0, 240, 255, 0.2);
        border-radius: 8px;
        padding: 14px;
        text-align: center;
        margin-bottom: 16px;
      }
      .w3p-amount-sats {
        font-size: 26px;
        font-weight: 800;
        color: #00f0ff;
        font-variant-numeric: tabular-nums;
      }
      .w3p-amount-usd {
        font-size: 13px;
        color: #94a3b8;
        margin-top: 2px;
      }
      .w3p-field {
        margin-bottom: 12px;
      }
      .w3p-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        color: #94a3b8;
        margin-bottom: 4px;
        display: flex;
        justify-content: space-between;
      }
      .w3p-input {
        width: 100%;
        box-sizing: border-box;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        color: #e2e8f0;
        font-family: monospace;
        font-size: 12px;
        padding: 8px 10px;
      }
      .w3p-input:focus {
        outline: none;
        border-color: #00f0ff;
      }
      .w3p-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 18px;
      }
      .w3p-btn-faucet {
        background: linear-gradient(135deg, #00f0ff, #0077ff);
        color: #030712;
        font-weight: 700;
        font-size: 14px;
        padding: 12px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 4px 15px rgba(0, 240, 255, 0.35);
        transition: transform 0.15s, box-shadow 0.15s;
      }
      .w3p-btn-faucet:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(0, 240, 255, 0.5);
      }
      .w3p-btn-preimage {
        background: rgba(255, 255, 255, 0.08);
        color: #f1f5f9;
        font-weight: 600;
        font-size: 13px;
        padding: 9px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .w3p-btn-preimage:hover {
        background: rgba(255, 255, 255, 0.14);
      }
      .w3p-status {
        margin-top: 12px;
        font-size: 12px;
        text-align: center;
        min-height: 16px;
      }
      .w3p-status.pending { color: #94a3b8; }
      .w3p-status.processing { color: #ffc400; font-weight: 600; }
      .w3p-status.success { color: #00ff88; font-weight: 700; }
      .w3p-status.error { color: #ff3366; font-weight: 600; }
    `;
    document.head.appendChild(style);
  }

  _injectModalDOM() {
    if (document.getElementById('web3-payment-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'web3-payment-modal';
    modal.className = 'w3p-backdrop hidden';
    modal.innerHTML = `
      <div class="w3p-card">
        <div class="w3p-header">
          <span class="w3p-badge"><i class="fas fa-lock"></i> HTTP 402 PAYMENT REQUIRED</span>
          <button id="w3p-close" class="w3p-close-btn" title="Cancel">&times;</button>
        </div>

        <div id="w3p-desc" class="w3p-desc">Resource Unlocking Challenge</div>

        <div class="w3p-amount-box">
          <div id="w3p-sats" class="w3p-amount-sats">1,000 SATS</div>
          <div id="w3p-usd" class="w3p-amount-usd">($0.25 USD)</div>
        </div>

        <div class="w3p-field">
          <div class="w3p-label">
            <span>LIGHTNING INVOICE / L402 MACAROON</span>
            <span id="w3p-id" style="font-family:monospace; color:#64748b;"></span>
          </div>
          <input type="text" id="w3p-invoice" class="w3p-input" readonly>
        </div>

        <div class="w3p-field">
          <div class="w3p-label"><span>CRYPTOGRAPHIC PREIMAGE (OPTIONAL)</span></div>
          <input type="text" id="w3p-preimage" class="w3p-input" placeholder="32-byte hex preimage proof...">
        </div>

        <div class="w3p-actions">
          <button id="w3p-btn-settle" class="w3p-btn-faucet">
            <i class="fas fa-bolt"></i> Instant Demo Settlement Faucet
          </button>
          <button id="w3p-btn-verify-preimage" class="w3p-btn-preimage">
            <i class="fas fa-key"></i> Settle with Preimage Proof
          </button>
        </div>

        <div id="w3p-status" class="w3p-status pending"></div>
      </div>
    `;

    document.body.appendChild(modal);

    // Bind event handlers
    const closeBtn = document.getElementById('w3p-close');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();

    const settleBtn = document.getElementById('w3p-btn-settle');
    if (settleBtn) settleBtn.onclick = () => this.settleDemo();

    const preimageBtn = document.getElementById('w3p-btn-verify-preimage');
    if (preimageBtn) {
      preimageBtn.onclick = () => {
        const inp = document.getElementById('w3p-preimage');
        const pre = inp ? inp.value : '';
        if (!pre.trim()) {
          const statusEl = document.getElementById('w3p-status');
          if (statusEl) {
            statusEl.textContent = 'Enter a 32-byte hex preimage or use Instant Demo Settlement';
            statusEl.className = 'w3p-status error';
          }
          return;
        }
        this.settlePreimage(pre);
      };
    }
  }
}

export const web3Payment = new Web3Payment();
