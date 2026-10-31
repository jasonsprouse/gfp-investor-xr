/**
 * Good Faith Paradigm WebXR — x402 Payment Protocol Interceptor & Settlement Manager
 * Standards alignment:
 * - x402 Payment Protocol (https://blog.payai.network/x402-payment-protocol/)
 *   - x402Version: 1, accepts: [{ scheme: "exact", network: "base" | "solana", maxAmountRequired, payTo, asset }]
 *   - Client -> Server header: X-PAYMENT (Base64-encoded signed payment payload)
 *   - Server -> Client header: X-PAYMENT-RESPONSE (Base64-encoded settlement receipt)
 * - RFC 9110 §15.5.3 (HTTP 402 Payment Required)
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

  buildX402PaymentHeader(token, challenge = {}) {
    const payloadObj = {
      x402Version: 1,
      scheme: challenge.scheme || 'exact',
      network: challenge.network || 'base',
      payload: {
        signature: '0x' + Array.from({ length: 64 }, (_, i) => ((i * 7 + 11) % 16).toString(16)).join(''),
        authorization: {
          from: '0x71C95911E9a5D330f4D621842EC243EE1343292e',
          to: challenge.payTo || '0xd07dc4262bcdbf85190c01c996b4c06a461d2430',
          value: String(challenge.maxAmountRequired || '1000000'),
          validAfter: '0',
          validBefore: String(Math.floor(Date.now() / 1000) + 3600),
          nonce: '0x' + Math.random().toString(16).slice(2, 18).padEnd(16, '0')
        },
        payment_id: challenge.payment_id || '',
        token: token || ''
      }
    };
    try {
      return btoa(JSON.stringify(payloadObj));
    } catch (_) {
      return token || '';
    }
  }

  getAuthHeaders(resource = '') {
    const headers = {
      'X-Client-ID': this.clientId,
      'Accept': 'application/json'
    };
    if (this.token) {
      headers['X-PAYMENT'] = this.buildX402PaymentHeader(this.token, { resource });
      headers['Authorization'] = `Bearer ${this.token}`;
      headers['X-Payment-Token'] = this.token;
    }
    return headers;
  }

  /**
   * Universal fetch wrapper that intercepts HTTP 402 (x402 Payment Protocol) and prompts settlement.
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
      const payReqHeader = res.headers.get('X-PAYMENT-REQUIRED') || res.headers.get('Payment-Required');
      let payMeta = {};
      if (payReqHeader) {
        try { payMeta = JSON.parse(payReqHeader); } catch (_) {}
      }

      const firstAccept = Array.isArray(data.accepts) && data.accepts[0] ? data.accepts[0] : {};
      const usdVal = data.amount_usd || payMeta.amount_usd || (data.amount ? data.amount / 1000 : 1.0);
      const maxAtomic = firstAccept.maxAmountRequired || data.maxAmountRequired || payMeta.maxAmountRequired || String(Math.round(usdVal * 1000000));

      const challenge = {
        x402Version: data.x402Version || payMeta.x402Version || 1,
        accepts: data.accepts || [],
        scheme: firstAccept.scheme || data.scheme || 'exact',
        network: firstAccept.network || data.network || 'base',
        payTo: firstAccept.payTo || data.payTo || '0xd07dc4262bcdbf85190c01c996b4c06a461d2430',
        asset: firstAccept.asset || data.asset || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        maxAmountRequired: maxAtomic,
        payment_id: data.payment_id || payMeta.payment_id || data.challenge_id,
        amount: data.amount || payMeta.amount || 1000,
        amount_usd: usdVal,
        currency: data.currency || payMeta.currency || 'USDC',
        description: firstAccept.description || data.description || data.message || payMeta.description || 'x402 Payment Required',
        invoice: data.invoice || '',
        macaroon: data.macaroon || '',
        settle_url: data.settle_url || payMeta.settle_url || '/api/402/settle',
        resource: url
      };

      return new Promise((resolve) => {
        this.showPaymentModal(challenge, async (settleResult) => {
          const xPaymentB64 = this.buildX402PaymentHeader(settleResult.token, challenge);
          const retryHeaders = {
            ...headers,
            'X-PAYMENT': xPaymentB64,
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

    const titleEl = document.getElementById('w3p-desc');
    const amountSatsEl = document.getElementById('w3p-sats');
    const amountUsdEl = document.getElementById('w3p-usd');
    const idEl = document.getElementById('w3p-id');
    const invoiceEl = document.getElementById('w3p-invoice');
    const statusEl = document.getElementById('w3p-status');

    const usdFormatted = Number(challenge.amount_usd || 1.0).toFixed(2);
    const atomicUsdc = challenge.maxAmountRequired || String(Math.round(Number(usdFormatted) * 1000000));

    if (titleEl) titleEl.textContent = challenge.description || 'x402 Payment Protocol Challenge';
    if (amountSatsEl) amountSatsEl.textContent = `${usdFormatted} USDC (Base / Solana)`;
    if (amountUsdEl) amountUsdEl.textContent = `x402Version: 1 • scheme: exact • maxAmountRequired: ${Number(atomicUsdc).toLocaleString()} (${challenge.amount || 0} SATS eq.)`;
    if (idEl) idEl.textContent = `network: ${challenge.network || 'base'} • id: ${challenge.payment_id || ''}`;
    if (invoiceEl) {
      invoiceEl.value = JSON.stringify({
        x402Version: 1,
        scheme: challenge.scheme || 'exact',
        network: challenge.network || 'base',
        payTo: challenge.payTo || '0xd07dc4262bcdbf85190c01c996b4c06a461d2430',
        maxAmountRequired: String(atomicUsdc),
        asset: challenge.asset || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
      });
    }
    if (statusEl) {
      statusEl.textContent = 'x402 Challenge Active • Awaiting signed X-PAYMENT header payload';
      statusEl.className = 'w3p-status pending';
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    this.onNotify(`⚡ x402 Payment Protocol: ${usdFormatted} USDC required`);
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
          <span class="w3p-badge"><i class="fas fa-bolt"></i> x402 PAYMENT PROTOCOL (HTTP 402)</span>
          <button id="w3p-close" class="w3p-close-btn" title="Cancel">&times;</button>
        </div>

        <div id="w3p-desc" class="w3p-desc">Resource Unlocking Challenge</div>

        <div class="w3p-amount-box">
          <div id="w3p-sats" class="w3p-amount-sats">25.00 USDC (Base / Solana)</div>
          <div id="w3p-usd" class="w3p-amount-usd">x402Version: 1 • scheme: exact</div>
        </div>

        <div class="w3p-field">
          <div class="w3p-label">
            <span>x402 PAYMENT REQUIREMENTS (accepts[0])</span>
            <span id="w3p-id" style="font-family:monospace; color:#64748b;"></span>
          </div>
          <input type="text" id="w3p-invoice" class="w3p-input" readonly>
        </div>

        <div class="w3p-field">
          <div class="w3p-label">
            <span>X-PAYMENT SIGNATURE / PREIMAGE PROOF (OPTIONAL)</span>
            <a href="https://blog.payai.network/x402-payment-protocol/" target="_blank" rel="noopener" style="color:#00f0ff;text-decoration:none;">PayAI x402 Spec ↗</a>
          </div>
          <input type="text" id="w3p-preimage" class="w3p-input" placeholder="EIP-3009 / x402 signature or 32-byte hex proof...">
        </div>

        <div class="w3p-actions">
          <button id="w3p-btn-settle" class="w3p-btn-faucet">
            <i class="fas fa-bolt"></i> Sign &amp; Settle via x402 (X-PAYMENT)
          </button>
          <button id="w3p-btn-verify-preimage" class="w3p-btn-preimage">
            <i class="fas fa-key"></i> Verify Custom x402 Proof
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

// ---------------------------------------------------------------------------
// Static Host / GitHub Pages L402 Edge Fallback
// When deployed to a static CDN (e.g. GitHub Pages) where /api/* returns 404/405 HTML,
// transparently emulate the /api/* L402 HTTP 402 endpoints in-browser so all Web3 demos work.
// When running with serve.py / Docker / Fly.io, real backend responses pass through untouched.
// ---------------------------------------------------------------------------
(function installStaticHost402Fallback() {
  if (typeof window === 'undefined' || !window.fetch) return;
  const origFetch = window.fetch.bind(window);
  const state = {
    cart: {},
    credits: 0,
    tier: 'free',
    trialExpires: null,
    settledTokens: new Set(),
    challenges: new Map()
  };

  const CATALOG = {
    '492856': { item_id: '492856', name: 'Harps of God — Yellow Y (#492856)', price_usd: 25.0, price_sats: 25000, price_eth: 0.01 },
    '490643': { item_id: '490643', name: 'Harps of God — Green G (#490643)', price_usd: 25.0, price_sats: 25000, price_eth: 0.01 }
  };

  const MEDALLIONS = {
    gold: { credits: 500, sats: 50000, usd: 50.0, label: '2 oz Gold Medallion Demo (500 Credits)' },
    silver: { credits: 100, sats: 12000, usd: 12.0, label: '2 oz Silver Medallion Demo (100 Credits)' },
    copper: { credits: 25, sats: 3000, usd: 3.0, label: '2 oz Copper Medallion Demo (25 Credits)' }
  };

  const THEOPHANY_REFLECTIONS = [
    'Light Over The Word: 35mm optical capture at Dallas World Aquarium (Dec 2005) — coherence confirmed.',
    'Sacred Blueprint Alignment: The Four Pillars converge in the Adventure Corridor Living Lab.',
    'Multiverse Proof Equation: Plate 1 resonance unlocked — Harps of God harmonic verified.'
  ];

  function makeJsonResponse(status, body, extraHeaders = {}) {
    const headers = new Headers({ 'Content-Type': 'application/json', ...extraHeaders });
    return new Response(JSON.stringify(body), { status, headers });
  }

  function make402Challenge(resource, sats, usd, description) {
    const pid = 'pay_' + Math.random().toString(36).slice(2, 10);
    const mac = btoa(JSON.stringify({ payment_id: pid, resource, amount: sats }));
    const inv = `lnbc${sats}n1p_gfp_demo_${pid}`;
    const usdcAtomic = String(Math.max(1000, Math.round(Number(usd || 1.0) * 1000000)));
    const accepts = [
      {
        scheme: 'exact',
        network: 'base',
        chainId: 'eip155:8453',
        maxAmountRequired: usdcAtomic,
        resource,
        description,
        mimeType: 'application/json',
        payTo: '0xd07dc4262bcdbf85190c01c996b4c06a461d2430',
        maxTimeoutSeconds: 300,
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        extra: { name: 'USD Coin', symbol: 'USDC', decimals: 6, facilitatorUrl: 'https://facilitator.payai.network', protocolGuide: 'https://blog.payai.network/x402-payment-protocol/' }
      },
      {
        scheme: 'exact',
        network: 'solana',
        maxAmountRequired: usdcAtomic,
        resource,
        description,
        mimeType: 'application/json',
        payTo: 'GFPx402Treasury1111111111111111111111111111',
        maxTimeoutSeconds: 300,
        asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        extra: { name: 'USDC (Solana)', symbol: 'USDC', decimals: 6, facilitatorUrl: 'https://facilitator.payai.network', protocolGuide: 'https://blog.payai.network/x402-payment-protocol/' }
      }
    ];
    state.challenges.set(pid, { payment_id: pid, resource, amount: sats, amount_usd: usd, maxAmountRequired: usdcAtomic, description, macaroon: mac, invoice: inv });
    const payload = {
      x402Version: 1,
      protocol: 'x402',
      protocol_guide: 'https://blog.payai.network/x402-payment-protocol/',
      accepts,
      status: 402,
      error: 'X-PAYMENT header is required',
      payment_id: pid,
      amount: sats,
      amount_usd: usd,
      maxAmountRequired: usdcAtomic,
      payTo: '0xd07dc4262bcdbf85190c01c996b4c06a461d2430',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      network: 'base',
      scheme: 'exact',
      currency: 'USDC',
      description,
      macaroon: mac,
      invoice: inv,
      settle_url: '/api/402/settle'
    };
    return makeJsonResponse(402, payload, {
      'WWW-Authenticate': `x402 version="1", scheme="exact", network="base", L402 macaroon="${mac}", invoice="${inv}"`,
      'Payment-Required': JSON.stringify({ x402Version: 1, payment_id: pid, amount: sats, amount_usd: usd, maxAmountRequired: usdcAtomic, currency: 'USDC', description, settle_url: '/api/402/settle' }),
      'X-PAYMENT-REQUIRED': JSON.stringify({ x402Version: 1, payment_id: pid, maxAmountRequired: usdcAtomic, payTo: '0xd07dc4262bcdbf85190c01c996b4c06a461d2430', network: 'base', scheme: 'exact' })
    });
  }

  function isSettled(headers, resource) {
    const h = new Headers(headers || {});
    const tok = (h.get('X-Payment-Token') || h.get('Authorization') || '').replace(/^(Bearer|L402)\s+/i, '').trim();
    return tok && state.settledTokens.has(`${tok}:${resource}`);
  }

  function buildCartSummary() {
    const items = [];
    let total_items = 0;
    let subtotal_usd = 0;
    let subtotal_sats = 0;
    let subtotal_eth = 0;
    for (const [id, qty] of Object.entries(state.cart)) {
      if (qty > 0 && CATALOG[id]) {
        const c = CATALOG[id];
        items.push({ ...c, quantity: qty, line_total_usd: c.price_usd * qty, line_total_sats: c.price_sats * qty });
        total_items += qty;
        subtotal_usd += c.price_usd * qty;
        subtotal_sats += c.price_sats * qty;
        subtotal_eth += c.price_eth * qty;
      }
    }
    return {
      items,
      total_items,
      subtotal_usd,
      subtotal_sats,
      subtotal_eth: Number(subtotal_eth.toFixed(4)),
      raffle_entries: total_items,
      dual_harp_synergy: Boolean(state.cart['492856'] > 0 && state.cart['490643'] > 0)
    };
  }

  async function handleStaticApi(urlStr, options = {}) {
    const u = new URL(urlStr, window.location.origin);
    const path = u.pathname;
    let body = {};
    if (options.body) {
      try { body = JSON.parse(options.body); } catch (_) {}
    }

    if (path === '/api/402/settle') {
      const pid = body.payment_id;
      const ch = state.challenges.get(pid) || { resource: body.resource || '/api/cart/checkout' };
      const tok = 'l402_demo_' + Math.random().toString(36).slice(2, 12);
      state.settledTokens.add(`${tok}:${ch.resource}`);
      return makeJsonResponse(200, { status: 'settled', payment_id: pid, token: tok, preimage: '00'.repeat(32) });
    }
    if (path === '/api/cart/items' && (!options.method || options.method === 'GET')) {
      return makeJsonResponse(200, buildCartSummary());
    }
    if (path === '/api/cart/items' && options.method === 'POST') {
      const id = String(body.item_id || '');
      const qty = Number(body.quantity || 1);
      if (CATALOG[id] && qty > 0) state.cart[id] = (state.cart[id] || 0) + qty;
      return makeJsonResponse(200, buildCartSummary());
    }
    if (path === '/api/cart/remove') {
      delete state.cart[String(body.item_id || '')];
      return makeJsonResponse(200, buildCartSummary());
    }
    if (path === '/api/cart/clear') {
      state.cart = {};
      return makeJsonResponse(200, buildCartSummary());
    }
    if (path === '/api/cart/checkout') {
      const sum = buildCartSummary();
      if (!isSettled(options.headers, '/api/cart/checkout')) {
        return make402Challenge('/api/cart/checkout', sum.subtotal_sats || 25000, sum.subtotal_usd || 25.0, `Harps of God NFT Basket Checkout (${sum.total_items} item(s))`);
      }
      state.cart = {};
      return makeJsonResponse(200, {
        status: 'confirmed',
        order: {
          order_id: 'ORD-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
          total_items: sum.total_items,
          raffle_tickets: Array.from({ length: sum.total_items }, (_, i) => `RAFFLE-${1000 + i}`),
          museum_tour_pass: 'PASS-GOLDEN-PLATES-VIP'
        }
      });
    }
    if (path === '/api/credits/balance') {
      return makeJsonResponse(200, { balance: state.credits, toss_cost: 5 });
    }
    if (path === '/api/credits/purchase') {
      const metal = String(body.metal || 'gold').toLowerCase();
      const m = MEDALLIONS[metal] || MEDALLIONS.gold;
      if (!isSettled(options.headers, '/api/credits/purchase')) {
        return make402Challenge('/api/credits/purchase', m.sats, m.usd, m.label);
      }
      state.credits += m.credits;
      return makeJsonResponse(200, { status: 'credited', balance: state.credits, credits_added: m.credits, metal });
    }
    if (path === '/api/credits/spend') {
      if (state.credits < 5) return makeJsonResponse(400, { error: 'Insufficient medallion credits (5 required)' });
      state.credits -= 5;
      const reflection = THEOPHANY_REFLECTIONS[Math.floor(Math.random() * THEOPHANY_REFLECTIONS.length)];
      return makeJsonResponse(200, { status: 'blessed', balance: state.credits, reflection });
    }
    if (path === '/api/subscriptions/status') {
      return makeJsonResponse(200, {
        tier: state.tier,
        tier_name: state.tier === 'paid' ? 'Pneumatic Investor (VIP)' : (state.tier === 'freemium' ? 'Seeker (24h Trial)' : 'Pilgrim (Free)'),
        trial_expires_at: state.trialExpires
      });
    }
    if (path === '/api/subscriptions/trial') {
      state.tier = 'freemium';
      state.trialExpires = new Date(Date.now() + 86400000).toISOString();
      return makeJsonResponse(200, { status: 'activated', tier: 'freemium', trial_expires_at: state.trialExpires });
    }
    if (path === '/api/subscriptions/upgrade') {
      if (!isSettled(options.headers, '/api/subscriptions/upgrade')) {
        return make402Challenge('/api/subscriptions/upgrade', 100000, 100.0, 'Upgrade to Pneumatic Investor (Permanent VIP Access)');
      }
      state.tier = 'paid';
      return makeJsonResponse(200, { status: 'upgraded', tier: 'paid' });
    }
    if (path === '/api/subscriptions/vip-content') {
      if (state.tier === 'free') {
        return make402Challenge('/api/subscriptions/vip-content', 100000, 100.0, 'VIP Investor Dossier & Sacred Frequency Vault');
      }
      return makeJsonResponse(200, { status: 'unlocked', title: 'Executive Theophany Dossier & HOA 2.0 Blueprints', content: 'Full VIP access unlocked.' });
    }
    return makeJsonResponse(200, { status: 'ok' });
  }

  window.fetch = async function(input, init) {
    const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const isApi = urlStr.startsWith('/api/') || urlStr.includes('/api/');
    if (!isApi) return origFetch(input, init);
    try {
      const res = await origFetch(input, init);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if ((res.status === 404 || res.status === 405) && !ct.includes('application/json')) {
        return handleStaticApi(urlStr, init);
      }
      return res;
    } catch (_) {
      return handleStaticApi(urlStr, init);
    }
  };
})();
