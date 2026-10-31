/**
 * Good Faith Paradigm WebXR — Rarible NFT Shopping Basket & HTTP 402 Checkout Drawer
 * Manages tokens #492856 (Yellow Y) and #490643 (Green G) under contract 0xd07dc4262bcdbf85190c01c996b4c06a461d2430.
 */

import { web3Payment } from './web3Payment.js';

export class NFTBasket {
  constructor({ onNotify, onOrderConfirmed } = {}) {
    this.onNotify = onNotify || ((msg) => console.log('[NFTBasket]', msg));
    this.onOrderConfirmed = onOrderConfirmed || (() => {});
    this.isOpen = false;
    this.cartData = {
      items: [],
      total_items: 0,
      subtotal_usd: 0,
      subtotal_eth: 0,
      subtotal_sats: 0,
      raffle_entries: 0,
      dual_harp_synergy: false
    };

    this._injectStyles();
    this._injectDOM();
    this.refresh();
  }

  async refresh() {
    try {
      const res = await fetch('/api/cart/items', {
        headers: web3Payment.getAuthHeaders('/api/cart/items')
      });
      if (res.ok) {
        this.cartData = await res.json();
        this.render();
      }
    } catch (e) {
      console.warn('[NFTBasket] Failed to fetch cart:', e);
    }
  }

  async addItem(itemId, quantity = 1) {
    try {
      const res = await fetch('/api/cart/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...web3Payment.getAuthHeaders('/api/cart/items')
        },
        body: JSON.stringify({ item_id: String(itemId), quantity })
      });
      if (res.ok) {
        this.cartData = await res.json();
        this.render();
        const itemName = itemId === '492856' ? 'Yellow Y Harp (#492856)' : 'Green G Harp (#490643)';
        this.onNotify(`🛒 Added ${quantity}x ${itemName} to NFT Basket`);
        this.open();
      } else {
        const err = await res.json();
        this.onNotify(`Failed to add item: ${err.message || 'Error'}`);
      }
    } catch (e) {
      this.onNotify(`Network error adding item: ${e.message}`);
    }
  }

  async removeItem(itemId) {
    try {
      const res = await fetch('/api/cart/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...web3Payment.getAuthHeaders('/api/cart/remove')
        },
        body: JSON.stringify({ item_id: String(itemId) })
      });
      if (res.ok) {
        this.cartData = await res.json();
        this.render();
        this.onNotify('Item removed from basket');
      }
    } catch (e) {
      console.warn('[NFTBasket] Remove error:', e);
    }
  }

  async clearCart() {
    try {
      const res = await fetch('/api/cart/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...web3Payment.getAuthHeaders('/api/cart/clear')
        }
      });
      if (res.ok) {
        this.cartData = await res.json();
        this.render();
        this.onNotify('NFT basket cleared');
      }
    } catch (e) {
      console.warn('[NFTBasket] Clear error:', e);
    }
  }

  async checkout() {
    if (this.cartData.total_items <= 0) {
      this.onNotify('Your NFT basket is empty');
      return;
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...web3Payment.getAuthHeaders('/api/cart/checkout')
      };

      const res = await fetch('/api/cart/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });

      if (res.status === 402) {
        // Trigger HTTP 402 payment flow
        const authHdr = res.headers.get('WWW-Authenticate') || '';
        const payHdr = res.headers.get('Payment-Required');
        let payMeta = {};
        if (payHdr) {
          try { payMeta = JSON.parse(payHdr); } catch (_) {}
        }
        const data = await res.json().catch(() => ({}));

        const challenge = {
          payment_id: data.payment_id || payMeta.payment_id,
          amount: data.amount || payMeta.amount || this.cartData.subtotal_sats,
          amount_usd: data.amount_usd || payMeta.amount_usd || this.cartData.subtotal_usd,
          currency: data.currency || payMeta.currency || 'SATS',
          description: data.description || `Checkout ${this.cartData.total_items} Rarible NFTs`,
          invoice: data.invoice || '',
          macaroon: data.macaroon || '',
          resource: '/api/cart/checkout'
        };

        web3Payment.showPaymentModal(challenge, async (settleResult) => {
          // Re-post checkout with settlement authorization
          const settleHeaders = {
            'Content-Type': 'application/json',
            'X-Client-ID': web3Payment.getClientId(),
            'Authorization': `Bearer ${settleResult.token}`,
            'X-Payment-Token': settleResult.token
          };
          const orderRes = await fetch('/api/cart/checkout', {
            method: 'POST',
            headers: settleHeaders,
            body: JSON.stringify({})
          });

          if (orderRes.ok) {
            const orderData = await orderRes.json();
            this.showOrderConfirmation(orderData);
            this.refresh();
          } else {
            this.onNotify('Checkout completion error; please retry');
          }
        });
      } else if (res.ok) {
        const orderData = await res.json();
        this.showOrderConfirmation(orderData);
        this.refresh();
      }
    } catch (e) {
      this.onNotify(`Checkout error: ${e.message}`);
    }
  }

  showOrderConfirmation(order) {
    this.close();
    this.onNotify(`🎉 Order ${order.order_id} Confirmed! +${order.raffle_entries_awarded} Raffle Tickets & VIP Museum Tour Pass Unlocked!`);
    this.onOrderConfirmed(order);
  }

  open() {
    this.isOpen = true;
    const drawer = document.getElementById('nft-basket-drawer');
    if (drawer) drawer.classList.add('open');
  }

  close() {
    this.isOpen = false;
    const drawer = document.getElementById('nft-basket-drawer');
    if (drawer) drawer.classList.remove('open');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  render() {
    // 1. Update counter in HUD header
    const counterEl = document.getElementById('cart-counter');
    if (counterEl) counterEl.textContent = this.cartData.total_items || '0';

    // 2. Render items in drawer
    const listEl = document.getElementById('basket-items-list');
    const subtotalUsdEl = document.getElementById('basket-subtotal-usd');
    const subtotalSatsEl = document.getElementById('basket-subtotal-sats');
    const raffleEntriesEl = document.getElementById('basket-raffle-entries');
    const synergyBannerEl = document.getElementById('basket-synergy-banner');
    const checkoutBtn = document.getElementById('basket-checkout-btn');

    if (subtotalUsdEl) subtotalUsdEl.textContent = `$${(this.cartData.subtotal_usd || 0).toFixed(2)}`;
    if (subtotalSatsEl) subtotalSatsEl.textContent = `${(this.cartData.subtotal_sats || 0).toLocaleString()} sats`;
    if (raffleEntriesEl) raffleEntriesEl.textContent = `${this.cartData.raffle_entries || 0} Tickets`;

    if (synergyBannerEl) {
      synergyBannerEl.style.display = this.cartData.dual_harp_synergy ? 'flex' : 'none';
    }

    if (checkoutBtn) {
      checkoutBtn.disabled = this.cartData.total_items <= 0;
    }

    if (!listEl) return;

    if (this.cartData.items.length === 0) {
      listEl.innerHTML = `
        <div class="basket-empty">
          <i class="fas fa-shopping-basket" style="font-size:32px; color:#475569; margin-bottom:12px;"></i>
          <p>Your basket is empty.</p>
          <span style="font-size:12px; color:#64748b;">Click BUY or CART at the Harps of God exhibit on the Skyport observation deck.</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.cartData.items.map(item => `
      <div class="basket-item">
        <img src="${item.image}" alt="${item.name}" class="basket-item-img">
        <div class="basket-item-info">
          <div class="basket-item-name">${item.name}</div>
          <div class="basket-item-price">$${Number(item.price_usd).toFixed(2)} USD • ${item.price_eth} ETH</div>
          <div class="basket-item-ctrls">
            <button class="basket-qty-btn" data-act="dec" data-id="${item.item_id}">-</button>
            <span class="basket-qty">${item.quantity}</span>
            <button class="basket-qty-btn" data-act="inc" data-id="${item.item_id}">+</button>
            <button class="basket-remove-btn" data-act="del" data-id="${item.item_id}">
              <i class="fas fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach listeners
    listEl.querySelectorAll('[data-act]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const act = btn.getAttribute('data-act');
        const id = btn.getAttribute('data-id');
        if (act === 'inc') this.addItem(id, 1);
        else if (act === 'dec') this.addItem(id, -1);
        else if (act === 'del') this.removeItem(id);
      };
    });
  }

  _injectStyles() {
    if (document.getElementById('nft-basket-styles')) return;
    const style = document.createElement('style');
    style.id = 'nft-basket-styles';
    style.textContent = `
      .nft-basket-drawer {
        position: fixed;
        top: 0;
        right: -380px;
        width: 360px;
        max-width: 90vw;
        height: 100vh;
        background: linear-gradient(180deg, rgba(13, 20, 36, 0.96), rgba(8, 12, 24, 0.98));
        border-left: 1px solid rgba(0, 240, 255, 0.25);
        box-shadow: -10px 0 35px rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        z-index: 99990;
        display: flex;
        flex-direction: column;
        transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #f1f5f9;
      }
      .nft-basket-drawer.open {
        right: 0;
      }
      .basket-header {
        padding: 18px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .basket-title {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 1px;
        color: #00f0ff;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .basket-close {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
      }
      .basket-close:hover { color: #fff; }
      .basket-synergy {
        background: linear-gradient(90deg, rgba(255, 196, 0, 0.15), rgba(0, 255, 136, 0.15));
        border-bottom: 1px solid rgba(255, 196, 0, 0.3);
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        color: #ffc400;
        display: none;
        align-items: center;
        gap: 6px;
      }
      .basket-items {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .basket-item {
        display: flex;
        gap: 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 10px;
      }
      .basket-item-img {
        width: 64px;
        height: 64px;
        object-fit: cover;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.15);
      }
      .basket-item-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .basket-item-name {
        font-size: 13px;
        font-weight: 600;
        color: #f8fafc;
        line-height: 1.2;
      }
      .basket-item-price {
        font-size: 11px;
        color: #94a3b8;
      }
      .basket-item-ctrls {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .basket-qty-btn {
        width: 22px;
        height: 22px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
      }
      .basket-qty {
        font-size: 12px;
        font-weight: 700;
        min-width: 16px;
        text-align: center;
      }
      .basket-remove-btn {
        background: none;
        border: none;
        color: #ef4444;
        cursor: pointer;
        margin-left: auto;
        font-size: 13px;
      }
      .basket-empty {
        text-align: center;
        padding: 40px 10px;
        color: #94a3b8;
      }
      .basket-footer {
        padding: 18px 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(8, 12, 24, 0.8);
      }
      .basket-row {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        margin-bottom: 8px;
        color: #94a3b8;
      }
      .basket-total {
        font-size: 16px;
        font-weight: 700;
        color: #00f0ff;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: 8px;
        margin-top: 4px;
      }
      .basket-btn-checkout {
        width: 100%;
        background: linear-gradient(135deg, #00f0ff, #0077ff);
        color: #020617;
        font-weight: 700;
        font-size: 14px;
        padding: 12px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        margin-top: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 4px 15px rgba(0, 240, 255, 0.35);
      }
      .basket-btn-checkout:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .btn-basket-hud {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0, 240, 255, 0.12);
        border: 1px solid rgba(0, 240, 255, 0.35);
        color: #00f0ff;
        border-radius: 20px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn-basket-hud:hover {
        background: rgba(0, 240, 255, 0.25);
        box-shadow: 0 0 12px rgba(0, 240, 255, 0.4);
      }
    `;
    document.head.appendChild(style);
  }

  _injectDOM() {
    if (document.getElementById('nft-basket-drawer')) return;

    // 1. Inject Top HUD Cart Button into .hud-actions
    const hudActions = document.querySelector('.hud-actions');
    if (hudActions) {
      const btn = document.createElement('button');
      btn.id = 'btn-nft-cart';
      btn.className = 'btn-basket-hud';
      btn.title = 'View Rarible NFT Shopping Basket';
      btn.innerHTML = `<i class="fas fa-shopping-basket"></i> Basket (<span id="cart-counter">0</span>)`;
      btn.onclick = () => this.toggle();
      hudActions.prepend(btn);
    }

    // 2. Inject Drawer Container
    const drawer = document.createElement('div');
    drawer.id = 'nft-basket-drawer';
    drawer.className = 'nft-basket-drawer';
    drawer.innerHTML = `
      <div class="basket-header">
        <div class="basket-title">
          <i class="fas fa-shopping-basket"></i> RARIBLE NFT BASKET
        </div>
        <button id="basket-close-btn" class="basket-close">&times;</button>
      </div>

      <div id="basket-synergy-banner" class="basket-synergy">
        <i class="fas fa-sparkles"></i> Dual-Harp Synergy Active: +1 Extra Raffle Ticket!
      </div>

      <div id="basket-items-list" class="basket-items"></div>

      <div class="basket-footer">
        <div class="basket-row">
          <span>Raffle Tickets</span>
          <span id="basket-raffle-entries">0 Tickets</span>
        </div>
        <div class="basket-row">
          <span>Lightning SATS</span>
          <span id="basket-subtotal-sats">0 sats</span>
        </div>
        <div class="basket-row basket-total">
          <span>Subtotal</span>
          <span id="basket-subtotal-usd">$0.00</span>
        </div>
        <button id="basket-checkout-btn" class="basket-btn-checkout">
          <i class="fas fa-bolt"></i> CHECKOUT VIA HTTP 402
        </button>
      </div>
    `;

    document.body.appendChild(drawer);

    const closeBtn = document.getElementById('basket-close-btn');
    if (closeBtn) closeBtn.onclick = () => this.close();

    const checkoutBtn = document.getElementById('basket-checkout-btn');
    if (checkoutBtn) checkoutBtn.onclick = () => this.checkout();
  }
}
