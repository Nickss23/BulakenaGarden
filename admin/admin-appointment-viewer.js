// ============================================================
//  admin-appointment-viewer.js
//  Self-contained - injects fonts, CSS, modal HTML, and logic.
//  No external CSS or HTML snippets required.
//  Just include this script and call viewAppointment(a) anywhere.
// ============================================================
(function () {

  // -- 1. Inject Google Fonts ----------------------------------
  (function injectFonts() {
    if (document.getElementById('am-fonts')) return;
    const link = document.createElement('link');
    link.id   = 'am-fonts';
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=DM+Sans:wght@300;400;500&display=swap';
    document.head.appendChild(link);
  })();

  // -- 2. Inject CSS -------------------------------------------
  (function injectStyles() {
    if (document.getElementById('am-styles')) return;
    const style = document.createElement('style');
    style.id = 'am-styles';
    style.textContent = `
      :root {
        --am-green-deep:   #1a3d2b;
        --am-green-mid:    #2d6a4f;
        --am-green-accent: #40916c;
        --am-green-light:  #95d5b2;
        --am-green-pale:   #d8f3dc;
        --am-cream:        #f9f6f0;
        --am-text-dark:    #1a2e1e;
        --am-text-muted:   #6b8f71;
      }

      /* Overlay */
      #appointment-modal {
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
      #appointment-modal.open { display: flex; }

      /* Container */
      .am-container {
        background: var(--am-cream);
        width: 100%;
        max-width: 460px;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 24px 64px rgba(26,61,43,0.22), 0 4px 16px rgba(26,61,43,0.1);
        animation: am-rise 0.45s cubic-bezier(0.16,1,0.3,1) both;
        max-height: 90vh;
        overflow-y: auto;
      }
      @keyframes am-rise {
        from { opacity:0; transform: translateY(24px) scale(0.97); }
        to   { opacity:1; transform: translateY(0)    scale(1);    }
      }

      /* Header */
      .am-header {
        background: linear-gradient(135deg, var(--am-green-deep) 0%, var(--am-green-mid) 100%);
        padding: 28px 28px 24px;
        position: relative;
        overflow: hidden;
      }
      .am-header::before {
        content: '';
        position: absolute;
        top: -40px; right: -40px;
        width: 160px; height: 160px;
        border-radius: 50%;
        background: rgba(255,255,255,0.05);
      }
      .am-header::after {
        content: '';
        position: absolute;
        bottom: -20px; left: 30%;
        width: 100px; height: 100px;
        border-radius: 50%;
        background: rgba(149,213,178,0.08);
      }
      .am-appt-label {
        font-family: 'DM Sans', sans-serif;
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--am-green-light);
        opacity: 0.85;
        margin-bottom: 6px;
        position: relative;
        z-index: 1;
      }
      .am-appt-name {
        font-family: 'Playfair Display', serif;
        font-size: 22px;
        font-weight: 600;
        color: #fff;
        line-height: 1.25;
        position: relative;
        z-index: 1;
        margin-bottom: 4px;
      }
      .am-appt-img { width:56px; height:56px; border-radius:10px; object-fit:cover; display:inline-block; vertical-align:middle; margin-right:12px; box-shadow: 0 6px 18px rgba(26,61,43,0.12); }
      .am-appt-id {
        font-family: 'DM Sans', sans-serif;
        font-size: 11px;
        color: var(--am-green-light);
        opacity: 0.7;
        position: relative;
        z-index: 1;
      }
      .am-close-btn {
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
      .am-close-btn:hover { background: rgba(255,255,255,0.24); }

      /* Body */
      .am-body { padding: 24px 28px 28px; }

      .am-section-title {
        font-family: 'DM Sans', sans-serif;
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: var(--am-green-accent);
        margin-bottom: 14px;
      }

      /* Info rows */
      .am-info-grid { display: grid; gap: 10px; margin-bottom: 20px; }
      .am-info-row  { display: flex; gap: 12px; align-items: flex-start; }
      .am-icon {
        width: 32px; height: 32px;
        border-radius: 8px;
        background: var(--am-green-pale);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        font-size: 14px;
        color: var(--am-green-mid);
      }
      .am-info-content { flex: 1; padding-top: 2px; }
      .am-info-label {
        font-family: 'DM Sans', sans-serif;
        font-size: 10px; font-weight: 500;
        letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--am-text-muted);
        line-height: 1; margin-bottom: 2px;
      }
      .am-info-value {
        font-family: 'DM Sans', sans-serif;
        font-size: 13.5px;
        color: var(--am-text-dark);
        line-height: 1.35;
      }

      /* Divider */
      .am-divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--am-green-pale), transparent);
        margin: 4px -28px 20px;
      }

      /* Notes card */
      .am-notes-card {
        background: var(--am-green-pale);
        border-radius: 14px;
        padding: 14px 16px;
        border: 1px solid rgba(64,145,108,0.15);
        margin-top: 4px;
      }
      .am-notes-text {
        font-family: 'DM Sans', sans-serif;
        font-size: 13.5px;
        color: var(--am-text-dark);
        line-height: 1.6;
        font-style: italic;
      }
      .am-body-img { width:100%; height:auto; border-radius:10px; object-fit:cover; margin:12px 0; box-shadow: 0 10px 26px rgba(26,61,43,0.08); }
      .am-thumb { width:120px; height:120px; border-radius:10px; object-fit:cover; box-shadow: 0 8px 20px rgba(26,61,43,0.06); }
      .am-image-row { display:flex; gap:12px; align-items:center; margin:12px 0; }
      /* Lightbox */
      #am-lightbox { display:none; position:fixed; inset:0; background: rgba(0,0,0,0.8); z-index:1200; align-items:center; justify-content:center; padding:24px; }
      #am-lightbox.open { display:flex; }
      .am-lightbox-inner { position:relative; max-width:90vw; max-height:90vh; }
      #am-lightbox-img { max-width:100%; max-height:90vh; border-radius:8px; box-shadow:0 18px 48px rgba(0,0,0,0.6); display:block; }
      #am-lightbox-close { position:absolute; top:-10px; right:-10px; background:#fff;border-radius:50%;border:none;width:36px;height:36px;cursor:pointer;font-size:18px; }
      .am-notes-empty {
        font-family: 'DM Sans', sans-serif;
        font-size: 13px;
        color: var(--am-text-muted);
        font-style: italic;
      }
      .am-reference-card {
        margin-top: 12px;
      }
      .am-reference-link {
        border: 0;
        border-radius: 999px;
        background: var(--am-green-mid);
        color: #fff;
        cursor: pointer;
        font-family: 'DM Sans', sans-serif;
        font-size: 12px;
        font-weight: 600;
        padding: 7px 12px;
      }
      .am-reference-link:hover { background: var(--am-green-deep); }

      /* Status bar */
      .am-status-bar {
        display: flex; align-items: center; justify-content: space-between;
        background: linear-gradient(135deg, #f0faf4, #e8f5e9);
        border: 1px solid rgba(64,145,108,0.2);
        border-radius: 12px; padding: 12px 16px; margin-top: 20px;
      }
      .am-status-left { display: flex; align-items: center; gap: 10px; }
      .am-status-dot  { width: 8px; height: 8px; border-radius: 50%; animation: am-pulse 2s infinite; }
      .am-status-text {
        font-family: 'DM Sans', sans-serif;
        font-size: 13px; font-weight: 500; color: var(--am-green-deep);
      }
      .am-status-badge {
        font-family: 'DM Sans', sans-serif;
        font-size: 11px; font-weight: 500;
        letter-spacing: 0.06em; padding: 4px 12px;
        border-radius: 20px; text-transform: uppercase; color: #fff;
      }

      /* Status color variants */
      .am-status-confirmed .am-status-dot   { background:#40916c; box-shadow:0 0 0 3px rgba(64,145,108,0.25); }
      .am-status-confirmed .am-status-badge { background:#40916c; }
      .am-status-pending   .am-status-dot   { background:#c9a84c; box-shadow:0 0 0 3px rgba(201,168,76,0.25); }
      .am-status-pending   .am-status-badge { background:#c9a84c; }
      .am-status-cancelled .am-status-dot   { background:#c0392b; box-shadow:0 0 0 3px rgba(192,57,43,0.25); }
      .am-status-cancelled .am-status-badge { background:#c0392b; }
      .am-status-completed .am-status-dot   { background:#40916c; box-shadow:0 0 0 3px rgba(64,145,108,0.25); }
      .am-status-completed .am-status-badge { background:#40916c; }
      .am-status-done      .am-status-dot   { background:#40916c; box-shadow:0 0 0 3px rgba(64,145,108,0.25); }
      .am-status-done      .am-status-badge { background:#40916c; }
      .am-status-scheduled .am-status-dot   { background:#7b5ea7; box-shadow:0 0 0 3px rgba(123,94,167,0.25); }
      .am-status-scheduled .am-status-badge { background:#7b5ea7; }

      @keyframes am-pulse {
        0%,100% { opacity:1; }
        50%      { opacity:0.4; }
      }
    `;
    document.head.appendChild(style);
  })();

  // -- 3. Inject Modal HTML ------------------------------------
  (function injectHTML() {
    if (document.getElementById('appointment-modal')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <div id="appointment-modal">
        <div class="am-container">
          <div class="am-header">
            <div class="am-appt-label">Appointment Details</div>
            <img id="am-appt-img" class="am-appt-img" style="display:none" alt="appt image">
            <div style="display:inline-block;vertical-align:middle;">
              <div class="am-appt-name" id="am-appt-name"></div>
              <div class="am-appt-id"   id="am-appt-id"></div>
            </div>
            <button class="am-close-btn" id="am-close-btn">×</button>
          </div>
          <div class="am-body" id="am-appt-body"></div>
        </div>
      </div>
    `;
    document.body.appendChild(div.firstElementChild);

    document.getElementById('am-close-btn').addEventListener('click', closeAppointmentModal);
    document.getElementById('appointment-modal').addEventListener('click', function (e) {
      if (e.target === this) closeAppointmentModal();
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

  function closeAppointmentModal() {
    const modal = document.getElementById('appointment-modal');
    if (modal) modal.classList.remove('open');
  }

  // Lightbox helpers
  function ensureLightbox() {
    if (document.getElementById('am-lightbox')) return;
    const div = document.createElement('div');
    div.id = 'am-lightbox';
    div.innerHTML = `
      <div class="am-lightbox-inner">
        <img id="am-lightbox-img" src="" alt="image">
        <button id="am-lightbox-close">×</button>
      </div>
    `;
    document.body.appendChild(div);
    div.addEventListener('click', function (e) {
      if (e.target === this || e.target.id === 'am-lightbox-close') closeAppointmentImage();
    });
  }

  function openAppointmentImage(url) {
    try {
      ensureLightbox();
      const lb = document.getElementById('am-lightbox');
      const img = document.getElementById('am-lightbox-img');
      if (!img || !lb) return window.open(url, '_blank');
      img.src = url;
      lb.classList.add('open');
    } catch (e) { window.open(url, '_blank'); }
  }

  function closeAppointmentImage() {
    const lb = document.getElementById('am-lightbox');
    if (!lb) return;
    lb.classList.remove('open');
    setTimeout(() => {
      const img = document.getElementById('am-lightbox-img');
      if (img) img.src = '';
    }, 200);
  }

  function formatDate(raw) {
    if (raw === undefined || raw === null || raw === '') return '-';
    let d;
    try {
      if (typeof raw === 'number') {
        d = raw > 1e12 ? new Date(raw) : new Date(raw * 1000);
      } else if (typeof raw === 'string') {
        const s = raw.trim();
        const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnly) {
          d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 9, 0, 0);
        } else if (/^\d+$/.test(s)) {
          const n = Number(s);
          d = n > 1e12 ? new Date(n) : new Date(n * 1000);
        } else {
          // handle common SQL datetime 'YYYY-MM-DD HH:MM:SS' by converting to ISO-ish
          let t = s;
          if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(t)) t = t.replace(' ', 'T');
          d = new Date(t);
          if (isNaN(d)) {
            // try replacing first space with 'T' if still invalid
            d = new Date(s.replace(' ', 'T'));
          }
        }
      } else {
        d = new Date(raw);
      }
    } catch (e) {
      return String(raw);
    }
    if (!d || isNaN(d)) return String(raw);
    return d.toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric',
      month: 'long', day: 'numeric'
    }) + ' - ' + d.toLocaleTimeString('en-PH', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  // -- 5. Main renderer ----------------------------------------
  function renderAppointment(a) {
    try {
      a = safeParse(a) || a;
      if (!a || typeof a !== 'object') { showToast('Invalid appointment data'); return; }

      // Debugging: log incoming object and computed fields (helps diagnose missing date/image)
      try { console.log('renderAppointment input', a); } catch(e){}

      const status      = (a.status || 'pending').toLowerCase();
      const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

      // Full name - support flat or nested customer object
      const customer   = a.customer || {};
      const firstName  = a.firstName  || customer.firstName  || '';
      const lastName   = a.lastName   || customer.lastName   || '';
      const fullName   = (firstName + ' ' + lastName).trim() || a.name || customer.name || '-';

      const contact    = a.contact  || a.phone  || customer.phone  || customer.contact || '-';
      const email      = a.email    || customer.email  || '-';
      const address    = a.address  || customer.address || '-';
      const service    = a.service  || a.serviceType   || '-';
      // Support many common date field names used across the app and server
      const date = a.dt || a.date || a.appointmentDate || a.scheduledAt || a.scheduled_at || a.datetime || a.date_time || a.created_at || a.createdAt || a.timestamp || null;
      const appointmentTime = a.appointment_time || a.time || '';
      const notes      = a.notes    || a.remarks        || '';
      const apptId     = a.appointmentId || a.id        || '';

      // image field support
      const imgField = a.reference_img || a.referenceImg || a.referenceImage || a.image || a.img || a.photo || a.attachment || a.file || a.upload || a.image_url || a.imagePath || (customer && (customer.image || customer.photo)) || '';
      let imgUrl = '';
      if (imgField) {
        const s = String(imgField || '').trim();
        if (window.resolveAdminAsset && typeof window.resolveAdminAsset === 'function') {
          imgUrl = window.resolveAdminAsset(s);
        } else if (/^https?:\/\//i.test(s) || s.startsWith('/')) {
          imgUrl = s;
        } else if (/^(?:\.\/)?uploads\//i.test(s)) {
          // already contains uploads/ (or ./uploads/) - use as-is but strip leading ./
          imgUrl = '../' + s.replace(/^\.\//, '');
        } else {
          imgUrl = '../uploads/' + s.replace(/^\/+/, '');
        }
      }

      // Debugging: computed values
      try { console.log('appointment date/raw:', date, 'formatted:', formatDate(date), 'imgField:', imgField, 'imgUrl:', imgUrl); } catch(e){}

      // Header - keep header image hidden (we render image in the body above notes)
      const imgEl = document.getElementById('am-appt-img');
      if (imgEl) { imgEl.style.display = 'none'; }
      document.getElementById('am-appt-name').textContent = fullName;
      document.getElementById('am-appt-id').textContent   = apptId ? 'ID: ' + apptId : '';

      // Body
      document.getElementById('am-appt-body').innerHTML = `

        <div class="am-section-title">Appointment Information</div>
        <div class="am-info-grid">

          <div class="am-info-row">
            <div class="am-icon"><i class="fa-solid fa-wrench"></i></div>
            <div class="am-info-content">
              <div class="am-info-label">Service</div>
              <div class="am-info-value">${escapeHtml(service)}</div>
            </div>
          </div>

          <div class="am-info-row">
            <div class="am-icon"><i class="fa-solid fa-calendar-days"></i></div>
            <div class="am-info-content">
              <div class="am-info-label">Date & Time</div>
              <div class="am-info-value">${escapeHtml(formatDate(date))}${appointmentTime ? ' - ' + escapeHtml((function(s){var m=String(s||'').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);if(!m)return String(s||'');var h=Number(m[1]);var min=m[2];var ap=h>=12?'PM':'AM';h=h%12;if(h===0)h=12;return h+':'+min+' '+ap;})(appointmentTime)) : ''}</div>
            </div>
          </div>

        </div>

        <div class="am-divider"></div>

        <div class="am-section-title">Client Information</div>
        <div class="am-info-grid">

          <div class="am-info-row">
            <div class="am-icon"><i class="fa-solid fa-phone"></i></div>
            <div class="am-info-content">
              <div class="am-info-label">Contact</div>
              <div class="am-info-value">${escapeHtml(contact)}${email !== '-' ? ' / ' + escapeHtml(email) : ''}</div>
            </div>
          </div>

          <div class="am-info-row">
            <div class="am-icon"><i class="fa-solid fa-map-location-dot"></i></div>
            <div class="am-info-content">
              <div class="am-info-label">Address</div>
              <div class="am-info-value">${escapeHtml(address)}</div>
            </div>
          </div>

        </div>

        <div class="am-divider"></div>
        <div class="am-section-title">Notes</div>
        <div class="am-notes-card">
          ${notes ? `<div class="am-notes-text">${escapeHtml(notes)}</div>` : `<div class="am-notes-empty">No notes provided.</div>`}
        </div>

        ${imgUrl ? `
          <div class="am-reference-card">
            <button type="button" class="am-reference-link" data-reference-url="${escapeHtml(imgUrl)}" onclick="window.openAppointmentImage(this.dataset.referenceUrl)">View Reference</button>
          </div>
        ` : ''}

        <div class="am-status-bar am-status-${status}">
          <div class="am-status-left">
            <div class="am-status-dot"></div>
            <span class="am-status-text">Appointment Status</span>
          </div>
          <div class="am-status-badge">${statusLabel}</div>
        </div>
      `;

      document.getElementById('appointment-modal').classList.add('open');

    } catch (err) {
      console.error('renderAppointment error', err);
      showToast('Could not open appointment details');
    }
  }

  // -- 6. Expose globals ---------------------------------------
  window.renderAppointment    = renderAppointment;
  window.closeAppointmentModal = closeAppointmentModal;
  window.viewAppointment      = renderAppointment;
  window.openAppointmentImage = openAppointmentImage;
  window.closeAppointmentImage = closeAppointmentImage;

})();
