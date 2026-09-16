// ============================================================
//  admin-order-viewer.js
//  Self-contained - injects fonts, CSS, modal HTML, and logic.
//  No external CSS or HTML snippets required.
//  Just include this script and call viewOrder(o) anywhere.
// ============================================================
(function () {
  function resolveAdminAsset(path) {
    const value = String(path || '').trim().replace(/\\/g, '/');
    if (!value) return '';
    if (/^(https?:)?\/\//i.test(value) || value.charAt(0) === '/') return value;
    if (value.indexOf('../') === 0) return value;
    if (value.indexOf('uploads/') === 0 || value.indexOf('images/') === 0) return '../' + value;
    if (value.indexOf('feedback/') === 0 || value.indexOf('reviews/') === 0 || value.indexOf('products/') === 0) return '../uploads/' + value;
    return value;
  }

  // -- 1. Inject Google Fonts ----------------------------------
  (function injectFonts() {
    if (document.getElementById('om-fonts')) return;
    const link = document.createElement('link');
    link.id   = 'om-fonts';
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=DM+Sans:wght@300;400;500&display=swap';
    document.head.appendChild(link);
  })();

  // -- 2. Inject CSS -------------------------------------------
  (function injectStyles() {
    if (document.getElementById('om-styles')) return;
    const style = document.createElement('style');
    style.id = 'om-styles';
    style.textContent = `
      :root {
        --om-green-deep:   #1a3d2b;
        --om-green-mid:    #2d6a4f;
        --om-green-accent: #40916c;
        --om-green-light:  #95d5b2;
        --om-green-pale:   #d8f3dc;
        --om-cream:        #f9f6f0;
        --om-text-dark:    #1a2e1e;
        --om-text-muted:   #6b8f71;
      }

      /* Overlay */
      #order-modal {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 1000;
        align-items: center;
        justify-content: center;
        padding: 24px;
        backdrop-filter: blur(3px);
      }
      #order-modal.open { display: flex; }

      /* Container */
      .om-container {
        background: var(--om-cream);
        width: 100%;
        max-width: 460px;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 24px 64px rgba(26,61,43,0.22), 0 4px 16px rgba(26,61,43,0.1);
        animation: om-rise 0.45s cubic-bezier(0.16,1,0.3,1) both;
        max-height: 90vh;
        overflow-y: auto;
      }
      @keyframes om-rise {
        from { opacity:0; transform: translateY(24px) scale(0.97); }
        to   { opacity:1; transform: translateY(0)    scale(1);    }
      }

      /* Header */
      .om-header {
        background: linear-gradient(135deg, var(--om-green-deep) 0%, var(--om-green-mid) 100%);
        padding: 28px 28px 24px;
        position: relative;
        overflow: hidden;
      }
      .om-header::before {
        content: '';
        position: absolute;
        top: -40px; right: -40px;
        width: 160px; height: 160px;
        border-radius: 50%;
        background: rgba(255,255,255,0.05);
      }
      .om-header::after {
        content: '';
        position: absolute;
        bottom: -20px; left: 30%;
        width: 100px; height: 100px;
        border-radius: 50%;
        background: rgba(149,213,178,0.08);
      }
      .om-order-label {
        font-family: 'DM Sans', sans-serif;
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--om-green-light);
        opacity: 0.85;
        margin-bottom: 6px;
        position: relative;
        z-index: 1;
      }
      .om-order-id {
        font-family: 'Playfair Display', serif;
        font-size: 20px;
        font-weight: 600;
        color: #fff;
        line-height: 1.25;
        position: relative;
        z-index: 1;
      }
      .om-close-btn {
        position: absolute;
        top: 18px; right: 18px;
        width: 30px; height: 30px;
        border-radius: 50%;
        background: rgba(255,255,255,0.12);
        border: none;
        color: #fff;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 15px;
        transition: background 0.2s;
        z-index: 2;
      }
      .om-close-btn:hover { background: rgba(255,255,255,0.24); }

      /* Body */
      .om-body { padding: 24px 28px 28px; }

      .om-section-title {
        font-family: 'DM Sans', sans-serif;
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: var(--om-green-accent);
        margin-bottom: 14px;
      }

      /* Info rows */
      .om-info-grid { display: grid; gap: 10px; margin-bottom: 20px; }
      .om-info-row  { display: flex; gap: 12px; align-items: flex-start; }
      .om-icon {
        width: 32px; height: 32px;
        border-radius: 8px;
        background: var(--om-green-pale);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        font-size: 14px;
        color: var(--om-green-mid);
      }
      .om-info-content { flex: 1; padding-top: 2px; }
      .om-info-label {
        font-family: 'DM Sans', sans-serif;
        font-size: 10px; font-weight: 500;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--om-text-muted);
        line-height: 1; margin-bottom: 2px;
      }
      .om-info-value {
        font-family: 'DM Sans', sans-serif;
        font-size: 13.5px;
        color: var(--om-text-dark);
        line-height: 1.35;
      }

      /* Divider */
      .om-divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--om-green-pale), transparent);
        margin: 4px -28px 20px;
      }

      /* Item cards */
      .om-item-card {
        display: flex; align-items: center; gap: 14px;
        background: var(--om-green-pale);
        border-radius: 14px;
        padding: 12px 14px; margin-bottom: 8px;
        border: 1px solid rgba(64,145,108,0.15);
      }
      .om-item-img {
        width: 48px; height: 48px;
        border-radius: 10px; object-fit: cover;
        background: var(--om-green-light); flex-shrink: 0;
      }
      .om-item-info { flex: 1; }
      .om-item-name {
        font-family: 'Playfair Display', serif;
        font-size: 14px; font-weight: 500;
        color: var(--om-green-deep); margin-bottom: 2px;
      }
      .om-item-qty  { font-family: 'DM Sans', sans-serif; font-size: 12px; color: var(--om-text-muted); }
      .om-item-price {
        font-family: 'Playfair Display', serif;
        font-size: 16px; font-weight: 600;
        color: var(--om-green-mid); white-space: nowrap;
      }

      /* Summary */
      .om-summary { margin-top: 16px; }
      .om-summary-row {
        display: flex; justify-content: space-between;
        font-family: 'DM Sans', sans-serif;
        font-size: 13px; color: var(--om-text-muted); margin-bottom: 6px;
      }
      .om-summary-total {
        display: flex; justify-content: space-between; align-items: center;
        border-top: 1px solid var(--om-green-pale);
        padding-top: 10px; margin-top: 4px;
        font-family: 'DM Sans', sans-serif;
        font-size: 14px; font-weight: 500; color: var(--om-text-dark);
      }
      .om-total-amount {
        font-family: 'Playfair Display', serif;
        font-size: 20px; font-weight: 600; color: var(--om-green-deep);
      }

      /* Status bar */
      .om-status-bar {
        display: flex; align-items: center; justify-content: space-between;
        background: linear-gradient(135deg, #f0faf4, #e8f5e9);
        border: 1px solid rgba(64,145,108,0.2);
        border-radius: 12px; padding: 12px 16px; margin-top: 18px;
      }
      .om-status-left { display: flex; align-items: center; gap: 10px; }
      .om-status-dot  { width: 8px; height: 8px; border-radius: 50%; animation: om-pulse 2s infinite; }
      .om-status-text {
        font-family: 'DM Sans', sans-serif;
        font-size: 13px; font-weight: 500; color: var(--om-green-deep);
      }
      .om-status-badge {
        font-family: 'DM Sans', sans-serif;
        font-size: 11px; font-weight: 500;
        letter-spacing: 0.06em; padding: 4px 12px;
        border-radius: 20px; text-transform: uppercase; color: #fff;
      }

      /* Status color variants */
      .om-status-confirmed .om-status-dot   { background:#f97316; box-shadow:0 0 0 3px rgba(249,115,22,0.25); }
      .om-status-confirmed .om-status-badge { background:#f97316; }
      .om-status-pending   .om-status-dot   { background:#c9a84c; box-shadow:0 0 0 3px rgba(201,168,76,0.25); }
      .om-status-pending   .om-status-badge { background:#c9a84c; }
      .om-status-cancelled .om-status-dot   { background:#c0392b; box-shadow:0 0 0 3px rgba(192,57,43,0.25); }
      .om-status-cancelled .om-status-badge { background:#c0392b; }
      .om-status-shipped   .om-status-dot   { background:#2d6a9f; box-shadow:0 0 0 3px rgba(45,106,159,0.25); }
      .om-status-shipped   .om-status-badge { background:#2d6a9f; }
      .om-status-delivered .om-status-dot   { background:#16a075; box-shadow:0 0 0 3px rgba(22,160,117,0.25); }
      .om-status-delivered .om-status-badge { background:#16a075; }
      .om-status-pickedup .om-status-dot    { background:#7fb33b; box-shadow:0 0 0 3px rgba(127,179,59,0.25); }
      .om-status-pickedup .om-status-badge  { background:#7fb33b; }

      @keyframes om-pulse {
        0%,100% { opacity:1; }
        50%      { opacity:0.4; }
      }
    `;
    document.head.appendChild(style);
  })();

  // -- 3. Inject Modal HTML ------------------------------------
  (function injectHTML() {
    if (document.getElementById('order-modal')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <div id="order-modal">
        <div class="om-container">
          <div class="om-header">
            <div class="om-order-label">Order Details</div>
            <div class="om-order-id" id="om-order-id"></div>
            <button class="om-close-btn" id="om-close-btn">?</button>
          </div>
          <div class="om-body" id="om-order-body"></div>
        </div>
      </div>
    `;
    document.body.appendChild(div.firstElementChild);

    // Close on button
    document.getElementById('om-close-btn').addEventListener('click', closeOrderModal);

    // Close on overlay click
    document.getElementById('order-modal').addEventListener('click', function (e) {
      if (e.target === this) closeOrderModal();
    });
  })();

  // -- 4. Helpers ----------------------------------------------
  function safeParse(input) {
    if (typeof input !== 'string') return input;
    try {
      return JSON.parse(input.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    } catch (e) {
      try { return JSON.parse(input); } catch (e2) { return null; }
    }
  }

  function closeOrderModal() {
    const modal = document.getElementById('order-modal');
    if (modal) modal.classList.remove('open');
  }

  // -- 5. Main renderer ----------------------------------------
  function renderAdminOrder(o) {
    try {
      o = safeParse(o) || o;
      if (!o || typeof o !== 'object') { showToast('Invalid order data'); return; }

      const customer    = o.customer || {};
      const items       = Array.isArray(o.items) ? o.items : [];
      const status      = (o.status || 'pending').toLowerCase();
      const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

      // Header - support both the injected 'om-' elements and legacy modal IDs
      const orderModalEl = document.getElementById('order-modal');
      const orderIdEl = document.getElementById('om-order-id') || document.getElementById('modal-order-id');
      const orderBodyEl = document.getElementById('om-order-body') || document.getElementById('modal-order-body');

      if (!orderModalEl || !orderIdEl || !orderBodyEl) {
        showToast('Order viewer not available on this page');
        return;
      }

      orderIdEl.textContent = o.orderId || '-';

      // Address
      const addressParts = [
        customer.street_address || customer.address,
        customer.apartment,
        customer.barangay,
        customer.municipality,
        customer.province,
        customer.region,
        customer.postalCode,
        customer.country
      ].filter(Boolean);
      const addressText = addressParts.length ? addressParts.join(', ') : (customer.fullAddress || customer.address || '-');

      // Items
      const itemsHTML = items.map(i => `
        <div class="om-item-card">
          <img
            src="${resolveAdminAsset(i.img || '')}"
            class="om-item-img"
            onerror="this.style.display='none'"
            alt="${escapeHtml(i.title || i.name || '')}"
          >
          <div class="om-item-info">
            <div class="om-item-name">${escapeHtml(i.title || i.name || '-')}</div>
            <div class="om-item-qty">Quantity: ${escapeHtml(String(i.qty || i.quantity || 1))}</div>
          </div>
          <div class="om-item-price">${peso(i.price || i.unit_price || 0)}</div>
        </div>
      `).join('');

      // Body
      orderBodyEl.innerHTML = `
        <div class="om-section-title">Customer Information</div>
        <div class="om-info-grid">

          <div class="om-info-row">
            <div class="om-icon"><i class="fa-solid fa-user"></i></div>
            <div class="om-info-content">
              <div class="om-info-label">Customer</div>
              <div class="om-info-value">${escapeHtml(((customer.firstName || '') + ' ' + (customer.lastName || '')).trim())}</div>
            </div>
          </div>

          <div class="om-info-row">
            <div class="om-icon"><i class="fa-solid fa-envelope"></i></div>
            <div class="om-info-content">
              <div class="om-info-label">Email</div>
              <div class="om-info-value">${escapeHtml(customer.email || '-')}</div>
            </div>
          </div>

          <div class="om-info-row">
            <div class="om-icon"><i class="fa-solid fa-phone"></i></div>
            <div class="om-info-content">
              <div class="om-info-label">Phone</div>
              <div class="om-info-value">${escapeHtml(customer.phone || customer.contact || '-')}</div>
            </div>
          </div>

          <div class="om-info-row">
            <div class="om-icon"><i class="fa-solid fa-map-location-dot"></i></div>
            <div class="om-info-content">
              <div class="om-info-label">Address</div>
              <div class="om-info-value">${escapeHtml(addressText || '-')}</div>
            </div>
          </div>

          <div class="om-info-row">
            <div class="om-icon"><i class="fa-solid fa-truck"></i></div>
            <div class="om-info-content">
              <div class="om-info-label">Delivery Method</div>
              <div class="om-info-value">${escapeHtml(o.deliveryType || '-')}</div>
            </div>
          </div>

        </div>

        <div class="om-divider"></div>

        <div class="om-section-title">Items (${items.length})</div>
        ${itemsHTML}

        <div class="om-summary">
          <div class="om-summary-row">
            <span>Shipping Fee</span>
            <span>${peso(o.shippingFee || 0)}</span>
          </div>
          <div class="om-summary-total">
            <span>Total</span>
            <span class="om-total-amount">${peso(o.total || 0)}</span>
          </div>
        </div>

        <div class="om-status-bar om-status-${status}">
          <div class="om-status-left">
            <div class="om-status-dot"></div>
            <span class="om-status-text">Order Status</span>
          </div>
          <div class="om-status-badge">${statusLabel}</div>
        </div>
      `;

      orderModalEl.classList.add('open');

    } catch (err) {
      console.error('renderAdminOrder error', err);
      showToast('Could not open order details');
    }
  }

  // -- 6. Expose globals ---------------------------------------
  window.renderAdminOrder = renderAdminOrder;
  window.closeOrderModal  = closeOrderModal;

  // Backwards compatibility
  if (!window.viewOrder || window.viewOrder.toString().indexOf('renderAdminOrder') === -1) {
    window.viewOrder = renderAdminOrder;
  }

})();
