/* ============================================================
   ADMIN DASHBOARD JAVASCRIPT (extracted from admin.html)
============================================================ */

/* ---- PRODUCT DATA (fetched from server) ---- */
let PRODUCTS = [];
let CURRENT_SECTION = 'dashboard';
const PRODUCT_TYPE_OPTIONS = ['Indoor', 'Outdoor', 'Hanging Plants', 'Table Plants', 'Planter', 'Furniture'];
let salesTrendChartInstance = null;
let ORDERS_POLL_TIMER = null;

function adminApi(path) {
  const cleanPath = String(path || '').replace(/^\/+/, '');
  const pathname = window.location.pathname.replace(/\\/g, '/');
  if (pathname.includes('/admin/')) {
    return new URL('api/' + cleanPath, window.location.href).toString();
  }
  const pageDir = pathname.endsWith('/')
    ? pathname
    : pathname.slice(0, pathname.lastIndexOf('/') + 1);
  return new URL('admin/api/' + cleanPath, window.location.origin + pageDir).toString();
}

/**
 * Fetch products from the server (../website/api/get_products.php).
 * If `q` is provided, server-side search is performed.
 * Returns a Promise that resolves when PRODUCTS is populated.
 */
function fetchProducts(q = '', options = {}) {
  const silent = !!(options && options.silent);
  const url = q && q.trim() ? `../website/api/get_products.php?q=${encodeURIComponent(q.trim())}` : '../website/api/get_products.php';
  return fetch(url)
    .then(r => r.text())
    .then(text => {
      // Some environments may return raw PHP/HTML (starts with '<' or '<?php') if PHP isn't running.
      try {
        const list = JSON.parse(text);
        if (list && typeof list === 'object' && !Array.isArray(list) && (list.error || list.success === false)) {
          console.error('../website/api/get_products.php returned an error payload:', list);
          if (!silent) showToast(list.error || 'Could not load products from server.');
          PRODUCTS = [];
        } else if (Array.isArray(list)) PRODUCTS = list;
        else if (list && typeof list === 'object' && Object.keys(list).length) PRODUCTS = [list];
        else PRODUCTS = [];
        const sb = document.getElementById('sb-products-count');
        if (sb) sb.textContent = PRODUCTS.length;
        renderProducts();
        // update dashboard widgets which depend on PRODUCTS
        if (typeof renderDashboardStats === 'function') renderDashboardStats();
        if (typeof renderActivityLog === 'function') renderActivityLog();
        return PRODUCTS;
      } catch (err) {
        console.error('Failed to parse products JSON. Server response:\n', text);
        // Show friendly guidance to user about likely cause (PHP not executed / served as file)
        if (!silent) showToast('Could not load products: server returned HTML. Open this page via http://localhost/... and ensure PHP/Apache is running.');
        PRODUCTS = [];
        renderProducts();
        return PRODUCTS;
      }
    })
    .catch(err => {
      console.error('Failed to fetch products:', err);
      if (!silent) showToast('Could not load products from server.');
      PRODUCTS = [];
      renderProducts();
      return PRODUCTS;
    });
}

/* ---- NAV ---- */
function showSection(id) {
  ensureProductTypeSelectOptions();

  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  const section = document.getElementById('section-' + id);
  if (section) section.classList.add('active');

  const link = document.querySelector(`.sidebar-link[data-section="${id}"]`);
  if (link) link.classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    products: 'Products',
    'add-product': 'Add Product',
    orders: 'All Orders',
    users: 'Users'
  };
  // Add admin custom sections titles
  const extraTitles = {
    appointments: 'Appointments',
    'add-appointment': 'New Appointment',
    feedback: 'Feedback',
    reports: 'Reports'
  };
  Object.assign(titles, extraTitles);
  document.getElementById('topbar-title').textContent = titles[id] || id;

  // Lazy-load section data
  if (id === 'orders' || id === 'dashboard') loadOrders();
  if (id === 'products') {
    const filterEl = document.getElementById('productFilter');
    fetchProducts(filterEl ? filterEl.value : '');
  }
  if (id === 'users' || id === 'dashboard') fetchUsers();
  if (id === 'appointments' || id === 'dashboard') fetchAppointments();
  if (id === 'feedback') loadFeedback();
  if (id === 'reports') initReportsModule();

  CURRENT_SECTION = id;
}

function ensureProductTypeSelectOptions() {
  const select = document.getElementById('pf-type');
  if (!select) return;

  const currentValue = select.value || '';
  const options = ['<option value="">Select type...</option>']
    .concat(PRODUCT_TYPE_OPTIONS.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`));
  select.innerHTML = options.join('');

  if (currentValue && PRODUCT_TYPE_OPTIONS.includes(currentValue)) {
    select.value = currentValue;
  }
}

/* ---- FEEDBACK / REVIEWS ---- */
function loadFeedback() {
  const rating = document.getElementById('filter-rating') ? document.getElementById('filter-rating').value : '';
  const service = document.getElementById('filter-service') ? document.getElementById('filter-service').value : '';
  const q = document.getElementById('feedback-search') ? document.getElementById('feedback-search').value.trim() : '';
  const params = ['limit=200'];
  if (rating) params.push('rating=' + encodeURIComponent(rating));
  if (service) params.push('service=' + encodeURIComponent(service));
  if (q) params.push('q=' + encodeURIComponent(q));
  const dataUrl = '../website/api/get_reviews.php?' + params.join('&');

  // Always fetch unfiltered data for the overview/chart so filters affect only the visible list
  const overviewUrl = '../website/api/get_reviews.php?limit=1000';

  let overviewTotal = null;
  fetch(overviewUrl)
    .then(r => r.text())
    .then(txt => {
      try {
        const list = JSON.parse(txt);
        try { renderFeedbackOverview(list); } catch(e) { console.error('renderFeedbackOverview failed', e); }
        overviewTotal = Array.isArray(list) ? list.length : null;
        const sb = document.getElementById('sb-feedback-count'); if (sb && overviewTotal !== null) sb.textContent = overviewTotal;
      } catch (err) {
        console.error('Failed to parse overview reviews JSON:', txt);
      }
    })
    .catch(err => { console.error('Failed to fetch overview reviews:', err); });

  // Fetch filtered list for the user-visible reviews only
  fetch(dataUrl)
    .then(r => r.text())
    .then(txt => {
      try {
        const list = JSON.parse(txt);
        renderFeedback(list);
        const showing = document.getElementById('feedback-showing');
        if (showing) {
          const shown = Array.isArray(list) ? list.length : 0;
          if (overviewTotal !== null) showing.textContent = `Showing ${shown} of ${overviewTotal}`;
          else showing.textContent = `Showing ${shown} of ${shown}`;
        }
      } catch (err) {
        console.error('Failed to parse filtered reviews JSON:', txt);
        const ul = document.getElementById('feedback-list'); if (ul) ul.innerHTML = '<li class="feedback-empty">Could not load feedback; ensure PHP is running.</li>';
      }
    })
    .catch(err => {
      console.error('Failed to fetch filtered reviews:', err);
      const ul = document.getElementById('feedback-list'); if (ul) ul.innerHTML = '<li class="feedback-empty">Network error loading feedback.</li>';
    });
}

// Hook feedback filter events (re-fetch when controls change)
try {
  ['filter-rating','filter-service','feedback-search'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const ev = el.tagName && el.tagName.toLowerCase() === 'input' ? 'input' : 'change';
    el.addEventListener(ev, function(){ loadFeedback(); });
  });
} catch(e) { /* ignore during initial load */ }

function renderFeedback(list) {
  const ul = document.getElementById('feedback-list');
  if (!ul) return;
  if (!Array.isArray(list) || list.length === 0) {
    ul.innerHTML = '<li class="feedback-empty">No feedback yet.</li>';
    return;
  }

  const toKey = (s) => String(s || '').trim().toLowerCase().replace(/[_\\s]+/g, '-').replace(/-+/g, '-');
  const toTitle = (s) => {
    const t = String(s || '').trim();
    if (!t) return '';
    return t.replace(/[_-]+/g, ' ').split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  function getContextTheme(label, value) {
    const norm = (s) => String(s || '').trim().toLowerCase();
    const isProduct = norm(label) === 'product';
    const key = isProduct ? 'product' : toKey(value);

    const themes = {
      product:       { bg: '#fff4e6', fg: '#b45309', border: 'rgba(180,83,9,0.16)' },
      gardening:     { bg: '#e6fff2', fg: '#16784f', border: 'rgba(22,120,79,0.14)' },
      landscaping:   { bg: '#e7f7ff', fg: '#0b7285', border: 'rgba(11,114,133,0.14)' },
      grotto:        { bg: '#f3e8ff', fg: '#6d28d9', border: 'rgba(109,40,217,0.16)' },
      waterfalls:    { bg: '#e8f0ff', fg: '#1d4ed8', border: 'rgba(29,78,216,0.16)' },
      'swimming-pool': { bg: '#e6fbff', fg: '#0e7490', border: 'rgba(14,116,144,0.16)' },
      'swimming pool': { bg: '#e6fbff', fg: '#0e7490', border: 'rgba(14,116,144,0.16)' },
      pickup:        { bg: '#eef7f1', fg: '#1a3d2b', border: 'rgba(26,61,43,0.12)' },
      delivery:      { bg: '#eef7f1', fg: '#1a3d2b', border: 'rgba(26,61,43,0.12)' },
      consultation:  { bg: '#eef7f1', fg: '#1a3d2b', border: 'rgba(26,61,43,0.12)' }
    };
    return themes[key] || { bg: '#eef7f1', fg: '#1a3d2b', border: 'rgba(26,61,43,0.12)' };
  }

  ul.innerHTML = list.map(r => {
    // reviewer name/supporting fields
    const reviewer = (r.anonymous && Number(r.anonymous) === 1) ? 'Anonymous' : (r.reviewer_name || r.name || 'Customer');
    // initials for avatar
    const initials = reviewer.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();

    const rating = Number(r.rating) || 0;
    const starsHtml = Array.from({length:5}).map((_,i)=> i < rating ? '<span class="feedback-star filled">&#9733;</span>' : '<span class="feedback-star">&#9733;</span>').join('');
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }) : '';

    const reviewText = r.text ? escapeHtml(r.text) : '';
    // context (product/service)
    const isProduct = (r.source !== 'service');
    const contextLabel = isProduct ? 'Product' : 'Service';
    const contextValueRaw = isProduct
      ? (r.product_title || ('Product ' + (r.product_id || '')))
      : (r.service || 'Service');
    const contextValue = isProduct ? contextValueRaw : toTitle(contextValueRaw);
    const theme = getContextTheme(contextLabel, contextValueRaw);

    // tags (if provided as JSON or comma list)
    let tagsHtml = '';
    let tagsCount = 0;
    try {
      if (r.tags) {
        let tags = r.tags;
        if (typeof tags === 'string') {
          try { tags = JSON.parse(tags); } catch(e){ tags = tags.split(',').map(s=>s.trim()).filter(Boolean); }
        }
        if (Array.isArray(tags) && tags.length) {
          tagsCount = tags.length;
          tagsHtml = tags.map(t => `<span class="feedback-tag">${escapeHtml(t)}</span>`).join('');
        }
      }
    } catch(e){ tagsHtml = ''; }

    const contextTag = `<span class="feedback-tag feedback-tag--context" style="--tag-bg:${theme.bg};--tag-fg:${theme.fg};--tag-border:${theme.border};">${escapeHtml(contextLabel)} - ${escapeHtml(contextValue)}</span>`;

    const sentiment = rating >= 4 ? 'pos' : (rating === 3 ? 'neu' : 'neg');
    const sentimentTitle = sentiment === 'pos' ? 'Positive' : (sentiment === 'neu' ? 'Neutral' : 'Negative');
    const textLen = String(r.text || '').trim().length;
    const isFeatured = Boolean(r.media) || textLen >= 220 || tagsCount >= 4;

    const mediaBlock = (() => {
      if (!r.media) return '';
      const src = resolveAdminAsset(r.media);
      const safe = escapeHtml(src);
      const lower = src.toLowerCase();
      const isVideo = ['.mp4', '.webm', '.mov', '.m4v', '.ogg'].some(ext => lower.endsWith(ext));
      const inner = isVideo
        ? `<video class="feedback-media__item" src="${safe}" controls></video>`
        : `<img class="feedback-media__item" src="${safe}" alt="Feedback media">`;
      return `<div class="feedback-media"><a href="${safe}" target="_blank" rel="noopener">${inner}</a></div>`;
    })();

    return `
      <li class="feedback-card${isFeatured ? ' featured' : ''}">
        <span class="feedback-sentiment feedback-sentiment--${sentiment}" title="${sentimentTitle}"></span>

        <div class="feedback-top">
          <div class="feedback-avatar">${escapeHtml(initials)}</div>
          <div class="feedback-top-meta">
            <div class="feedback-name">${escapeHtml(reviewer)}</div>
            <div class="feedback-date">${escapeHtml(date)}</div>
          </div>
        </div>

        <div class="feedback-stars" aria-label="${rating} out of 5">${starsHtml}</div>

        <div class="feedback-tags">
          ${contextTag}
          ${tagsHtml}
        </div>

        ${reviewText ? `<div class="feedback-text">${reviewText}</div>` : ``}
        ${mediaBlock}
      </li>`;
  }).join('');
}

// Chart instance for feedback overview
let FEEDBACK_OVERVIEW_CHART = null;

function renderFeedbackOverview(list) {
  const reviews = Array.isArray(list) ? list : [];
  console.log('renderFeedbackOverview called, reviews:', reviews.length);
  // ensure overview row visible if CSS accidentally hides it
  try { const row = document.getElementById('feedback-overview-row'); if (row) row.style.display = 'flex'; } catch(e){}
  const total = reviews.length;
  const sum = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0);
  const avg = total ? (sum / total) : 0;
  const avgDisplay = (Math.round(avg * 10) / 10).toFixed(1);
  try {
    const avgChip = document.getElementById('feedback-avg-chip'); if (avgChip) avgChip.textContent = avgDisplay;
    const totalChip = document.getElementById('feedback-total-chip'); if (totalChip) totalChip.textContent = String(total);
  } catch (e) { /* ignore */ }

  // per-star counts 5..1
  const counts = [5,4,3,2,1].map(st => reviews.filter(r => Number(r.rating) === st).length);

  // update left summary DOM
  const elAvg = document.getElementById('feedback-avg'); if (elAvg) elAvg.textContent = avgDisplay;
  const elStars = document.getElementById('feedback-stars'); if (elStars) {
    const full = Math.round(avg);
    elStars.innerHTML = Array.from({length:5}).map((_,i)=> i < full ? '<span style="color:#f6b74b;font-size:18px">&#9733;</span>' : '<span style="color:#eee;font-size:18px">&#9733;</span>').join('');
  }
  const elCount = document.getElementById('feedback-count'); if (elCount) elCount.textContent = `Based on ${total} review${total===1? '' : 's'}`;

  const elDist = document.getElementById('feedback-distribution');
  if (elDist) {
    elDist.innerHTML = counts.map((c, idx) => {
      const star = 5 - idx;
      const pct = total ? Math.round((c / total) * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
        <div style="width:36px;font-weight:600;color:#666">${star}?</div>
        <div style="flex:1;background:#eee;border-radius:8px;height:10px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--green-3),var(--green-1));border-radius:8px;"></div>
        </div>
        <div style="width:36px;text-align:right;color:#666">${c}</div>
      </div>`;
    }).join('');
  }

  // prepare last 6 months labels and counts
  const now = new Date();
  const months = [];
  const countsByMonth = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleString('en-US', { month: 'short' }));
    countsByMonth.push(0);
  }
  reviews.forEach(r => {
    const d = r.created_at ? new Date(r.created_at) : (r.createdAt ? new Date(r.createdAt) : null);
    if (!d || isNaN(d)) return;
    for (let i = 0; i < 6; i++) {
      const dd = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      if (dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear()) { countsByMonth[i]++; break; }
    }
  });

  try {
    const canvas = document.getElementById('feedbackOverviewChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (FEEDBACK_OVERVIEW_CHART) FEEDBACK_OVERVIEW_CHART.destroy();
    // compute aspect ratio from canvas size so Chart.js respects the fixed height
    const aspect = (canvas && canvas.clientWidth && canvas.clientHeight) ? (canvas.clientWidth / canvas.clientHeight) : undefined;
    FEEDBACK_OVERVIEW_CHART = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{ label: 'Reviews', data: countsByMonth, backgroundColor: 'rgba(31,133,100,0.95)', borderRadius: 8 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        ...(aspect ? { aspectRatio: aspect } : {}),
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        plugins: { legend: { display: false } }
      }
    });
  } catch (e) { console.error('Chart render failed', e); }
}

function exportFeedback() {
  fetch('../website/api/get_reviews.php?limit=1000')
    .then(r => r.text())
    .then(txt => {
      try {
        const list = JSON.parse(txt);
        if (!Array.isArray(list) || !list.length) { alert('No feedback to export'); return; }
        const rows = [ ['id','product_id','product_title','order_ref','rating','text','anonymous','media','created_at'] ];
        list.forEach(r => rows.push([r.id, r.product_id, r.product_title, r.order_ref, r.rating, r.text ? r.text.replace(/\r|\n/g,' ') : '', r.anonymous, r.media, r.created_at]));
        const csv = rows.map(r => r.map(c => '"' + String(c || '').replace(/"/g,'""') + '"').join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'reviews_export.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      } catch (e) { console.error('Failed to export feedback', e, txt); alert('Failed to export feedback'); }
    })
    .catch(err => { console.error('Network error exporting feedback', err); alert('Network error'); });
}

/* ---- APPOINTMENTS ---- */
let APPOINTMENTS = [];

function fetchAppointments() {
  const status = document.getElementById('appointment-status-filter') ? document.getElementById('appointment-status-filter').value : '';
  const service = document.getElementById('appointment-service-filter') ? document.getElementById('appointment-service-filter').value : '';
  const params = [];
  if (status) params.push('status=' + encodeURIComponent(status));
  if (service) params.push('service=' + encodeURIComponent(service));
  // Include admin=1 so the server knows this is an admin request and may
  // return all appointments. Frontend user requests should still supply an
  // email parameter and will not be affected.
  const url = '../website/api/get_appointments.php' + (params.length ? ('?' + params.join('&') + '&admin=1') : '?admin=1');
  fetch(url)
    .then(r => r.text())
    .then(txt => {
      try {
        const list = JSON.parse(txt);
        APPOINTMENTS = Array.isArray(list) ? list : [];
        try {
          APPOINTMENTS.sort((a, b) => {
            const ia = Number(a && a.id ? a.id : 0);
            const ib = Number(b && b.id ? b.id : 0);
            return ia - ib;
          });
        } catch (e) { /* ignore sort errors */ }
        renderAppointments();
        renderDashboardInsights();
        const sb = document.getElementById('sb-appointments-count'); if (sb) sb.textContent = APPOINTMENTS.length;
      } catch (err) {
        console.error('Failed to parse appointments JSON:', txt);
        document.getElementById('appointments-body').innerHTML = '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:20px;">Could not load appointments; ensure PHP is running.</td></tr>';
      }
    })
    .catch(err => {
      console.error('Failed to fetch appointments:', err);
      document.getElementById('appointments-body').innerHTML = '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:20px;">Network error loading appointments.</td></tr>';
    });
}

function renderAppointments() {
  const tbody = document.getElementById('appointments-body');
  if (!Array.isArray(APPOINTMENTS) || APPOINTMENTS.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:20px;">No appointments found.</td></tr>';
    return;
  }
  function appointmentAllowedStatuses(status) {
    const current = String(status || '').toLowerCase();
    if (current === 'done' || current === 'cancelled') return [];
    if (current === 'confirmed') return ['confirmed', 'done'];
    return ['pending', 'confirmed', 'cancelled'];
  }
  function formatAppointmentDateTime(a) {
    const dateOnly = String(a.appointment_date || a.preferred_date || '').trim();
    const timeOnly = String(a.appointment_time || '').trim();
    const raw = String(a.dt || a.created_at || '').trim();
    if (dateOnly) {
      const parts = dateOnly.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 9, 0, 0);
        if (!Number.isNaN(d.getTime())) {
          const dateText = d.toLocaleDateString('en-PH', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          const timeText = timeOnly || '09:00 AM';
          return `${dateText} - ${timeText}`;
        }
      }
    }
    if (raw) {
      const normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
      const d = new Date(normalized);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString('en-PH', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    }
    return '-';
  }
  tbody.innerHTML = APPOINTMENTS.map((a, i) => {
    const dt = formatAppointmentDateTime(a);
    const contact = (a.phone ? a.phone : '') + (a.email ? (a.phone ? ' / ' : '') + a.email : '');
    // Render a status dropdown + eye icon to view details (matches desired UI)
    const statuses = appointmentAllowedStatuses(a.status);
    const statusLabels = { pending: 'Pending', confirmed: 'Confirmed', done: 'Done', cancelled: 'Cancelled' };
    const viewBtn = `<button class="action-btn view" title="View details" onclick="showAppointment(${a.id})" style="margin-left:6px;"><i class="fa-solid fa-eye"></i></button>`;
    const actionHtml = statuses.length
      ? `<select class="form-select status-action-select" style="width:120px;font-size:.9rem;" onchange="updateAppointmentStatus(${a.id}, this.value, this.value==='cancelled')">${statuses.map(s => `<option value="${s}" ${String(a.status||'').toLowerCase()===s? 'selected' : ''}>${statusLabels[s]}</option>`).join('')}</select>${viewBtn}`
      : viewBtn;

    const statusClass = (a.status || '').toLowerCase();
    const statusLabel = { pending: 'Pending', confirmed: 'Confirmed', done: 'Done', cancelled: 'Cancelled' }[statusClass] || (a.status || '-');
    const statusHtml = `<span class="badge-status ${statusClass}">${statusLabel}</span>`;

    return `<tr>
      <td>${a.id || (i+1)}</td>
      <td><strong>${escapeHtml(a.name || '-')}</strong></td>
      <td>${escapeHtml(a.service || '-')}</td>
      <td>${escapeHtml(dt)}</td>
      <td>${escapeHtml(contact)}</td>
      <td>${statusHtml}</td>
      <td><div class="status-action-wrapper">${actionHtml}</div></td>
    </tr>`;
  }).join('');
}

function updateAppointmentStatus(id, status, confirmDecline = false) {
  if (!id) return showToast('Invalid appointment id');
  const current = APPOINTMENTS.find(x => String(x.id) === String(id));
  const currentStatus = String(current && current.status || '').toLowerCase();
  const nextStatus = String(status || '').toLowerCase();
  if (currentStatus === 'done' || currentStatus === 'cancelled') {
    showToast('Completed or cancelled appointments cannot be changed.');
    fetchAppointments();
    return;
  }
  if (currentStatus === 'confirmed' && (nextStatus === 'pending' || nextStatus === 'cancelled')) {
    showToast('Confirmed appointments cannot be moved back to pending or cancelled.');
    fetchAppointments();
    return;
  }
  if (confirmDecline) {
    if (!confirm('Decline this appointment? This cannot be undone.')) return;
  }
  const fd = new FormData(); fd.append('id', id); fd.append('status', status);
  showToast('Updating...');
  fetch('../website/api/update_appointment_status.php', { method: 'POST', body: fd })
    .then(r => r.text())
    .then(txt => {
      try {
        const res = JSON.parse(txt);
        if (res && res.success) {
          showToast('Updated');
          fetchAppointments();
        } else {
          console.error('update_appointment_status error:', res, txt);
          showToast((res && res.message) ? res.message : 'Failed to update');
        }
      } catch (e) {
        console.error('Invalid JSON from ../website/api/update_appointment_status.php:', txt);
        showToast('Server error updating appointment');
      }
    })
    .catch(err => { console.error('Network error updating appointment:', err); showToast('Network error'); });
}

// Hook filter change events
document.addEventListener('DOMContentLoaded', function() {
  const s = document.getElementById('appointment-status-filter');
  const sv = document.getElementById('appointment-service-filter');
  if (s) s.addEventListener('change', fetchAppointments);
  if (sv) sv.addEventListener('change', fetchAppointments);
});

function showAppointment(id) {
  const a = APPOINTMENTS.find(x => String(x.id) === String(id));
  if (!a) { showToast('Appointment not found'); return; }

  // Prefer the dedicated appointment viewer if loaded
  if (window.renderAppointment && typeof window.renderAppointment === 'function') {
    try { window.renderAppointment(a); return; } catch (e) { console.error('renderAppointment failed', e); }
  }

  // Fallback to legacy modal
  const body = document.getElementById('modal-order-body') || document.getElementById('am-appt-body') || document.getElementById('om-order-body');
  const referenceImg = a.reference_img || a.referenceImg || a.referenceImage || a.image || a.img || '';
  const referenceUrl = referenceImg ? resolveAdminAsset(referenceImg) : '';
  const referenceHtml = referenceUrl
    ? `<div style="margin-top:12px;">
        <button type="button" data-reference-url="${escapeHtml(referenceUrl)}" onclick="window.open(this.dataset.referenceUrl,'_blank')" style="border:0;border-radius:999px;background:#2d6a4f;color:#fff;padding:7px 12px;font-weight:700;cursor:pointer;">View Reference</button>
      </div>`
    : '';
  const html = `<div><strong>${escapeHtml(a.name)}</strong><div style="margin-top:8px;">Service: ${escapeHtml(a.service)}</div><div>Date: ${escapeHtml(a.dt || a.created_at)}</div><div style="margin-top:8px;">Contact: ${escapeHtml(a.phone || '')} ${a.email ? (' / ' + escapeHtml(a.email)) : ''}</div><div style="margin-top:8px;">Address: ${escapeHtml(a.address || '')}</div><div style="margin-top:8px;">Notes: ${escapeHtml(a.notes || 'No notes provided.')}</div>${referenceHtml}</div>`;
  if (body) body.innerHTML = html;
  const modal = document.getElementById('appointment-modal') || document.getElementById('order-modal');
  if (modal) modal.classList.add('open');
}

document.querySelectorAll('.sidebar-link').forEach(link => {
  link.addEventListener('click', () => showSection(link.dataset.section));
});

document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

/* ---- HELPERS ---- */
function peso(n) {
  return 'PHP ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

let appointmentDeleteTargetId = null;
let appointmentDeleteModalInstance = null;

function ensureAppointmentDeleteModal() {
  if (document.getElementById('adminAppointmentDeleteModal')) return;
  const modalHtml = `
    <div class="modal fade" id="adminAppointmentDeleteModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" style="border:none;border-radius:24px;overflow:hidden;box-shadow:0 28px 70px rgba(13,74,47,.18);">
          <div class="modal-header" style="border-bottom:none;padding:1.35rem 1.5rem 0;background:linear-gradient(180deg, rgba(217,255,246,.9), rgba(255,255,255,1));">
            <button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" style="padding:1rem 1.5rem 1.35rem;">
            <div style="display:inline-flex;align-items:center;gap:.5rem;padding:.45rem .8rem;border-radius:999px;background:rgba(45,158,104,.09);color:var(--green-1);font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Delete appointment</div>
            <h3 style="font-family:'Cormorant Garamond',serif;font-size:1.55rem;font-weight:500;color:var(--dark);margin:.85rem 0 .35rem;">Are you sure you want to delete this appointment?</h3>
            <p style="color:var(--muted);line-height:1.7;font-size:.95rem;margin:0;">Choose Yes to delete it, or No to keep it.</p>
          </div>
          <div class="modal-footer" style="border-top:none;padding:0 1.5rem 1.5rem;">
            <button type="button" class="btn" data-bs-dismiss="modal" style="border-radius:999px;padding:.62rem 1.15rem;border:1px solid rgba(45,158,104,.18);background:white;color:var(--green-1);font-weight:700;">No</button>
            <button type="button" class="btn js-admin-delete-confirm" style="border:none;background:linear-gradient(135deg,var(--green-1),var(--green-2));color:white;border-radius:999px;padding:.62rem 1.2rem;font-weight:700;letter-spacing:.04em;box-shadow:0 12px 24px rgba(13,74,47,.18);">Yes</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modalEl = document.getElementById('adminAppointmentDeleteModal');
  if (modalEl && window.bootstrap && window.bootstrap.Modal) {
    appointmentDeleteModalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modalEl.querySelector('.js-admin-delete-confirm').addEventListener('click', executeAppointmentDelete);
  }
}

function openAppointmentDeleteModal(id) {
  ensureAppointmentDeleteModal();
  appointmentDeleteTargetId = id;
  if (appointmentDeleteModalInstance) appointmentDeleteModalInstance.show();
}

function executeAppointmentDelete() {
  if (!appointmentDeleteTargetId) return;
  const fd = new FormData();
  fd.append('id', appointmentDeleteTargetId);
  showToast('Deleting...');
  fetch(adminApi('delete_appointment.php'), { method: 'POST', body: fd })
    .then(r => r.text())
    .then(txt => {
      try {
        const res = JSON.parse(txt);
        if (res && res.success) {
          showToast('Appointment deleted');
          if (appointmentDeleteModalInstance) appointmentDeleteModalInstance.hide();
          appointmentDeleteTargetId = null;
          fetchAppointments();
        } else {
          console.error('delete_appointment.php error:', res, txt);
          showToast((res && res.message) ? res.message : 'Delete failed');
        }
      } catch (e) {
        console.error('Invalid JSON from delete_appointment.php:', txt);
        showToast('Server error deleting appointment');
      }
    })
    .catch(err => {
      console.error('Network error deleting appointment:', err);
      showToast('Network error');
    });
}

function deleteAppointment(id) {
  if (!id) return showToast('Invalid appointment id');
  openAppointmentDeleteModal(id);
}

function normalizeProductSizes(rawSizes) {
  let parsed = rawSizes;

  if (typeof parsed === 'string') {
    const text = parsed.trim();
    if (!text) return [];
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => ({
      label: String((entry && (entry.label || entry.size || entry.name)) || '').trim(),
      price: Number(entry && entry.price),
      stock: Math.max(0, Number(entry && entry.stock) || 0)
    }))
    .filter((entry) => entry.label && Number.isFinite(entry.price) && entry.price >= 0);
}

function getProductSizeBasePrice(product) {
  const sizes = normalizeProductSizes(product && product.sizes);
  if (!sizes.length) return Number(product && product.price) || 0;
  return sizes.reduce((min, entry) => Math.min(min, entry.price), sizes[0].price);
}

function getProductSizeTotalStock(productOrSizes) {
  const sizes = Array.isArray(productOrSizes)
    ? normalizeProductSizes(productOrSizes)
    : normalizeProductSizes(productOrSizes && productOrSizes.sizes);
  if (!sizes.length) return Number(productOrSizes && productOrSizes.stock) || 0;
  return sizes.reduce((sum, entry) => sum + (Number(entry.stock) || 0), 0);
}

function getProductStockDisplay(product) {
  const sizes = normalizeProductSizes(product && product.sizes);
  const totalStock = getProductSizeTotalStock(product);

  if (!sizes.length) {
    const className = totalStock === 0 ? 'out' : totalStock <= 5 ? 'low' : 'ok';
    return {
      mode: 'single',
      className,
      label: totalStock === 0 ? 'Out of Stock' : totalStock <= 5 ? `Low (${totalStock})` : String(totalStock)
    };
  }

  return {
    mode: 'sizes',
    items: sizes.map((entry) => {
      const stock = Math.max(0, Number(entry.stock) || 0);
      return {
        label: `${entry.label}:${stock}`,
        className: stock === 0 ? 'out' : stock <= 5 ? 'low' : 'ok'
      };
    })
  };
}

function updateProductStockTotalField(sizes) {
  const totalEl = document.getElementById('pf-stock-total');
  if (!totalEl) return;
  const entries = Array.isArray(sizes) ? sizes : readProductSizeRows();
  totalEl.value = String(getProductSizeTotalStock(entries));
}

function updateProductSizeActionsVisibility(sizes) {
  const actionsEl = document.getElementById('pf-size-actions');
  if (!actionsEl) return;
  const entries = Array.isArray(sizes) ? sizes : readProductSizeRows();
  actionsEl.classList.toggle('d-none', !entries.length);
}

function updateStockFieldMode(sizes, fallbackStock) {
  const stockEl = document.getElementById('pf-stock-total');
  const stockLabelEl = document.getElementById('pf-stock-label');
  if (!stockEl || !stockLabelEl) return;

  const entries = Array.isArray(sizes) ? sizes : readProductSizeRows();
  const rowCount = entries.length;

  if (rowCount > 1) {
    stockLabelEl.textContent = 'Total Stock';
    stockEl.readOnly = true;
    stockEl.value = String(getProductSizeTotalStock(entries));
    return;
  }

  stockLabelEl.textContent = 'Stock';
  stockEl.readOnly = false;

  if (rowCount === 1) {
    stockEl.value = String(Math.max(0, Number(entries[0].stock) || 0));
    return;
  }

  if (fallbackStock !== undefined) {
    stockEl.value = String(Math.max(0, Number(fallbackStock) || 0));
  }
}

function updateMainPriceVisibility(sizes) {
  const priceEl = document.getElementById('pf-price');
  const wrapEl = priceEl ? priceEl.closest('.col-md-3') : null;
  if (!wrapEl || !priceEl) return;
  const rowCount = Array.isArray(sizes)
    ? sizes.length
    : document.querySelectorAll('#pf-sizes-list .size-row').length;
  const hasMultipleSizes = rowCount > 1;
  wrapEl.classList.toggle('d-none', hasMultipleSizes);
  priceEl.required = !hasMultipleSizes;
  if (hasMultipleSizes) {
    priceEl.value = '';
  }
}

function renderProductSizeRows(sizes) {
  const list = document.getElementById('pf-sizes-list');
  if (!list) return;

  const entries = Array.isArray(sizes) ? sizes : [];
  if (!entries.length) {
    list.innerHTML = '';
    updateProductSizeActionsVisibility([]);
    updateMainPriceVisibility([]);
    updateStockFieldMode([], document.getElementById('pf-stock-total') ? document.getElementById('pf-stock-total').value : 0);
    return;
  }

  list.innerHTML = entries.map((entry, index) => `
    <div class="size-row" data-size-index="${index}">
      <div>
        <label class="form-label">Size Label</label>
        <input type="text" class="form-control js-size-label" placeholder="e.g. Small, S, 4ft" value="${escapeHtml(entry.label || '')}">
      </div>
      <div>
        <label class="form-label">Price (?)</label>
        <input type="number" class="form-control js-size-price" min="0" step="0.01" placeholder="0.00" value="${entry.price != null && entry.price !== '' ? Number(entry.price) : ''}">
      </div>
      <div>
        <label class="form-label">Stock Qty</label>
        <input type="number" class="form-control js-size-stock" min="0" step="1" placeholder="0" value="${entry.stock != null && entry.stock !== '' ? Math.max(0, Number(entry.stock) || 0) : 0}">
      </div>
      <button type="button" class="btn-outline-green size-row-remove js-size-remove" aria-label="Remove size">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
  `).join('');

  updateProductSizeActionsVisibility(entries);
  updateMainPriceVisibility(entries);
  updateStockFieldMode(entries);
}

function readProductSizeRows() {
  return Array.from(document.querySelectorAll('#pf-sizes-list .size-row')).map((row) => {
    const labelEl = row.querySelector('.js-size-label');
    const priceEl = row.querySelector('.js-size-price');
    const stockEl = row.querySelector('.js-size-stock');
    return {
      label: String(labelEl ? labelEl.value : '').trim(),
      price: Number(priceEl ? priceEl.value : ''),
      stock: Math.max(0, Number(stockEl ? stockEl.value : 0) || 0)
    };
  }).filter((entry) => entry.label && Number.isFinite(entry.price) && entry.price >= 0);
}

function addProductSizeRow(size) {
  const nextSizes = readProductSizeRows();
  const stockEl = document.getElementById('pf-stock-total');
  const fallbackStock = stockEl ? Math.max(0, Number(stockEl.value) || 0) : 0;
  nextSizes.push({
    label: (size && size.label) || '',
    price: size && size.price != null ? Number(size.price) : '',
    stock: size && size.stock != null ? Math.max(0, Number(size.stock) || 0) : (nextSizes.length === 0 ? fallbackStock : 0)
  });
  renderProductSizeRows(nextSizes);
}

function resetProductSizeRows() {
  renderProductSizeRows([]);
}

/* ---- PRODUCTS TABLE ---- */
function updateProductCategoryFilterOptions() {
  const select = document.getElementById('productCategoryFilter');
  if (!select) return;

  const currentValue = select.value || '';
  const productTypes = Array.isArray(PRODUCTS)
    ? PRODUCTS.map((product) => String(product.type || '').trim()).filter(Boolean)
    : [];
  const mergedTypes = Array.from(new Set(PRODUCT_TYPE_OPTIONS.concat(productTypes)));

  select.innerHTML = ['<option value="">All Categories</option>']
    .concat(mergedTypes.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`))
    .join('');

  if (currentValue && mergedTypes.includes(currentValue)) {
    select.value = currentValue;
  }
}

function renderProducts(filter) {
  const tbody = document.getElementById('products-body');
  if (!tbody) return;

  updateProductCategoryFilterOptions();

  const searchEl = document.getElementById('productFilter');
  const categoryEl = document.getElementById('productCategoryFilter');
  const minPriceEl = document.getElementById('productPriceMin');
  const maxPriceEl = document.getElementById('productPriceMax');

  const rawFilter = typeof filter === 'string' ? filter : (searchEl ? searchEl.value : '');
  const q = String(rawFilter || '').toLowerCase().trim();
  const category = String(categoryEl ? categoryEl.value : '').trim().toLowerCase();
  let minPrice = minPriceEl && minPriceEl.value !== '' ? Number(minPriceEl.value) : null;
  let maxPrice = maxPriceEl && maxPriceEl.value !== '' ? Number(maxPriceEl.value) : null;
  let hasValidMin = Number.isFinite(minPrice);
  let hasValidMax = Number.isFinite(maxPrice);

  if (hasValidMin && hasValidMax && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  const list = (Array.isArray(PRODUCTS) ? PRODUCTS : []).filter((product) => {
    const title = String(product.title || '').toLowerCase();
    const type = String(product.type || '').toLowerCase();
    const price = Number(product.price);
    const matchesSearch = !q || title.includes(q) || type.includes(q);
    const matchesCategory = !category || type === category;
    const matchesMin = !hasValidMin || price >= minPrice;
    const matchesMax = !hasValidMax || price <= maxPrice;
    return matchesSearch && matchesCategory && matchesMin && matchesMax;
  });

  // Update sidebar count (defensive)
  const sbEl = document.getElementById('sb-products-count');
  if (sbEl) sbEl.textContent = PRODUCTS.length || 0;

  // Low stock stat (defensive)
  const lowCount = (PRODUCTS || []).filter(p => {
    const stockNum = getProductSizeTotalStock(p);
    return stockNum <= 5;
  }).length;
  const lowEl = document.getElementById('stat-lowstock');
  if (lowEl) lowEl.textContent = lowCount;

  if (!Array.isArray(list) || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:20px;">No products found.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(p => {
    const stockDisplay = getProductStockDisplay(p);
    const stockMarkup = stockDisplay.mode === 'sizes'
      ? `<div class="stock-badges">${stockDisplay.items.map((item) => `<span class="stock-badge ${item.className}">${escapeHtml(item.label)}</span>`).join('')}</div>`
      : `<span class="stock-badge ${stockDisplay.className}">${escapeHtml(stockDisplay.label)}</span>`;
    const ratingNum = p.rating == null || p.rating === '' ? null : Number(p.rating);
    const stars = ratingNum == null ? 'No rating yet' : 'Rated';
    const reviewCount = Number(p.review_count || 0);
    const ratingMeta = ratingNum == null ? '' : ` <small style="color:#aaa;">${ratingNum.toFixed(1)}${reviewCount > 0 ? ` (${reviewCount} review${reviewCount === 1 ? '' : 's'})` : ''}</small>`;
    return `<tr>
      <td><img src="${resolveAdminAsset(p.img)}" alt="${p.title}" class="product-thumb" onerror="this.src='https://via.placeholder.com/44x44/a6d4c9/08745b?text=BG'"></td>
      <td><strong>${escapeHtml(p.title || 'Untitled Product')}</strong></td>
      <td><span class="type-chip">${escapeHtml(p.type || 'Uncategorized')}</span></td>
      <td>${peso(p.price)}</td>
      <td>${stockMarkup}</td>
      <td style="color:#c87f00;">${stars}${ratingMeta}</td>
      <td>
        <button class="action-btn edit" onclick="editProduct(${p.id})"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="action-btn del" onclick="deleteProduct(${p.id})"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

const productFilterEl = document.getElementById('productFilter');
if (productFilterEl) {
  productFilterEl.addEventListener('input', function() {
    const q = this.value || '';
    // Use server-side search when user types; empty query fetches all
    fetchProducts(q);
  });
}

const productCategoryFilterEl = document.getElementById('productCategoryFilter');
if (productCategoryFilterEl) {
  productCategoryFilterEl.addEventListener('change', renderProducts);
}

['productPriceMin', 'productPriceMax'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', renderProducts);
});

function editProduct(id) {
  const p = PRODUCTS.find(x => Number(x.id) === Number(id));
  if (!p) return;
  showSection('add-product');
  document.getElementById('pf-id').value    = p.id;
  document.getElementById('pf-name').value  = p.title;
  document.getElementById('pf-type').value  = p.type;
  document.getElementById('pf-price').value = p.price;
  document.getElementById('pf-img-current').value = p.img || '';
  const imgHelpEl = document.getElementById('pf-img-help');
  if (imgHelpEl) imgHelpEl.textContent = p.img ? `Current image: ${p.img}` : 'Choose an image from your files. Supported: JPG, PNG, GIF, WEBP.';
  const imgFileEl = document.getElementById('pf-img-file');
  if (imgFileEl) imgFileEl.value = '';
  document.getElementById('pf-stock-total').value = String(Number(p.stock || 0));
  document.getElementById('pf-desc').value = p.description || p.desc || '';
  renderProductSizeRows(normalizeProductSizes(p.sizes));
  updateStockFieldMode(normalizeProductSizes(p.sizes), Number(p.stock || 0));
  showToast('Editing: ' + p.title);
}

function deleteProduct(id) {
  const p = PRODUCTS.find(x => Number(x.id) === Number(id));
  if (!p) return;
  if (!confirm(`Delete "${p.title}"? This will remove the product from the database.`)) return;
  const fd = new FormData(); fd.append('id', id);
  showToast('Deleting product...');
  fetch(adminApi('delete_product.php'), { method: 'POST', body: fd })
    .then(r => r.text())
    .then(txt => {
      try {
        const res = JSON.parse(txt);
        if (res && res.success) {
          showToast('Product deleted');
          fetchProducts();
        } else {
          console.error('delete_product.php error:', res, txt);
          showToast((res && res.message) ? res.message : 'Failed to delete product');
        }
      } catch (e) {
        console.error('Invalid JSON from delete_product.php:', txt);
        showToast('Server error deleting product');
      }
    })
    .catch(err => { console.error('Failed to delete product:', err); showToast('Network error deleting product'); });
}

document.getElementById('product-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const id = Number(document.getElementById('pf-id').value) || 0;
  const title = (document.getElementById('pf-name').value || '').trim();
  const type = (document.getElementById('pf-type').value || '').trim();
  const priceInput = document.getElementById('pf-price').value;
  const imgCurrent = (document.getElementById('pf-img-current').value || '').trim();
  const imgFileEl = document.getElementById('pf-img-file');
  const imgFile = imgFileEl && imgFileEl.files ? imgFileEl.files[0] : null;
  const desc = (document.getElementById('pf-desc').value || '').trim();
  const sizes = readProductSizeRows();
  const stockInputEl = document.getElementById('pf-stock-total');
  const stock = sizes.length > 1
    ? String(getProductSizeTotalStock(sizes))
    : String(Math.max(0, Number(stockInputEl ? stockInputEl.value : 0) || 0));
  const sizePrices = sizes.map(entry => Number(entry.price)).filter(value => Number.isFinite(value) && value >= 0);
  const effectivePrice = priceInput !== '' ? Number(priceInput) : (sizePrices.length ? Math.min(...sizePrices) : NaN);
  if (!title || !type || !Number.isFinite(effectivePrice)) {
    showToast('Please fill required fields (name, type, price).');
    return;
  }

  const fd = new FormData();
  if (id) fd.append('id', id);
  fd.append('title', title);
  fd.append('type', type);
  fd.append('price', String(effectivePrice));
  fd.append('current_img', imgCurrent);
  if (imgFile) fd.append('image_file', imgFile);
  fd.append('stock', stock);
  fd.append('description', desc);
  fd.append('sizes', JSON.stringify(sizes));
  showToast('Saving product...');
  fetch(adminApi('save_product.php'), { method: 'POST', body: fd })
    .then(r => r.text())
    .then(text => {
      try {
        const res = JSON.parse(text);
        if (res && res.success) {
          showToast(res.message || 'Product saved');
          document.getElementById('product-form').reset();
          document.getElementById('pf-id').value = '';
          resetProductSizeRows();
          fetchProducts();
        } else {
          console.error('save_product.php returned error:', res, text);
          showToast((res && (res.error || res.message)) ? (res.error || res.message) : 'Failed to save product');
        }
      } catch (err) {
        console.error('Invalid JSON from save_product.php:', text);
        showToast('Server error saving product. Ensure PHP is running.');
      }
    })
    .catch(err => {
      console.error('Failed to save product:', err);
      showToast('Could not save product (network error).');
    });
});

document.getElementById('pf-add-size').addEventListener('click', function() {
  addProductSizeRow({ label: '', price: '' });
});

document.getElementById('pf-add-size-inline').addEventListener('click', function() {
  addProductSizeRow({ label: '', price: '' });
});

document.getElementById('pf-sizes-list').addEventListener('click', function(e) {
  const removeBtn = e.target.closest('.js-size-remove');
  if (!removeBtn) return;
  const row = removeBtn.closest('.size-row');
  const index = Number(row && row.getAttribute('data-size-index'));
  if (Number.isNaN(index)) return;
  const nextSizes = readProductSizeRows().filter((_, entryIndex) => entryIndex !== index);
  renderProductSizeRows(nextSizes);
});

document.getElementById('pf-sizes-list').addEventListener('input', function(e) {
  if (!e.target.closest('.size-row')) return;
  const sizes = readProductSizeRows();
  updateStockFieldMode(sizes);
  updateMainPriceVisibility(sizes);
  updateProductSizeActionsVisibility(sizes);
});

document.getElementById('pf-stock-total').addEventListener('input', function() {
  const rows = Array.from(document.querySelectorAll('#pf-sizes-list .size-row'));
  if (rows.length !== 1) return;
  const stockEl = rows[0].querySelector('.js-size-stock');
  if (!stockEl) return;
  stockEl.value = String(Math.max(0, Number(this.value) || 0));
});

document.getElementById('product-form').addEventListener('reset', function() {
  window.setTimeout(() => {
    document.getElementById('pf-id').value = '';
    document.getElementById('pf-img-current').value = '';
    const imgHelpEl = document.getElementById('pf-img-help');
    if (imgHelpEl) imgHelpEl.textContent = 'Choose an image from your files. Supported: JPG, PNG, GIF, WEBP.';
    resetProductSizeRows();
    updateStockFieldMode([], 0);
  }, 0);
});

document.getElementById('pf-img-file').addEventListener('change', function() {
  const imgHelpEl = document.getElementById('pf-img-help');
  if (!imgHelpEl) return;
  const file = this.files && this.files[0] ? this.files[0] : null;
  imgHelpEl.textContent = file
    ? `Selected file: ${file.name}`
    : (document.getElementById('pf-img-current').value
      ? `Current image: ${document.getElementById('pf-img-current').value}`
      : 'Choose an image from your files. Supported: JPG, PNG, GIF, WEBP.');
});

resetProductSizeRows();
ensureProductTypeSelectOptions();
document.getElementById('pf-price').required = false;
updateStockFieldMode([], 0);

/* ---- ORDERS ---- */
let allOrders = [];

function loadOrders() {
  return fetch('../website/api/orders_list.php')
    .then(r => r.json())
    .then(list => {
      allOrders = Array.isArray(list) ? list : [];
      if (typeof REPORTS_CACHE !== 'undefined') REPORTS_CACHE.orders = null;
      renderOrders();
      renderDashboardStats();
      renderRecentOrders();
      document.getElementById('sb-orders-count').textContent = allOrders.length;
    })
    .catch(() => {
      // Gracefully show placeholder when PHP not available
      document.getElementById('orders-body').innerHTML =
        '<tr><td colspan="9" style="text-align:center;color:#aaa;padding:20px;">Could not load orders from the database. Ensure PHP and MySQL are running.</td></tr>';
    });
}

function startOrdersPolling() {
  if (ORDERS_POLL_TIMER) return;
  ORDERS_POLL_TIMER = setInterval(() => {
    if (document.hidden) return;
    if (CURRENT_SECTION !== 'dashboard' && CURRENT_SECTION !== 'orders') return;
    loadOrders();
    fetchProducts('', { silent: true });
  }, 20000);
}

/* ---- USERS ---- */
function fetchUsers() {
  fetch(adminApi('get_users.php'))
    .then(r => r.text())
    .then(text => {
      try {
        const list = JSON.parse(text);
        window.ADMIN_USERS = Array.isArray(list) ? list : [];
        renderUsers(window.ADMIN_USERS);
        if (typeof renderActivityLog === 'function') renderActivityLog();
      } catch (err) {
        console.error('Failed to parse users JSON. Server response:\n', text);
        document.getElementById('users-body').innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px;">Could not load users; ensure PHP/Apache is running.</td></tr>';
      }
    })
    .catch(err => {
      console.error('Failed to fetch users:', err);
      document.getElementById('users-body').innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px;">Could not load users from server.</td></tr>';
    });
}

// Listen for cross-tab user changes so the activity log can refresh automatically
window.addEventListener('storage', function (e) {
  try {
    if (!e) return;
    if (e.key === 'bulakena_users_refetch') {
      // Re-fetch users from server when other tabs add a new user
      fetchUsers();
    }
  } catch (err) {
    console.error('Error handling storage event for users refetch:', err);
  }
});

function renderUsers(list) {
  const tbody = document.getElementById('users-body');
  if (!Array.isArray(list) || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px;">No users found.</td></tr>';
    return;
  }
  const sortedUsers = list.slice().sort((a, b) => {
    const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
    const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
    const safeA = Number.isFinite(dateA) ? dateA : 0;
    const safeB = Number.isFinite(dateB) ? dateB : 0;
    if (safeA !== safeB) return safeA - safeB;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  tbody.innerHTML = sortedUsers.map(u => {
    const reg = u.created_at || u.createdAt ? new Date(u.created_at || u.createdAt).toLocaleString() : '-';
    const full = u.full_name || u.name || u.username || '-';
    const email = u.email || u.user_email || '-';
    const totalOrders = Number(u.total_orders || 0);
    const addressParts = [
      u.street_address || u.address || u.street,
      u.street_type,
      u.barangay,
      u.municipality || u.city,
      u.province,
      u.region
    ].map(part => String(part || '').trim()).filter(Boolean);
    const address = addressParts.length ? addressParts.join(', ') : '-';
    return `<tr>` +
      `<td>${u.id || '-'}</td>` +
      `<td><strong>${escapeHtml(full)}</strong></td>` +
      `<td>${escapeHtml(email)}</td>` +
      `<td>${totalOrders}</td>` +
      `<td>${escapeHtml(address)}</td>` +
      `<td>${reg}</td>` +
    `</tr>`;
  }).join('');
}
function escapeHtml(s){
  return String(s||'').replace(/[&<>"'`]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;','`':'&#96;'})[c]; });
}

function resolveAdminAsset(path) {
  const value = String(path || '').trim().replace(/\\/g, '/');
  if (!value) return '';
  if (/^(https?:)?\/\//i.test(value) || value.charAt(0) === '/') return value;
  if (value.indexOf('../') === 0) return value;
  if (value.indexOf('uploads/') === 0 || value.indexOf('images/') === 0) return '../' + value;
  if (value.indexOf('feedback/') === 0 || value.indexOf('reviews/') === 0 || value.indexOf('products/') === 0) {
    return '../uploads/' + value;
  }
  return value;
}

function viewUser(id) {
  showToast('User: ' + id);
}

function renderDashboardStats() {
  // Orders and revenue
  const statOrdersEl = document.getElementById('stat-orders');
  if (statOrdersEl) statOrdersEl.textContent = allOrders.length;
  const rev = allOrders.reduce((s, o) => isCountedSaleOrder(o) ? s + (Number(o.total) || 0) : s, 0);
  const statRevEl = document.getElementById('stat-revenue');
  if (statRevEl) statRevEl.textContent = peso(rev);

  // Deltas for last 24 hours
  const now = Date.now();
  const orders24 = Array.isArray(allOrders) ? allOrders.filter(o => {
    const d = o.date || o.created_at || o.createdAt || null;
    if (!d) return false;
    const t = new Date(d).getTime(); if (isNaN(t)) return false;
    return (now - t) <= (24 * 60 * 60 * 1000);
  }).length : 0;
  const statOrdersDeltaEl = document.getElementById('stat-orders-delta');
  if (statOrdersDeltaEl) statOrdersDeltaEl.textContent = `${orders24} new in last 24h`;

  const rev24 = Array.isArray(allOrders) ? allOrders.reduce((s,o)=>{
    if (!isCountedSaleOrder(o)) return s;
    const d = o.date || o.created_at || o.createdAt || null; if (!d) return s;
    const t = new Date(d).getTime(); if (isNaN(t)) return s;
    return ((now - t) <= (24*60*60*1000)) ? s + (Number(o.total)||0) : s;
  },0) : 0;
  const statRevDeltaEl = document.getElementById('stat-revenue-delta');
  if (statRevDeltaEl) statRevDeltaEl.textContent = `Last 24h: ${peso(rev24)}`;

  // Products count and recent additions (last 24 hours)
  const prodCount = Array.isArray(PRODUCTS) ? PRODUCTS.length : 0;
  const prodEl = document.getElementById('stat-products');
  if (prodEl) prodEl.textContent = prodCount;
  const recentAdded = Array.isArray(PRODUCTS) ? PRODUCTS.filter(p => {
    const d = p.created_at || p.createdAt || p.date || p.createdAtTimestamp || null;
    if (!d) return false;
    const t = new Date(d).getTime(); if (isNaN(t)) return false;
    return (now - t) <= (24 * 60 * 60 * 1000);
  }).length : 0;
  const prodDelta = document.getElementById('stat-products-delta');
  if (prodDelta) prodDelta.textContent = `${recentAdded} added in last 24h`;

  // Low stock
  const lowCount = (PRODUCTS || []).filter(p => Number(p.stock) <= 5).length;
  const lowEl = document.getElementById('stat-lowstock');
  if (lowEl) lowEl.textContent = lowCount;

  renderDashboardInsights();
}

function formatCompactDate(dateValue) {
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getOrderCustomerName(order) {
  if (order && order.customer) {
    const first = String(order.customer.firstName || '').trim();
    const last = String(order.customer.lastName || '').trim();
    const full = `${first} ${last}`.trim();
    if (full) return full;
    if (order.customer.email) return String(order.customer.email).trim();
  }
  return String(order && (order.customer_name || order.customerName || order.customer_email || order.email) || 'Customer').trim() || 'Customer';
}

function getOrderCustomerEmail(order) {
  return String(order && order.customer && order.customer.email || order && (order.customer_email || order.email) || '').trim().toLowerCase();
}

function getOrderDateValue(order) {
  return order && (order.date || order.created_at || order.createdAt || null);
}

function isCountedSaleOrder(order) {
  const status = String(order && order.status || '').toLowerCase().trim();
  return status !== '' && status !== 'pending' && status !== 'cancelled';
}

function buildTopSellingProducts(limit = 5) {
  const totals = new Map();
  (Array.isArray(allOrders) ? allOrders : []).forEach((order) => {
    if (String(order.status || '').toLowerCase() === 'cancelled') return;
    (Array.isArray(order.items) ? order.items : []).forEach((item) => {
      const title = String(item.title || item.product_title || 'Unnamed plant').trim() || 'Unnamed plant';
      const qty = Number(item.qty || item.quantity || 0) || 0;
      const revenue = (Number(item.price) || 0) * qty;
      const current = totals.get(title) || { title, qty: 0, revenue: 0 };
      current.qty += qty;
      current.revenue += revenue;
      totals.set(title, current);
    });
  });
  return Array.from(totals.values()).sort((a, b) => (b.qty - a.qty) || (b.revenue - a.revenue)).slice(0, limit);
}

function buildActiveCustomers(limit = 5) {
  const totals = new Map();
  (Array.isArray(allOrders) ? allOrders : []).forEach((order) => {
    const email = getOrderCustomerEmail(order) || `guest:${getOrderCustomerName(order)}`;
    const current = totals.get(email) || { name: getOrderCustomerName(order), email: getOrderCustomerEmail(order), orders: 0, spent: 0, lastDate: null };
    current.orders += 1;
    if (String(order.status || '').toLowerCase() !== 'cancelled') {
      current.spent += Number(order.total) || 0;
    }
    const dateValue = getOrderDateValue(order);
    if (dateValue) {
      const ts = new Date(dateValue).getTime();
      const currentTs = current.lastDate ? new Date(current.lastDate).getTime() : 0;
      if (!isNaN(ts) && ts > currentTs) current.lastDate = dateValue;
    }
    totals.set(email, current);
  });
  return Array.from(totals.values()).sort((a, b) => (b.orders - a.orders) || (b.spent - a.spent)).slice(0, limit);
}

function buildLowStockSummary(limit = 5) {
  return (Array.isArray(PRODUCTS) ? PRODUCTS : [])
    .map((product) => ({
      title: String(product.title || 'Untitled Product'),
      stock: getProductSizeTotalStock(product),
      type: String(product.type || 'Uncategorized')
    }))
    .filter((product) => product.stock <= 5)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, limit);
}

function buildMonthlySalesSeries(months = 6) {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      revenue: 0,
      cancelled: 0
    });
  }
  (Array.isArray(allOrders) ? allOrders : []).forEach((order) => {
    if (!isCountedSaleOrder(order)) return;
    const dateValue = getOrderDateValue(order);
    if (!dateValue) return;
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.find((entry) => entry.key === key);
    if (!bucket) return;
    if (String(order.status || '').toLowerCase() === 'cancelled') {
      bucket.cancelled += 1;
    } else {
      bucket.revenue += Number(order.total) || 0;
    }
  });
  return buckets;
}

function buildServiceBookingSeries() {
  const totals = new Map();
  (Array.isArray(APPOINTMENTS) ? APPOINTMENTS : []).forEach((appointment) => {
    const key = String(appointment.service || 'Other').trim() || 'Other';
    const current = totals.get(key) || { service: key, total: 0, confirmed: 0 };
    current.total += 1;
    if (String(appointment.status || '').toLowerCase() === 'confirmed' || String(appointment.status || '').toLowerCase() === 'done') {
      current.confirmed += 1;
    }
    totals.set(key, current);
  });
  return Array.from(totals.values()).sort((a, b) => b.total - a.total);
}

function renderDashboardList(containerId, items, renderItem) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = '<div class="dashboard-empty-state">No data available yet.</div>';
    return;
  }
  container.innerHTML = items.map(renderItem).join('');
}

function renderDashboardInsights() {
  const topPlants = buildTopSellingProducts();
  const activeCustomers = buildActiveCustomers();
  const lowStock = buildLowStockSummary();
  const monthlySales = buildMonthlySalesSeries();
  const serviceTrends = buildServiceBookingSeries();

  const totalOrders = Array.isArray(allOrders) ? allOrders.length : 0;
  const cancelledOrders = (Array.isArray(allOrders) ? allOrders : []).filter((order) => String(order.status || '').toLowerCase() === 'cancelled').length;
  const cancelledRate = totalOrders ? ((cancelledOrders / totalOrders) * 100) : 0;
  const cancelledRateValue = document.getElementById('cancelled-rate-value');
  const cancelledRateMeta = document.getElementById('cancelled-rate-meta');
  if (cancelledRateValue) cancelledRateValue.textContent = `${cancelledRate.toFixed(cancelledRate >= 10 ? 0 : 1)}%`;
  if (cancelledRateMeta) cancelledRateMeta.textContent = `${cancelledOrders} cancelled of ${totalOrders} orders`;

  const totalBookings = Array.isArray(APPOINTMENTS) ? APPOINTMENTS.length : 0;
  const confirmedBookings = (Array.isArray(APPOINTMENTS) ? APPOINTMENTS : []).filter((appointment) => {
    const status = String(appointment.status || '').toLowerCase();
    return status === 'confirmed' || status === 'done';
  }).length;
  const bookingsValue = document.getElementById('service-bookings-value');
  const bookingsMeta = document.getElementById('service-bookings-meta');
  if (bookingsValue) bookingsValue.textContent = String(totalBookings);
  if (bookingsMeta) bookingsMeta.textContent = totalBookings ? `${confirmedBookings} confirmed or completed` : 'No bookings yet';

  const topPlantValue = document.getElementById('top-plant-value');
  const topPlantMeta = document.getElementById('top-plant-meta');
  if (topPlantValue) topPlantValue.textContent = topPlants.length ? topPlants[0].title : '-';
  if (topPlantMeta) topPlantMeta.textContent = topPlants.length ? `${topPlants[0].qty} sold - ${peso(topPlants[0].revenue)}` : 'Waiting for sales data';

  renderDashboardList('top-products-list', topPlants, (item, index) => `
    <div class="dashboard-list-item">
      <span class="dashboard-list-rank">${index + 1}</span>
      <div class="dashboard-list-body">
        <div class="dashboard-list-title">${escapeHtml(item.title)}</div>
        <div class="dashboard-list-meta">${item.qty} sold - ${peso(item.revenue)}</div>
      </div>
      <div class="dashboard-list-value">${item.qty}x</div>
    </div>`);

  renderDashboardList('low-stock-list', lowStock, (item, index) => `
    <div class="dashboard-list-item">
      <span class="dashboard-list-rank">${index + 1}</span>
      <div class="dashboard-list-body">
        <div class="dashboard-list-title">${escapeHtml(item.title)}</div>
        <div class="dashboard-list-meta">${escapeHtml(item.type)}</div>
      </div>
      <div class="dashboard-list-value">${item.stock <= 0 ? 'Out' : item.stock + ' left'}</div>
    </div>`);

  const salesCanvas = document.getElementById('salesTrendChart');
  if (salesCanvas && window.Chart) {
    if (salesTrendChartInstance) salesTrendChartInstance.destroy();
    salesTrendChartInstance = new Chart(salesCanvas, {
      type: 'line',
      data: {
        labels: monthlySales.map((entry) => entry.label),
        datasets: [
          {
            label: 'Revenue',
            data: monthlySales.map((entry) => entry.revenue),
            borderColor: '#08745B',
            backgroundColor: 'rgba(8,116,91,0.14)',
            tension: 0.35,
            fill: true,
            yAxisID: 'yRevenue'
          },
          {
            label: 'Cancelled Orders',
            data: monthlySales.map((entry) => entry.cancelled),
            borderColor: '#d9534f',
            backgroundColor: 'rgba(217,83,79,0.12)',
            tension: 0.3,
            fill: false,
            yAxisID: 'yCount'
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, color: '#4f645b' } }
        },
        scales: {
          yRevenue: {
            position: 'left',
            grid: { color: 'rgba(93,203,165,0.14)' },
            ticks: { color: '#6d8178', callback: (value) => peso(value) }
          },
          yCount: {
            position: 'right',
            grid: { display: false },
            ticks: { color: '#c45b56', precision: 0 }
          },
          x: { ticks: { color: '#6d8178' }, grid: { display: false } }
        }
      }
    });
  }
}

function buildRevenueLineChartConfig(labels, values, options) {
  const opts = options || {};
  const revenueLabel = opts.revenueLabel || 'Revenue';
  const revenueData = Array.isArray(values) ? values : [];
  const extraDatasets = Array.isArray(opts.extraDatasets) ? opts.extraDatasets : [];
  const legendDisplay = typeof opts.legendDisplay === 'boolean' ? opts.legendDisplay : false;
  const tooltipCallback = typeof opts.tooltipCallback === 'function'
    ? opts.tooltipCallback
    : (ctx) => `${ctx.dataset.label || revenueLabel}: ${peso(ctx.parsed.y || 0)}`;
  const yTickCallback = typeof opts.yTickCallback === 'function'
    ? opts.yTickCallback
    : (v) => peso(v);
  return {
    type: 'line',
    data: {
      labels: Array.isArray(labels) ? labels : [],
      datasets: [
        {
          label: revenueLabel,
          data: revenueData.map((v) => Number(v) || 0),
          borderColor: '#08745B',
          backgroundColor: 'rgba(93,203,165,0.22)',
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2
        }
      ].concat(extraDatasets)
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: legendDisplay },
        tooltip: { callbacks: { label: tooltipCallback } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7, color: '#6e7b74', font: { weight: '700' } } },
        y: { beginAtZero: true, grid: { color: 'rgba(93,203,165,0.18)' }, ticks: { color: '#6e7b74', callback: yTickCallback } }
      }
    }
  };
}

function renderActivityLog() {
  const ul = document.querySelector('.activity-list');
  if (!ul) return;
  const items = [];

  // Helper to convert date-like values to a timestamp and formatted delta
  function makeWhen(ts) {
    if (!ts) return { ts: Date.now(), label: 'recent' };
    var t = new Date(ts).getTime();
    if (isNaN(t)) return { ts: Date.now(), label: 'recent' };
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return { ts: t, label: s + 's ago' };
    var m = Math.floor(s / 60);
    if (m < 60) return { ts: t, label: m + 'm ago' };
    var h = Math.floor(m / 60);
    if (h < 24) return { ts: t, label: h + 'h ago' };
    return { ts: t, label: Math.floor(h / 24) + 'd ago' };
  }

  // Only keep activity from the last 24 hours
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);

  // Orders: include creation and recent status changes (e.g., confirmed)
  (Array.isArray(allOrders) ? allOrders : []).forEach(function (o) {
    var id = o.orderId || o.order_ref || o.id || '-';
    // Prefer status update timestamp when present
    var statusTs = o.status_updated_at || o.statusUpdatedAt || null;
    if (statusTs) {
      var when = makeWhen(statusTs);
      if (when.ts >= cutoff) {
        var s = String(o.status || '').toLowerCase();
        var title = 'Order updated (' + id + ')';
        if (s === 'confirmed') title = 'Order confirmed (' + id + ')';
        else if (s === 'shipped') title = 'Order shipped (' + id + ')';
        else if (s === 'delivered' || s === 'pickedup') title = 'Order completed (' + id + ')';
        else if (s === 'cancelled') title = 'Order cancelled (' + id + ')';
        items.push({ ts: when.ts, dot: 'green', title: title, timeLabel: when.label });
      }
    }

    // Also include new orders placed within cutoff
    var createdVal = o.date || o.created_at || o.createdAt || null;
    if (createdVal) {
      var whenC = makeWhen(createdVal);
      if (whenC.ts >= cutoff) {
        items.push({ ts: whenC.ts, dot: 'green', title: 'New order received (' + id + ')', timeLabel: whenC.label });
      }
    }
  });

  // Low stock alerts (current check); show as 'now' so they expire after 24h automatically
  (Array.isArray(PRODUCTS) ? PRODUCTS : []).forEach(function (p) {
    if (Number(p.stock) > 0 && Number(p.stock) <= 5) {
      items.push({ ts: Date.now(), dot: 'yellow', title: 'Low stock alert - ' + p.title + ' (' + Number(p.stock) + ' left)', timeLabel: 'now' });
    }
    if (Number(p.stock) <= 0) {
      items.push({ ts: Date.now(), dot: 'red', title: 'Out of stock - ' + p.title, timeLabel: 'now' });
    }
  });

  // Recent user registrations within cutoff
  (Array.isArray(window.ADMIN_USERS) ? window.ADMIN_USERS : []).forEach(function (u) {
    var timeVal = u.created_at || u.createdAt || null;
    var when = makeWhen(timeVal);
    if (when.ts >= cutoff) {
      items.push({ ts: when.ts, dot: 'green', title: 'User registered ? ' + (u.email || u.user_email || u.name || '-'), timeLabel: when.label });
    }
  });

  // Sort by timestamp descending (newest first)
  items.sort(function (a, b) { return b.ts - a.ts; });

  if (items.length === 0) {
    ul.innerHTML = '<li class="activity-item"><div class="activity-dot"></div><div><div>No recent activity.</div><div class="activity-time">-</div></div></li>';
    return;
  }

  // Render all items (container is scrollable); newest items appear at top
  ul.innerHTML = items.map(function (it) {
    return '<li class="activity-item">' +
      '<div class="activity-dot ' + (it.dot || '') + '"></div>' +
      '<div><div>' + it.title + '</div><div class="activity-time">' + (it.timeLabel || '') + '</div></div>' +
      '</li>';
  }).join('');
}

function renderRecentOrders() {
  const tbody = document.getElementById('recent-orders-body');
  const recent = allOrders.slice(0, 5);
  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:16px;">No orders found.</td></tr>';
    return;
  }
  tbody.innerHTML = recent.map(o => {
    const status = (o.status || 'pending').toLowerCase();
    return `<tr>
      <td><code style="font-size:.78rem;color:var(--green-1)">${o.orderId || '-'}</code></td>
      <td>${(o.customer && o.customer.firstName) ? o.customer.firstName + ' ' + o.customer.lastName : '-'}</td>
      <td>${peso(o.total || 0)}</td>
      <td><span class="badge-status ${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
      <td style="font-size:.78rem;color:#888">${o.date ? new Date(o.date).toLocaleDateString() : '-'}</td>
    </tr>`;
  }).join('');
}

// Revenue chart (uses allOrders which is populated by loadOrders)
let revenueChartInstance = null;
function renderRevenueChart() {
  const rangeEl = document.getElementById('revenue-range');
  const groupEl = document.getElementById('revenue-group');
  const days = rangeEl ? parseInt(rangeEl.value, 10) : 30;
  const group = groupEl ? groupEl.value : 'day';

  // If orders are not loaded yet, attempt to load then render
  if (!Array.isArray(allOrders) || allOrders.length === 0) {
    loadOrders();
    // loadOrders calls renderDashboardStats which triggers renderRecentOrders; wait a bit then render chart
    setTimeout(() => renderRevenueChart(), 600);
    return;
  }

  // Build labels and aggregated totals
  const now = new Date();
  let labels = [];
  let totals = [];

  if (group === 'month') {
    // Build last N months labels (based on days as months approximation)
    const months = Math.max(1, Math.round(days / 30));
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      labels.push(d.toLocaleString(undefined, { month: 'short', year: 'numeric' }));
      totals.push(0);
    }
    // Aggregate by month key
    allOrders.forEach(o => {
      if (!isCountedSaleOrder(o)) return;
      const dstr = o.date || o.created_at || o.createdAt || null;
      if (!dstr) return;
      const t = new Date(dstr);
      if (isNaN(t.getTime())) return;
      const key = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0');
      // find index
      for (let i = 0; i < labels.length; i++) {
        const labelDate = new Date(now.getFullYear(), now.getMonth() - (labels.length - 1 - i), 1);
        const labelKey = labelDate.getFullYear() + '-' + String(labelDate.getMonth() + 1).padStart(2, '0');
        if (labelKey === key) {
          totals[i] += Number(o.total) || 0;
          break;
        }
      }
    });
  } else {
    // Daily aggregation for last `days` days
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      labels.push(d.toLocaleDateString());
      totals.push(0);
    }
    const startTs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).setHours(0,0,0,0);
    allOrders.forEach(o => {
      if (!isCountedSaleOrder(o)) return;
      const dstr = o.date || o.created_at || o.createdAt || null;
      if (!dstr) return;
      const t = new Date(dstr);
      if (isNaN(t.getTime())) return;
      if (t.getTime() < startTs) return;
      // compute index by days difference
      const idx = Math.floor((t.setHours(0,0,0,0) - startTs) / (24 * 60 * 60 * 1000));
      if (idx >= 0 && idx < totals.length) totals[idx] += Number(o.total) || 0;
    });
  }

  // Create or update Chart.js instance
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;
  const cfg = buildRevenueLineChartConfig(labels, totals, {
    revenueLabel: 'Revenue',
    legendDisplay: false,
    yTickCallback: (v) => 'PHP ' + Number(v).toLocaleString()
  });

  try {
    if (revenueChartInstance) {
      revenueChartInstance.data = cfg.data;
      revenueChartInstance.options = cfg.options;
      revenueChartInstance.update();
    } else {
      revenueChartInstance = new Chart(ctx.getContext('2d'), cfg);
    }
  } catch (err) {
    console.error('Failed to render revenue chart:', err);
    showToast('Could not render revenue chart. Ensure Chart.js is loaded.');
  }
}

function generateReport() {
  const range = document.getElementById('report-range');
  const days = range ? parseInt(range.value, 10) : 30;
  // reuse revenue chart to show report
  const rangeEl = document.getElementById('revenue-range');
  if (rangeEl) rangeEl.value = String(days);
  renderRevenueChart();
}

function downloadReport() {
  // Build CSV from aggregated chart data
  if (!revenueChartInstance) { showToast('Generate report first'); return; }
  const labels = revenueChartInstance.data.labels || [];
  const data = (revenueChartInstance.data.datasets && revenueChartInstance.data.datasets[0].data) || [];
  let csv = 'Date,Total\n';
  for (let i = 0; i < labels.length; i++) csv += `"${labels[i]}","${data[i] || 0}"\n`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'sales-report.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ---- REPORTS MODULE ---- */
let REPORTS_INITIALIZED = false;
const REPORTS_CACHE = {
  orders: null,
  products: null,
  appointments: null,
  users: null,
  reviews: null
};

let REPORTS_VIEW = {
  type: 'sales',
  from: '',
  to: '',
  filter1: '',
  filter2: '',
  search: '',
  sortKey: '',
  sortDir: 'desc', // asc | desc
  columns: [],
  rows: [],
  title: 'Sales Report',
  fileBase: 'report'
};

function formatISODate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseAnyDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  // supports "YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss", and ISO strings
  const t = Date.parse(s.replace(' ', 'T'));
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

function reportsFormatSimpleDateTime(val) {
  const d = parseAnyDate(val);
  if (!d) return val ? String(val) : '';
  const month = d.toLocaleString('en-US', { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();
  let hour = d.getHours();
  const minute = String(d.getMinutes()).padStart(2, '0');
  const meridiem = hour >= 12 ? 'pm' : 'am';
  hour = hour % 12 || 12;
  return `${month} ${day}, ${year}, ${String(hour).padStart(2, '0')}:${minute} ${meridiem}`;
}

function inDateRange(dateVal, fromVal, toVal) {
  const d = parseAnyDate(dateVal);
  if (!d) return false;
  const from = fromVal ? parseAnyDate(fromVal) : null;
  const to = toVal ? parseAnyDate(toVal) : null;
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function reportsFetchJson(url) {
  return fetch(url)
    .then(r => r.text())
    .then(txt => {
      try { return JSON.parse(txt); } catch (e) { throw new Error('Invalid JSON response'); }
    });
}

function reportsNormalizeOrderList(payload) {
  if (payload && payload.success === true && Array.isArray(payload.orders)) return payload.orders;
  if (Array.isArray(payload)) return payload;
  return [];
}

function reportsEnsureOrders() {
  if (REPORTS_CACHE.orders) return Promise.resolve(REPORTS_CACHE.orders);
  if (Array.isArray(allOrders) && allOrders.length) {
    REPORTS_CACHE.orders = allOrders;
    return Promise.resolve(REPORTS_CACHE.orders);
  }
  return reportsFetchJson('../website/api/orders_list.php')
    .then(j => {
      REPORTS_CACHE.orders = reportsNormalizeOrderList(j);
      return REPORTS_CACHE.orders;
    })
    .catch(err => {
      console.error('Reports: failed to load orders', err);
      REPORTS_CACHE.orders = [];
      return REPORTS_CACHE.orders;
    });
}

function reportsEnsureProducts() {
  if (REPORTS_CACHE.products) return Promise.resolve(REPORTS_CACHE.products);
  return reportsFetchJson('../website/api/get_products.php')
    .then(j => {
      REPORTS_CACHE.products = Array.isArray(j) ? j : [];
      return REPORTS_CACHE.products;
    })
    .catch(err => {
      console.error('Reports: failed to load products', err);
      REPORTS_CACHE.products = [];
      return REPORTS_CACHE.products;
    });
}

function reportsEnsureAppointments() {
  if (REPORTS_CACHE.appointments) return Promise.resolve(REPORTS_CACHE.appointments);
  return reportsFetchJson('../website/api/get_appointments.php?admin=1')
    .then(j => {
      REPORTS_CACHE.appointments = Array.isArray(j) ? j : [];
      return REPORTS_CACHE.appointments;
    })
    .catch(err => {
      console.error('Reports: failed to load appointments', err);
      REPORTS_CACHE.appointments = [];
      return REPORTS_CACHE.appointments;
    });
}

function reportsEnsureUsers() {
  if (REPORTS_CACHE.users) return Promise.resolve(REPORTS_CACHE.users);
  if (Array.isArray(window.ADMIN_USERS) && window.ADMIN_USERS.length) {
    REPORTS_CACHE.users = window.ADMIN_USERS;
    return Promise.resolve(REPORTS_CACHE.users);
  }
  return reportsFetchJson(adminApi('get_users.php'))
    .then(j => {
      REPORTS_CACHE.users = Array.isArray(j) ? j : [];
      return REPORTS_CACHE.users;
    })
    .catch(err => {
      console.error('Reports: failed to load users', err);
      REPORTS_CACHE.users = [];
      return REPORTS_CACHE.users;
    });
}

function reportsEnsureReviews() {
  if (REPORTS_CACHE.reviews) return Promise.resolve(REPORTS_CACHE.reviews);
  return reportsFetchJson('../website/api/get_reviews.php?limit=1000')
    .then(j => {
      REPORTS_CACHE.reviews = Array.isArray(j) ? j : [];
      return REPORTS_CACHE.reviews;
    })
    .catch(err => {
      console.error('Reports: failed to load reviews', err);
      REPORTS_CACHE.reviews = [];
      return REPORTS_CACHE.reviews;
    });
}

function reportsGetEl(id) { return document.getElementById(id); }

function reportsSetSelectOptions(selectEl, options, placeholder) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = placeholder || 'All';
  selectEl.appendChild(opt0);
  (options || []).forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    selectEl.appendChild(opt);
  });
}

function reportsSetupFilters(type) {
  const f1 = reportsGetEl('reports-filter1');
  const f2 = reportsGetEl('reports-filter2');
  const l1 = reportsGetEl('reports-filter1-label');
  const l2 = reportsGetEl('reports-filter2-label');

  if (type === 'sales') {
    if (l1) l1.textContent = 'Status';
    if (l2) l2.textContent = 'Period';
    reportsSetSelectOptions(f1, [
      { value: 'pending', label: 'Pending' },
      { value: 'confirmed', label: 'Confirmed' },
      { value: 'shipped', label: 'Shipped' },
      { value: 'delivered', label: 'Delivered' },
      { value: 'pickedup', label: 'Picked up' },
      { value: 'cancelled', label: 'Cancelled' }
    ], 'All Statuses');
    reportsSetSelectOptions(f2, [
      { value: 'day', label: 'Daily' },
      { value: 'week', label: 'Weekly' },
      { value: 'month', label: 'Monthly' },
      { value: 'year', label: 'Yearly' }
    ], 'Per Order (Detailed)');
  } else if (type === 'inventory') {
    if (l1) l1.textContent = 'Category';
    if (l2) l2.textContent = 'Stock';
    reportsSetSelectOptions(f1, [
      { value: 'Indoor', label: 'Indoor' },
      { value: 'Outdoor', label: 'Outdoor' },
      { value: 'Hanging Plants', label: 'Hanging Plants' },
      { value: 'Table Plants', label: 'Table Plants' },
      { value: 'Planter', label: 'Planter' },
      { value: 'Furniture', label: 'Furniture' }
    ], 'All Categories');
    reportsSetSelectOptions(f2, [
      { value: 'low', label: 'Low Stock (= 5)' },
      { value: 'out', label: 'Out of Stock (0)' }
    ], 'All Stock');
  } else if (type === 'appointments') {
    if (l1) l1.textContent = 'Status';
    if (l2) l2.textContent = 'Service';
    reportsSetSelectOptions(f1, [
      { value: 'pending', label: 'Pending' },
      { value: 'confirmed', label: 'Confirmed' },
      { value: 'done', label: 'Done' },
      { value: 'cancelled', label: 'Cancelled' }
    ], 'All Statuses');
    reportsSetSelectOptions(f2, [
      { value: 'gardening', label: 'Gardening' },
      { value: 'landscaping', label: 'Landscaping' },
      { value: 'grotto', label: 'Grotto' },
      { value: 'waterfalls', label: 'Waterfalls' },
      { value: 'swimming-pool', label: 'Swimming Pool' }
    ], 'All Services');
  } else if (type === 'customers') {
    if (l1) l1.textContent = 'User Status';
    if (l2) l2.textContent = 'Activity';
    reportsSetSelectOptions(f1, [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' }
    ], 'All Status');
    reportsSetSelectOptions(f2, [
      { value: 'new', label: 'New (0 orders)' },
      { value: 'repeat', label: 'Repeat (= 2 orders)' }
    ], 'All Activity');
  } else if (type === 'payments') {
    if (l1) l1.textContent = 'Method';
    if (l2) l2.textContent = 'Status';
    reportsSetSelectOptions(f1, [
      { value: 'GCash', label: 'GCash' }
    ], 'All Methods');
    reportsSetSelectOptions(f2, [
      { value: 'pending', label: 'Pending' },
      { value: 'confirmed', label: 'Confirmed' },
      { value: 'shipped', label: 'Shipped' },
      { value: 'delivered', label: 'Delivered' },
      { value: 'pickedup', label: 'Picked up' },
      { value: 'cancelled', label: 'Cancelled' }
    ], 'All Statuses');
  }
}

function reportsApplySearch(rows, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return rows;
  return rows.filter(r => JSON.stringify(r).toLowerCase().includes(s));
}

function reportsSort(rows, key, dir) {
  if (!key) return rows;
  const sign = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    const na = Number(va);
    const nb = Number(vb);
    if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * sign;
    const ta = (va === null || va === undefined) ? '' : String(va).toLowerCase();
    const tb = (vb === null || vb === undefined) ? '' : String(vb).toLowerCase();
    if (ta < tb) return -1 * sign;
    if (ta > tb) return 1 * sign;
    return 0;
  });
}

function reportsRenderSummary(kpis) {
  const el = reportsGetEl('reports-summary');
  if (!el) return;
  el.innerHTML = '';
  (kpis || []).slice(0, 4).forEach(k => {
    const div = document.createElement('div');
    div.className = 'report-kpi';
    div.innerHTML = `<div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub">${k.sub || ''}</div>`;
    el.appendChild(div);
  });
}

// --- Reports insights (Sales only) ---
const REPORTS_INSIGHT_CHARTS = { revenue: null, category: null };

function reportsDestroyInsightCharts() {
  try { if (REPORTS_INSIGHT_CHARTS.revenue) { REPORTS_INSIGHT_CHARTS.revenue.destroy(); REPORTS_INSIGHT_CHARTS.revenue = null; } } catch (e) {}
  try { if (REPORTS_INSIGHT_CHARTS.category) { REPORTS_INSIGHT_CHARTS.category.destroy(); REPORTS_INSIGHT_CHARTS.category = null; } } catch (e) {}
}

function reportsSetInsightsVisible(visible) {
  const wrap = reportsGetEl('reports-insights');
  if (!wrap) return;
  wrap.style.display = visible ? '' : 'none';
  if (!visible) {
    const chips = reportsGetEl('reports-revenue-chips');
    const trends = reportsGetEl('reports-trends');
    const legend = reportsGetEl('reports-category-legend');
    if (chips) chips.innerHTML = '';
    if (trends) trends.innerHTML = '';
    if (legend) legend.innerHTML = '';
  }
}

function reportsRenderChipRow(chips) {
  const el = reportsGetEl('reports-revenue-chips');
  if (!el) return;
  el.innerHTML = '';
  (chips || []).forEach(c => {
    const div = document.createElement('div');
    div.className = 'reports-chip';
    div.innerHTML = `<span class="k">${escapeHtml(c.k || '')}</span><span class="v">${escapeHtml(c.v || '')}</span>`;
    el.appendChild(div);
  });
}

function reportsBuildDailySeriesByRange(rows, fromValue, toValue) {
  const valuesByDay = Object.create(null);
  (rows || []).forEach(o => {
    const d = parseAnyDate(o.date || o.created_at || '');
    if (!d) return;
    const key = formatISODate(d);
    valuesByDay[key] = (valuesByDay[key] || 0) + (Number(o.total || 0) || 0);
  });

  const fallbackDates = Object.keys(valuesByDay).sort();
  const fromDate = fromValue ? parseAnyDate(fromValue) : (fallbackDates.length ? parseAnyDate(fallbackDates[0]) : null);
  const toDate = toValue ? parseAnyDate(toValue) : (fallbackDates.length ? parseAnyDate(fallbackDates[fallbackDates.length - 1]) : null);

  if (!fromDate || !toDate) {
    return {
      labels: fallbackDates,
      values: fallbackDates.map((key) => Number(valuesByDay[key] || 0))
    };
  }

  fromDate.setHours(0, 0, 0, 0);
  toDate.setHours(0, 0, 0, 0);

  const labels = [];
  const values = [];
  const cursor = new Date(fromDate.getTime());
  while (cursor.getTime() <= toDate.getTime()) {
    const key = formatISODate(cursor);
    labels.push(key);
    values.push(Number(valuesByDay[key] || 0));
    cursor.setDate(cursor.getDate() + 1);
  }

  return { labels, values };
}

function reportsPalette(n) {
  const base = [
    '#08745B', '#2f8a6f', '#5dcba5', '#a6d4c9',
    '#1a3d2b', '#3aa07f', '#0f2922', '#95d5b2'
  ];
  const out = [];
  for (let i = 0; i < Math.max(1, n); i++) out.push(base[i % base.length]);
  return out;
}

function reportsRenderSalesInsights(perOrderRows) {
  const Chart = window.Chart;
  const wrap = reportsGetEl('reports-insights');
  if (!wrap) return Promise.resolve();

  // Only show insights for Sales report
  if (REPORTS_VIEW.type !== 'sales') {
    reportsSetInsightsVisible(false);
    reportsDestroyInsightCharts();
    return Promise.resolve();
  }

  reportsSetInsightsVisible(true);

  const orderIdSet = new Set((perOrderRows || []).map(r => String(r.orderId || '').trim()).filter(Boolean));
  const rawOrders = Array.isArray(REPORTS_CACHE.orders) ? REPORTS_CACHE.orders : [];
  const filteredOrders = rawOrders.filter(o => orderIdSet.has(String(o.orderId || o.order_ref || '').trim()));

  // KPI chips
  const notCancelled = filteredOrders.filter(o => String(o.status || '').toLowerCase() !== 'cancelled');
  const cancelled = filteredOrders.filter(o => String(o.status || '').toLowerCase() === 'cancelled');
  const netRevenue = notCancelled.reduce((s, o) => s + (Number(o.total || 0) || 0), 0);
  const cancelledCount = cancelled.length;
  const aov = notCancelled.length ? (netRevenue / notCancelled.length) : 0;
  reportsRenderChipRow([
    { k: 'Net', v: peso(netRevenue) },
    { k: 'Orders', v: String(filteredOrders.length) },
    { k: 'Avg', v: peso(aov) },
    { k: 'Cancelled', v: String(cancelledCount) }
  ]);

  // Revenue series (daily)
  const dailySeries = reportsBuildDailySeriesByRange(
    notCancelled,
    REPORTS_VIEW.from,
    REPORTS_VIEW.to
  );
  const days = dailySeries.labels;
  const rev = dailySeries.values;

  // Render revenue chart
  try {
    const canvas = reportsGetEl('reports-revenue-chart');
    if (canvas && Chart) {
      if (REPORTS_INSIGHT_CHARTS.revenue) { REPORTS_INSIGHT_CHARTS.revenue.destroy(); REPORTS_INSIGHT_CHARTS.revenue = null; }
      const ctx = canvas.getContext('2d');
      const revenueCfg = buildRevenueLineChartConfig(days.length ? days : ['No data'], days.length ? rev : [0], {
        revenueLabel: 'Revenue',
        legendDisplay: false,
        tooltipCallback: (ctx) => ` ${peso(ctx.parsed.y || 0)}`,
        yTickCallback: (v) => peso(v)
      });
      REPORTS_INSIGHT_CHARTS.revenue = new Chart(ctx, revenueCfg);
    }
  } catch (e) {
    console.error('Reports insights: revenue chart failed', e);
  }

  // Category pie + trends need product metadata
  return reportsEnsureProducts().then(products => {
    const productById = Object.create(null);
    const productByTitle = Object.create(null);
    const normalizeTitleKey = (value) => String(value || '').trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ');
    (products || []).forEach(p => {
      if (!p) return;
      if (p.id != null) productById[String(p.id)] = p;
      const titleKey = normalizeTitleKey(p.title || p.baseTitle || '');
      if (titleKey && !productByTitle[titleKey]) productByTitle[titleKey] = p;
    });

    // Aggregate by category (revenue)
    const catRevenue = Object.create(null);
    notCancelled.forEach(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      items.forEach(it => {
        const pid = (it && (it.id ?? it.product_id ?? it.productId ?? (it.product && it.product.id))) ?? null;
        const qty = Number(it && (it.qty ?? it.quantity ?? it.count ?? 1)) || 0;
        const price = Number(it && (it.price ?? it.unit_price ?? 0)) || 0;
        const titleKey = normalizeTitleKey(it && (it.baseTitle || it.title || it.name || ''));
        const prod = pid != null ? productById[String(pid)] : (titleKey ? productByTitle[titleKey] : null);
        const snapshotCat = it && (it.type || it.category || it.product_type || it.productCategory);
        const liveCat = prod && (prod.type || prod.category);
        const cat = String(snapshotCat || liveCat || 'Uncategorized');
        catRevenue[cat] = (catRevenue[cat] || 0) + (qty * price);
      });
    });

    let cats = Object.keys(catRevenue).map(k => ({ k, v: Number(catRevenue[k] || 0) }));
    cats.sort((a, b) => b.v - a.v);

    const catLabels = cats.map(x => x.k);
    const catValues = cats.map(x => x.v);
    const colors = reportsPalette(catLabels.length);

    // Render pie chart
    try {
      const canvas = reportsGetEl('reports-category-pie');
      if (canvas && Chart) {
        if (REPORTS_INSIGHT_CHARTS.category) { REPORTS_INSIGHT_CHARTS.category.destroy(); REPORTS_INSIGHT_CHARTS.category = null; }
        const ctx = canvas.getContext('2d');
        REPORTS_INSIGHT_CHARTS.category = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: catLabels.length ? catLabels : ['No data'],
            datasets: [{
              data: catLabels.length ? catValues : [1],
              backgroundColor: catLabels.length ? colors : ['rgba(93,203,165,0.25)'],
              borderColor: 'rgba(255,255,255,0.9)',
              borderWidth: 2,
              hoverOffset: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.label}: ${peso(ctx.parsed || 0)}`
                }
              }
            }
          }
        });
      }
    } catch (e) {
      console.error('Reports insights: category chart failed', e);
    }

    // Legend
    try {
      const legend = reportsGetEl('reports-category-legend');
      if (legend) {
        legend.innerHTML = '';
        catLabels.forEach((lab, idx) => {
          const item = document.createElement('div');
          item.className = 'reports-legend-item';
          const sw = document.createElement('span');
          sw.className = 'reports-legend-swatch';
          sw.style.background = colors[idx] || '#08745B';
          const tx = document.createElement('span');
          tx.className = 'reports-legend-text';
          tx.textContent = `${lab} - ${peso(catValues[idx] || 0)}`;
          item.appendChild(sw);
          item.appendChild(tx);
          legend.appendChild(item);
        });
      }
    } catch (e) {}

    // Popular trends (top products by quantity)
    const prodAgg = Object.create(null);
    notCancelled.forEach(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      items.forEach(it => {
        const pid = (it && (it.id ?? it.product_id ?? it.productId ?? (it.product && it.product.id))) ?? null;
        const qty = Number(it && (it.qty ?? it.quantity ?? it.count ?? 1)) || 0;
        const price = Number(it && (it.price ?? it.unit_price ?? 0)) || 0;
        const title = (it && (it.title || it.name)) || (pid != null && productById[String(pid)] && productById[String(pid)].title) || 'Unknown plant';
        const key = String(pid != null ? pid : title);
        if (!prodAgg[key]) prodAgg[key] = { title, qty: 0, rev: 0 };
        prodAgg[key].qty += qty;
        prodAgg[key].rev += qty * price;
      });
    });

    const top = Object.values(prodAgg).sort((a, b) => (b.qty - a.qty) || (b.rev - a.rev)).slice(0, 6);
    const maxQty = top.reduce((m, x) => Math.max(m, x.qty), 0) || 1;

    const trendsEl = reportsGetEl('reports-trends');
    if (trendsEl) {
      if (!top.length) {
        trendsEl.innerHTML = `<div style="color:#6e7b74;font-weight:800;padding:6px 2px;">No plant sales in the current filters.</div>`;
      } else {
        trendsEl.innerHTML = '';
        top.forEach(t => {
          const div = document.createElement('div');
          div.className = 'trend-item';
          const pct = Math.max(2, Math.round((t.qty / maxQty) * 100));
          div.innerHTML = `
            <div class="trend-top">
              <div class="trend-name">${escapeHtml(t.title)}</div>
              <div class="trend-meta">${escapeHtml(String(t.qty))} sold - ${escapeHtml(peso(t.rev))}</div>
            </div>
            <div class="trend-bar"><span style="width:${pct}%;"></span></div>
          `;
          trendsEl.appendChild(div);
        });
      }
    }

    return true;
  }).catch(err => {
    console.error('Reports insights: products load failed', err);
    return false;
  });
}

function reportsRenderTable(columns, rows) {
  const thead = reportsGetEl('reports-thead');
  const tbody = reportsGetEl('reports-tbody');
  if (!thead || !tbody) return;

  thead.innerHTML = '';
  const tr = document.createElement('tr');
  columns.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c.label;
    const sort = document.createElement('span');
    sort.className = 'sort';
    if (REPORTS_VIEW.sortKey === c.key) sort.textContent = REPORTS_VIEW.sortDir === 'asc' ? 'ASC' : 'DESC';
    th.appendChild(sort);
    th.addEventListener('click', () => {
      if (REPORTS_VIEW.sortKey === c.key) REPORTS_VIEW.sortDir = REPORTS_VIEW.sortDir === 'asc' ? 'desc' : 'asc';
      else { REPORTS_VIEW.sortKey = c.key; REPORTS_VIEW.sortDir = 'asc'; }
      reportsRefreshView(false);
    });
    tr.appendChild(th);
  });
  thead.appendChild(tr);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center;color:#888;padding:18px;">No results found.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  rows.forEach(r => {
    const rowEl = document.createElement('tr');
    columns.forEach(c => {
      const td = document.createElement('td');
      const v = r[c.key];
      td.textContent = (c.format ? c.format(v, r) : (v === null || v === undefined ? '' : String(v)));
      rowEl.appendChild(td);
    });
    tbody.appendChild(rowEl);
  });
}

function reportsBuildSales(orders) {
  const rows = (orders || []).filter(isCountedSaleOrder).map(o => {
    const cust = o.customer || {};
    const name = `${cust.firstName || ''} ${cust.lastName || ''}`.trim();
    return {
      date: o.date || '',
      orderId: o.orderId || '',
      customer: name || '-',
      email: cust.email || '',
      items: Array.isArray(o.items) ? o.items.length : 0,
      delivery: o.deliveryType || '',
      status: (o.status || 'pending'),
      total: Number(o.total || 0)
    };
  });

  return {
    title: 'Sales Report',
    fileBase: 'sales-report',
    dateKey: 'date',
    columns: [
      { key: 'date', label: 'Date', format: (v) => reportsFormatSimpleDateTime(v) },
      { key: 'orderId', label: 'Order ID' },
      { key: 'customer', label: 'Customer' },
      { key: 'email', label: 'Email' },
      { key: 'items', label: 'Items' },
      { key: 'delivery', label: 'Delivery' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Total', format: (v) => peso(v || 0) }
    ],
    rows
  };
}

function reportsBuildInventory(products) {
  const rows = (products || []).map(p => ({
    id: p.id,
    title: p.title || '',
    type: p.type || '',
    stock: Number(p.stock || 0),
    price: Number(p.price || 0),
    rating: p.rating || '',
    value: Number(p.stock || 0) * Number(p.price || 0)
  }));

  return {
    title: 'Product Inventory Report',
    fileBase: 'inventory-report',
    dateKey: '',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'title', label: 'Product' },
      { key: 'type', label: 'Category' },
      { key: 'stock', label: 'Stock' },
      { key: 'price', label: 'Price', format: (v) => peso(v || 0) },
      { key: 'value', label: 'Inventory Value', format: (v) => peso(v || 0) },
      { key: 'rating', label: 'Rating' }
    ],
    rows
  };
}

function reportsBuildAppointments(appts) {
  const rows = (appts || []).map(a => ({
    id: a.id,
    scheduled: a.dt || '',
    name: a.name || '',
    email: a.email || '',
    service: a.service || '',
    status: a.status || '',
    created: a.created_at || ''
  }));

  return {
    title: 'Appointment Report',
    fileBase: 'appointment-report',
    dateKey: 'scheduled',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'scheduled', label: 'Scheduled' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'service', label: 'Service' },
      { key: 'status', label: 'Status' },
      { key: 'created', label: 'Created' }
    ],
    rows
  };
}

function reportsBuildPayments(orders) {
  const rows = (orders || []).map(o => {
    const cust = o.customer || {};
    const name = `${cust.firstName || ''} ${cust.lastName || ''}`.trim();
    return {
      date: o.date || '',
      transaction: o.orderId || '',
      customer: name || '-',
      email: cust.email || '',
      method: o.paymentMethod || 'GCash',
      status: (o.status || 'pending'),
      total: Number(o.total || 0)
    };
  });

  return {
    title: 'Payment & Transaction Report',
    fileBase: 'payment-report',
    dateKey: 'date',
    columns: [
      { key: 'date', label: 'Date', format: (v) => reportsFormatSimpleDateTime(v) },
      { key: 'transaction', label: 'Transaction' },
      { key: 'customer', label: 'Customer' },
      { key: 'email', label: 'Email' },
      { key: 'method', label: 'Method' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Amount', format: (v) => peso(v || 0) }
    ],
    rows
  };
}

function reportsBuildCustomers(users, orders, appts, reviews) {
  const orderByEmail = Object.create(null);
  (orders || []).forEach(o => {
    const email = String((o.customer && o.customer.email) || '').trim().toLowerCase();
    if (!email) return;
    const total = Number(o.total || 0);
    const date = o.date || '';
    if (!orderByEmail[email]) orderByEmail[email] = { count: 0, spent: 0, last: '' };
    orderByEmail[email].count += 1;
    orderByEmail[email].spent += total;
    if (date && (!orderByEmail[email].last || Date.parse(date) > Date.parse(orderByEmail[email].last))) orderByEmail[email].last = date;
  });

  const apptByEmail = Object.create(null);
  (appts || []).forEach(a => {
    const email = String(a.email || '').trim().toLowerCase();
    if (!email) return;
    apptByEmail[email] = (apptByEmail[email] || 0) + 1;
  });

  const reviewByEmail = Object.create(null);
  (reviews || []).forEach(r => {
    const email = String(r.email || '').trim().toLowerCase();
    if (!email) return;
    reviewByEmail[email] = (reviewByEmail[email] || 0) + 1;
  });

  const rows = (users || []).map(u => {
    const email = String(u.email || '').trim();
    const key = email.toLowerCase();
    const o = orderByEmail[key] || { count: 0, spent: 0, last: '' };
    return {
      id: u.id,
      name: u.full_name || u.name || '',
      email: email,
      status: u.status || '',
      orders: o.count,
      spent: o.spent,
      appointments: apptByEmail[key] || 0,
      reviews: reviewByEmail[key] || 0,
      lastOrder: o.last || ''
    };
  });

  return {
    title: 'Customer Activity Report',
    fileBase: 'customer-activity-report',
    dateKey: '',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Customer' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
      { key: 'orders', label: 'Orders' },
      { key: 'spent', label: 'Total Spent', format: (v) => peso(v || 0) },
      { key: 'appointments', label: 'Appointments' },
      { key: 'reviews', label: 'Reviews' },
      { key: 'lastOrder', label: 'Last Order', format: (v) => reportsFormatSimpleDateTime(v) }
    ],
    rows
  };
}

function reportsCompute(type) {
  if (type === 'sales') return reportsEnsureOrders().then(list => reportsBuildSales(list));
  if (type === 'inventory') return reportsEnsureProducts().then(list => reportsBuildInventory(list));
  if (type === 'appointments') return reportsEnsureAppointments().then(list => reportsBuildAppointments(list));
  if (type === 'payments') return reportsEnsureOrders().then(list => reportsBuildPayments(list));
  if (type === 'customers') {
    return Promise.all([reportsEnsureUsers(), reportsEnsureOrders(), reportsEnsureAppointments(), reportsEnsureReviews()])
      .then(([users, orders, appts, reviews]) => reportsBuildCustomers(users, orders, appts, reviews));
  }
  return Promise.resolve(reportsBuildSales([]));
}

function reportsMakeKpis(type, rows) {
  if (type === 'sales') {
    const totalOrders = rows.length;
    const totalRevenue = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const cancelled = rows.filter(r => String(r.status).toLowerCase() === 'cancelled').length;
    const aov = totalOrders ? (totalRevenue / totalOrders) : 0;
    return [
      { label: 'Total Sales', value: peso(totalRevenue), sub: 'Filtered range' },
      { label: 'Orders', value: String(totalOrders), sub: `${cancelled} cancelled` },
      { label: 'Avg Order', value: peso(aov), sub: 'Average order value' }
    ];
  }
  if (type === 'inventory') {
    const total = rows.length;
    const low = rows.filter(r => Number(r.stock) <= 5 && Number(r.stock) > 0).length;
    const out = rows.filter(r => Number(r.stock) === 0).length;
    const value = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
    return [
      { label: 'Products', value: String(total), sub: 'Total catalogue' },
      { label: 'Low Stock', value: String(low), sub: '= 5 units' },
      { label: 'Out of Stock', value: String(out), sub: '0 units' },
      { label: 'Inventory Value', value: peso(value), sub: 'Stock - price' }
    ];
  }
  if (type === 'appointments') {
    const total = rows.length;
    const done = rows.filter(r => String(r.status).toLowerCase() === 'done').length;
    const cancelled = rows.filter(r => String(r.status).toLowerCase() === 'cancelled').length;
    const scheduled = total - done - cancelled;
    return [
      { label: 'Appointments', value: String(total), sub: 'Filtered range' },
      { label: 'Scheduled', value: String(scheduled), sub: 'Upcoming / in progress' },
      { label: 'Done', value: String(done), sub: 'Done services' },
      { label: 'Cancelled', value: String(cancelled), sub: 'Cancelled bookings' }
    ];
  }
  if (type === 'customers') {
    const total = rows.length;
    const active = rows.filter(r => Number(r.orders) > 0).length;
    const spent = rows.reduce((s, r) => s + (Number(r.spent) || 0), 0);
    const avg = total ? (spent / total) : 0;
    return [
      { label: 'Customers', value: String(total), sub: 'Registered users' },
      { label: 'Active', value: String(active), sub: '= 1 order' },
      { label: 'Total Spent', value: peso(spent), sub: 'All customers' },
      { label: 'Avg Spend', value: peso(avg), sub: 'Per customer' }
    ];
  }
  if (type === 'payments') {
    const total = rows.length;
    const amount = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const pending = rows.filter(r => String(r.status).toLowerCase() === 'pending').length;
    const cancelled = rows.filter(r => String(r.status).toLowerCase() === 'cancelled').length;
    return [
      { label: 'Transactions', value: String(total), sub: 'Filtered range' },
      { label: 'Amount', value: peso(amount), sub: 'Gross amount' },
      { label: 'Pending', value: String(pending), sub: 'Awaiting processing' },
      { label: 'Cancelled', value: String(cancelled), sub: 'Cancelled orders' }
    ];
  }
  return [];
}

function reportsFilterRows(type, model) {
  let rows = model.rows || [];
  const from = REPORTS_VIEW.from;
  const to = REPORTS_VIEW.to;
  const f1 = REPORTS_VIEW.filter1;
  const f2 = REPORTS_VIEW.filter2;

  if (model.dateKey) rows = rows.filter(r => inDateRange(r[model.dateKey], from, to));

  if (type === 'sales') {
    if (f1) rows = rows.filter(r => String(r.status).toLowerCase() === String(f1).toLowerCase());
  } else if (type === 'inventory') {
    if (f1) rows = rows.filter(r => String(r.type) === String(f1));
    if (f2 === 'low') rows = rows.filter(r => Number(r.stock) <= 5 && Number(r.stock) > 0);
    if (f2 === 'out') rows = rows.filter(r => Number(r.stock) === 0);
  } else if (type === 'appointments') {
    if (f1) rows = rows.filter(r => String(r.status).toLowerCase() === String(f1).toLowerCase());
    if (f2) rows = rows.filter(r => String(r.service).toLowerCase() === String(f2).toLowerCase());
  } else if (type === 'customers') {
    if (f1) rows = rows.filter(r => String(r.status).toLowerCase() === String(f1).toLowerCase());
    if (f2 === 'new') rows = rows.filter(r => Number(r.orders) === 0);
    if (f2 === 'repeat') rows = rows.filter(r => Number(r.orders) >= 2);
  } else if (type === 'payments') {
    if (f1) rows = rows.filter(r => String(r.method).toLowerCase() === String(f1).toLowerCase());
    if (f2) rows = rows.filter(r => String(r.status).toLowerCase() === String(f2).toLowerCase());
  }

  rows = reportsApplySearch(rows, REPORTS_VIEW.search);
  rows = reportsSort(rows, REPORTS_VIEW.sortKey, REPORTS_VIEW.sortDir);
  return rows;
}

function reportsRefreshView(refetch) {
  const type = REPORTS_VIEW.type;
  const run = () => reportsCompute(type).then(model => {
    REPORTS_VIEW.title = model.title;
    REPORTS_VIEW.fileBase = model.fileBase;

    // Apply filters on the base model rows first
    const baseFiltered = reportsFilterRows(type, model);

    // Sales can optionally be grouped by a time period (daily/weekly/monthly/yearly)
    let columns = model.columns;
    let finalRows = baseFiltered;
    let kpiRows = baseFiltered;

    if (type === 'sales') {
      const period = String(REPORTS_VIEW.filter2 || '');
      if (period === 'day' || period === 'week' || period === 'month' || period === 'year') {
        const groups = Object.create(null);
        baseFiltered.forEach(r => {
          const d = parseAnyDate(r.date);
          if (!d) return;
          let key = '';
          if (period === 'day') key = formatISODate(d);
          if (period === 'month') key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (period === 'year') key = String(d.getFullYear());
          if (period === 'week') {
            // Week key (Mon-Sun) using Monday as start
            const dd = new Date(d.getTime());
            const day = (dd.getDay() + 6) % 7; // Mon=0..Sun=6
            dd.setDate(dd.getDate() - day);
            key = `${formatISODate(dd)}`;
          }
          if (!groups[key]) groups[key] = { period: key, orders: 0, revenue: 0, cancelled: 0 };
          groups[key].orders += 1;
          groups[key].revenue += Number(r.total || 0);
          if (String(r.status).toLowerCase() === 'cancelled') groups[key].cancelled += 1;
        });

        finalRows = Object.values(groups);
        REPORTS_VIEW.sortKey = REPORTS_VIEW.sortKey && REPORTS_VIEW.sortKey !== 'date' ? REPORTS_VIEW.sortKey : 'period';
        columns = [
          { key: 'period', label: period === 'week' ? 'Week Starting' : 'Period' },
          { key: 'orders', label: 'Orders' },
          { key: 'cancelled', label: 'Cancelled' },
          { key: 'revenue', label: 'Revenue', format: (v) => peso(v || 0) }
        ];
        // Apply search/sort on grouped rows (search already applied to base)
        finalRows = reportsApplySearch(finalRows, REPORTS_VIEW.search);
        finalRows = reportsSort(finalRows, REPORTS_VIEW.sortKey, REPORTS_VIEW.sortDir);
      }
    }

    REPORTS_VIEW.columns = columns;
    REPORTS_VIEW.rows = finalRows;

    reportsRenderSummary(reportsMakeKpis(type, kpiRows));
    reportsRenderTable(columns, finalRows);

    // Sales-only high-end insights (charts + trends)
    try { reportsRenderSalesInsights(kpiRows || []); } catch (e) {}
  });

  if (refetch) {
    // allow manual "refresh" behavior
    if (type === 'sales' || type === 'payments') REPORTS_CACHE.orders = null;
    if (type === 'inventory') REPORTS_CACHE.products = null;
    if (type === 'appointments') REPORTS_CACHE.appointments = null;
    if (type === 'customers') { REPORTS_CACHE.users = null; REPORTS_CACHE.orders = null; REPORTS_CACHE.appointments = null; REPORTS_CACHE.reviews = null; }
  }

  run().catch(err => {
    console.error('Reports: render failed', err);
    showToast('Could not generate report. Check server endpoints.');
  });
}

function reportsExportCSV() {
  const cols = REPORTS_VIEW.columns || [];
  const rows = REPORTS_VIEW.rows || [];
  if (!cols.length) { showToast('Generate a report first'); return; }

  const header = cols.map(c => `"${String(c.label).replace(/"/g, '""')}"`).join(',') + '\n';
  const body = rows.map(r => cols.map(c => {
    const v = c.format ? c.format(r[c.key], r) : r[c.key];
    return `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
  }).join(',')).join('\n');

  const blob = new Blob([header + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${REPORTS_VIEW.fileBase}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function reportsExportXlsx() {
  const XLSX = window.XLSX;
  if (!XLSX) { showToast('Excel export unavailable (XLSX not loaded)'); return; }
  const cols = REPORTS_VIEW.columns || [];
  const rows = REPORTS_VIEW.rows || [];
  if (!cols.length) { showToast('Generate a report first'); return; }

  const flat = rows.map(r => {
    const o = {};
    cols.forEach(c => {
      const v = c.format ? c.format(r[c.key], r) : r[c.key];
      o[c.label] = v;
    });
    return o;
  });

  const ws = XLSX.utils.json_to_sheet(flat);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${REPORTS_VIEW.fileBase}.xlsx`);
}

function reportsExportPdf() {
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF) { showToast('PDF export unavailable (jsPDF not loaded)'); return; }
  const cols = REPORTS_VIEW.columns || [];
  const rows = REPORTS_VIEW.rows || [];
  if (!cols.length) { showToast('Generate a report first'); return; }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(REPORTS_VIEW.title, 40, 40);
  doc.setFontSize(10);
  const meta = `Generated: ${new Date().toLocaleString()}   Range: ${REPORTS_VIEW.from || '-'} to ${REPORTS_VIEW.to || '-'}`;
  doc.text(meta, 40, 58);

  const head = [cols.map(c => c.label)];
  const body = rows.map(r => cols.map(c => {
    const v = c.format ? c.format(r[c.key], r) : r[c.key];
    return v === null || v === undefined ? '' : String(v);
  }));

  try {
    doc.autoTable({
      head: head,
      body: body,
      startY: 78,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [8, 116, 91] }
    });
  } catch (e) {
    console.error('PDF export failed:', e);
    showToast('PDF export failed');
    return;
  }

  doc.save(`${REPORTS_VIEW.fileBase}.pdf`);
}

function initReportsModule() {
  if (REPORTS_INITIALIZED) return;
  const typeEl = reportsGetEl('reports-type');
  if (!typeEl) return;

  REPORTS_INITIALIZED = true;

  const fromEl = reportsGetEl('reports-from');
  const toEl = reportsGetEl('reports-to');
  const f1El = reportsGetEl('reports-filter1');
  const f2El = reportsGetEl('reports-filter2');
  const qEl = reportsGetEl('reports-search');

  REPORTS_VIEW.type = typeEl.value || 'sales';
  REPORTS_VIEW.from = fromEl ? fromEl.value : '';
  REPORTS_VIEW.to = toEl ? toEl.value : '';

  reportsSetupFilters(REPORTS_VIEW.type);

  // Events
  typeEl.addEventListener('change', () => {
    REPORTS_VIEW.type = typeEl.value;
    REPORTS_VIEW.sortKey = '';
    REPORTS_VIEW.sortDir = 'desc';
    reportsSetupFilters(REPORTS_VIEW.type);
    reportsRefreshView(false);
  });

  const onFiltersChanged = () => {
    REPORTS_VIEW.from = fromEl ? fromEl.value : '';
    REPORTS_VIEW.to = toEl ? toEl.value : '';
    REPORTS_VIEW.filter1 = f1El ? f1El.value : '';
    REPORTS_VIEW.filter2 = f2El ? f2El.value : '';
    reportsRefreshView(false);
  };

  if (fromEl) fromEl.addEventListener('change', onFiltersChanged);
  if (toEl) toEl.addEventListener('change', onFiltersChanged);
  if (f1El) f1El.addEventListener('change', onFiltersChanged);
  if (f2El) f2El.addEventListener('change', onFiltersChanged);

  let qTimer = null;
  if (qEl) qEl.addEventListener('input', () => {
    REPORTS_VIEW.search = qEl.value;
    if (qTimer) clearTimeout(qTimer);
    qTimer = setTimeout(() => reportsRefreshView(false), 180);
  });

  const runBtn = reportsGetEl('reports-run');
  const pdfBtn = reportsGetEl('reports-export-pdf');
  const xlsxBtn = reportsGetEl('reports-export-xlsx');
  const csvBtn = reportsGetEl('reports-export-csv');

  if (runBtn) runBtn.addEventListener('click', () => reportsRefreshView(true));
  if (pdfBtn) pdfBtn.addEventListener('click', reportsExportPdf);
  if (xlsxBtn) xlsxBtn.addEventListener('click', reportsExportXlsx);
  if (csvBtn) csvBtn.addEventListener('click', reportsExportCSV);

  // initial render
  reportsRefreshView(false);
}

function renderOrders() {
  const tbody = document.getElementById('orders-body');
  const statusFilterEl = document.getElementById('order-status-filter');
  const dateFromEl = document.getElementById('order-date-from');
  const dateToEl = document.getElementById('order-date-to');
  const summaryEl = document.getElementById('order-filter-summary');
  const statusFilter = statusFilterEl ? statusFilterEl.value : '';
  const dateFrom = dateFromEl ? dateFromEl.value : '';
  const dateTo = dateToEl ? dateToEl.value : '';
  const list = allOrders.filter(o => {
    const status = (o.status || 'pending').toLowerCase();
    if (statusFilter && status !== statusFilter) return false;
    const orderDate = getOrderFilterDateKey(o);
    if (dateFrom && (!orderDate || orderDate < dateFrom)) return false;
    if (dateTo && (!orderDate || orderDate > dateTo)) return false;
    return true;
  });
  if (summaryEl) {
    summaryEl.textContent = list.length === allOrders.length
      ? `Showing all ${allOrders.length} orders`
      : `Showing ${list.length} of ${allOrders.length} orders`;
  }

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#aaa;padding:20px;">No orders found.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(o => {
    const name = o.customer ? `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim() : '-';
    const contactNumber = o.customer ? (o.customer.phone || o.customer.contact || '-') : '-';
    const itemCount = Array.isArray(o.items) ? o.items.length : '-';
    const delivery = o.deliveryType === 'pickup' ? 'Pickup' : 'Ship';
    const status = (o.status || 'pending').toLowerCase();
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const statusBadge = `<span class="badge-status ${status}">${statusLabel}</span>`;
    // action select for status update (delivery-aware, forward-only)
    const orderKey = (o.orderId || o.order_ref || o.id || '').toString().replace(/'/g, "\\'");
    const isPickup = o.deliveryType === 'pickup';
    const isTerminal = ['delivered', 'cancelled', 'pickedup'].includes(status);
    const flow = isPickup ? ['pending','confirmed','pickedup'] : ['pending','confirmed','shipped','delivered'];
    const statusLabels = { pending: 'Pending', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', pickedup: 'Picked Up', cancelled: 'Cancelled' };
    let statusActions = '';
    if (!isTerminal) {
      let startIndex = flow.indexOf(status);
      if (startIndex < 0) startIndex = 0;
      let optionsHtml = `<option value="${status}" selected>${statusLabel}</option>`;
      const nextStatus = flow[startIndex + 1];
      if (nextStatus) {
        optionsHtml += `<option value="${nextStatus}">${statusLabels[nextStatus] || (nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1))}</option>`;
      }
      // allow cancelling only while still pending
      if (status === 'pending') {
        optionsHtml += `<option value="cancelled">${statusLabels.cancelled}</option>`;
      }
      statusActions = `<select onchange="updateOrderStatus('${orderKey}', this.value)" class="form-select form-select-sm" style="width:130px;display:inline-block;margin-right:6px;">${optionsHtml}</select>`;
    }

    return `<tr>
      <td><code style="font-size:.76rem;color:var(--green-1)">${o.orderId || '-'}</code></td>
      <td>${name}</td>
      <td style="font-size:.78rem;color:#888">${escapeHtml(contactNumber)}</td>
      <td style="text-align:center">${itemCount}</td>
      <td>${delivery}</td>
      <td><strong>${peso(o.total || 0)}</strong></td>
      <td>${statusBadge}</td>
      <td style="font-size:.76rem;color:#888">${o.date ? new Date(o.date).toLocaleDateString() : '-'}</td>
      <td>
        ${statusActions}
        <button class="action-btn view" onclick="viewOrder(${JSON.stringify(o).replace(/\"/g,'&quot;')})"><i class="fa-solid fa-eye"></i></button>
      </td>
    </tr>`;
  }).join('');

}

function getOrderManilaDateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch (e) {
    return date.toISOString().slice(0, 10);
  }
}

function getOrderFilterDateKey(order) {
  const direct = String((order && (order.dateKey || order.date_key)) || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  return getOrderManilaDateKey(order && (order.date || order.created_at || order.createdAt || ''));
}

function bindOrderFilters() {
  const status = document.getElementById('order-status-filter');
  const from = document.getElementById('order-date-from');
  const to = document.getElementById('order-date-to');
  const clear = document.getElementById('order-date-clear');
  if (status && status.dataset.bound !== '1') {
    status.dataset.bound = '1';
    status.addEventListener('change', renderOrders);
  }
  if (from && from.dataset.bound !== '1') {
    from.dataset.bound = '1';
    from.addEventListener('change', renderOrders);
    from.addEventListener('input', renderOrders);
  }
  if (to && to.dataset.bound !== '1') {
    to.dataset.bound = '1';
    to.addEventListener('change', renderOrders);
    to.addEventListener('input', renderOrders);
  }
  if (clear && clear.dataset.bound !== '1') {
    clear.dataset.bound = '1';
    clear.addEventListener('click', function () {
      if (from) from.value = '';
      if (to) to.value = '';
      renderOrders();
    });
  }
}

bindOrderFilters();

function updateOrderStatus(orderId, status) {
  if (!orderId) return showToast('Invalid order id');
  const currentOrder = (Array.isArray(allOrders) ? allOrders : []).find(o => String(o.orderId || o.order_ref || o.id || '') === String(orderId));
  const currentStatus = String(currentOrder && currentOrder.status || '').toLowerCase();
  const nextStatus = String(status || '').toLowerCase();
  const isPickup = currentOrder && currentOrder.deliveryType === 'pickup';
  const allowedTransitions = isPickup
    ? { pending: ['confirmed', 'cancelled'], confirmed: ['pickedup'] }
    : { pending: ['confirmed', 'cancelled'], confirmed: ['shipped'], shipped: ['delivered'] };
  if (['delivered', 'cancelled', 'pickedup'].includes(currentStatus)) {
    showToast('Completed or cancelled orders cannot be changed.');
    loadOrders();
    return;
  }
  if (nextStatus === currentStatus) return;
  if (!((allowedTransitions[currentStatus] || []).includes(nextStatus))) {
    showToast(isPickup
      ? 'Please follow the order status sequence: Pending > Confirmed > Picked Up.'
      : 'Please follow the order status sequence: Pending > Confirmed > Shipped > Delivered.');
    loadOrders();
    return;
  }
  if (!confirm(`Change status of ${orderId} to ${status}?`)) return;

  // optimistic UI update: update badge immediately while request runs
  let previousStatus = null;
  document.querySelectorAll('#orders-body code').forEach(codeEl => {
    if (codeEl.textContent.trim() === orderId) {
      const tr = codeEl.closest('tr');
      if (tr) {
        const statusCell = tr.children[6];
        if (statusCell) {
          previousStatus = statusCell.innerHTML;
          const st = String(status || '').toLowerCase();
          statusCell.innerHTML = `<span class="badge-status ${st}">${st.charAt(0).toUpperCase()+st.slice(1)}</span>`;
        }
      }
    }
  });

  const fd = new FormData();
  fd.append('orderId', orderId);
  fd.append('status', status);
  console.log('updateOrderStatus ->', { orderId, status });
  showToast('Updating order status...');
  fetch(adminApi('update_order_status.php'), { method: 'POST', body: fd })
    .then(r => r.text())
    .then(txt => {
      console.log('api/update_order_status.php response text:', txt);
      try {
        const res = JSON.parse(txt);
        if (res && res.success) {
          let successMessage = 'Order status updated';
          const sms = res && res.sms ? res.sms : null;
          const stockAction = res && res.stock_action ? String(res.stock_action) : 'none';
          if (String(status).toLowerCase() === 'confirmed') {
            successMessage = (sms && !sms.ok)
              ? 'Order confirmed, but SMS failed to send'
              : 'Order confirmed successfully';
            if (stockAction === 'deducted') successMessage += ' and stock was updated';
          } else if (String(status).toLowerCase() === 'shipped') {
            successMessage = (sms && !sms.ok)
              ? 'Order shipped, but SMS failed to send'
              : 'Order shipped successfully';
          } else if (String(status).toLowerCase() === 'delivered') {
            successMessage = (sms && !sms.ok)
              ? 'Order delivered, but SMS failed to send'
              : 'Order delivered successfully';
          } else if (String(status).toLowerCase() === 'cancelled' && stockAction === 'restored') {
            successMessage = 'Order cancelled and stock was restored';
          }
          showToast(successMessage);
          // refresh orders in background to ensure consistency
          loadOrders();
          // Refresh products whenever the server reports a stock change.
          try { if (stockAction !== 'none') fetchProducts(); } catch(e){}
          if (typeof renderActivityLog === 'function') renderActivityLog();
        } else {
          console.error('api/update_order_status.php returned error:', res, txt);
          // revert optimistic change
          if (previousStatus !== null) {
            document.querySelectorAll('#orders-body code').forEach(codeEl => {
              if (codeEl.textContent.trim() === orderId) {
                const tr = codeEl.closest('tr');
                if (tr) tr.children[6].innerHTML = previousStatus;
              }
            });
          }
          showToast((res && res.message) ? res.message : 'Failed to update status');
        }
      } catch (e) {
        console.error('Invalid JSON from api/update_order_status.php:', txt);
        if (previousStatus !== null) {
          document.querySelectorAll('#orders-body code').forEach(codeEl => {
            if (codeEl.textContent.trim() === orderId) {
              const tr = codeEl.closest('tr');
              if (tr) tr.children[6].innerHTML = previousStatus;
            }
          });
        }
        showToast('Server error updating order status');
      }
    })
    .catch(err => { console.error('Failed to update order status:', err); if (previousStatus !== null) { document.querySelectorAll('#orders-body code').forEach(codeEl => { if (codeEl.textContent.trim() === orderId) { const tr = codeEl.closest('tr'); if (tr) tr.children[6].innerHTML = previousStatus; } }); } showToast('Network error updating order status'); });
}

function viewOrder(o) {
  // Delegate to the external renderer when available. This keeps `admin.js`
  // lightweight while allowing `admin-view-order.js` to implement the full
  // modal markup and styling.
  if (typeof window.renderAdminOrder === 'function') {
    try { window.renderAdminOrder(o); return; } catch (err) { console.error('renderAdminOrder error', err); }
  }

  // Fallback: simple safe viewer to avoid UI freeze if external script not loaded.
  try {
    let data = o;
    if (typeof o === 'string') {
      data = JSON.parse(o.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    }
    const customer = (data && data.customer) ? data.customer : {};
    const body = document.getElementById('modal-order-body');
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
    body.innerHTML = `<div style="font-size:.95rem;color:#444;"><strong>Customer:</strong> ${escapeHtml((customer.firstName||'') + ' ' + (customer.lastName||''))}<br><strong>Email:</strong> ${escapeHtml(customer.email||'-')}<br><strong>Phone:</strong> ${escapeHtml(customer.phone||customer.contact||'-')}<br><strong>Address:</strong> ${escapeHtml(addressText)}</div>`;
    document.getElementById('order-modal').classList.add('open');
  } catch (err) {
    console.error('viewOrder fallback error', err);
    showToast('Could not open order details');
  }
}

/* ---- INIT ---- */
document.addEventListener('DOMContentLoaded', () => {
  startOrdersPolling();
  // Fetch products from DB first, then load orders
  fetchProducts().then(() => {
    loadOrders();
    // Also fetch users so activity log includes recent registrations
    fetchUsers();
    fetchAppointments();
    loadFeedback();
  }).catch(() => {
    // still load orders even if products fail
    loadOrders();
    // attempt to fetch users even on product fetch failure
    fetchUsers();
    fetchAppointments();
    loadFeedback();
  });
});


