/**
 * Good Faith Paradigm WebXR — Theophany Wishing Well, Spot-Price Win Algorithm,
 * On-Chain Tokenized Metal Swaps (PAXG/XAUt, KAG/SLVON, COPXON), KYC Digital ID,
 * Rarible NFT Basket, and HTTP 402 Monetization HUD Manager.
 */

export class WishingWellManager {
  constructor({ onNotify } = {}) {
    this.onNotify = onNotify || ((msg) => console.log(msg));
    this.clientId = this.getOrCreateClientId();
    this.activeTab = 'well'; // 'well' | 'claim' | 'kyc' | 'cart' | 'widget'
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
      kyc: { verified: false },
      cart: { items: [], total_items: 0, subtotal_usd: 0, raffle_entries: 0 },
      subscription: { tier: 'free', name: 'Pilgrim (Free Tier)' },
      lastTossResult: null,
      activeChallenge: null
    };

    this.injectDOM();
    this.refreshAll();
  }

  getOrCreateClientId() {
    let cid = localStorage.getItem('gfp_xr_client_id');
    if (!cid) {
      cid = 'xr_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('gfp_xr_client_id', cid);
    }
    return cid;
  }

  async api(method, path, body = null, extraHeaders = {}) {
    const headers = {
      'Accept': 'application/json',
      'X-Client-ID': this.clientId,
      ...extraHeaders
    };
    const token = localStorage.getItem('gfp_xr_402_token');
    if (token && !headers['Authorization']) {
      headers['X-Payment-Token'] = token;
    }
    const opts = { method, headers };
    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, headers: res.headers, data };
  }

  async refreshAll() {
    try {
      const [balRes, cartRes, subRes] = await Promise.all([
        this.api('GET', '/api/wishing-well/balance'),
        this.api('GET', '/api/cart'),
        this.api('GET', '/api/subscriptions/status')
      ]);
      if (balRes.status === 200) {
        Object.assign(this.state, balRes.data);
      }
      if (cartRes.status === 200) {
        this.state.cart = cartRes.data;
      }
      if (subRes.status === 200) {
        this.state.subscription = subRes.data;
      }
      this.render();
    } catch (e) {
      console.warn('WishingWellManager refresh warning:', e);
    }
  }

  // Trigger HTTP 402 Challenge Modal and allow instant Demo Faucet or Preimage Settlement
  async handle402Response(challengeData, onSettledCallback) {
    this.state.activeChallenge = {
      ...challengeData,
      onSettled: onSettledCallback
    };
    this.render402Modal();
  }

  async settleActiveChallenge(method = 'demo') {
    const ch = this.state.activeChallenge;
    if (!ch) return;
    const pid = ch.payment_id || ch.challenge_id;
    const res = await this.api('POST', '/api/402/settle', {
      payment_id: pid,
      method
    });
    if (res.status === 200 && res.data.success) {
      const tok = res.data.token || res.data.payment_token;
      if (tok) {
        localStorage.setItem('gfp_xr_402_token', tok);
      }
      const cb = ch.onSettled;
      this.state.activeChallenge = null;
      this.render402Modal();
      this.onNotify('⚡ HTTP 402 Payment Settled! 50% Yield Pool / 50% Metal Pool Credited.');
      if (cb) await cb(tok);
      await this.refreshAll();
    } else {
      this.onNotify('⚠️ Settlement failed: ' + (res.data.message || 'Error'));
    }
  }

  // 1. Throw Any Custom USD Amount Into the Wishing Well
  async depositCustomAmount(amountUsd) {
    const val = parseFloat(amountUsd);
    if (isNaN(val) || val < 0.25) {
      this.onNotify('Minimum Wishing Well throw is $0.25 (25 cents = 1 Wish).');
      return;
    }
    const res = await this.api('POST', '/api/wishing-well/deposit', { amount_usd: val });
    if (res.status === 402) {
      this.handle402Response(res.data, async () => {
        await this.refreshAll();
      });
    } else if (res.status === 200) {
      await this.refreshAll();
      this.onNotify(`⛲ Threw $${val.toFixed(2)} into the Wishing Well!`);
    }
  }

  // 2. Purchase 2 oz Gold (500 cr), Silver (100 cr), or Copper (25 cr) Medallion Demo
  async purchaseMedallionCredits(metal) {
    const res = await this.api('POST', '/api/credits/purchase', { medallion: metal, quantity: 1 });
    if (res.status === 402) {
      this.open('well');
      this.handle402Response(res.data, async () => {
        await this.refreshAll();
      });
    } else if (res.status === 200) {
      await this.refreshAll();
    }
  }

  // 3. Toss a Wish ($0.25 = 5 Credits) with Live Spot-Price Win Algorithm
  async tossWish(wishesCount = 1, targetMetal = 'all', simulateWinMetal = null) {
    const wishInput = document.getElementById('gfp-ww-wish-input');
    const wishText = wishInput ? wishInput.value.trim() : 'Evolving to a Type I Civilization';
    const payload = {
      wishes: parseInt(wishesCount, 10) || 1,
      target_metal: targetMetal,
      wish: wishText || 'Evolving to a Type I Civilization'
    };
    if (simulateWinMetal) {
      payload.simulate_win_metal = simulateWinMetal;
    }
    const res = await this.api('POST', '/api/wishing-well/toss', payload);
    if (res.status === 200) {
      this.state.lastTossResult = res.data;
      await this.refreshAll();
      if (res.data.win_algorithm && res.data.win_algorithm.won_on_this_toss) {
        const won = res.data.win_algorithm.wins[0];
        this.onNotify(`🏆 WINNER! You won a ${won.name} ($${won.cash_value_usd.toFixed(2)} value)!`);
        this.switchTab('claim');
      } else {
        this.onNotify(`⛲ Wish tossed ($0.25)! $0.125 in Yield Pool + $0.125 in Metal Prize Pool.`);
      }
    } else {
      this.onNotify(res.data.message || 'Need at least 5 credits ($0.25) to toss a wish!');
    }
  }

  // 4. Update Live Precious Metal Spot Prices
  async updateSpotPrices() {
    const g = parseFloat(document.getElementById('gfp-spot-gold')?.value || 2750);
    const s = parseFloat(document.getElementById('gfp-spot-silver')?.value || 34);
    const c = parseFloat(document.getElementById('gfp-spot-copper')?.value || 1.25);
    const res = await this.api('POST', '/api/wishing-well/metals', { gold: g, silver: s, copper: c });
    if (res.status === 200) {
      this.onNotify('📈 Live Precious Metal Spot Prices & Win Algorithm Updated!');
      await this.refreshAll();
    }
  }

  // 5. Submit KYC Digital ID Verification
  async submitKYC() {
    const full_name = document.getElementById('gfp-kyc-name')?.value.trim();
    const email = document.getElementById('gfp-kyc-email')?.value.trim();
    const jurisdiction = document.getElementById('gfp-kyc-jurisdiction')?.value.trim();
    const id_type = document.getElementById('gfp-kyc-idtype')?.value;
    const id_last4 = document.getElementById('gfp-kyc-last4')?.value.trim();
    const wallet_address = document.getElementById('gfp-kyc-wallet')?.value.trim();
    const mailing_address = document.getElementById('gfp-kyc-address')?.value.trim();

    if (!full_name) {
      this.onNotify('Please enter your Full Legal Name to mint your KYC Digital ID.');
      return;
    }
    const res = await this.api('POST', '/api/kyc/verify', {
      full_name,
      email,
      jurisdiction,
      id_type,
      id_last4,
      wallet_address,
      mailing_address
    });
    if (res.status === 200 && res.data.success) {
      this.onNotify(`🪪 KYC Digital ID Minted: ${res.data.kyc.kyc_id}`);
      await this.refreshAll();
    } else {
      this.onNotify(res.data.message || 'KYC Verification error');
    }
  }

  // 6. Claim Won 2 oz Precious Metal (Cash / On-Chain Spot Swap on Base / Physical Mail)
  async claimPrize(winId, claimMode, tokenSymbol = '', dexVenue = '') {
    if (!this.state.kyc || !this.state.kyc.verified) {
      this.onNotify('🪪 Please verify your KYC Digital ID first to claim your 2 oz prize!');
      this.switchTab('kyc');
      return;
    }
    const res = await this.api('POST', '/api/wishing-well/claim', {
      win_id: winId,
      claim_mode: claimMode,
      token_symbol: tokenSymbol,
      dex_venue: dexVenue
    });
    if (res.status === 200 && res.data.success) {
      this.onNotify(`✅ Prize Claimed via ${claimMode.toUpperCase()}!`);
      await this.refreshAll();
    } else {
      this.onNotify(res.data.message || 'Prize claim failed');
    }
  }

  // 7. Rarible NFT Cart Actions
  async addToCart(tokenId) {
    const res = await this.api('POST', '/api/cart/items', { item_id: String(tokenId), quantity: 1 });
    if (res.status === 200) {
      this.onNotify(`🛒 Added Harps of God #${tokenId} to Rarible Basket!`);
      await this.refreshAll();
    }
  }

  async removeFromCart(tokenId) {
    await this.api('DELETE', `/api/cart/items/${tokenId}`);
    await this.refreshAll();
  }

  async checkoutCart() {
    const res = await this.api('POST', '/api/cart/checkout', {});
    if (res.status === 402) {
      this.handle402Response(res.data, async (tok) => {
        await this.api('POST', '/api/cart/checkout', {}, { 'Authorization': `Bearer ${tok}` });
        this.onNotify('🎉 Rarible NFT Basket Checkout Completed!');
        await this.refreshAll();
      });
    } else if (res.status === 200) {
      this.onNotify('🎉 Rarible NFT Basket Checkout Completed!');
      await this.refreshAll();
    }
  }

  // 8. Subscription Actions
  async upgradeSubscription(targetTier) {
    const res = await this.api('POST', '/api/subscriptions/upgrade', { target_tier: targetTier });
    if (res.status === 402) {
      this.handle402Response(res.data, async () => {
        this.onNotify('🌟 Upgraded to Pneumatic Investor (Paid Tier)!');
        await this.refreshAll();
      });
    } else if (res.status === 200) {
      this.onNotify(`🌟 Subscription active: ${res.data.name}`);
      await this.refreshAll();
    }
  }

  open(tab = 'well') {
    this.activeTab = tab;
    const modal = document.getElementById('gfp-wishing-well-drawer');
    if (modal) modal.style.display = 'flex';
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.refreshAll();
  }

  close() {
    const modal = document.getElementById('gfp-wishing-well-drawer');
    if (modal) modal.style.display = 'none';
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.render();
  }

  injectDOM() {
    if (document.getElementById('gfp-wishing-well-drawer')) return;

    // Add Top HUD Trigger Buttons inside .hud-actions
    const hudActions = document.querySelector('.hud-actions');
    if (hudActions) {
      const wellBtn = document.createElement('button');
      wellBtn.id = 'btn-hud-wishing-well';
      wellBtn.className = 'btn-hud active';
      wellBtn.style.background = 'linear-gradient(135deg, #f59e0b, #10b981)';
      wellBtn.style.color = '#020617';
      wellBtn.style.fontWeight = '800';
      wellBtn.innerHTML = '⛲ Wishing Well (<span id="hud-well-wishes">0</span> Wishes)';
      wellBtn.addEventListener('click', () => this.open('well'));
      hudActions.prepend(wellBtn);

      const kycBtn = document.createElement('button');
      kycBtn.id = 'btn-hud-kyc';
      kycBtn.className = 'btn-hud';
      kycBtn.innerHTML = '🪪 <span id="hud-kyc-badge">KYC ID</span>';
      kycBtn.addEventListener('click', () => this.open('kyc'));
      hudActions.appendChild(kycBtn);

      const cartBtn = document.createElement('button');
      cartBtn.id = 'btn-hud-nft-cart';
      cartBtn.className = 'btn-hud';
      cartBtn.innerHTML = '🛒 NFT Cart (<span id="hud-cart-count">0</span>)';
      cartBtn.addEventListener('click', () => this.open('cart'));
      hudActions.appendChild(cartBtn);
    }

    // Main Slide-Over Drawer for Theophany Wishing Well, Tokenized Metals, KYC ID & Cart
    const drawer = document.createElement('div');
    drawer.id = 'gfp-wishing-well-drawer';
    drawer.style.cssText = 'display:none; position:fixed; inset:0; z-index:9999; background:rgba(2,6,23,0.82); backdrop-filter:blur(8px); justify-content:flex-end; font-family:Inter,system-ui,sans-serif; color:#f8fafc; user-select:text;';
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer) this.close();
    });

    drawer.innerHTML = `
      <div style="width:100%; max-width:680px; height:100%; background:#0f172a; border-left:2px solid rgba(245,158,11,0.5); display:flex; flex-direction:column; justify-content:space-between; overflow:hidden; box-shadow:-12px 0 40px rgba(0,0,0,0.8);">
        <!-- Header -->
        <div style="padding:16px 20px; background:#020617; border-bottom:1px solid #1e293b;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div>
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                <span style="padding:2px 8px; border-radius:4px; background:rgba(245,158,11,0.2); border:1px solid rgba(245,158,11,0.5); color:#fcd34d; font-size:10px; font-weight:800; font-family:monospace;">501(c)(3) THEOPHANY WISHING WELL</span>
                <span style="padding:2px 8px; border-radius:4px; background:rgba(16,185,129,0.2); border:1px solid rgba(16,185,129,0.5); color:#6ee7b7; font-size:10px; font-weight:800; font-family:monospace;">$0.25 / WISH • 50% YIELD POOL • 50% 2OZ METALS</span>
              </div>
              <h2 style="margin:6px 0 2px; font-size:18px; font-weight:800; color:#fff;">⛲ Theophany Wishing Well &amp; On-Chain Metal Vault</h2>
              <p style="margin:0; font-size:11px; color:#94a3b8;">Throw any amount in: 50% ($0.125/wish) enters a Yield-Bearing Asset Pool &bull; 50% ($0.125/wish) funds 2 oz Gold (PAXG/XAUt), Silver (KAG/SLVON) &amp; Copper (COPXON) prizes.</p>
            </div>
            <button id="gfp-ww-close" style="padding:6px 12px; border-radius:8px; background:#1e293b; border:1px solid #334155; color:#e2e8f0; cursor:pointer; font-weight:700; font-size:12px;">✕ Close</button>
          </div>

          <!-- Navigation Tabs -->
          <div id="gfp-ww-tabs" style="display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; margin-top:12px;"></div>
        </div>

        <!-- Body -->
        <div id="gfp-ww-body" style="flex:1; overflow-y:auto; padding:16px 20px;"></div>

        <!-- Footer -->
        <div id="gfp-ww-footer" style="padding:12px 20px; background:#020617; border-top:1px solid #1e293b; display:flex; align-items:center; justify-content:space-between; font-size:12px;"></div>
      </div>

      <!-- HTTP 402 Payment Challenge Modal Overlay -->
      <div id="gfp-402-modal" style="display:none; position:fixed; inset:0; z-index:10001; background:rgba(2,6,23,0.9); align-items:center; justify-content:center; padding:16px;"></div>
    `;

    document.body.appendChild(drawer);
    document.getElementById('gfp-ww-close')?.addEventListener('click', () => this.close());
    window.GFPWishingWell = this;
  }

  render402Modal() {
    const modal = document.getElementById('gfp-402-modal');
    if (!modal) return;
    const ch = this.state.activeChallenge;
    if (!ch) {
      modal.style.display = 'none';
      return;
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div style="width:100%; max-width:480px; background:#0f172a; border:2px solid #f59e0b; border-radius:16px; padding:20px; box-shadow:0 0 40px rgba(245,158,11,0.4);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span style="padding:3px 8px; border-radius:4px; background:rgba(245,158,11,0.2); color:#fcd34d; font-family:monospace; font-size:11px; font-weight:800;">HTTP 402 PAYMENT REQUIRED (L402)</span>
          <button onclick="window.GFPWishingWell.state.activeChallenge=null; window.GFPWishingWell.render402Modal();" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:16px;">✕</button>
        </div>
        <h3 style="margin:0 0 6px; font-size:16px; color:#fff;">${ch.description || 'Complete HTTP 402 Micropayment'}</h3>
        <div style="background:#020617; border:1px solid #1e293b; border-radius:10px; padding:12px; font-family:monospace; font-size:11px; color:#cbd5e1; margin-bottom:14px;">
          <div><strong>Challenge ID:</strong> ${ch.payment_id}</div>
          <div><strong>Amount:</strong> $${Number(ch.amount_usd || 0).toFixed(2)} USD (${ch.amount} ${ch.currency})</div>
          <div><strong>50% Yield-Bearing Asset Pool:</strong> $${(Number(ch.amount_usd || 0) * 0.5).toFixed(2)} USD</div>
          <div><strong>50% Precious Metal Prize Pool:</strong> $${(Number(ch.amount_usd || 0) * 0.5).toFixed(2)} USD</div>
          <div style="margin-top:6px; word-break:break-all; color:#64748b;"><strong>L402 Invoice:</strong> ${ch.invoice || ''}</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <button onclick="window.GFPWishingWell.settleActiveChallenge('demo')" style="padding:10px 14px; border-radius:10px; background:linear-gradient(90deg, #f59e0b, #10b981); border:none; color:#020617; font-weight:800; font-size:13px; cursor:pointer;">
            ⚡ Instant Settle via HTTP 402 Demo Faucet ($${Number(ch.amount_usd || 0).toFixed(2)})
          </button>
        </div>
      </div>
    `;
  }

  render() {
    // Update top HUD badges
    const wishesEl = document.getElementById('hud-well-wishes');
    if (wishesEl) wishesEl.textContent = this.state.wishes_available || 0;
    const kycEl = document.getElementById('hud-kyc-badge');
    if (kycEl) kycEl.textContent = this.state.kyc?.verified ? `KYC ✓ (${this.state.kyc.kyc_id})` : 'KYC ID';
    const cartEl = document.getElementById('hud-cart-count');
    if (cartEl) cartEl.textContent = this.state.cart?.total_items || 0;

    // Render Tabs
    const tabsEl = document.getElementById('gfp-ww-tabs');
    if (tabsEl) {
      const tabs = [
        { id: 'well', label: `⛲ Wishing Well (${this.state.wishes_available || 0})` },
        { id: 'claim', label: `🏆 Claim Metals (${(this.state.unclaimed_wins || []).length})` },
        { id: 'kyc', label: `🪪 KYC ID ${this.state.kyc?.verified ? '✓' : ''}` },
        { id: 'cart', label: `🛒 NFT Cart (${this.state.cart?.total_items || 0})` },
        { id: 'widget', label: `🎛️ IP Demo & Tiers` }
      ];
      tabsEl.innerHTML = tabs.map(t => `
        <button onclick="window.GFPWishingWell.switchTab('${t.id}')" style="padding:7px 6px; border-radius:8px; font-size:11px; font-weight:800; cursor:pointer; border:1px solid ${this.activeTab === t.id ? '#f59e0b' : '#1e293b'}; background:${this.activeTab === t.id ? '#f59e0b' : '#0f172a'}; color:${this.activeTab === t.id ? '#020617' : '#cbd5e1'};">
          ${t.label}
        </button>
      `).join('');
    }

    const bodyEl = document.getElementById('gfp-ww-body');
    if (!bodyEl) return;

    const econ = this.state.wishing_well_economics || {};
    const odds = this.state.metal_odds || {};

    if (this.activeTab === 'well') {
      const goldOdds = odds.gold || { spot_price_oz_usd: 2750, prize_value_2oz_usd: 5500, odds_1_in: 44000, win_probability_pct: 0.00227 };
      const silverOdds = odds.silver || { spot_price_oz_usd: 34, prize_value_2oz_usd: 68, odds_1_in: 544, win_probability_pct: 0.18382 };
      const copperOdds = odds.copper || { spot_price_oz_usd: 1.25, prize_value_2oz_usd: 2.50, odds_1_in: 20, win_probability_pct: 5.0 };

      bodyEl.innerHTML = `
        <!-- 1. Throw Any Amount Into the Wishing Well -->
        <div style="background:#020617; border:1px solid rgba(245,158,11,0.4); border-radius:12px; padding:14px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:12px; font-weight:800; color:#fcd34d; font-family:monospace;">1. THROW ANY AMOUNT INTO THE WISHING WELL ($0.25 / WISH)</span>
            <span style="font-size:11px; color:#6ee7b7; font-family:monospace;">50% Yield Pool • 50% Metal Pool</span>
          </div>
          <div style="display:flex; gap:8px; margin-bottom:10px;">
            <input id="gfp-ww-custom-usd" type="number" step="0.25" min="0.25" value="5.00" placeholder="Enter USD amount (e.g. 0.25, 5.00, 100.00)" style="flex:1; padding:8px 12px; border-radius:8px; background:#0f172a; border:1px solid #334155; color:#fff; font-family:monospace; font-size:13px;" />
            <button onclick="window.GFPWishingWell.depositCustomAmount(document.getElementById('gfp-ww-custom-usd').value)" style="padding:8px 16px; border-radius:8px; background:linear-gradient(90deg, #f59e0b, #eab308); border:none; color:#020617; font-weight:800; font-size:12px; cursor:pointer;">
              ⛲ Throw Into Well
            </button>
          </div>
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin-bottom:10px;">
            <button onclick="window.GFPWishingWell.depositCustomAmount(0.25)" style="padding:6px; border-radius:6px; background:#1e293b; border:1px solid #334155; color:#e2e8f0; font-size:11px; cursor:pointer;"><strong>$0.25</strong> (1 Wish)</button>
            <button onclick="window.GFPWishingWell.depositCustomAmount(1.25)" style="padding:6px; border-radius:6px; background:#1e293b; border:1px solid #d97706; color:#fdba74; font-size:11px; cursor:pointer;"><strong>$1.25</strong> (5 Wishes / Cu)</button>
            <button onclick="window.GFPWishingWell.depositCustomAmount(5.00)" style="padding:6px; border-radius:6px; background:#1e293b; border:1px solid #94a3b8; color:#e2e8f0; font-size:11px; cursor:pointer;"><strong>$5.00</strong> (20 Wishes / Ag)</button>
            <button onclick="window.GFPWishingWell.depositCustomAmount(25.00)" style="padding:6px; border-radius:6px; background:#1e293b; border:1px solid #eab308; color:#fde047; font-size:11px; cursor:pointer;"><strong>$25.00</strong> (100 Wishes / Au)</button>
          </div>

          <!-- 50% Yield Pool / 50% Metal Pool Live Balances -->
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; text-align:center; background:#0f172a; padding:10px; border-radius:8px; border:1px solid #1e293b;">
            <div>
              <div style="font-size:10px; color:#94a3b8; font-family:monospace;">YOUR AVAILABLE WISHES</div>
              <div style="font-size:16px; font-weight:800; color:#fcd34d;">${this.state.wishes_available || 0} <span style="font-size:11px; color:#94a3b8;">(${this.state.credit_balance || 0} cr)</span></div>
            </div>
            <div>
              <div style="font-size:10px; color:#38bdf8; font-family:monospace;">50% YIELD POOL (14.5% APY)</div>
              <div style="font-size:16px; font-weight:800; color:#38bdf8;">$${Number(econ.yield_pool_principal_usd || 0).toFixed(2)}</div>
              <div style="font-size:10px; color:#6ee7b7;">+$${Number(econ.estimated_annual_yield_usd || 0).toFixed(2)}/yr yield</div>
            </div>
            <div>
              <div style="font-size:10px; color:#6ee7b7; font-family:monospace;">50% METAL PRIZE POOL</div>
              <div style="font-size:16px; font-weight:800; color:#6ee7b7;">$${Number(econ.metal_prize_pool_contributed_usd || 0).toFixed(2)}</div>
              <div style="font-size:10px; color:#94a3b8;">$0.125 / wish coverage</div>
            </div>
          </div>
        </div>

        <!-- 2. Toss a $0.25 Wish & Spot-Price Win Algorithm -->
        <div style="background:#020617; border:1px solid rgba(16,185,129,0.4); border-radius:12px; padding:14px; margin-bottom:14px;">
          <div style="font-size:12px; font-weight:800; color:#6ee7b7; font-family:monospace; margin-bottom:8px;">2. TOSS A WISH ($0.25 = 5 CREDITS) • SPOT-PRICE WIN ALGORITHM</div>
          <input id="gfp-ww-wish-input" type="text" placeholder="Type your wish (e.g., Evolving to a Type I Civilization)..." style="width:100%; box-sizing:border-box; padding:8px 12px; border-radius:8px; background:#0f172a; border:1px solid #334155; color:#fff; font-size:12px; margin-bottom:8px;" />
          <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; margin-bottom:8px;">
            <button onclick="window.GFPWishingWell.tossWish(1, 'all')" style="padding:10px; border-radius:8px; background:linear-gradient(90deg, #10b981, #06b6d4); border:none; color:#020617; font-weight:800; font-size:12px; cursor:pointer;">
              ⛲ Toss 1 Wish ($0.25 / 5 Credits)
            </button>
            <button onclick="window.GFPWishingWell.tossWish(1, 'copper', 'copper')" style="padding:10px; border-radius:8px; background:#1e293b; border:1px solid #f59e0b; color:#fcd34d; font-weight:700; font-size:11px; cursor:pointer;" title="Demo trigger to test winning & claiming Cash, Base DEX PAXG/KAG/COPXON Swap, or Physical Mail">
              🎯 Demo Simulate 2 oz Win (Test Claim Flow)
            </button>
          </div>
          ${this.state.lastTossResult ? `
            <div style="padding:10px; border-radius:8px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); font-size:11px; color:#d1fae5; margin-top:6px;">
              <div><strong>✨ ${this.state.lastTossResult.title}:</strong> <em>"${this.state.lastTossResult.verse}"</em></div>
              <div style="margin-top:4px; color:#94a3b8;">${this.state.lastTossResult.reflection}</div>
            </div>
          ` : ''}
        </div>

        <!-- 3. Live Spot-Price Actuarial Matrix ($0.125 per Wish Coverage) -->
        <div style="background:#020617; border:1px solid #1e293b; border-radius:12px; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:11px; font-weight:800; color:#38bdf8; font-family:monospace;">3. LIVE PRECIOUS METAL SPOT PRICES &amp; $0.125 ACTUARIAL WIN ALGORITHM</span>
            <button onclick="window.GFPWishingWell.updateSpotPrices()" style="padding:4px 8px; border-radius:6px; background:#1e293b; border:1px solid #38bdf8; color:#38bdf8; font-size:10px; font-weight:700; cursor:pointer;">🔄 Recalculate Odds</button>
          </div>
          <p style="font-size:11px; color:#94a3b8; margin:0 0 10px;">
            Formula: <code>P(Win 2 oz Metal) = $0.125 / (2 &times; Spot_Price_oz)</code>. Every 25&cent; wish allocates 12.5&cent; to cover the exact actuarial value of the 2 oz prize:
          </p>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; font-size:11px;">
            <div style="padding:10px; border-radius:8px; background:#0f172a; border:1px solid rgba(234,179,8,0.4);">
              <div style="font-weight:800; color:#fde047;">🥇 2 oz Gold (PAXG / XAUt)</div>
              <div style="margin-top:4px; color:#94a3b8;">Spot/oz ($): <input id="gfp-spot-gold" type="number" step="10" value="${goldOdds.spot_price_oz_usd}" style="width:70px; background:#020617; border:1px solid #334155; color:#fff; padding:2px 4px; border-radius:4px; font-family:monospace; font-size:11px;" /></div>
              <div style="margin-top:4px;">2 oz Value: <strong>$${goldOdds.prize_value_2oz_usd}</strong></div>
              <div style="color:#6ee7b7; font-family:monospace; margin-top:2px;">Odds: 1 in ${goldOdds.odds_1_in} (${goldOdds.win_probability_pct}%)</div>
            </div>
            <div style="padding:10px; border-radius:8px; background:#0f172a; border:1px solid rgba(148,163,184,0.4);">
              <div style="font-weight:800; color:#e2e8f0;">🥈 2 oz Silver (KAG / SLVON)</div>
              <div style="margin-top:4px; color:#94a3b8;">Spot/oz ($): <input id="gfp-spot-silver" type="number" step="0.5" value="${silverOdds.spot_price_oz_usd}" style="width:70px; background:#020617; border:1px solid #334155; color:#fff; padding:2px 4px; border-radius:4px; font-family:monospace; font-size:11px;" /></div>
              <div style="margin-top:4px;">2 oz Value: <strong>$${silverOdds.prize_value_2oz_usd}</strong></div>
              <div style="color:#6ee7b7; font-family:monospace; margin-top:2px;">Odds: 1 in ${silverOdds.odds_1_in} (${silverOdds.win_probability_pct}%)</div>
            </div>
            <div style="padding:10px; border-radius:8px; background:#0f172a; border:1px solid rgba(217,119,6,0.4);">
              <div style="font-weight:800; color:#fdba74;">🥉 2 oz Copper (COPXON)</div>
              <div style="margin-top:4px; color:#94a3b8;">Spot/oz ($): <input id="gfp-spot-copper" type="number" step="0.05" value="${copperOdds.spot_price_oz_usd}" style="width:70px; background:#020617; border:1px solid #334155; color:#fff; padding:2px 4px; border-radius:4px; font-family:monospace; font-size:11px;" /></div>
              <div style="margin-top:4px;">2 oz Value: <strong>$${copperOdds.prize_value_2oz_usd}</strong></div>
              <div style="color:#6ee7b7; font-family:monospace; margin-top:2px;">Odds: 1 in ${copperOdds.odds_1_in} (${copperOdds.win_probability_pct}%)</div>
            </div>
          </div>
        </div>
      `;
    } else if (this.activeTab === 'claim') {
      const unclaimed = this.state.unclaimed_wins || [];
      const claimed = this.state.claimed_wins || [];
      bodyEl.innerHTML = `
        <div style="background:#020617; border:1px solid rgba(245,158,11,0.4); border-radius:12px; padding:14px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12px; font-weight:800; color:#fcd34d; font-family:monospace;">1. ON-CHAIN SPOT SWAPS (TOKENIZED METALS ON BASE) &amp; PRIZE SETTLEMENT</span>
            <span style="font-size:11px; color:${this.state.kyc?.verified ? '#6ee7b7' : '#f87171'}; font-family:monospace;">
              ${this.state.kyc?.verified ? `🪪 KYC Verified (${this.state.kyc.kyc_id})` : '⚠️ KYC Digital ID Required to Claim'}
            </span>
          </div>
          <p style="font-size:11px; color:#94a3b8; margin:6px 0 10px;">
            Winners can claim their 2 oz precious metal in <strong>(1) Instant Cash (USDC/USD)</strong>, <strong>(2) On-Chain Tokenized Metal Spot Swap on Base</strong> via <a href="https://uniswap.org/" target="_blank" style="color:#38bdf8;">Uniswap</a>, <a href="https://aerodrome.finance/" target="_blank" style="color:#38bdf8;">Aerodrome</a>, or <a href="https://simpleswap.io/tokenized-assets" target="_blank" style="color:#38bdf8;">SimpleSwap</a>, or <strong>(3) Insured Physical Mail Delivery</strong>:
          </p>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; font-size:11px; margin-bottom:12px;">
            <div style="padding:8px; border-radius:8px; background:#0f172a; border:1px solid #334155;">
              <div style="font-weight:800; color:#fde047;">🥇 Gold (PAXG / XAUt)</div>
              <div style="color:#94a3b8; font-size:10px; margin-top:2px;">1:1 fine troy oz London Good Delivery gold bars in Brink's vaults (<a href="https://www.paxos.com/pax-gold" target="_blank" style="color:#fcd34d;">PAX Gold</a> / Tether XAUt).</div>
            </div>
            <div style="padding:8px; border-radius:8px; background:#0f172a; border:1px solid #334155;">
              <div style="font-weight:800; color:#e2e8f0;">🥈 Silver (KAG / SLVON)</div>
              <div style="color:#94a3b8; font-size:10px; margin-top:2px;">Kinesis Silver (KAG) or SLVON tokenized silver exposure via <a href="https://simpleswap.io/tokenized-assets" target="_blank" style="color:#38bdf8;">SimpleSwap</a> &amp; Base liquidity.</div>
            </div>
            <div style="padding:8px; border-radius:8px; background:#0f172a; border:1px solid #334155;">
              <div style="font-weight:800; color:#fdba74;">🥉 Copper (COPXON)</div>
              <div style="color:#94a3b8; font-size:10px; margin-top:2px;">Warehouse receipt digital model representing title to physical copper reserves (<a href="https://simpleswap.io/tokenized-assets" target="_blank" style="color:#fdba74;">COPXON</a>).</div>
            </div>
          </div>

          ${unclaimed.length === 0 ? `
            <div style="padding:16px; text-align:center; background:#0f172a; border-radius:8px; border:1px dashed #334155; font-size:12px; color:#94a3b8;">
              No unclaimed 2 oz metal wins yet. Toss a wish in the <strong>Wishing Well</strong> tab (or click <em>Demo Simulate 2 oz Win</em>) to test claiming!
            </div>
          ` : unclaimed.map(w => `
            <div style="padding:12px; border-radius:10px; background:#0f172a; border:1px solid #f59e0b; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#fde047; font-size:13px;">🏆 ${w.name} (${w.win_id})</span>
                <span style="font-family:monospace; font-size:12px; color:#6ee7b7;">2 oz Value: $${Number(w.cash_value_usd).toFixed(2)} USD</span>
              </div>
              <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:10px;">
                <button onclick="window.GFPWishingWell.claimPrize('${w.win_id}', 'cash')" style="padding:8px; border-radius:6px; background:#10b981; border:none; color:#020617; font-weight:800; font-size:11px; cursor:pointer;">
                  💵 1. Claim Cash ($${Number(w.cash_value_usd).toFixed(2)} USDC)
                </button>
                <button onclick="window.GFPWishingWell.claimPrize('${w.win_id}', 'tokenized_swap', '${(w.tokenized_options && w.tokenized_options[0]) ? w.tokenized_options[0].symbol : ''}', 'Aerodrome')" style="padding:8px; border-radius:6px; background:#38bdf8; border:none; color:#020617; font-weight:800; font-size:11px; cursor:pointer;">
                  🔄 2. Base DEX Swap (${(w.tokenized_options && w.tokenized_options[0]) ? w.tokenized_options[0].symbol : 'Token'})
                </button>
                <button onclick="window.GFPWishingWell.claimPrize('${w.win_id}', 'physical_mail')" style="padding:8px; border-radius:6px; background:#f59e0b; border:none; color:#020617; font-weight:800; font-size:11px; cursor:pointer;">
                  📦 3. Mail 2 oz Medallion
                </button>
              </div>
            </div>
          `).join('')}
        </div>

        ${claimed.length > 0 ? `
          <div style="background:#020617; border:1px solid #1e293b; border-radius:12px; padding:14px;">
            <div style="font-size:11px; font-weight:800; color:#6ee7b7; font-family:monospace; margin-bottom:8px;">CLAIMED PRIZE RECEIPTS (${claimed.length})</div>
            ${claimed.map(c => `
              <div style="padding:10px; border-radius:8px; background:#0f172a; border:1px solid #334155; font-size:11px; margin-bottom:6px;">
                <div><strong>${c.name}</strong> &bull; Mode: <span style="color:#fcd34d; font-family:monospace;">${c.claim_mode.toUpperCase()}</span> &bull; KYC: <code>${c.kyc_id}</code></div>
                <div style="color:#94a3b8; font-family:monospace; font-size:10px; margin-top:4px;">${JSON.stringify(c.settlement)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `;
    } else if (this.activeTab === 'kyc') {
      const kyc = this.state.kyc || {};
      bodyEl.innerHTML = `
        <div style="background:#020617; border:1px solid rgba(56,189,248,0.4); border-radius:12px; padding:14px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:12px; font-weight:800; color:#38bdf8; font-family:monospace;">🪪 GOOD FAITH PARADIGM — KYC DIGITAL ID (W3C DID / BASE ATTESTATION)</span>
            <span style="padding:2px 8px; border-radius:4px; font-size:10px; font-family:monospace; background:${kyc.verified ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; color:${kyc.verified ? '#6ee7b7' : '#fca5a5'};">
              ${kyc.verified ? 'VERIFIED' : 'UNVERIFIED'}
            </span>
          </div>
          <p style="font-size:11px; color:#94a3b8; margin:0 0 12px;">
            Your <strong>KYC Digital ID</strong> verifies your identity, Base wallet address (for <code>PAXG</code> / <code>XAUt</code>, <code>KAG</code> / <code>SLVON</code>, and <code>COPXON</code> swaps + Yield Pool shares), and physical mailing address (for insured 2 oz Gold, Silver &amp; Copper medallion delivery).
          </p>

          ${kyc.verified ? `
            <div style="padding:14px; border-radius:12px; background:linear-gradient(135deg, rgba(16,185,129,0.15), rgba(56,189,248,0.15)); border:1px solid #10b981; margin-bottom:14px; font-size:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:#6ee7b7; font-size:14px;">🪪 ${kyc.full_name}</strong>
                <span style="font-family:monospace; color:#fcd34d; font-weight:800;">${kyc.kyc_id}</span>
              </div>
              <div style="font-family:monospace; font-size:11px; color:#cbd5e1; margin-top:6px;">DID: ${kyc.did}</div>
              <div style="font-size:11px; color:#94a3b8; margin-top:4px;">Wallet: <code>${kyc.wallet_address}</code></div>
              <div style="font-size:11px; color:#94a3b8; margin-top:2px;">Shipping Address: ${kyc.mailing_address}</div>
              <div style="font-family:monospace; font-size:10px; color:#64748b; margin-top:6px; word-break:break-all;">HMAC Attestation: ${kyc.signature}</div>
            </div>
          ` : ''}

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:11px;">
            <div>
              <label style="display:block; color:#94a3b8; margin-bottom:4px;">Full Legal Name *</label>
              <input id="gfp-kyc-name" type="text" value="${kyc.full_name || ''}" placeholder="e.g. Jason Sprouse" style="width:100%; box-sizing:border-box; padding:8px; border-radius:6px; background:#0f172a; border:1px solid #334155; color:#fff;" />
            </div>
            <div>
              <label style="display:block; color:#94a3b8; margin-bottom:4px;">Email Address *</label>
              <input id="gfp-kyc-email" type="email" value="${kyc.email || ''}" placeholder="you@domain.com" style="width:100%; box-sizing:border-box; padding:8px; border-radius:6px; background:#0f172a; border:1px solid #334155; color:#fff;" />
            </div>
            <div>
              <label style="display:block; color:#94a3b8; margin-bottom:4px;">Government ID Type</label>
              <select id="gfp-kyc-idtype" style="width:100%; box-sizing:border-box; padding:8px; border-radius:6px; background:#0f172a; border:1px solid #334155; color:#fff;">
                <option value="Passport">Passport</option>
                <option value="Drivers_License">Driver's License / State ID</option>
                <option value="National_EID">National Digital ID</option>
              </select>
            </div>
            <div>
              <label style="display:block; color:#94a3b8; margin-bottom:4px;">ID Document Last 4 Digits &amp; Jurisdiction</label>
              <div style="display:flex; gap:6px;">
                <input id="gfp-kyc-last4" type="text" maxlength="4" value="${kyc.id_last4 || '7777'}" placeholder="Last 4" style="width:50%; padding:8px; border-radius:6px; background:#0f172a; border:1px solid #334155; color:#fff; font-family:monospace;" />
                <input id="gfp-kyc-jurisdiction" type="text" value="${kyc.jurisdiction || 'US-TX'}" placeholder="US-TX" style="width:50%; padding:8px; border-radius:6px; background:#0f172a; border:1px solid #334155; color:#fff; font-family:monospace;" />
              </div>
            </div>
            <div style="grid-column:span 2;">
              <label style="display:block; color:#94a3b8; margin-bottom:4px;">Base / EVM Wallet Address (for PAXG, KAG, COPXON &amp; Yield Pool)</label>
              <input id="gfp-kyc-wallet" type="text" value="${kyc.wallet_address || '0x0d12a3d7065969196b01b6359f9394622b74f3df'}" style="width:100%; box-sizing:border-box; padding:8px; border-radius:6px; background:#0f172a; border:1px solid #334155; color:#fff; font-family:monospace;" />
            </div>
            <div style="grid-column:span 2;">
              <label style="display:block; color:#94a3b8; margin-bottom:4px;">Verified Physical Mailing Address (for Insured 2 oz Gold/Silver/Copper Delivery)</label>
              <input id="gfp-kyc-address" type="text" value="${kyc.mailing_address || ''}" placeholder="Street Address, City, State, ZIP, Country" style="width:100%; box-sizing:border-box; padding:8px; border-radius:6px; background:#0f172a; border:1px solid #334155; color:#fff;" />
            </div>
          </div>
          <button onclick="window.GFPWishingWell.submitKYC()" style="margin-top:12px; width:100%; padding:10px; border-radius:8px; background:linear-gradient(90deg, #38bdf8, #10b981); border:none; color:#020617; font-weight:800; font-size:12px; cursor:pointer;">
            🪪 Verify Identity &amp; Issue Signed KYC Digital ID
          </button>
        </div>
      `;
    } else if (this.activeTab === 'cart') {
      const cart = this.state.cart || { items: [], total_items: 0, subtotal_usd: 0 };
      bodyEl.innerHTML = `
        <div style="background:#020617; border:1px solid rgba(245,158,11,0.4); border-radius:12px; padding:14px;">
          <div style="font-size:12px; font-weight:800; color:#fcd34d; font-family:monospace; margin-bottom:10px;">🛒 RARIBLE HARPS OF GOD NFT SHOPPING BASKET (HTTP 402)</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
            <button onclick="window.GFPWishingWell.addToCart('492856')" style="padding:10px; border-radius:8px; background:rgba(245,158,11,0.15); border:1px solid #f59e0b; color:#fde047; font-weight:800; font-size:12px; cursor:pointer;">
              + Add Yellow Y-Harps #492856 ($20)
            </button>
            <button onclick="window.GFPWishingWell.addToCart('490643')" style="padding:10px; border-radius:8px; background:rgba(16,185,129,0.15); border:1px solid #10b981; color:#6ee7b7; font-weight:800; font-size:12px; cursor:pointer;">
              + Add Green G-Harps #490643 ($20)
            </button>
          </div>
          ${(cart.items || []).length === 0 ? `
            <div style="padding:16px; text-align:center; color:#94a3b8; font-size:12px;">Your Rarible NFT Basket is empty.</div>
          ` : (cart.items || []).map(it => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#0f172a; border:1px solid #1e293b; border-radius:8px; margin-bottom:6px; font-size:12px;">
              <div>
                <strong>${it.name}</strong> (x${it.quantity})
                <div style="font-size:11px; color:#94a3b8;">$${it.line_total_usd.toFixed(2)} USD (${it.line_total_eth} ETH)</div>
              </div>
              <button onclick="window.GFPWishingWell.removeFromCart('${it.token_id}')" style="padding:4px 8px; border-radius:6px; background:#ef4444; border:none; color:#fff; font-size:11px; cursor:pointer;">Remove</button>
            </div>
          `).join('')}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:10px; border-top:1px solid #1e293b;">
            <div style="font-size:13px; font-weight:800;">Total: $${Number(cart.subtotal_usd || 0).toFixed(2)} USD</div>
            <button onclick="window.GFPWishingWell.checkoutCart()" style="padding:9px 16px; border-radius:8px; background:linear-gradient(90deg, #f59e0b, #10b981); border:none; color:#020617; font-weight:800; font-size:12px; cursor:pointer;">
              ⚡ Checkout Basket via HTTP 402
            </button>
          </div>
        </div>
      `;
    } else if (this.activeTab === 'widget') {
      const sub = this.state.subscription || { tier: 'free', name: 'Pilgrim (Free Tier)' };
      bodyEl.innerHTML = `
        <div style="background:#020617; border:1px solid #1e293b; border-radius:12px; padding:14px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:12px; font-weight:800; color:#38bdf8; font-family:monospace;">MULTI-TIER HTTP 402 SUBSCRIPTION</span>
            <span style="font-size:11px; color:#fcd34d; font-family:monospace;">Active: ${sub.name}</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
            <button onclick="window.GFPWishingWell.upgradeSubscription('free')" style="padding:8px; border-radius:8px; background:#0f172a; border:1px solid #334155; color:#cbd5e1; font-size:11px; cursor:pointer;">Free (Pilgrim)</button>
            <button onclick="window.GFPWishingWell.upgradeSubscription('freemium')" style="padding:8px; border-radius:8px; background:#0f172a; border:1px solid #38bdf8; color:#38bdf8; font-size:11px; font-weight:700; cursor:pointer;">⚡ 24h Freemium VIP Trial</button>
            <button onclick="window.GFPWishingWell.upgradeSubscription('paid')" style="padding:8px; border-radius:8px; background:linear-gradient(90deg, #f59e0b, #10b981); border:none; color:#020617; font-size:11px; font-weight:800; cursor:pointer;">👑 Pneumatic Investor ($19.99)</button>
          </div>
        </div>
        <div style="background:#020617; border:1px solid rgba(245,158,11,0.4); border-radius:12px; padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:11px; font-weight:800; color:#fcd34d; font-family:monospace;">COMPLEMENTARY 501(c)(3) IP DIGITAL DEMONSTRATION</span>
            <a href="https://jasonsprouse.github.io/digital-golden-plates/harps_inline_widget.html" target="_blank" rel="noopener" style="font-size:11px; color:#38bdf8;">Open Full Screen ↗</a>
          </div>
          <iframe src="https://jasonsprouse.github.io/digital-golden-plates/harps_inline_widget.html" style="width:100%; height:360px; border:1px solid #1e293b; border-radius:8px; background:#020617;"></iframe>
        </div>
      `;
    }

    const footerEl = document.getElementById('gfp-ww-footer');
    if (footerEl) {
      footerEl.innerHTML = `
        <div>
          <span style="color:#94a3b8;">Wishes:</span> <strong style="color:#fcd34d;">${this.state.wishes_available || 0}</strong> &bull;
          <span style="color:#94a3b8;">Yield Pool:</span> <strong style="color:#38bdf8;">$${Number(econ.yield_pool_principal_usd || 0).toFixed(2)}</strong> &bull;
          <span style="color:#94a3b8;">KYC:</span> <strong style="color:${this.state.kyc?.verified ? '#6ee7b7' : '#fca5a5'};">${this.state.kyc?.verified ? this.state.kyc.kyc_id : 'Unverified'}</strong>
        </div>
        <button onclick="window.GFPWishingWell.tossWish(1, 'all')" style="padding:6px 12px; border-radius:6px; background:#f59e0b; border:none; color:#020617; font-weight:800; font-size:11px; cursor:pointer;">
          ⛲ Toss Wish ($0.25)
        </button>
      `;
    }
  }
}
