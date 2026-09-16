/* ===================================================== */
/* Bulakena Garden Unified Script File */
/* - Shared nav behavior */
/* - Shared auth behavior */
/* - Page scripts (guarded by page-specific selectors) */
/* ===================================================== */


(function () {
  "use strict";
  window.resolvePublicAsset = window.resolvePublicAsset || function (path) {
    var value = String(path || '').trim().replace(/\\/g, '/');
    if (!value) return '';
    if (/^(https?:)?\/\//i.test(value) || value.charAt(0) === '/') return value;
    if (value.indexOf('../') === 0) return value;
    if (value.indexOf('uploads/') === 0 || value.indexOf('images/') === 0) return '../' + value;
    if (value.indexOf('proof_delivery/') === 0) return '../uploads/' + value;
    if (value.indexOf('feedback/') === 0 || value.indexOf('reviews/') === 0 || value.indexOf('products/') === 0) return '../uploads/' + value;
    return value;
  };
})();
/* ----------------------- */
/* Shared: Navigation UX */

/* ----------------------- */
(function () {
  "use strict";

  function updateNavbarScrolledState() {
    var nav = document.querySelector(".navbar");
    if (!nav) return;
    nav.classList.toggle("nav-scrolled", window.scrollY > 8);
  }

  function setupSmoothScrollLinks() {
    document.addEventListener("click", function (event) {
      var link = event.target.closest('.navbar a[href^="#"]');
      if (!link) return;

      var href = link.getAttribute("href");
      if (!href || href === "#") return;
      var target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });

      var collapse = document.querySelector(".navbar .navbar-collapse.show");
      if (collapse && window.bootstrap && window.bootstrap.Collapse) {
        window.bootstrap.Collapse.getOrCreateInstance(collapse).hide();
      }
    });
  }

  function init() {
    updateNavbarScrolledState();
    setupSmoothScrollLinks();
    window.addEventListener("scroll", updateNavbarScrolledState, { passive: true });
  }

  document.addEventListener("DOMContentLoaded", init);
})();


/* ---------------------- */
/* Home: Testimonials */
/* ---------------------- */
(function () {
  "use strict";

  var allReviewsRequest = null;

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function getReviewName(entry) {
    return normalizeText(entry.reviewer_name || entry.name || "");
  }

  function getReviewEmail(entry) {
    return normalizeText(entry.reviewer_email || entry.email || "");
  }

  function isAnonymous(entry) {
    return Number(entry.anonymous || 0) === 1;
  }

  function makeInitials(name) {
    var cleaned = normalizeText(name);
    if (!cleaned) return "U";
    var parts = cleaned.split(/\s+/).filter(Boolean);
    var first = parts[0] ? parts[0].charAt(0) : "";
    var second = parts.length > 1 ? parts[1].charAt(0) : (parts[0] ? parts[0].charAt(1) : "");
    var out = (first + second).toUpperCase();
    return out || "U";
  }

  function renderStars(container, rating) {
    var i;
    for (i = 0; i < 5; i++) {
      var star = document.createElement("span");
      star.className = "star" + (i < rating ? " filled" : "");
      star.innerHTML = "&#9733;";
      container.appendChild(star);
    }
  }

  function renderStarString(rating) {
    var safeRating = Math.max(0, Math.min(5, Number(rating) || 0));
    return Array.from({ length: 5 }).map(function (_, idx) {
      return idx < safeRating ? "\u2605" : "\u2606";
    }).join("");
  }

  function getDisplayName(entry) {
    if (isAnonymous(entry)) return "Anonymous";
    return getReviewName(entry) || "Customer";
  }

  function formatReviewDate(value) {
    var parsed = Date.parse(value || "");
    if (!parsed) return "Recent review";
    return new Date(parsed).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long"
    });
  }

  function getReviewTag(entry) {
    var source = normalizeText(entry && entry.source).toLowerCase();
    var service = normalizeText(entry && entry.service);
    var productTitle = normalizeText(entry && entry.product_title);

    if (source === "service" && service) return service;
    if (source === "product" && productTitle) return productTitle;
    if (source === "service") return "Service Feedback";
    if (source === "product") return "Product Review";
    return "Customer Review";
  }


  function resolvePublicAsset(path) {
    var value = String(path || '').trim().replace(/\\/g, '/');
    if (!value) return '';
    if (/^(https?:)?\/\//i.test(value) || value.charAt(0) === '/') return value;
    if (value.indexOf('../') === 0) return value;
    if (value.indexOf('uploads/') === 0 || value.indexOf('images/') === 0) return '../' + value;
    if (value.indexOf('proof_delivery/') === 0) return '../uploads/' + value;
    if (value.indexOf('feedback/') === 0 || value.indexOf('reviews/') === 0 || value.indexOf('products/') === 0) return '../uploads/' + value;
    return value;
  }
  function getReviewMediaSrc(entry) {
    var media = normalizeText(entry && (entry.media || entry.product_img)).replace(/\\/g, "/");
    if (!media) return "";

    var lower = media.toLowerCase();
    var isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".jfif"].some(function (ext) {
      return lower.indexOf(ext, lower.length - ext.length) !== -1;
    });
    if (!isImage) return "";

    if (/^(https?:)?\/\//i.test(media) || media.charAt(0) === "/") return media;
    if (media.indexOf("uploads/") === 0) return "../" + media;
    if (media.indexOf("feedback/") === 0 || media.indexOf("reviews/") === 0) return "../uploads/" + media;
    return "../uploads/" + media;
  }

  function getImageModal() {
    var modal = document.getElementById("reviewImageModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "reviewImageModal";
    modal.className = "review-image-modal";
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "Customer review image");
    modal.innerHTML = [
      '<button class="review-image-modal__backdrop" type="button" aria-label="Close image preview"></button>',
      '<div class="review-image-modal__panel">',
      '  <button class="review-image-modal__close" type="button" aria-label="Close image preview">&times;</button>',
      '  <img class="review-image-modal__img" src="" alt="">',
      '</div>'
    ].join("");

    modal.addEventListener("click", function (event) {
      if (
        event.target.classList.contains("review-image-modal__backdrop") ||
        event.target.classList.contains("review-image-modal__close")
      ) {
        closeImageModal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal.classList.contains("open")) {
        event.stopPropagation();
        closeImageModal();
      }
    });

    document.body.appendChild(modal);
    return modal;
  }

  function openImageModal(src, alt) {
    var modal = getImageModal();
    var img = modal.querySelector(".review-image-modal__img");
    if (!img) return;

    img.src = src;
    img.alt = alt || "Customer review image";
    modal.classList.add("open");
    document.body.classList.add("review-image-modal-open");

    var closeBtn = modal.querySelector(".review-image-modal__close");
    if (closeBtn) closeBtn.focus();
  }

  function closeImageModal() {
    var modal = document.getElementById("reviewImageModal");
    if (!modal) return;

    modal.classList.remove("open");
    document.body.classList.remove("review-image-modal-open");
  }

  function makeImagePreviewable(img, src, alt) {
    img.setAttribute("role", "button");
    img.setAttribute("tabindex", "0");
    img.title = "View image";
    img.addEventListener("click", function () {
      openImageModal(src, alt);
    });
    img.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openImageModal(src, alt);
      }
    });
  }

  function sortByCreatedAtDesc(list) {
    return (list || []).slice().sort(function (a, b) {
      var ta = Date.parse(a && a.created_at ? a.created_at : 0) || 0;
      var tb = Date.parse(b && b.created_at ? b.created_at : 0) || 0;
      return tb - ta;
    });
  }

  function summarizeReviews(list) {
    var rated = (list || []).filter(function (entry) {
      var rating = Number(entry && entry.rating);
      return rating >= 1 && rating <= 5;
    });
    var total = rated.length;
    var sum = rated.reduce(function (acc, entry) {
      return acc + (Number(entry.rating) || 0);
    }, 0);
    return {
      total: total,
      average: total ? (sum / total) : 0
    };
  }

  function createTestimonialCard(review) {
    var card = document.createElement("div");
    card.className = "testimonial-card";
    var rating = Math.max(1, Math.min(5, Number(review.rating) || 5));

    var head = document.createElement("div");
    head.className = "testimonial-head";

    var avatar = document.createElement("div");
    avatar.className = "testimonial-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = makeInitials(review.name);

    var meta = document.createElement("div");
    meta.className = "testimonial-meta";

    var nameEl = document.createElement("div");
    nameEl.className = "testimonial-name";
    nameEl.textContent = review.name;

    var stars = document.createElement("div");
    stars.className = "testimonial-stars";
    stars.setAttribute("aria-label", rating + " out of 5 stars");
    renderStars(stars, rating);

    meta.appendChild(nameEl);
    meta.appendChild(stars);

    head.appendChild(avatar);
    head.appendChild(meta);

    var message = document.createElement("p");
    message.className = "testimonial-message";
    message.textContent = review.text;

    card.appendChild(head);

    if (review.media) {
      var mediaWrap = document.createElement("div");
      mediaWrap.className = "testimonial-media";

      var img = document.createElement("img");
      img.src = review.media;
      img.alt = "Customer review image from " + review.name;
      makeImagePreviewable(img, review.media, img.alt);
      img.addEventListener("error", function () {
        mediaWrap.remove();
      });

      mediaWrap.appendChild(img);
      card.appendChild(mediaWrap);
    }

    card.appendChild(message);
    return card;
  }

  function createPaginationDots(total, activeIndex, onSelect) {
    var wrap = document.createElement("div");
    wrap.className = "testimonial-pagination";
    wrap.setAttribute("aria-label", "Testimonials pagination");

    for (var i = 0; i < total; i++) {
      (function (idx) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "testimonial-dot" + (idx === activeIndex ? " active" : "");
        btn.setAttribute("aria-label", "Show testimonial " + (idx + 1) + " of " + total);
        if (idx === activeIndex) btn.setAttribute("aria-current", "true");
        btn.addEventListener("click", function () { onSelect(idx); });
        wrap.appendChild(btn);
      })(i);
    }

    return wrap;
  }

  function pickFeaturedReviews(list, maxCount) {
    var seen = Object.create(null);
    var valid = sortByCreatedAtDesc(list || []).filter(function (entry) {
      return Number(entry && entry.rating) > 0;
    });

    valid.sort(function (a, b) {
      var aHasImage = getReviewMediaSrc(a) ? 1 : 0;
      var bHasImage = getReviewMediaSrc(b) ? 1 : 0;
      if (aHasImage !== bHasImage) return bHasImage - aHasImage;
      return Number(b.rating || 0) - Number(a.rating || 0);
    });

    return valid.reduce(function (picked, entry) {
      if (picked.length >= maxCount) return picked;

      var name = getDisplayName(entry);
      var text = normalizeText(entry.text) || "No written review provided.";
      var key = [
        normalizeText(entry.source),
        normalizeText(entry.id),
        normalizeText(entry.order_ref),
        normalizeText(entry.appointment_id),
        name.toLowerCase(),
        text.toLowerCase()
      ].join("|");

      if (seen[key]) return picked;
      seen[key] = true;

      picked.push({
        name: name,
        text: text,
        rating: Math.max(1, Math.min(5, Number(entry.rating) || 5)),
        media: getReviewMediaSrc(entry)
      });
      return picked;
    }, []);
  }

  function buildReviewCard(entry, index) {
    var card = document.createElement("div");
    var head = document.createElement("div");
    var avatar = document.createElement("div");
    var meta = document.createElement("div");
    var nameEl = document.createElement("div");
    var dateEl = document.createElement("div");
    var stars = document.createElement("div");
    var text = document.createElement("p");
    var tag = document.createElement("span");
    var rating = Math.max(0, Math.min(5, Number(entry && entry.rating) || 0));

    card.className = "review-card";
    card.style.animationDelay = String(index * 60) + "ms";

    head.className = "review-card-head";
    avatar.className = "review-avatar";
    avatar.textContent = makeInitials(getDisplayName(entry));

    nameEl.className = "review-name";
    nameEl.textContent = getDisplayName(entry);

    dateEl.className = "review-date";
    dateEl.textContent = formatReviewDate(entry && entry.created_at);

    meta.appendChild(nameEl);
    meta.appendChild(dateEl);

    head.appendChild(avatar);
    head.appendChild(meta);

    stars.className = "review-stars";
    stars.textContent = renderStarString(rating);

    text.className = "review-text";
    text.textContent = normalizeText(entry && entry.text) || "No written review provided.";

    tag.className = "review-tag";
    tag.textContent = getReviewTag(entry);

    card.appendChild(head);
    card.appendChild(stars);
    card.appendChild(text);

    // Add review image if available
    var media = getReviewMediaSrc(entry);
    if (media) {
      var imgContainer = document.createElement("div");
      imgContainer.className = "review-image-container";
      
      var img = document.createElement("img");
      img.className = "review-image";
      img.src = media;
      img.alt = "Review image from " + getDisplayName(entry);
      makeImagePreviewable(img, media, img.alt);
      
      img.addEventListener("error", function() {
        imgContainer.style.display = "none";
      });
      
      imgContainer.appendChild(img);
      card.appendChild(imgContainer);
    }

    card.appendChild(tag);

    return card;
  }

  function updateReviewSummary(list) {
    var averageEl = document.getElementById("allReviewsAverage");
    var starsEl = document.getElementById("allReviewsStars");
    var totalEl = document.getElementById("allReviewsTotal");
    var summary = summarizeReviews(list);
    var rounded = Math.round(summary.average);

    if (averageEl) averageEl.textContent = summary.average ? summary.average.toFixed(1) : "0.0";
    if (starsEl) starsEl.textContent = renderStarString(rounded);
    if (totalEl) {
      totalEl.textContent = summary.total
        ? "Based on " + summary.total + " verified review" + (summary.total === 1 ? "" : "s")
        : "No reviews available yet";
    }
  }

  function renderAllReviews(list) {
    var grid = document.getElementById("allReviewsGrid");
    if (!grid) return;

    grid.innerHTML = "";

    if (!Array.isArray(list) || !list.length) {
      var empty = document.createElement("div");
      empty.className = "reviews-empty";
      empty.textContent = "No reviews available yet.";
      grid.appendChild(empty);
      updateReviewSummary([]);
      return;
    }

    list.forEach(function (entry, index) {
      grid.appendChild(buildReviewCard(entry, index));
    });
    updateReviewSummary(list);
  }

  function fetchAllReviews(limit) {
    if (allReviewsRequest) return allReviewsRequest;

    allReviewsRequest = fetch("api/get_reviews.php?limit=" + encodeURIComponent(limit))
      .then(function (res) { return res.text(); })
      .then(function (txt) {
        var parsed;
        try {
          parsed = JSON.parse(txt);
        } catch (e) {
          return [];
        }
        return Array.isArray(parsed) ? sortByCreatedAtDesc(parsed) : [];
      })
      .catch(function () {
        return [];
      });

    return allReviewsRequest;
  }

  function initAllReviewsOverlay(limit) {
    var overlay = document.getElementById("allReviewsOverlay");
    var openBtn = document.getElementById("seeAllReviewsBtn");
    var closeBtn = document.getElementById("closeAllReviewsBtn");
    var backdrop = overlay ? overlay.querySelector("[data-close-reviews='true']") : null;
    var hasLoaded = false;

    if (!overlay || !openBtn || !closeBtn || !backdrop) return;

    function closeOverlay() {
      overlay.classList.remove("open");
      document.body.style.overflow = "";
    }

    function openOverlay() {
      overlay.classList.add("open");
      document.body.style.overflow = "hidden";

      if (hasLoaded) return;

      fetchAllReviews(limit).then(function (reviews) {
        renderAllReviews(reviews);
        hasLoaded = true;
      });
    }

    openBtn.addEventListener("click", openOverlay);
    closeBtn.addEventListener("click", closeOverlay);
    backdrop.addEventListener("click", closeOverlay);
    document.addEventListener("keydown", function (event) {
      if (document.body.classList.contains("review-image-modal-open")) return;
      if (event.key === "Escape") closeOverlay();
    });

    window.openAllReviews = openOverlay;
    window.closeAllReviews = closeOverlay;
  }

  function initHomeTestimonials() {
    var carousel = document.getElementById("testimonials-carousel");
    if (!carousel) return;

    var slide = document.getElementById("testimonial-slide");
    if (!slide) return;

    var maxCount = Number(carousel.getAttribute("data-max") || 5) || 5;
    var limit = Number(carousel.getAttribute("data-limit") || 1000) || 1000;

    initAllReviewsOverlay(limit);

    fetchAllReviews(limit)
      .then(function (allReviews) {
        var unique = pickFeaturedReviews(allReviews, maxCount);
        if (!unique.length) {
          slide.innerHTML = "";
          return;
        }
        slide.innerHTML = "";
        unique.slice(0, maxCount).forEach(function (review) {
          slide.appendChild(createTestimonialCard(review));
        });
      })
      .catch(function () {
        slide.innerHTML = "";
      });
  }

  document.addEventListener("DOMContentLoaded", initHomeTestimonials);
})();


/* ---------------------- */
/* Shared: Auth System */
/* ---------------------- */
(function () {
  "use strict";

  var USERS_KEY = "bulakena_users_v1";
  var SESSION_KEY = "bulakena_session_v1";
  var AUTH_SYNC_KEY = "bulakena_auth_sync_v1";
  var CART_KEY_PREFIX = "bulakena_cart_v1:";
  var CART_SELECTION_KEY_PREFIX = "bulakena_cart_selection_v1:";
  var BUYER_ADDRESSES_KEY_PREFIX = "bulakena_buyer_addresses_v1:";
  var BUYER_SELECTED_ADDRESS_KEY_PREFIX = "bulakena_selected_address_v1:";
  var modalEl = null;
  var modalInstance = null;
  var verificationModalEl = null;
  var verificationModalInstance = null;
  var forgotPasswordModalEl = null;
  var forgotPasswordModalInstance = null;
  var resetPasswordModalEl = null;
  var resetPasswordModalInstance = null;
  var accountModalEl = null;
  var accountModalInstance = null;
  var cartModalEl = null;
  var cartModalInstance = null;
  var orderSummaryModalEl = null;
  var orderSummaryModalInstance = null;
  var ordersModalEl = null;
  var ordersModalInstance = null;
  var savedAddressesModalEl = null;
  var savedAddressesModalInstance = null;
  var addressFormModalEl = null;
  var addressFormModalInstance = null;
  var currentAddressEditId = "";
  var simpleOrderSummaryEl = null;
  var simpleOrderSummaryInstance = null;
  var simpleAddressEl = null;
  var simpleAddressInstance = null;
  var pendingCheckoutItems = [];
  var pendingVerificationEmail = "";
  var pendingVerificationUserId = 0;
  var pendingPasswordResetEmail = "";
  var memoryStore = {};
  var sessionState = { ready: false, user: null, promise: null };

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      memoryStore[key] = value;
    }
  }

  function storageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      delete memoryStore[key];
    }
  }

  function safeParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function normalizeSessionUser(user) {
    if (!user || typeof user !== "object") return null;
    var email = normalizeEmail(user.email);
    if (!email) return null;
    var normalized = {
      id: Number(user.id) || 0,
      name: String(user.name || "").trim(),
      email: email,
      status: String(user.status || "active")
    };
    [
      'phone',
      'region',
      'province',
      'municipality',
      'barangay',
      'street_type',
      'street_address',
      'address',
      'address_line',
      'street'
    ].forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(user, field)) {
        normalized[field] = String(user[field] || "").trim();
      }
    });
    if (normalized.province === "__special__") {
      normalized.province = "";
    }
    if (!normalized.street_address) {
      normalized.street_address = String(user.address || user.address_line || user.street || "").trim();
    }
    return normalized;
  }

  function setSessionUser(user) {
    sessionState.user = normalizeSessionUser(user);
    sessionState.ready = true;
    if (sessionState.user) {
      storageSet("bulakena_user_v1", JSON.stringify(sessionState.user));
      storageSet(SESSION_KEY, sessionState.user.email);
      storageSet("session_email", sessionState.user.email);
    } else {
      storageRemove("bulakena_user_v1");
      storageRemove(SESSION_KEY);
      storageRemove("session_email");
    }
    return sessionState.user;
  }

  function emitAuthSync() {
    storageSet(AUTH_SYNC_KEY, String(Date.now()));
    try {
      window.dispatchEvent(new CustomEvent("bulakena:auth-sync"));
    } catch (error) {
      // Ignore environments without CustomEvent support.
    }
  }

  function requestAuth(endpoint, payload) {
    if (!window.fetch) {
      return Promise.resolve({ success: false, message: "Fetch is not available in this browser." });
    }
    if (window.location.protocol === "file:") {
      return Promise.resolve({ success: false, message: "Run site from http://localhost." });
    }
    var formData = new FormData();
    Object.keys(payload || {}).forEach(function (key) {
      if (payload[key] !== undefined && payload[key] !== null) {
        formData.append(key, payload[key]);
      }
    });
    return fetch(endpoint, {
      method: "POST",
      body: formData,
      credentials: "same-origin"
    }).then(async function (response) {
      var rawText = "";
      try {
        rawText = await response.text();
      } catch (error) {
        return { success: false, message: "No response body was received from the server." };
      }

      if (!rawText) {
        return {
          success: false,
          message: response.statusText || "The server responded without a body.",
          status: response.status || 0
        };
      }

      try {
        return JSON.parse(rawText);
      } catch (error) {
        var textMessage = rawText.replace(/\s+/g, " ").trim();
        return {
          success: false,
          message: textMessage || "Invalid JSON response from server.",
          status: response.status || 0,
          rawResponse: textMessage
        };
      }
    }).catch(function () {
      return { success: false, message: endpoint + " could not be reached." };
    });
  }

  function refreshSession(options) {
    options = options || {};
    if (sessionState.promise) {
      if (options.silent) return sessionState.promise;
      return sessionState.promise.finally(updateNavAuthState);
    }
    if (!window.fetch || window.location.protocol === "file:") {
      sessionState.ready = true;
      if (!options.silent) updateNavAuthState();
      return Promise.resolve(sessionState.user);
    }
    sessionState.promise = fetch("api/session_check.php", {
      credentials: "same-origin"
    }).then(function (response) {
      return response.json().catch(function () {
        return { authenticated: false, user: null };
      });
    }).then(function (result) {
      var user = result && result.authenticated ? result.user : null;
      setSessionUser(user);
      return sessionState.user;
    }).catch(function () {
      sessionState.ready = true;
      return sessionState.user;
    }).finally(function () {
      sessionState.promise = null;
      if (!options.silent) {
        updateNavAuthState();
      }
    });
    return sessionState.promise;
  }

  function loginWithServer(email, password) {
    return requestAuth("api/login.php", {
      email: normalizeEmail(email),
      password: password
    }).then(function (result) {
      if (result && result.success) {
        setSessionUser(result.user || null);
        emitAuthSync();
      }
      return result;
    });
  }

  function registerWithServer(name, email, password, address) {
    var payload = {
      name: String(name || "").trim(),
      email: normalizeEmail(email),
      password: password
    };

    if (address && typeof address === "object") {
      payload.phone = String(address.phone || "").replace(/\D/g, "").slice(0, 11);
      payload.region = String(address.region || "").trim();
      payload.province = String(address.province || "").trim();
      payload.municipality = String(address.municipality || "").trim();
      payload.barangay = String(address.barangay || "").trim();
      payload.street_address = String(address.street_address || "").trim();
    }

    return requestAuth("api/register.php", payload);
  }

  function completeRegistrationWithServer(code) {
    return requestAuth("api/complete_registration.php", {
      code: String(code || "").trim()
    });
  }

  function verifyExistingAccountWithServer(userId, code) {
    return requestAuth("api/verify-code.php", {
      user_id: Number(userId) || 0,
      code: String(code || "").trim()
    });
  }

  var PSGC_API_BASE = "https://psgc.cloud/api";
  var signupAddressApiCache = {};
  var signupAddressInitPromise = null;
  var authSignupAddressBound = false;
  var authAccountAddressBound = false;

  function sortByName(items) {
    return items.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }

  function normalizeRegionName(name) {
    const regionName = String(name || '').trim();
    if (!regionName) return '';
    if (/^National Capital Region\b/i.test(regionName)) return 'Metro Manila';
    if (/^Cordillera Administrative Region\b/i.test(regionName)) return 'Cordillera Administrative Region';
    if (/^Bangsamoro Autonomous Region/i.test(regionName)) return 'Bangsamoro Autonomous Region in Muslim Mindanao';
    if (/^MIMAROPA Region\b/i.test(regionName)) return 'Mimaropa';
    const parenMatch = regionName.match(/\(([^)]+)\)/);
    if (parenMatch && parenMatch[1]) {
      return parenMatch[1].trim();
    }
    return regionName;
  }

  function getSelectedOption(selectId, root) {
    const scope = root || document;
    const select = scope.querySelector ? scope.querySelector("#" + selectId) : document.getElementById(selectId);
    return select && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
  }

  function fillAddressSelect(selectId, items, placeholder, getValue, getLabel, getCode) {
    const select = document.getElementById(selectId);
    const sortedItems = sortByName(items);
    if (!select) return;
    select.innerHTML = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder;
    select.appendChild(placeholderOption);

    sortedItems.forEach((item) => {
      const option = document.createElement('option');
      option.value = getValue(item);
      option.textContent = getLabel(item);
      option.dataset.code = getCode(item);
      select.appendChild(option);
    });

    select.disabled = false;
  }

  function resetAddressSelect(selectId, placeholder) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    select.appendChild(option);
    select.disabled = true;
  }

  function getCurrentRegionCode() {
    const option = getSelectedOption('region');
    return option ? option.dataset.code || '' : '';
  }

  function getCurrentProvinceCode() {
    const option = getSelectedOption('province');
    return option ? option.dataset.code || '' : '';
  }

  function getCurrentMunicipalityCode() {
    const option = getSelectedOption('municipality');
    return option ? option.dataset.code || '' : '';
  }

  async function apiFetchJson(url) {
    if (signupAddressApiCache[url]) return signupAddressApiCache[url];
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Request failed: ' + response.status);
    }
    const data = await response.json();
    signupAddressApiCache[url] = data;
    return data;
  }

  async function loadAddressData() {
    try {
      const regions = await apiFetchJson(`${PSGC_API_BASE}/regions`);

      fillAddressSelect(
        'region',
        Array.isArray(regions) ? regions : [],
        'Select region',
        (item) => normalizeRegionName(item.name),
        (item) => normalizeRegionName(item.name),
        (item) => item.code
      );

      const metroManilaOption = Array.from(document.getElementById('region').options).find((option) => option.value === 'Metro Manila');
      if (metroManilaOption) {
        metroManilaOption.selected = true;
        handleRegionChange();
      }
    } catch (error) {
      console.error('Failed to load address data:', error);
      const regionSelect = document.getElementById('region');
      regionSelect.innerHTML = '<option value="">Failed to load regions</option>';
      regionSelect.disabled = true;
    }
  }

  function handleRegionChange() {
    const regionCode = getCurrentRegionCode();
    resetAddressSelect('province', 'Select province');
    resetAddressSelect('municipality', 'Select province first');
    resetAddressSelect('barangay', 'Select municipality first');

    if (!regionCode) {
      return;
    }

      apiFetchJson(`${PSGC_API_BASE}/regions/${regionCode}/provinces`)
      .then((provinces) => {
        if (Array.isArray(provinces) && provinces.length) {
          fillAddressSelect('province', provinces, 'Select province', (item) => item.name, (item) => item.name, (item) => item.code);
          return;
        }

        return apiFetchJson(`${PSGC_API_BASE}/regions/${regionCode}/cities-municipalities`).then((municipalities) => {
          if (Array.isArray(municipalities) && municipalities.length) {
            fillAddressSelect('municipality', municipalities, 'Select municipality', (item) => item.name, (item) => item.name, (item) => item.code);
          }
        });
      });
  }

  function handleProvinceChange() {
    const regionCode = getCurrentRegionCode();
    const provinceCode = getCurrentProvinceCode();
    resetAddressSelect('municipality', 'Select municipality');
    resetAddressSelect('barangay', 'Select municipality first');

    if (!regionCode) return;

    if (provinceCode) {
      apiFetchJson(`${PSGC_API_BASE}/provinces/${provinceCode}/cities-municipalities`)
        .then((municipalities) => {
          if (Array.isArray(municipalities) && municipalities.length) {
            fillAddressSelect('municipality', municipalities, 'Select municipality', (item) => item.name, (item) => item.name, (item) => item.code);
          }
        });
      return;
    }

    apiFetchJson(`${PSGC_API_BASE}/regions/${regionCode}/cities-municipalities`)
      .then((municipalities) => {
        if (Array.isArray(municipalities) && municipalities.length) {
          fillAddressSelect('municipality', municipalities, 'Select municipality', (item) => item.name, (item) => item.name, (item) => item.code);
        }
      });
  }

  function handleMunicipalityChange() {
    const municipalityCode = getCurrentMunicipalityCode();
    resetAddressSelect('barangay', 'Select barangay');

    if (!municipalityCode) return;

    apiFetchJson(`${PSGC_API_BASE}/cities-municipalities/${municipalityCode}/barangays`)
      .then((barangays) => {
        if (Array.isArray(barangays) && barangays.length) {
          fillAddressSelect('barangay', barangays, 'Select barangay', (item) => item.name, (item) => item.name, (item) => item.code);
        }
      });
  }

  function initSignupAddressControls() {
    if (!modalEl) return;
    var signUpForm = modalEl.querySelector(".js-form-signup");
    if (!signUpForm) return;

    if (!authSignupAddressBound) {
      authSignupAddressBound = true;

      var regionSelect = document.getElementById('region');
      if (regionSelect) {
        regionSelect.addEventListener('change', function () {
          handleRegionChange();
        });
      }

      var provinceSelect = document.getElementById('province');
      if (provinceSelect) {
        provinceSelect.addEventListener('change', function () {
          handleProvinceChange();
        });
      }

      var municipalitySelect = document.getElementById('municipality');
      if (municipalitySelect) {
        municipalitySelect.addEventListener('change', function () {
          handleMunicipalityChange();
        });
      }

      var phoneInput = signUpForm.querySelector('#authSignUpPhone');
      if (phoneInput) {
        phoneInput.addEventListener('input', function (event) {
          event.target.value = event.target.value.replace(/\D/g, '').slice(0, 11);
        });
      }

      var signUpTab = modalEl.querySelector('[data-bs-target="#auth-signup"]');
      if (signUpTab && signUpTab.dataset.addressLoaderBound !== "1") {
        signUpTab.dataset.addressLoaderBound = "1";
        signUpTab.addEventListener('shown.bs.tab', function () {
          loadAddressData();
        });
      }
    }

    loadAddressData();
  }

  function resendVerificationCodeWithServer(email, userId) {
    var payload = {
      email: normalizeEmail(email)
    };
    if (Number(userId) > 0) {
      payload.user_id = Number(userId);
    }
    return requestAuth("api/resend-verification-code.php", payload);
  }

  function requestPasswordResetWithServer(email) {
    return requestAuth("api/forgot_password.php", {
      email: normalizeEmail(email)
    });
  }

  function completePasswordResetWithServer(email, code, newPassword) {
    return requestAuth("api/reset_password.php", {
      email: normalizeEmail(email),
      code: String(code || "").trim(),
      new_password: newPassword
    });
  }

  function logoutFromServer() {
    return requestAuth("api/logout.php", {}).then(function (result) {
      setSessionUser(null);
      emitAuthSync();
      return result;
    });
  }

  function getUsers() {
    var parsed = safeParse(storageGet(USERS_KEY), []);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function (entry) {
      return entry && typeof entry.email === "string" && typeof entry.password === "string";
    });
  }

  function saveUsers(users) {
    storageSet(USERS_KEY, JSON.stringify(users));
  }

  function getSessionEmail() {
    return sessionState.user && sessionState.user.email ? sessionState.user.email : "";
  }

  function setSessionEmail(email) {
    setSessionUser({
      id: sessionState.user && sessionState.user.id,
      name: sessionState.user && sessionState.user.name,
      email: email,
      status: sessionState.user && sessionState.user.status
    });
  }

  function clearSession() {
    setSessionUser(null);
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function getCartStorageKey() {
    var sessionEmail = normalizeEmail(getSessionEmail());
    if (!sessionEmail) {
      console.warn('[GET_CART_KEY] Session email is empty. Raw session:', getSessionEmail());
      return null;
    }
    var key = CART_KEY_PREFIX + sessionEmail;
    console.log('[GET_CART_KEY] Session email:', sessionEmail, 'Full key:', key);
    return key;
  }

  function getCartSelectionStorageKey() {
    var sessionEmail = normalizeEmail(getSessionEmail());
    if (!sessionEmail) return null;
    return CART_SELECTION_KEY_PREFIX + sessionEmail;
  }

  function getBuyerAddressesStorageKey() {
    var sessionEmail = normalizeEmail(getSessionEmail());
    if (!sessionEmail) return null;
    return BUYER_ADDRESSES_KEY_PREFIX + sessionEmail;
  }

  function getBuyerSelectedAddressStorageKey() {
    var sessionEmail = normalizeEmail(getSessionEmail());
    if (!sessionEmail) return null;
    return BUYER_SELECTED_ADDRESS_KEY_PREFIX + sessionEmail;
  }

  function getOrdersStorageKey() {
    var sessionEmail = normalizeEmail(getSessionEmail());
    if (!sessionEmail) return null;
    return "bulakena_orders_v1:" + sessionEmail;
  }

  function getUserOrders(user) {
    var who = user || getCurrentUser();
    if (!who || !who.email) return [];
    var key = getOrdersStorageKey();
    var raw = storageGet(key) || "[]";
    try { var parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; } catch (e) {}
    return [];
  }

  function addOrderForCurrentUser(order) {
    if (!order) return;
    var key = getOrdersStorageKey();
    if (!key) return;
    var list = getUserOrders();
    list.push(order);
    storageSet(key, JSON.stringify(list));
  }

  function renderOrdersPanel() {
    if (!ordersModalEl) return;
    var list = ordersModalEl.querySelector('.js-orders-list');
    var empty = ordersModalEl.querySelector('.orders-empty');
    if (!list || !empty) return;

    var orders = getUserOrders();
    if (!orders.length) {
      empty.classList.remove('d-none');
      list.innerHTML = '';
      return;
    }

    empty.classList.add('d-none');
    list.innerHTML = orders.map(function(o){
      var date = new Date(o.date).toLocaleString();
      var shipment = o.shipmentDate ? new Date(o.shipmentDate).toLocaleString() : 'TBD';
      var itemsHtml = (o.items||[]).map(function(i){
        var thumb = i.img ? '<img src="'+i.img+'" alt="'+truncateText(i.title,20)+'" style="width:54px;height:54px;object-fit:cover;border-radius:8px;vertical-align:middle;margin-right:12px;">' : '';
        return '<li class="order-item">'+thumb+'<div class="flex-grow-1"><div class="order-item-title">'+truncateText(i.title,60)+'</div><div class="order-item-sub">x'+i.qty+' ('+formatPeso(i.price)+')</div></div><div class="order-item-price">'+formatPeso((Number(i.price)||0)* (Number(i.qty)||1))+'</div></li>';
      }).join('');

      // simple status (no tracker)
      var status = String(o.status || '').trim().toLowerCase();
      var displayStatus = status ? (status.charAt(0).toUpperCase() + status.slice(1)) : '';
      // status badge color could be handled via CSS classes later if needed
      
      var stepsHtml = ''; // not used any more

      // map image placeholder (use provided map image if set on order)
      var mapSrc = o.mapImg ? o.mapImg : '../images/order-map.png';

      // show product image with title/desc/qty/total in header and chevron toggle
      var firstItem = (o.items && o.items.length) ? o.items[0] : null;
      var thumbHtml = '';
      if (firstItem && firstItem.img) {
        thumbHtml = '<div class="order-thumb-toggle js-order-img-toggle" title="Click to view product description" style="cursor:pointer;">' +
          '<img src="'+firstItem.img+'" alt="'+truncateText(firstItem.title,30)+'" style="width:72px;height:72px;object-fit:cover;border-radius:8px;display:block;margin:auto;">' +
        '</div>';
      } else {
        thumbHtml = '<div class="order-thumb-toggle js-order-img-toggle" title="Click to view product description" style="cursor:pointer;">' +
          '<div style="width:72px;height:72px;border-radius:8px;background:#f0f9f5;display:flex;align-items:center;justify-content:center;color:#2f8a6f;font-weight:700;">IMG</div>' +
        '</div>';
      }
      var firstDesc = firstItem && firstItem.desc ? truncateText(firstItem.desc,80) : (firstItem && firstItem.title ? truncateText(firstItem.title,80) : '');
      var firstQty = firstItem ? Number(firstItem.qty) || 0 : (o.items ? o.items.reduce(function(s,it){return s + (Number(it.qty)||0);},0) : 0);

      // details section now simplified: status text + order metadata
      var odDate = new Date(o.date).toLocaleString();
      var odShip = o.shipmentDate ? new Date(o.shipmentDate).toLocaleString() : 'TBD';
      var odDelivery = o.deliveryDate ? new Date(o.deliveryDate).toLocaleString() : 'TBD';
      return [
        '<article class="order-row p-2 border-bottom d-flex align-items-center justify-content-start">',
        '  <div class="d-flex align-items-center gap-3 w-100">',
        '    '+thumbHtml,
        '    <div class="order-header-content flex-grow-1">',
        '      <div class="order-header-title">'+truncateText(firstItem ? firstItem.title : 'Order', 60)+'</div>',
        '      <div class="order-header-desc d-none js-order-desc">'+firstDesc+'</div>',
        '      <div class="order-header-meta d-flex align-items-center gap-2 mt-2">',
        '        <span class="badge bg-light text-success">Qty: '+firstQty+'</span>',
        '        <div class="ms-auto fw-bold">Total: '+formatPeso(o.total)+'</div>',
        '      </div>',
        '    </div>',
        '    <div class="order-toggle-chevron ms-2" aria-hidden="true">',
        '      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9l6 6 6-6" stroke="#184b3f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        '    </div>',
        '  </div>',
        '</article>',
        '<div class="order-details d-none px-3 pb-2">',
        '  <div class="order-status-simple mb-2">Status: <span class="status-badge">'+displayStatus+'</span></div>',
        '  <div class="order-meta-info">',
        '    <div><strong>Order number:</strong> '+o.id+'</div>',
        '    <div><strong>Order date:</strong> '+odDate+'</div>',
        '    <div><strong>Shipment date:</strong> '+odShip+'</div>',
        '    <div><strong>Delivery date:</strong> '+odDelivery+'</div>',
        '  </div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function getCartSelectionMap() {
    var key = getCartSelectionStorageKey();
    if (!key) return {};
    var parsed = safeParse(storageGet(key), {});
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  }

  function saveCartSelectionMap(selectionMap) {
    var key = getCartSelectionStorageKey();
    if (!key) return;
    storageSet(key, JSON.stringify(selectionMap || {}));
  }

  function setCartItemSelected(itemId, isSelected) {
    var selectionMap = getCartSelectionMap();
    var key = String(itemId);
    if (isSelected) {
      selectionMap[key] = true;
    } else {
      delete selectionMap[key];
    }
    saveCartSelectionMap(selectionMap);
  }

  function clearCartSelections() {
    saveCartSelectionMap({});
  }

  function getBuyerAddresses() {
    var key = getBuyerAddressesStorageKey();
    if (!key) return [];
    var parsed = safeParse(storageGet(key), []);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(function (entry) {
        return {
          id: String(entry.id || ""),
          name: String(entry.name || "").trim(),
          phone: String(entry.phone || "").trim(),
          address: String(entry.address || "").trim(),
          addressDetails: String(entry.addressDetails || "").trim(),
          isDefault: !!entry.isDefault
        };
      })
      .filter(function (entry) {
        return entry.id && entry.name && entry.phone && entry.address;
      });
  }

  function saveBuyerAddresses(addresses) {
    var key = getBuyerAddressesStorageKey();
    if (!key) return;
    storageSet(key, JSON.stringify(addresses || []));
  }

  function getSelectedAddressId() {
    var key = getBuyerSelectedAddressStorageKey();
    if (!key) return "";
    return String(storageGet(key) || "");
  }

  function saveSelectedAddressId(addressId) {
    var key = getBuyerSelectedAddressStorageKey();
    if (!key) return;
    storageSet(key, String(addressId || ""));
  }

  function getSelectedAddress(addresses) {
    var list = Array.isArray(addresses) ? addresses : getBuyerAddresses();
    if (!list.length) return null;
    var selectedId = getSelectedAddressId();
    var selected = list.find(function (entry) { return entry.id === selectedId; }) || null;
    if (selected) return selected;
    return list.find(function (entry) { return entry.isDefault; }) || list[0];
  }

  function normalizePhoneDigits(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 11);
  }

  function normalizeProductSizes(rawSizes) {
    var parsed = rawSizes;
    if (typeof parsed === 'string') {
      var text = parsed.trim();
      if (!text) return [];
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return [];
      }
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.map(function(entry) {
      return {
        label: String(entry && (entry.label || entry.size || entry.name) || '').trim(),
        price: Number(entry && entry.price) || 0,
        stock: Math.max(0, Number(entry && entry.stock) || 0)
      };
    }).filter(function(entry) {
      return entry.label && entry.price >= 0;
    });
  }

  function resolveProductSelection(product) {
    var sizes = normalizeProductSizes(product && product.sizes);
    var selectedSize = product && product.selectedSize && typeof product.selectedSize === 'object'
      ? {
          label: String(product.selectedSize.label || '').trim(),
          price: Number(product.selectedSize.price),
          stock: Math.max(0, Number(product.selectedSize.stock) || 0)
        }
      : null;

    if (selectedSize && selectedSize.label && Number.isFinite(selectedSize.price) && selectedSize.price >= 0) {
      return selectedSize;
    }

    if (sizes.length) {
      return {
        label: sizes[0].label,
        price: sizes[0].price,
        stock: sizes[0].stock
      };
    }

    return null;
  }

  function buildCartItemKey(product, selectedSize) {
    var baseId = Number(product && product.id) || 0;
    var sizePart = selectedSize && selectedSize.label ? ('::' + selectedSize.label.toLowerCase()) : '';
    return String(baseId) + sizePart;
  }

  function getCartItems() {
    var key = getCartStorageKey();
    if (!key) {
      console.warn('[GET_CART_ITEMS] No storage key (session email missing?)');
      return [];
    }
    var rawValue = storageGet(key);
    console.log('[GET_CART_ITEMS] Key:', key, 'Raw value:', rawValue);
    var parsed = safeParse(rawValue, []);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(function (item) {
        var sizeLabel = String(item.sizeLabel || item.size_label || '').trim();
        var cartKey = String(item.cartKey || item.cart_key || '').trim();
        var numericId = Number(item.id);
        if (!cartKey) {
          cartKey = String(numericId || 0) + (sizeLabel ? ('::' + sizeLabel.toLowerCase()) : '');
        }
        return {
          id: numericId,
          cartKey: cartKey,
          title: String(item.title || ""),
          baseTitle: String(item.baseTitle || item.base_title || item.title || ""),
          desc: String(item.desc || ""),
          price: Number(item.price) || 0,
          qty: Math.max(1, Number(item.qty) || 1),
          img: resolvePublicAsset(item.img),
          sizeLabel: sizeLabel
        };
      })
      .filter(function (item) {
        return item.id > 0 && item.title.length > 0 && item.cartKey.length > 0;
      });
  }

  function saveCartItems(items) {
    var key = getCartStorageKey();
    if (!key) {
      console.warn('[SAVE_CART_ITEMS] No storage key (session email missing?)');
      return;
    }
    var jsonStr = JSON.stringify(items);
    console.log('[SAVE_CART_ITEMS] Key:', key, 'Items:', items, 'JSON:', jsonStr);
    storageSet(key, jsonStr);
  }

  function getCartCount(items) {
    return (items || getCartItems()).reduce(function (sum, item) {
      return sum + (Number(item.qty) || 0);
    }, 0);
  }

  function getCartTotal(items) {
    return (items || getCartItems()).reduce(function (sum, item) {
      return sum + ((Number(item.price) || 0) * (Number(item.qty) || 0));
    }, 0);
  }

  function formatPeso(value) {
    return "PHP " + (Number(value) || 0).toLocaleString();
  }

  function ensureCartMenuEntry() {
    var menus = document.querySelectorAll(".js-auth-menu .dropdown-menu");
    menus.forEach(function (menu) {
      if (menu.querySelector(".js-auth-cart")) return;
      var accountItem = menu.querySelector(".js-auth-account");
      if (!accountItem) return;

      var li = document.createElement("li");
      li.innerHTML = '<button type="button" class="dropdown-item auth-cart-link js-auth-cart">Cart <span class="badge text-bg-success rounded-pill js-cart-count d-none">0</span></button>';
      var accountLi = accountItem.closest("li");
      if (accountLi && accountLi.parentNode) {
        accountLi.parentNode.insertBefore(li, accountLi.nextSibling);
      } else {
        menu.appendChild(li);
      }
    });
  }

  function ensureOrdersMenuEntry() {
    var menus = document.querySelectorAll(".js-auth-menu .dropdown-menu");
    menus.forEach(function(menu){
      if (menu.querySelector(".js-auth-orders")) return;
      var accountItem = menu.querySelector(".js-auth-account");
      if (!accountItem) return;
      var li = document.createElement("li");
      li.innerHTML = '<button type="button" class="dropdown-item js-auth-orders">My Orders</button>';
      // attach listener immediately so it works when entry is added dynamically
      var btn = li.querySelector('.js-auth-orders');
      if (btn) btn.addEventListener('click', openOrdersModal);
      var accountLi = accountItem.closest("li");
      if (accountLi && accountLi.parentNode) {
        accountLi.parentNode.insertBefore(li, accountLi.nextSibling);
      } else {
        menu.appendChild(li);
      }
    });
  }

  function ensureAppointmentsMenuEntry() {
    var menus = document.querySelectorAll(".js-auth-menu .dropdown-menu");
    menus.forEach(function(menu){
      if (menu.querySelector(".js-auth-appointments")) return;
      var accountItem = menu.querySelector(".js-auth-account");
      if (!accountItem) return;
      var li = document.createElement('li');
      li.innerHTML = '<button type="button" class="dropdown-item js-auth-appointments">My Appointments</button>';
      var btn = li.querySelector('.js-auth-appointments');
      if (btn) btn.addEventListener('click', function(){ window.location.href = 'appointments.html'; });
      var accountLi = accountItem.closest("li");
      if (accountLi && accountLi.parentNode) {
        accountLi.parentNode.insertBefore(li, accountLi.nextSibling);
      } else {
        menu.appendChild(li);
      }
    });
  }

  function ensureProfileMenuHierarchy() {
    var menus = document.querySelectorAll(".js-auth-menu .dropdown-menu");
    menus.forEach(function(menu) {
      var headerItem = menu.querySelector(".js-auth-email");
      var accountItem = menu.querySelector(".js-auth-account");
      var cartItem = menu.querySelector(".js-auth-cart");
      var appointmentsItem = menu.querySelector(".js-auth-appointments");
      var ordersItem = menu.querySelector(".js-auth-orders");
      var signoutItem = menu.querySelector(".js-auth-signout");

      var headerLi = headerItem ? headerItem.closest("li") : null;
      var accountLi = accountItem ? accountItem.closest("li") : null;
      var cartLi = cartItem ? cartItem.closest("li") : null;
      var appointmentsLi = appointmentsItem ? appointmentsItem.closest("li") : null;
      var ordersLi = ordersItem ? ordersItem.closest("li") : null;
      var signoutLi = signoutItem ? signoutItem.closest("li") : null;

      [headerLi, accountLi, cartLi, appointmentsLi, ordersLi, signoutLi].forEach(function(li) {
        if (li) menu.appendChild(li);
      });
    });
  }

  function updateCartBadge() {
    var user = getCurrentUser();
    var count = user ? getCartCount() : 0;
    var badges = document.querySelectorAll(".js-cart-count");
    badges.forEach(function (badge) {
      badge.textContent = String(count);
      badge.classList.toggle("d-none", count <= 0);
    });
  }

  function changeCartQty(itemId, delta) {
    var items = getCartItems();
    var idx = items.findIndex(function (item) { return String(item.cartKey) === String(itemId); });
    if (idx < 0) return;
    items[idx].qty = Math.max(1, (Number(items[idx].qty) || 1) + Number(delta || 0));
    saveCartItems(items);
    renderCartPanel();
    updateCartBadge();
  }

  function removeCartItem(itemId) {
    setCartItemSelected(itemId, false);
    var items = getCartItems().filter(function (item) {
      return String(item.cartKey) !== String(itemId);
    });
    saveCartItems(items);
    renderCartPanel();
    updateCartBadge();
  }

  function clearCartItems() {
    saveCartItems([]);
    clearCartSelections();
    renderCartPanel();
    updateCartBadge();
  }

  function getSelectedCartItems(items) {
    var selectionMap = getCartSelectionMap();
    return (items || getCartItems()).filter(function (item) {
      return !!selectionMap[String(item.cartKey)];
    });
  }

  function getSelectedCartTotal(items) {
    return getSelectedCartItems(items).reduce(function (sum, item) {
      return sum + ((Number(item.price) || 0) * (Number(item.qty) || 0));
    }, 0);
  }

  function truncateText(text, maxLength) {
    var source = String(text || "").trim();
    if (source.length <= maxLength) return source;
    return source.slice(0, Math.max(0, maxLength - 3)).trimEnd() + "...";
  }

  function checkoutSelectedItems() {
    var items = getCartItems();
    var selectedItems = getSelectedCartItems(items);
    if (!selectedItems.length) {
      showToast("Select at least one product to checkout.", "error");
      return;
    }
    pendingCheckoutItems = selectedItems.slice();
    if (cartModalInstance) {
      cartModalInstance.hide();
    }
    openSimpleOrderSummaryModal();
  }

  function finalizeCheckout(selectedItems, orderRef) {
    // record order for history (this function assumes stock has been validated)
    if (selectedItems && selectedItems.length) {
      var total = selectedItems.reduce(function(sum,item){return sum + ((Number(item.price)||0)*(Number(item.qty)||0));}, 0) + (selectedItems.length ? 120 : 0);
      var order = {
        id: String(orderRef || ''),
        date: new Date().toISOString(),
        shipmentDate: new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)).toISOString(),
        deliveryDate: new Date(Date.now() + (5 * 24 * 60 * 60 * 1000)).toISOString(),
        items: selectedItems.map(function(i){ return {id:i.id, cartKey:i.cartKey, title:i.title, baseTitle:i.baseTitle, sizeLabel:i.sizeLabel, qty:i.qty, price:i.price, img:i.img, type:i.type || '', category:i.category || ''}; }),
        total: total,
        status: 'pending'
      };
      addOrderForCurrentUser(order);
    }

    var items = getCartItems();
    var selectedIds = {};
    selectedItems.forEach(function (item) { selectedIds[String(item.cartKey)] = true; });

    var remainingItems = items.filter(function (item) { return !selectedIds[String(item.cartKey)]; });
    saveCartItems(remainingItems);
    clearCartSelections();
    updateCartBadge();
    renderCartPanel();
    showToast("Checkout complete for " + selectedItems.length + " item(s).", "success");
  }

  // Validate stock availability for selected items before checkout.
  // Returns a Promise that resolves to { ok: true } or { ok: false, problems: [...] }
  function checkStockForItems(selectedItems) {
    return new Promise(function (resolve) {
      if (!Array.isArray(selectedItems) || selectedItems.length === 0) return resolve({ ok: true });
      // Fetch current products from server and compare stocks
      fetch('api/get_products.php')
        .then(function (r) { return r.text(); })
        .then(function (txt) {
          try {
            var list = JSON.parse(txt);
            var map = {};
            if (Array.isArray(list)) {
              list.forEach(function (p) { map[String(p.id)] = p; });
            } else if (list && typeof list === 'object') {
              map[String(list.id)] = list;
            }

            var problems = [];
            selectedItems.forEach(function (it) {
              var id = String(it.id);
              var needed = Number(it.qty) || 0;
              var product = typeof map[id] !== 'undefined' ? map[id] : null;
              var avail = null;
              if (product) {
                var sizes = normalizeProductSizes(product.sizes || product.sizes_json);
                if (it.sizeLabel && sizes.length) {
                  var matched = sizes.find(function (entry) {
                    return String(entry.label).toLowerCase() === String(it.sizeLabel).toLowerCase();
                  }) || null;
                  avail = matched ? Number(matched.stock || 0) : 0;
                } else {
                  avail = Number(product.stock || 0);
                }
              }
              if (avail === null) {
                // unknown product - treat as unavailable
                problems.push({ id: it.id, title: it.title, available: 0, requested: needed });
              } else if (avail <= 0) {
                problems.push({ id: it.id, title: it.title, available: avail, requested: needed });
              } else if (needed > avail) {
                problems.push({ id: it.id, title: it.title, available: avail, requested: needed });
              }
            });

            if (problems.length) return resolve({ ok: false, problems: problems });
            return resolve({ ok: true });
          } catch (e) {
            console.error('Failed to parse products JSON for stock check:', e, txt);
            return resolve({ ok: true });
          }
        })
        .catch(function (err) {
          console.error('Network error fetching products for stock check:', err);
          // fail-open: allow checkout if products endpoint not reachable
          return resolve({ ok: true });
        });
    });
  }

  function openSimpleOrderSummaryModal() {
    ensureSimpleOrderSummaryModal();
    renderSimpleOrderSummary();
    if (simpleOrderSummaryInstance) simpleOrderSummaryInstance.show();
  }

  function startPayMongoQRPHCheckout(payload) {
    var checkoutData = {
      total: Number(payload && payload.total) || 0,
      items: Array.isArray(payload && payload.items) ? payload.items : [],
      shipping_fee: Number(payload && payload.shipping_fee) || 0,
      order_ref: String((payload && payload.order_ref) || ''),
      customer_name: String((payload && payload.customer_name) || ''),
      customer_email: String((payload && payload.customer_email) || ''),
      customer_phone: String((payload && payload.customer_phone) || ''),
      customer_address: String((payload && payload.customer_address) || ''),
      delivery_type: String((payload && payload.delivery_type) || 'delivery')
    };
    [
      'email', 'phone', 'firstName', 'lastName', 'address', 'apartment', 'city',
      'barangay', 'municipality', 'province', 'postalCode', 'country', 'region',
      'deliveryType', 'shippingFee'
    ].forEach(function (key) {
      if (payload && Object.prototype.hasOwnProperty.call(payload, key)) {
        checkoutData[key] = payload[key];
      }
    });

    return fetch('api/create-checkout.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(checkoutData)
    }).then(function (response) {
      return response.text().then(function (text) {
        var parsed = text ? safeParse(text, null) : null;
        if (!response.ok || !parsed || !parsed.success) {
          throw new Error((parsed && parsed.message) || 'Unable to start QRPH checkout.');
        }
        if (!parsed.checkout_url) {
          throw new Error('PayMongo did not return a checkout URL.');
        }
        return parsed;
      });
    });
  }

  function ensureSimpleOrderSummaryModal() {
    if (simpleOrderSummaryEl) return;
    var html = [
      '<div class="modal fade" id="simpleOrderSummaryModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-dialog-centered modal-lg profile-modal-dialog">',
      '    <div class="modal-content profile-modal-card">',
      '      <div class="profile-modal-head d-flex align-items-center justify-content-between">',
      '        <button type="button" class="btn profile-modal-back js-simple-back-cart" aria-label="Back"><</button>',
      '        <div class="text-center flex-grow-1">',
      '          <p class="profile-modal-kicker mb-1">Checkout</p>',
      '          <h5 class="modal-title mb-0">Order summary</h5>',
      '        </div>',
      '        <div style="width:40px;"></div>',
      '      </div>',
      '      <div class="modal-body pt-3">',
      '        <section class="mb-3">',
            '          <div class="js-simple-address-preview mt-2" style="border:1px solid #cfe6df; background:#f7fffc; border-radius:12px; padding:10px;"></div>',
      '        </section>',
      '        <section class="mb-2">',
      '          <h6 class="mb-2">Product details</h6>',
      '          <div class="js-simple-items" style="max-height:40vh; overflow:auto;"></div>',
      '        </section>',
      '        <div class="d-flex align-items-center justify-content-between py-2 border-top">',
      '          <span>Shipping fee</span>',
      '          <span class="js-simple-ship">PHP 0</span>',
      '        </div>',
      '        <div class="d-flex align-items-center justify-content-between py-2">',
      '          <small class="text-muted js-simple-count">0 item(s)</small>',
      '          <strong class="js-simple-total">PHP 0</strong>',
      '        </div>',
      '        <div class="d-flex justify-content-end">',
      '      </div>',
      '      <div class="profile-modal-footer d-flex justify-content-end">',
      '          <button type="button" class="btn btn-success btn-sm js-simple-place">Place order</button>',
      '      </div>',
      '      <button type="button" class="btn-close profile-modal-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.insertAdjacentHTML('beforeend', html);
    simpleOrderSummaryEl = document.getElementById('simpleOrderSummaryModal');
    if (simpleOrderSummaryEl && window.bootstrap && window.bootstrap.Modal) {
      simpleOrderSummaryInstance = window.bootstrap.Modal.getOrCreateInstance(simpleOrderSummaryEl);
    }

    if (!simpleOrderSummaryEl) return;

    simpleOrderSummaryEl.addEventListener('click', function (event) {
      var addAddr = event.target.closest('.js-simple-add-address');
      if (addAddr) {
        openSimpleAddressModal('');
        return;
      }
      var editAddr = event.target.closest('.js-simple-edit-address');
      if (editAddr) {
        var id = String(editAddr.dataset.id || '');
        openSimpleAddressModal(id);
        return;
      }
      var backToCart = event.target.closest('.js-simple-back-cart');
      if (backToCart) {
        if (simpleOrderSummaryInstance) simpleOrderSummaryInstance.hide();
        if (cartModalInstance) cartModalInstance.show();
        return;
      }
      var place = event.target.closest('.js-simple-place');
      if (place) {
        var addr = getSelectedAddress();
        if (!addr) { showToast('Please add and select a shipping address.', 'error'); return; }
        var items = pendingCheckoutItems && pendingCheckoutItems.length ? pendingCheckoutItems.slice() : getSelectedCartItems();
        if (!items.length) { showToast('No selected items to place.', 'error'); return; }
        // Validate stock before finalizing
        checkStockForItems(items).then(function(result){
          if (!result || !result.ok) {
            // build helpful message
            var msg = 'Some items are out of stock or have insufficient quantity:\n';
            (result && result.problems || []).forEach(function(p){ msg += '- ' + (p.title || ('#'+p.id)) + ' (available: ' + p.available + ', requested: ' + p.requested + ')\n'; });
            alert(msg);
            showToast('Cannot place order: some items unavailable', 'error');
            return;
          }
          // all good - finalize
          finalizeCheckout(items);
          if (simpleOrderSummaryInstance) simpleOrderSummaryInstance.hide();
        }).catch(function(e){
          console.error('Stock validation error:', e);
          // On validation error, fail-safe by not blocking checkout (or change to block)
          showToast('Could not validate stock; please try again later', 'error');
        });
        return;
      }
    });
  }

  function renderSimpleOrderSummary() {
    if (!simpleOrderSummaryEl) return;
    var tiles = simpleOrderSummaryEl.querySelector('.js-simple-items');
    var totalEl = simpleOrderSummaryEl.querySelector('.js-simple-total');
    var countEl = simpleOrderSummaryEl.querySelector('.js-simple-count');
    var shipEl = simpleOrderSummaryEl.querySelector('.js-simple-ship');
    var addrPrev = simpleOrderSummaryEl.querySelector('.js-simple-address-preview');
    if (!tiles || !totalEl || !countEl || !shipEl || !addrPrev) return;

    var items = pendingCheckoutItems && pendingCheckoutItems.length ? pendingCheckoutItems.slice() : getSelectedCartItems();
    var totalQty = 0, original = 0;
    tiles.innerHTML = items.map(function (item) {
      var qty = Number(item.qty) || 0; totalQty += qty; var price = Number(item.price) || 0; original += price * qty;
      var title = truncateText(String(item.title||''), 50).replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return [
        '<article class="d-flex align-items-center gap-2 py-2">',
        '  <img src="'+item.img+'" alt="'+title+'" style="width:56px;height:56px;object-fit:cover;border-radius:8px;">',
        '  <div class="flex-grow-1">',
        '    <div class="fw-semibold">'+title+'</div>',
        '    <div class="text-success fw-bold">'+formatPeso(price)+'</div>',
        '  </div>',
        '  <div class="text-muted">x '+qty+'</div>',
        '</article>'
      ].join('');
    }).join('');

    var shippingFee = items.length ? 120 : 0;
    shipEl.textContent = formatPeso(shippingFee);
    countEl.textContent = totalQty + ' item(s)';
    totalEl.textContent = formatPeso(original + shippingFee);

    var addr = getSelectedAddress();
    if (!addr) {
      addrPrev.innerHTML = '<button type="button" class="btn w-100 js-simple-add-address" style="background:#efefef; border-radius:999px; padding:12px 16px; font-weight:700;">+ Add shipping address</button>';
    } else {
      var full = addr.address + (addr.addressDetails ? (', ' + addr.addressDetails) : '');
      addrPrev.innerHTML = [
        '<article class="d-flex flex-column gap-1">',
        '  <div class="d-flex align-items-center justify-content-between">',
        '    <div class="d-flex align-items-center gap-2">',
        '      <span aria-hidden="true">Address</span>',
        '      <strong>'+addr.name+'</strong>',
        '    </div>',
        '    <div class="d-flex align-items-center gap-2">',
        '      <small class="text-muted">'+addr.phone+'</small>',
        '      <button type="button" class="btn btn-sm btn-outline-secondary js-simple-edit-address" data-id="'+addr.id+'">Edit</button>',
        '    </div>',
        '  </div>',
        '  <small>'+full+'</small>',
        '</article>'
      ].join('');
    }
  }

  function openSimpleAddressModal(addressId) {
    ensureSimpleAddressModal();
    var form = simpleAddressEl.querySelector('.js-simple-address-form');
    if (form) {
      var data = null;
      if (addressId) {
        var list = getBuyerAddresses();
        data = list.find(function(x){return x.id===addressId;}) || null;
      }
      // Reuse resetAddressForm: map names
      var tmp = {
        id: data ? data.id : '',
        name: data ? data.name : '',
        phone: data ? normalizePhoneDigits(data.phone) : '',
        address: data ? data.address : '',
        addressDetails: data ? data.addressDetails : '',
        isDefault: data ? !!data.isDefault : false
      };
      // Fill form
      form.querySelector('[name="address_id"]').value = tmp.id || '';
      form.querySelector('[name="buyer_name"]').value = tmp.name || '';
      form.querySelector('[name="buyer_phone"]').value = tmp.phone || '';
      form.querySelector('[name="buyer_address"]').value = tmp.address || '';
      form.querySelector('[name="buyer_address_details"]').value = tmp.addressDetails || '';
    }
    if (simpleAddressInstance) simpleAddressInstance.show();
  }

  function ensureSimpleAddressModal() {
    if (simpleAddressEl) return;
    var html = [
      '<div class="modal fade" id="simpleAddressModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-dialog-centered modal-md profile-modal-dialog">',
      '    <div class="modal-content profile-modal-card">',
      '      <div class="profile-modal-head d-flex align-items-center justify-content-between">',
      '        <button type="button" class="btn profile-modal-back js-simple-addr-back" aria-label="Back"><</button>',
      '        <div class="text-center flex-grow-1">',
      '          <p class="profile-modal-kicker mb-1">Checkout</p>',
      '          <h5 class="modal-title mb-0">Add new address</h5>',
      '        </div>',
      '        <div style="width:40px;"></div>',
      '      </div>',
      '      <div class="modal-body pt-3">',
      '        <form class="js-simple-address-form">',
      '          <input type="hidden" name="address_id" value="">',
      '          <div class="mb-2">',
      '            <label class="form-label fw-semibold">Name</label>',
      '            <input type="text" name="buyer_name" class="form-control" placeholder="Name" required>',
      '          </div>',
      '          <div class="mb-2">',
      '            <label class="form-label fw-semibold">Phone number</label>',
      '            <div class="input-group">',
      '              <span class="input-group-text">PH +63</span>',
      '              <input type="text" name="buyer_phone" class="form-control" placeholder="Enter a valid phone number" inputmode="numeric" autocomplete="tel" maxlength="11" pattern="[0-9]{11}" title="Enter exactly 11 digits" required>',
      '            </div>',
      '          </div>',
      '          <div class="mb-2">',
      '            <label class="form-label fw-semibold">Address</label>',
      '            <input type="text" name="buyer_address" class="form-control" placeholder="Select address" required>',
      '          </div>',
            '          <div class="mb-2">',
      '            <label class="form-label fw-semibold">Address details</label>',
      '            <input type="text" name="buyer_address_details" class="form-control" placeholder="Enter other details (optional)">',
      '          </div>',
                  '          <div class="d-grid">',
      '            <button type="submit" class="btn btn-success btn-sm">Save</button>',
      '          </div>',
      '        </form>',
      '      </div>',
      '      <button type="button" class="btn-close profile-modal-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.insertAdjacentHTML('beforeend', html);
    simpleAddressEl = document.getElementById('simpleAddressModal');
    if (simpleAddressEl && window.bootstrap && window.bootstrap.Modal) {
      simpleAddressInstance = window.bootstrap.Modal.getOrCreateInstance(simpleAddressEl);
    }

    if (!simpleAddressEl) return;

    simpleAddressEl.addEventListener('click', function (event) {
      var backBtn = event.target.closest('.js-simple-addr-back');
      if (backBtn) {
        if (simpleAddressInstance) simpleAddressInstance.hide();
        if (simpleOrderSummaryInstance) simpleOrderSummaryInstance.show();
        return;
      }
          });

    var form = simpleAddressEl.querySelector('.js-simple-address-form');
    if (form) {
      var phoneInput = form.querySelector('[name="buyer_phone"]');
      if (phoneInput) {
        phoneInput.addEventListener('input', function () {
          this.value = normalizePhoneDigits(this.value);
        });
      }
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var addressId = String(form.querySelector('[name="address_id"]').value || '');
        var name = String(form.querySelector('[name="buyer_name"]').value || '').trim();
        var phone = normalizePhoneDigits(form.querySelector('[name="buyer_phone"]').value || '');
        var address = String(form.querySelector('[name="buyer_address"]').value || '').trim();
        var addressDetails = String(form.querySelector('[name="buyer_address_details"]').value || '').trim();
        var isDefault = false;
        if (!name || !phone || !address) { showToast('Name, phone number, and address are required.', 'error'); return; }
        if (phone.length !== 11) { showToast('Phone number must contain exactly 11 digits.', 'error'); return; }

        var addresses = getBuyerAddresses();
        var targetId = addressId || ('addr_' + Date.now() + '_' + Math.floor(Math.random()*1000));
        var found = false;
        addresses = addresses.map(function (entry) {
          if (entry.id !== targetId) return entry;
          found = true;
          return { id: targetId, name: name, phone: phone, address: address, addressDetails: addressDetails, isDefault: isDefault };
        });
        if (!found) {
          addresses.push({ id: targetId, name: name, phone: phone, address: address, addressDetails: addressDetails, isDefault: isDefault });
        }
        // Default address handling removed for simplified theme
        saveBuyerAddresses(addresses);
        saveSelectedAddressId(targetId);
        if (simpleAddressInstance) simpleAddressInstance.hide();
        renderSimpleOrderSummary();
        showToast('Address saved.', 'success');
      });
    }
  }

  function resetAddressForm(formEl, address) {
    if (!formEl) return;
    var data = address || {};
    formEl.querySelector('[name="address_id"]').value = data.id || "";
    formEl.querySelector('[name="buyer_name"]').value = data.name || "";
    formEl.querySelector('[name="buyer_phone"]').value = normalizePhoneDigits(data.phone || "");
    formEl.querySelector('[name="buyer_address"]').value = data.address || "";
    formEl.querySelector('[name="buyer_address_details"]').value = data.addressDetails || "";
    formEl.querySelector('[name="buyer_default"]').value = data.isDefault ? "1" : "0";

    var setDefaultBtn = formEl.querySelector(".js-order-set-default");
    if (setDefaultBtn) {
      var isDefaultActive = formEl.querySelector('[name="buyer_default"]').value === "1";
      setDefaultBtn.dataset.default = isDefaultActive ? "1" : "0";
      setDefaultBtn.textContent = isDefaultActive ? "Default Address Enabled" : "Set as Default Address";
      setDefaultBtn.classList.toggle("active", isDefaultActive);
    }
  }

  function renderAddressList() {
    if (!orderSummaryModalEl) return;
    var listWrap = orderSummaryModalEl.querySelector(".js-order-address-list");
    if (!listWrap) return;

    var addresses = getBuyerAddresses();
    var selected = getSelectedAddress(addresses);
    if (!addresses.length) {
      listWrap.innerHTML = '<p class="mb-0 text-muted">No saved addresses yet. Click + to add one.</p>';
      return;
    }

    listWrap.innerHTML = addresses.map(function (entry) {
      var fullAddress = entry.address + (entry.addressDetails ? (", " + entry.addressDetails) : "");
      var checkedAttr = selected && selected.id === entry.id ? " checked" : "";
      return [
        '<article class="order-address-item">',
        '  <label class="order-address-pick">',
        '    <input type="radio" name="order_address_pick" class="form-check-input js-order-address-pick" data-id="' + entry.id + '"' + checkedAttr + '>',
        '    <span class="order-address-content">',
        '      <strong>' + entry.name + "</strong>",
        '      <small>' + entry.phone + "</small>",
        '      <small>' + fullAddress + (entry.isDefault ? " (Default)" : "") + "</small>",
        "    </span>",
        "  </label>",
        '  <button type="button" class="btn btn-sm btn-outline-secondary js-order-edit-address" data-id="' + entry.id + '">Edit</button>',
        "</article>"
      ].join("");
    }).join("");
  }

  function renderOrderSummaryModal() {
    if (!orderSummaryModalEl) return;

    var buyerFormWrap = orderSummaryModalEl.querySelector(".js-order-buyer-form-wrap");
    var buyerForm = orderSummaryModalEl.querySelector(".js-order-buyer-form");
    var modalTitleEl = orderSummaryModalEl.querySelector(".js-order-modal-title");
    var topRow = orderSummaryModalEl.querySelector(".js-order-top-row");
    if (!buyerFormWrap || !buyerForm) return;

    buyerFormWrap.classList.add("d-none");
    if (modalTitleEl) modalTitleEl.textContent = "Your Addresses";
    if (topRow) topRow.classList.remove("d-none");
    resetAddressForm(buyerForm, null);
    renderSelectedAddressPreview();
  }

  function openOrderSummaryModal() {
    ensureOrderSummaryModal();
    renderOrderSummaryModal();
    renderSelectedAddressPreview();
    renderOrderItemsSummary();
    if (orderSummaryModalInstance) {
      orderSummaryModalInstance.show();
    }
  }

  function ensureOrderSummaryModal() {
    if (orderSummaryModalEl) return;
    var html = [
      '<div class="modal fade" id="orderSummaryModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-dialog-centered modal-lg profile-modal-dialog profile-order-dialog">',
      '    <div class="modal-content profile-modal-card">',
      '      <div class="profile-modal-head">',
      '        <p class="profile-modal-kicker mb-1">Checkout</p>',
      '        <h5 class="modal-title mb-1 js-order-modal-title">Your Addresses</h5>',
      '        <p class="profile-modal-subtitle mb-0">Confirm your shipping address and items.</p>',
      "      </div>",
      '      <div class="modal-body pt-3">',
      '        <section class="order-buyer-card mb-3">',
      '          <div class="order-buyer-top js-order-top-row d-flex align-items-center justify-content-between gap-2 flex-wrap">',
      '            <h6 class="mb-0">Shipping Address</h6>',
      '            <div class="d-flex align-items-center gap-2">',
      '              <button type="button" class="btn order-buyer-plus js-order-toggle-buyer" aria-label="Add buyer info" style="border-radius: 10px; padding: 6px 10px; border: 2px solid #17A382; color: #0f5132; background: #D9FFF6; font-weight: 600;">+ Add shipping address</button>',
      '            </div>',
      "          </div>",
      '          <div class="js-order-address-preview mt-2" style="border:1px solid #cfe6df; background:#f7fffc; border-radius:12px; padding:10px;"></div>',
      '          <div class="js-order-buyer-form-wrap d-none mt-2">',
      '            <form class="js-order-buyer-form">',
      '              <div class="row g-2">',
      '                <input type="hidden" name="address_id" value="">',
      '                <div class="col-md-6"><input type="text" name="buyer_name" class="form-control" placeholder="Name" required></div>',
      '                <div class="col-md-6"><input type="text" name="buyer_phone" class="form-control" placeholder="Phone number" inputmode="numeric" autocomplete="tel" maxlength="11" pattern="[0-9]{11}" title="Enter exactly 11 digits" required></div>',
      '                <div class="col-12"><input type="text" name="buyer_address" class="form-control" placeholder="Address" required></div>',
      '                <div class="col-12"><input type="text" name="buyer_address_details" class="form-control" placeholder="Address details (optional)"></div>',
      '                <div class="col-12 d-flex align-items-center gap-2"><button type="button" class="btn btn-outline-success btn-sm js-order-set-default" data-default="0">Set as Default Address</button><input type="hidden" name="buyer_default" value="0"></div>',
      "              </div>",
      '              <div class="d-flex gap-2 mt-2">',
      '                <button type="submit" class="btn btn-success btn-sm">Save</button>',
      '                <button type="button" class="btn btn-outline-secondary btn-sm js-order-cancel-form">Cancel</button>',
      "              </div>",
      "            </form>",
      "          </div>",
      "        </section>",
      '        <section class="order-items-card">',
      '          <div class="d-flex align-items-center justify-content-between mb-2">',
      '            <h6 class="mb-0 js-tt-seller-name">Bulakena Garden</h6>',
      '            <button type="button" class="btn btn-link btn-sm text-muted" disabled>Add note</button>',
      '          </div>',
      '          <div class="js-tt-items-list" style="max-height:40vh; overflow:auto;"></div>',
      '          <div class="d-flex align-items-center justify-content-between py-2 border-top js-tt-seller-discount">',
      '            <span class="fw-semibold">Seller discount</span>',
      '            <span class="text-danger js-tt-seller-discount-amt">-PHP 0</span>',
      '          </div>',
      '          <div class="d-flex align-items-center justify-content-between py-2 border-top js-tt-platform-discount">',
      '            <span class="fw-semibold">Platform discount</span>',
      '            <span class="text-danger js-tt-platform-discount-amt">-PHP 0</span>',
      '          </div>',
      '          <div class="js-tt-breakdown mt-2"></div>',
      '          <div class="d-flex align-items-center justify-content-between py-2 border-top">',
      '            <span>Shipping fee</span>',
      '            <span class="js-tt-shipping-fee-amt">PHP 0</span>',
      '          </div>',
      '          <div class="alert alert-light border d-none js-tt-savings mt-2" role="alert">',
      "            <strong>Congrats!</strong> You're saving <span class=\"js-tt-savings-amt\">PHP 0</span> on this order.",
      '          </div>',
      '          <div class="order-items-footer d-flex align-items-center justify-content-between mt-2">',
      '            <small class="text-muted js-order-items-count">0 item(s)</small>',
      '            <div class="d-flex align-items-center gap-3">',
      '              <strong class="js-order-items-total">PHP 0</strong>',
      '              <button type="button" class="btn btn-success btn-sm js-order-place">Place Order</button>',
      '            </div>',
      '          </div>',
      '        </section>',
      "      </div>",
      '      <button type="button" class="btn profile-modal-back js-order-back" aria-label="Back"><</button>',
      '      <button type="button" class="btn-close profile-modal-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      "    </div>",
      "  </div>",
      "</div>"
    ].join("");

    document.body.insertAdjacentHTML("beforeend", html);
    orderSummaryModalEl = document.getElementById("orderSummaryModal");
    if (orderSummaryModalEl && window.bootstrap && window.bootstrap.Modal) {
      orderSummaryModalInstance = window.bootstrap.Modal.getOrCreateInstance(orderSummaryModalEl);
    }

    if (!orderSummaryModalEl) return;

    orderSummaryModalEl.addEventListener("click", function (event) {
      var toggleBtn = event.target.closest(".js-order-toggle-buyer");
      if (toggleBtn) {
        openAddressFormModal("");
        return;
      }

      var backBtn = event.target.closest(".js-order-back");
      if (backBtn) {
        var activeFormWrap = orderSummaryModalEl.querySelector(".js-order-buyer-form-wrap");
        var activeListWrap = orderSummaryModalEl.querySelector(".js-order-address-list");
        var modalTitleEl = orderSummaryModalEl.querySelector(".js-order-modal-title");
        var topRow = orderSummaryModalEl.querySelector(".js-order-top-row");
        var formVisible = activeFormWrap && !activeFormWrap.classList.contains("d-none");
        if (formVisible) {
          if (activeFormWrap) activeFormWrap.classList.add("d-none");
          if (activeListWrap) activeListWrap.classList.add("d-none");
          renderSelectedAddressPreview();
          if (modalTitleEl) modalTitleEl.textContent = "Your Addresses";
          if (topRow) topRow.classList.remove("d-none");
        } else {
          if (orderSummaryModalInstance) orderSummaryModalInstance.hide();
          if (cartModalInstance) cartModalInstance.show();
        }
        return;
      }

      var cancelFormBtn = event.target.closest(".js-order-cancel-form");
      if (cancelFormBtn) {
        var cancelFormWrap = orderSummaryModalEl.querySelector(".js-order-buyer-form-wrap");
        var cancelListWrap = orderSummaryModalEl.querySelector(".js-order-address-list");
        var modalTitleEl = orderSummaryModalEl.querySelector(".js-order-modal-title");
        var topRow = orderSummaryModalEl.querySelector(".js-order-top-row");
        if (cancelFormWrap) cancelFormWrap.classList.add("d-none");
        if (cancelListWrap) cancelListWrap.classList.add("d-none");
        renderSelectedAddressPreview();
        if (modalTitleEl) modalTitleEl.textContent = "Your Addresses";
        if (topRow) topRow.classList.remove("d-none");
        return;
      }

      var editBtn = event.target.closest(".js-order-edit-address");
      if (editBtn) {
        var editId = String(editBtn.dataset.id || "");
        openAddressFormModal(editId);
        return;
      }

      var setDefaultBtn = event.target.closest(".js-order-set-default");
      if (setDefaultBtn) {
        var buyerFormEl = orderSummaryModalEl.querySelector(".js-order-buyer-form");
        var defaultInput = buyerFormEl ? buyerFormEl.querySelector('[name="buyer_default"]') : null;
        if (!defaultInput) return;
        var nextIsDefault = defaultInput.value !== "1";
        defaultInput.value = nextIsDefault ? "1" : "0";
        setDefaultBtn.dataset.default = nextIsDefault ? "1" : "0";
        setDefaultBtn.textContent = nextIsDefault ? "Default Address Enabled" : "Set as Default Address";
        setDefaultBtn.classList.toggle("active", nextIsDefault);
        return;
      }

      var addAddrPill = event.target.closest('.js-tt-add-addr');
      if (addAddrPill) {
        openAddressFormModal("");
        return;
      }

      var ttMinus = event.target.closest('.js-tt-minus');
      if (ttMinus) {
        changeCartQty(ttMinus.dataset.id, -1);
        pendingCheckoutItems = getSelectedCartItems(getCartItems());
        renderOrderItemsSummary();
        return;
      }

      var ttPlus = event.target.closest('.js-tt-plus');
      if (ttPlus) {
        changeCartQty(ttPlus.dataset.id, 1);
        pendingCheckoutItems = getSelectedCartItems(getCartItems());
        renderOrderItemsSummary();
        return;
      }

      var pickInput = event.target.closest(".js-order-address-pick");
      if (pickInput) {
        saveSelectedAddressId(pickInput.dataset.id);
        renderAddressList();
        renderSelectedAddressPreview();
        return;
      }

      
      var placeOrderBtn = event.target.closest('.js-order-place');
      if (placeOrderBtn) {
        var selectedAddress = getSelectedAddress();
        if (!selectedAddress) {
          showToast('Please add and select a shipping address.', 'error');
          return;
        }
        var items = pendingCheckoutItems && pendingCheckoutItems.length ? pendingCheckoutItems.slice() : getSelectedCartItems();
        if (!items.length) {
          showToast('No selected items to place.', 'error');
          return;
        }

        var subtotal = items.reduce(function (sum, item) {
          return sum + ((Number(item.price) || 0) * (Number(item.qty) || 0));
        }, 0);
        var shippingFee = items.length ? 120 : 0;
        var total = subtotal + shippingFee;

        var checkoutPayload = {
          total: total,
          items: items,
          order_ref: '',
          customer_name: selectedAddress.name || '',
          customer_phone: selectedAddress.phone || '',
          customer_email: getSessionEmail() || '',
          customer_address: (selectedAddress.address || '') + (selectedAddress.addressDetails ? (', ' + selectedAddress.addressDetails) : ''),
          delivery_type: 'delivery',
          shipping_fee: shippingFee
        };

        var nameParts = String(checkoutPayload.customer_name || '').trim().split(/\s+/);
        var orderData = {
          order_ref: checkoutPayload.order_ref,
          email: checkoutPayload.customer_email || '',
          phone: checkoutPayload.customer_phone || '',
          firstName: nameParts.shift() || 'Customer',
          lastName: nameParts.join(' ') || '',
          address: selectedAddress.address || checkoutPayload.customer_address || '',
          apartment: selectedAddress.addressDetails || '',
          city: selectedAddress.city || selectedAddress.municipality || '',
          barangay: selectedAddress.barangay || '',
          municipality: selectedAddress.municipality || selectedAddress.city || '',
          province: selectedAddress.province || '',
          postalCode: selectedAddress.postalCode || selectedAddress.postal_code || '',
          country: 'Philippines',
          region: selectedAddress.region || '',
          deliveryType: 'delivery',
          items: items,
          shippingFee: shippingFee,
          total: checkoutPayload.total,
          timestamp: new Date().toISOString()
        };

        Object.keys(orderData).forEach(function (key) {
          if (!Object.prototype.hasOwnProperty.call(checkoutPayload, key)) {
            checkoutPayload[key] = orderData[key];
          }
        });

        startPayMongoQRPHCheckout(checkoutPayload).then(function (result) {

          finalizeCheckout(items, result.order_ref || '');
          if (orderSummaryModalInstance) orderSummaryModalInstance.hide();

          // Store payment session data for the confirmation page
          sessionStorage.setItem('checkout_url', result.checkout_url);
          sessionStorage.setItem('order_ref', result.order_ref);
          sessionStorage.setItem('session_id', result.session_id || result.source_id || '');
          sessionStorage.setItem('order_total', checkoutPayload.total);
          sessionStorage.setItem('checkout_items', JSON.stringify(items));
          sessionStorage.setItem('qr_code_url', result.qr_code_url || '');
          sessionStorage.setItem('qr_code_value', result.qr_code_value || '');
          sessionStorage.setItem('customer_name', checkoutPayload.customer_name || '');

          // PayMongo Checkout renders the official QRPH code that GCash recognizes.
          window.location.href = result.checkout_url;
          })
          .catch(function (error) {
            console.error('QRPH checkout failed:', error);
            showToast(error && error.message ? error.message : 'Could not start QRPH checkout.', 'error');
          });
        return;
      }

    });

    // Inline buyer form removed; using dedicated Address Form modal instead.
  }

  function renderSelectedAddressPreview() {
    if (!orderSummaryModalEl) return;
    var preview = orderSummaryModalEl.querySelector('.js-order-address-preview');
    if (!preview) return;
    var addr = getSelectedAddress();
    if (!addr) {
      preview.innerHTML = '<button type="button" class="btn w-100 js-tt-add-addr" style="background:#efefef; border-radius:999px; padding:12px 16px; font-weight:700;">+ Add shipping address</button>';
      return;
    }
    var full = addr.address + (addr.addressDetails ? (', ' + addr.addressDetails) : '');
    preview.innerHTML = [
      '<article class="order-address-item" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">',
      '  <div class="order-address-content" style="display:flex; flex-direction:column;">',
      '    <strong>' + addr.name + '</strong>',
      '    <small>' + addr.phone + '</small>',
      '    <small>' + full + (addr.isDefault ? ' (Default)' : '') + '</small>',
      '  </div>',
      '  <button type="button" class="btn btn-sm btn-outline-secondary js-order-edit-address" data-id="' + addr.id + '">Edit</button>',
      '</article>'
    ].join('');
  }

  function renderOrderItemsSummary() {
    if (!orderSummaryModalEl) return;
    var tilesEl = orderSummaryModalEl.querySelector('.js-tt-items-list');
    var countEl = orderSummaryModalEl.querySelector('.js-order-items-count');
    var totalEl = orderSummaryModalEl.querySelector('.js-order-items-total');
    var sellerDiscEl = orderSummaryModalEl.querySelector('.js-tt-seller-discount-amt');
    var platformDiscEl = orderSummaryModalEl.querySelector('.js-tt-platform-discount-amt');
    var breakdownEl = orderSummaryModalEl.querySelector('.js-tt-breakdown');
    var savingsRow = orderSummaryModalEl.querySelector('.js-tt-savings');
    var savingsAmtEl = orderSummaryModalEl.querySelector('.js-tt-savings-amt');
    var shippingFeeEl = orderSummaryModalEl.querySelector('.js-tt-shipping-fee-amt');
    if (!tilesEl || !countEl || !totalEl || !sellerDiscEl || !platformDiscEl || !breakdownEl || !shippingFeeEl) return;

    var items = pendingCheckoutItems && pendingCheckoutItems.length ? pendingCheckoutItems.slice() : getSelectedCartItems();
    var original = 0;
    var totalQty = 0;

    tilesEl.innerHTML = items.map(function(item){
      var qty = Number(item.qty) || 0;
      var price = Number(item.price) || 0;
      var sub = qty * price;
      totalQty += qty;
      original += sub;
      var safeTitle = truncateText((item.title || ''), 42).replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return [
        '<article class="d-flex align-items-center gap-2 py-2">',
        '  <img src="' + item.img + '" alt="' + safeTitle + '" style="width:64px; height:64px; object-fit:cover; border-radius:8px;">',
        '  <div class="flex-grow-1">',
        '    <div class="fw-semibold">' + safeTitle + '</div>',
        '    <div class="text-success fw-bold">' + formatPeso(price) + '</div>',
        '  </div>',
        '  <div class="d-flex align-items-center gap-1">',
        '    <button type="button" class="btn btn-sm btn-outline-secondary js-tt-minus" data-id="' + item.cartKey + '">-</button>',
        '    <span class="px-2">' + qty + '</span>',
        '    <button type="button" class="btn btn-sm btn-outline-secondary js-tt-plus" data-id="' + item.cartKey + '">+</button>',
        '  </div>',
        '</article>'
      ].join('');
    }).join('');

    var sellerDiscount = 0;
    var platformDiscount = 0;
    var subtotal = Math.max(0, original - sellerDiscount - platformDiscount);

    var shippingFee = items.length > 0 ? 120 : 0; // flat fee example

    sellerDiscEl.textContent = '-' + formatPeso(sellerDiscount).replace('PHP ','PHP ');
    platformDiscEl.textContent = '-' + formatPeso(platformDiscount).replace('PHP ','PHP ');

    breakdownEl.innerHTML = [
      '<div class="d-flex align-items-center justify-content-between py-1"><span>Original price</span><span>' + formatPeso(original) + '</span></div>',
      '<div class="d-flex align-items-center justify-content-between py-1"><span>Product discount</span><span class="text-danger">-' + formatPeso(0).replace('PHP ','PHP ') + '</span></div>',
      '<div class="d-flex align-items-center justify-content-between py-1 border-bottom"><span>Seller coupons</span><span class="text-danger">-' + formatPeso(sellerDiscount).replace('PHP ','PHP ') + '</span></div>'
    ].join('');

    shippingFeeEl.textContent = formatPeso(shippingFee);

    var savings = (original - subtotal);
    if (savingsRow && savingsAmtEl) {
      savingsRow.classList.toggle('d-none', savings <= 0);
      savingsAmtEl.textContent = formatPeso(savings);
    }

    var grandTotal = subtotal + shippingFee;
    countEl.textContent = totalQty + ' item(s)';
    totalEl.textContent = formatPeso(grandTotal);
  }

  function openAddressFormModal(addressId) {
    ensureAddressFormModal();
    currentAddressEditId = String(addressId || "");
    var form = addressFormModalEl.querySelector('.js-order-buyer-form');
    if (form) {
      var data = null;
      if (currentAddressEditId) {
        var addrs = getBuyerAddresses();
        data = addrs.find(function (e) { return e.id === currentAddressEditId; }) || null;
      }
      resetAddressForm(form, data || null);
    }
    if (addressFormModalInstance) addressFormModalInstance.show();
  }

  function ensureAddressFormModal() {
    if (addressFormModalEl) return;
    var html = [
      '<div class="modal fade" id="addressFormModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-dialog-centered modal-md profile-modal-dialog">',
      '    <div class="modal-content profile-modal-card">',
      '      <div class="profile-modal-head">',
      '        <p class="profile-modal-kicker mb-1">Checkout</p>',
      '        <h5 class="modal-title mb-1">Shipping address</h5>',
      '        <p class="profile-modal-subtitle mb-0">Fill out your delivery details.</p>',
      '      </div>',
      '      <div class="modal-body pt-3">',
      '        <div class="js-order-buyer-form-wrap mt-0">',
      '          <form class="js-order-buyer-form">',
      '            <div class="row g-2">',
      '              <input type="hidden" name="address_id" value="">',
      '              <div class="col-md-6"><input type="text" name="buyer_name" class="form-control" placeholder="Name" required></div>',
      '              <div class="col-md-6"><input type="text" name="buyer_phone" class="form-control" placeholder="Phone number" inputmode="numeric" autocomplete="tel" maxlength="11" pattern="[0-9]{11}" title="Enter exactly 11 digits" required></div>',
      '              <div class="col-12"><input type="text" name="buyer_address" class="form-control" placeholder="Address" required></div>',
      '              <div class="col-12"><input type="text" name="buyer_address_details" class="form-control" placeholder="Address details (optional)"></div>',
      '              <div class="col-12 d-flex align-items-center gap-2"><button type="button" class="btn btn-outline-success btn-sm js-order-set-default" data-default="0">Set as Default Address</button><input type="hidden" name="buyer_default" value="0"></div>',
      '            </div>',
      '            <div class="d-flex gap-2 mt-2">',
      '              <button type="submit" class="btn btn-success btn-sm">Save</button>',
      '              <button type="button" class="btn btn-outline-secondary btn-sm js-order-cancel-form">Cancel</button>',
      '            </div>',
      '          </form>',
      '        </div>',
      '      </div>',
      '      <button type="button" class="btn-close profile-modal-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.insertAdjacentHTML('beforeend', html);
    addressFormModalEl = document.getElementById('addressFormModal');
    if (addressFormModalEl && window.bootstrap && window.bootstrap.Modal) {
      addressFormModalInstance = window.bootstrap.Modal.getOrCreateInstance(addressFormModalEl);
    }

    if (!addressFormModalEl) return;

    addressFormModalEl.addEventListener('click', function (event) {
      var cancelBtn = event.target.closest('.js-order-cancel-form');
      if (cancelBtn) {
        if (addressFormModalInstance) addressFormModalInstance.hide();
        return;
      }

      var setDefaultBtn = event.target.closest('.js-order-set-default');
      if (setDefaultBtn) {
        var buyerFormEl = addressFormModalEl.querySelector('.js-order-buyer-form');
        var defaultInput = buyerFormEl ? buyerFormEl.querySelector('[name="buyer_default"]') : null;
        if (!defaultInput) return;
        var nextIsDefault = defaultInput.value !== '1';
        defaultInput.value = nextIsDefault ? '1' : '0';
        setDefaultBtn.dataset.default = nextIsDefault ? '1' : '0';
        setDefaultBtn.textContent = nextIsDefault ? 'Default Address Enabled' : 'Set as Default Address';
        setDefaultBtn.classList.toggle('active', nextIsDefault);
        return;
      }
    });

    var buyerForm = addressFormModalEl.querySelector('.js-order-buyer-form');
    if (buyerForm) {
      var buyerPhoneInput = buyerForm.querySelector('[name="buyer_phone"]');
      if (buyerPhoneInput) {
        buyerPhoneInput.addEventListener('input', function () {
          this.value = normalizePhoneDigits(this.value);
        });
      }
      buyerForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var addressId = String(buyerForm.querySelector('[name="address_id"]').value || "");
        var name = String(buyerForm.querySelector('[name="buyer_name"]').value || "").trim();
        var phone = normalizePhoneDigits(buyerForm.querySelector('[name="buyer_phone"]').value || "");
        var address = String(buyerForm.querySelector('[name="buyer_address"]').value || "").trim();
        var addressDetails = String(buyerForm.querySelector('[name="buyer_address_details"]').value || "").trim();
        var isDefault = String(buyerForm.querySelector('[name="buyer_default"]').value || '0') === '1';

        if (!name || !phone || !address) {
          showToast('Name, phone number, and address are required.', 'error');
          return;
        }
        if (phone.length !== 11) {
          showToast('Phone number must contain exactly 11 digits.', 'error');
          return;
        }

        var addresses = getBuyerAddresses();
        var targetId = addressId || ("addr_" + Date.now() + "_" + Math.floor(Math.random() * 1000));
        var found = false;

        addresses = addresses.map(function (entry) {
          if (entry.id !== targetId) return entry;
          found = true;
          return {
            id: targetId,
            name: name,
            phone: phone,
            address: address,
            addressDetails: addressDetails,
            isDefault: isDefault
          };
        });

        if (!found) {
          addresses.push({ id: targetId, name: name, phone: phone, address: address, addressDetails: addressDetails, isDefault: isDefault });
        }

        if (isDefault) {
          addresses = addresses.map(function (entry) { entry.isDefault = entry.id === targetId; return entry; });
        } else if (!addresses.some(function (entry) { return entry.isDefault; })) {
          addresses[0].isDefault = true;
        }

        saveBuyerAddresses(addresses);
        saveSelectedAddressId(targetId);
        showToast('Address saved.', 'success');
        if (addressFormModalInstance) addressFormModalInstance.hide();
        renderSelectedAddressPreview();
      });
    }
  }

  function ensureSavedAddressesModal() {
    if (savedAddressesModalEl) return;
    var html = [
      '<div class="modal fade" id="savedAddressesModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-dialog-centered modal-md profile-modal-dialog">',
      '    <div class="modal-content profile-modal-card">',
      '      <div class="profile-modal-head">',
      '        <p class="profile-modal-kicker mb-1">Checkout</p>',
      '        <h5 class="modal-title mb-1">Saved Addresses</h5>',
      '        <p class="profile-modal-subtitle mb-0">Pick an address for delivery.</p>',
      '      </div>',
      '      <div class="modal-body pt-3">',
      '        <div class="js-saved-addresses-list" style="max-height:50vh; overflow:auto;"></div>',
      '        <div class="d-flex align-items-center justify-content-end gap-2 mt-3">',
      '          <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Close</button>',
      '          <button type="button" class="btn btn-success btn-sm js-saved-use">Use Selected Address</button>',
      '        </div>',
      '      </div>',
      '      <button type="button" class="btn-close profile-modal-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.insertAdjacentHTML('beforeend', html);
    savedAddressesModalEl = document.getElementById('savedAddressesModal');
    if (savedAddressesModalEl && window.bootstrap && window.bootstrap.Modal) {
      savedAddressesModalInstance = window.bootstrap.Modal.getOrCreateInstance(savedAddressesModalEl);
    }

    if (!savedAddressesModalEl) return;

    savedAddressesModalEl.addEventListener('click', function (event) {
      var useBtn = event.target.closest('.js-saved-use');
      if (useBtn) {
        var pick = savedAddressesModalEl.querySelector('input[name="saved_address_pick"]:checked');
        if (!pick) {
          showToast('Please select an address.', 'error');
          return;
        }
        saveSelectedAddressId(pick.value);
        if (savedAddressesModalInstance) savedAddressesModalInstance.hide();
        renderSelectedAddressPreview();
        renderAddressList();
        return;
      }

      var editBtn = event.target.closest('.js-saved-edit-address');
      if (editBtn) {
        var id = String(editBtn.dataset.id || '');
        var addresses = getBuyerAddresses();
        var target = addresses.find(function (e) { return e.id === id; }) || null;
        if (target) {
          if (savedAddressesModalInstance) savedAddressesModalInstance.hide();
          if (orderSummaryModalInstance) orderSummaryModalInstance.show();
          var formWrap = orderSummaryModalEl.querySelector('.js-order-buyer-form-wrap');
          var listWrap = orderSummaryModalEl.querySelector('.js-order-address-list');
          var form = orderSummaryModalEl.querySelector('.js-order-buyer-form');
          var modalTitleEl = orderSummaryModalEl.querySelector('.js-order-modal-title');
          var topRow = orderSummaryModalEl.querySelector('.js-order-top-row');
          if (form && formWrap) {
            resetAddressForm(form, target);
            formWrap.classList.remove('d-none');
          }
          if (listWrap) listWrap.classList.add('d-none');
          if (modalTitleEl) modalTitleEl.textContent = 'Add Address';
          if (topRow) topRow.classList.add('d-none');
        }
      }
    });
  }

  function renderSavedAddressesList() {
    if (!savedAddressesModalEl) return;
    var listWrap = savedAddressesModalEl.querySelector('.js-saved-addresses-list');
    if (!listWrap) return;
    var addresses = getBuyerAddresses();
    var selected = getSelectedAddress(addresses);
    if (!addresses.length) {
      listWrap.innerHTML = '<p class="mb-0 text-muted">No saved addresses yet. Use + Add shipping address.</p>';
      return;
    }
    listWrap.innerHTML = addresses.map(function (entry) {
      var full = entry.address + (entry.addressDetails ? (', ' + entry.addressDetails) : '');
      var checked = selected && selected.id === entry.id ? ' checked' : '';
      return [
        '<article class="order-address-item" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">',
        '  <label class="order-address-pick" style="display:flex; align-items:center; gap:10px;">',
        '    <input type="radio" name="saved_address_pick" class="form-check-input" value="' + entry.id + '"' + checked + '>',
        '    <span class="order-address-content" style="display:flex; flex-direction:column;">',
        '      <strong>' + entry.name + '</strong>',
        '      <small>' + entry.phone + '</small>',
        '      <small>' + full + (entry.isDefault ? ' (Default)' : '') + '</small>',
        '    </span>',
        '  </label>',
        '  <button type="button" class="btn btn-sm btn-outline-secondary js-saved-edit-address" data-id="' + entry.id + '">Edit</button>',
        '</article>'
      ].join('');
    }).join('');
  }

  function renderCartPanel() {
    // Cart is now rendered on dedicated cart.html page, not in modal
    return;
    var empty = cartModalEl.querySelector(".js-auth-cart-empty");
    var summary = cartModalEl.querySelector(".js-auth-cart-summary");
    var totalEl = cartModalEl.querySelector(".js-auth-cart-total");
    var totalRow = cartModalEl.querySelector(".js-auth-cart-total-row");
    var selectedRow = cartModalEl.querySelector(".js-auth-cart-selected-row");
    var selectedCountEl = cartModalEl.querySelector(".js-auth-cart-selected-count");
    var checkoutBtn = cartModalEl.querySelector(".js-auth-cart-checkout");
    if (!list || !empty || !summary || !totalEl || !totalRow || !selectedRow || !selectedCountEl || !checkoutBtn) return;

    var user = getCurrentUser();
    if (!user) {
      list.innerHTML = "";
      empty.textContent = "Sign in to view your cart.";
      empty.classList.remove("d-none");
      summary.classList.add("d-none");
      totalEl.textContent = formatPeso(0);
      selectedCountEl.textContent = "0 selected";
      checkoutBtn.disabled = true;
      totalRow.classList.add("d-none");
      selectedRow.classList.add("d-none");
      return;
    }

    var items = getCartItems();
    if (!items.length) {
      list.innerHTML = "";
      empty.textContent = "Your cart is empty.";
      empty.classList.remove("d-none");
      summary.classList.add("d-none");
      totalEl.textContent = formatPeso(0);
      selectedCountEl.textContent = "0 selected";
      checkoutBtn.disabled = true;
      totalRow.classList.add("d-none");
      selectedRow.classList.add("d-none");
      return;
    }

    empty.classList.add("d-none");
    summary.classList.remove("d-none");
    var selectionMap = getCartSelectionMap();
    var selectedItems = getSelectedCartItems(items);
    selectedCountEl.textContent = selectedItems.length + " selected";
    totalEl.textContent = formatPeso(getSelectedCartTotal(items));
    var hasSelection = selectedItems.length > 0;
    checkoutBtn.disabled = !hasSelection;
    totalRow.classList.toggle("d-none", !hasSelection);
    selectedRow.classList.toggle("d-none", !hasSelection);
    list.innerHTML = items.map(function (item) {
      var safeTitle = item.title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      var safeDesc = truncateText(item.desc || "No description", 92).replace(/</g, "&lt;").replace(/>/g, "&gt;");
      var checkedAttr = selectionMap[String(item.cartKey)] ? ' checked' : '';
      return [
        '<article class="auth-cart-item" data-cart-id="' + item.cartKey + '">',
        '  <input type="checkbox" class="form-check-input auth-cart-check js-cart-check" data-id="' + item.cartKey + '"' + checkedAttr + '>',
        '  <img src="' + resolvePublicAsset(item.img) + '" alt="' + safeTitle + '" class="auth-cart-thumb" onerror="this.onerror=null;this.src=\'../images/logo.JPG\';">',
        '  <div class="auth-cart-meta">',
        '    <h6 class="auth-cart-title mb-1">' + safeTitle + '</h6>',
        '    <p class="auth-cart-desc mb-1">' + safeDesc + "</p>",
        '    <p class="auth-cart-price mb-1">' + formatPeso(item.price) + "</p>",
        '    <div class="auth-cart-controls">',
        '      <button type="button" class="btn btn-sm auth-cart-qty-btn js-cart-minus" data-id="' + item.cartKey + '">-</button>',
        '      <span class="auth-cart-qty" aria-live="polite">' + item.qty + "</span>",
        '      <button type="button" class="btn btn-sm auth-cart-qty-btn js-cart-plus" data-id="' + item.cartKey + '">+</button>',
        '      <button type="button" class="btn btn-link btn-sm auth-cart-remove js-cart-remove" data-id="' + item.cartKey + '">Remove</button>',
        "    </div>",
        "  </div>",
        '  <div class="auth-cart-subtotal">' + formatPeso(item.price * item.qty) + "</div>",
        "</article>"
      ].join("");
    }).join("");
  }

  function addToCart(product, qty) {
    var currentUser = getCurrentUser();
    if (!currentUser) {
      // If a product detail modal is open, hide it before prompting sign-in
      try {
        var detailEl = document.getElementById('detailModal');
        if (detailEl && window.bootstrap && window.bootstrap.Modal) {
          window.bootstrap.Modal.getOrCreateInstance(detailEl).hide();
        }
      } catch (e) {
        // ignore
      }
      openAuthModal("signin");
      showToast("Please sign in before adding to cart.", "error");
      return { ok: false, reason: "not_signed_in" };
    }

    var quantity = Math.max(1, Number(qty) || 1);
    // Prevent adding out-of-stock products
    try {
      var selectedSize = resolveProductSelection(product);
      var prodStock = selectedSize && typeof selectedSize.stock !== 'undefined'
        ? Number(selectedSize.stock || 0)
        : Number(product && (product.stock || product.qtyAvailable || product.stockQty) || 0);
      if (prodStock <= 0) {
        showToast('This product is out of stock and cannot be added to cart.', 'error');
        return { ok: false, reason: 'out_of_stock' };
      }
    } catch (e) { /* ignore stock check errors */ }
    var items = getCartItems();
    var selectedSize = resolveProductSelection(product);
    var cartKey = buildCartItemKey(product, selectedSize);
    var displayTitle = String(product.title || "Product");
    if (selectedSize && selectedSize.label) {
      displayTitle += ' (' + selectedSize.label + ')';
    }
    var idx = items.findIndex(function (item) { return String(item.cartKey) === cartKey; });
    if (idx >= 0) {
      items[idx].qty += quantity;
    } else {
        items.push({
          id: Number(product.id),
          cartKey: cartKey,
          title: displayTitle,
          baseTitle: String(product.title || "Product"),
          desc: String(product.desc || ""),
          price: selectedSize ? selectedSize.price : (Number(product.price) || 0),
          qty: quantity,
          img: resolvePublicAsset(product.img),
          sizeLabel: selectedSize ? selectedSize.label : "",
          type: String(product.type || product.category || ""),
          category: String(product.type || product.category || "")
        });
    }
    saveCartItems(items);
    
    // Debug logging
    var storageKey = getCartStorageKey();
    console.log('[ADD_TO_CART] Product:', product.title, 'Qty:', quantity);
    console.log('[ADD_TO_CART] Session email:', getSessionEmail());
    console.log('[ADD_TO_CART] Storage key:', storageKey);
    console.log('[ADD_TO_CART] Items saved to localStorage:', items);
    console.log('[ADD_TO_CART] Full localStorage state:', JSON.stringify(localStorage));
    
    updateCartBadge();
    renderCartPanel();
    showToast("Added to cart.", "success");
    return { ok: true };
  }

  function saveUserToDatabase(user, options) {
    options = options || {};
    if (!user || !user.email || !user.name) {
      return Promise.resolve({ success: false, message: "Missing user data." });
    }
    if (!window.fetch) {
      return Promise.resolve({ success: false, message: "Fetch is not available in this browser." });
    }
    if (window.location.protocol === "file:") {
      console.error("Database sync skipped: run the site via http://localhost so PHP can execute.");
      return Promise.resolve({ success: false, message: "Run site from http://localhost." });
    }

    var formData = new FormData();
    if (user.id !== undefined && user.id !== null && Number(user.id) > 0) {
      formData.append("id", String(Number(user.id)));
    }
    formData.append("name", user.name);
    formData.append("email", normalizeEmail(user.email));
    if (options.rejectIfExists) {
      formData.append("reject_if_exists", "1");
    }
    if (typeof user.password === "string" && user.password.length > 0) {
      formData.append("password", user.password);
    }
    if (typeof user.phone === "string") {
      formData.append("phone", String(user.phone).replace(/\D/g, "").slice(0, 11));
    }
    if (typeof user.region === "string") {
      formData.append("region", String(user.region).trim());
    }
    if (typeof user.province === "string") {
      formData.append("province", String(user.province).trim());
    }
    if (typeof user.municipality === "string") {
      formData.append("municipality", String(user.municipality).trim());
    }
    if (typeof user.barangay === "string") {
      formData.append("barangay", String(user.barangay).trim());
    }
    if (typeof user.street_address === "string") {
      formData.append("street_address", String(user.street_address).trim());
    }

    return fetch("api/save_user.php", {
      method: "POST",
      body: formData
    }).then(function (response) {
      return response.json().catch(function () {
        return { success: false, message: "Invalid JSON response from server." };
      });
    }).then(function (result) {
      if (!result || !result.success) {
        console.error("Database sync failed:", result && result.message ? result.message : result);
      }
      return result;
    }).catch(function () {
      console.error("Database sync failed: api/save_user.php could not be reached.");
      return { success: false, message: "api/save_user.php could not be reached." };
    });
  }

  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) return;
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.innerHTML;
    }

    if (isLoading) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' + (loadingText || "Loading...");
      return;
    }

    button.disabled = false;
    button.innerHTML = button.dataset.originalText;
  }

  function showToast(message, kind) {
    try {
      var el = document.getElementById('cartToast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'cartToast';
        el.className = 'cart-toast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-atomic', 'true');
        document.body.appendChild(el);
      }

      var text = String(message || '').trim();
      if (!text) return;

      // Match template behavior: simple bottom toast
      var prefix = (kind === 'error' || kind === 'danger') ? 'Error:' : 'Success:';
      el.textContent = prefix + ' ' + text;
      el.classList.add('show');
      try { clearTimeout(el._tid); } catch (e) {}
      el._tid = setTimeout(function(){ try { el.classList.remove('show'); } catch (e) {} }, 2800);
    } catch (e) {
      // last-resort fallback
      try { console.warn('Toast failed', e); } catch (ignore) {}
    }
  }

  function handlePayMongoReturn() {
    if (!window.URLSearchParams || !window.fetch) return;
    var params = new URLSearchParams(window.location.search || "");
    if (String(params.get("paymongo") || "").toLowerCase() !== "success") return;

    var orderRef = String(params.get("order") || params.get("order_ref") || "").trim();
    if (!orderRef) return;
    var sessionId = "";
    try {
      sessionId = String(params.get("session_id") || sessionStorage.getItem("session_id") || "").trim();
    } catch (ignore) {}

    fetch("api/confirm-payment-return.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ order_ref: orderRef, session_id: sessionId })
    })
    .then(function (response) {
      return response.json().catch(function () {
        return { success: false, message: "Payment return response was not valid JSON." };
      });
    })
    .then(function (result) {
      if (result && result.success) {
        showToast("Payment confirmed. Your order is now being processed.", "success");
        try {
          var cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (ignore) {}
        return;
      }
      showToast((result && result.message) || "Could not confirm payment return.", "error");
    })
    .catch(function (error) {
      console.error("PayMongo return confirmation failed:", error);
      showToast("Could not confirm payment return.", "error");
    });
  }

  document.addEventListener("DOMContentLoaded", handlePayMongoReturn);

  // Show a centered auth result modal (login / logout) using site theme colors
  function showAuthResultModal(title, message, options) {
    options = options || {};
    try {
      // remove existing if present
      var existing = document.getElementById('authResultOverlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'authResultOverlay';
      overlay.className = 'auth-result-overlay';

      var card = document.createElement('div');
      card.className = 'auth-result-card';

      var iconWrap = document.createElement('div');
      iconWrap.className = 'auth-result-icon';
      // default check SVG
      iconWrap.innerHTML = options.iconHtml || '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="currentColor"/><path d="M7.5 12.5l2.5 2.5L16.5 9" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      var h = document.createElement('h3');
      h.className = 'auth-result-title';
      h.textContent = (title || '').toUpperCase();

      var p = document.createElement('p');
      p.className = 'auth-result-message';
      p.textContent = message || '';

      var btn = document.createElement('button');
      btn.className = 'btn btn-success auth-result-close';
      btn.textContent = options.buttonText || 'CLOSE WINDOW';

      card.appendChild(iconWrap);
      card.appendChild(h);
      card.appendChild(p);
      card.appendChild(btn);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // animate in
      requestAnimationFrame(function () { overlay.classList.add('visible'); card.classList.add('visible'); });

      function removeModal() {
        try { card.classList.remove('visible'); overlay.classList.remove('visible'); } catch (e) {}
        setTimeout(function () { try { overlay.remove(); } catch (e) {} }, 320);
      }

      btn.addEventListener('click', function () { removeModal(); if (typeof options.onClose === 'function') options.onClose(); });
      overlay.addEventListener('click', function (ev) { if (ev.target === overlay && options.closeOnBackdrop !== false) { removeModal(); if (typeof options.onClose === 'function') options.onClose(); } });

      return {
        close: removeModal
      };
    } catch (e) {
      console.error('Failed to show auth result modal', e);
      return null;
    }
  }

  // Lightweight floating toast fallback (top-right) in case Bootstrap toasts don't appear
  function showFloatingToast(message, kind, delay) {
    try {
      delay = typeof delay === 'number' ? delay : 2000;
      var containerId = 'floatingToastContainer';
      var container = document.getElementById(containerId);
      if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.position = 'fixed';
        container.style.top = '18px';
        container.style.right = '18px';
        container.style.zIndex = 1090;
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
      }

      var el = document.createElement('div');
      el.className = 'floating-toast ' + (kind === 'success' ? 'floating-success' : 'floating-error');
      el.textContent = message || '';
      container.appendChild(el);
      // entrance
      requestAnimationFrame(function () { el.classList.add('visible'); });
      setTimeout(function () { try { el.classList.remove('visible'); setTimeout(function(){ el.remove(); }, 300); } catch (e) {} }, delay);
    } catch (e) {
      console.error('Floating toast failed', e);
    }
  }

  // Lightweight styled auth toasts (login / logout) - copied and adapted from demo
  var toastCounter = 0;
  var TOAST_CONFIG = {
    login: {
      class: 'login-toast',
      icon: 'fa-solid fa-circle-check',
      title: 'Login Successful',
      msg: "Welcome back. You're now signed in.",
      meta: 'Your Account is set',
      footerIconColor: '#5dcba5',
      footerLabel: 'Session started',
      actionLabel: '',
      progressBg: 'linear-gradient(90deg, #5dcba5, #08745b)'
    },
    logout: {
      class: 'logout-toast',
      icon: 'fa-solid fa-arrow-right-from-bracket',
      title: 'Signing Out',
      msg: "Please wait, signing out...",
      meta: 'Session ended',
      footerIconColor: '#e74c3c',
      footerLabel: 'Session cleared',
      actionLabel: 'Sign in again',
      progressBg: 'linear-gradient(90deg, #ff8b82, #c0392b)'
    }
  };

  function ensureToastContainer() {
    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  // Ensure Font Awesome stylesheet is present (used by toast icons)
  function ensureFontAwesome() {
    try {
      var found = Array.prototype.slice.call(document.styleSheets || []).some(function(sheet){
        try { return sheet.href && sheet.href.indexOf('font-awesome') !== -1 || sheet.href && sheet.href.indexOf('fontawesome') !== -1; } catch(e){ return false; }
      });
      if (found) return;
      if (document.querySelector('link[href*="fontawesome"]') || document.querySelector('link[href*="font-awesome"]')) return;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    } catch (e) { console.warn('Could not inject Font Awesome', e); }
  }

  function showAuthToast(type, options) {
    options = options || {};
    try {
      ensureFontAwesome();
      var cfg = TOAST_CONFIG[type] || TOAST_CONFIG.login;
      var id = 'toast-' + (++toastCounter);
      var now = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
      var toast = document.createElement('div');
      toast.className = 'auth-toast ' + cfg.class;
      toast.id = id;
      toast.dataset.type = type;
      toast.innerHTML = '\n      <div class="toast-progress" style="background:'+cfg.progressBg+'"></div>\n      <div class="toast-body">\n        <div class="toast-icon-wrap">\n          <i class="'+cfg.icon+'"></i>\n        </div>\n        <div class="toast-content">\n          <div class="toast-title">'+cfg.title+'</div>\n          <div class="toast-msg">'+cfg.msg+'</div>\n          <div class="toast-meta">\n            <i class="fa-solid fa-clock"></i> '+now+'\n            <span class="dot"></span>\n            '+cfg.meta+'\n          </div>\n        </div>\n        <button class="toast-close" data-toast-id="'+id+'">\n          <i class="fa-solid fa-xmark"></i>\n        </button>\n      </div>\n      <div class="toast-footer">\n        <span class="toast-footer-label">\n          <i class="fa-solid fa-shield-halved" style="color:'+cfg.footerIconColor+'"></i>\n          '+cfg.footerLabel+'\n        </span>\n        <button class="toast-action-btn" data-toast-id="'+id+'">'+cfg.actionLabel+'</button>\n      </div>\n    ';

      var container = ensureToastContainer();
      container.prepend(toast);

      // wire close buttons
      toast.querySelectorAll('[data-toast-id]').forEach(function(btn){
        btn.addEventListener('click', function(ev){ var tid = ev.currentTarget.getAttribute('data-toast-id'); dismissToast(tid); });
      });

      // Trigger enter animation
      requestAnimationFrame(function () { requestAnimationFrame(function () { toast.classList.add('show'); }); });

      // Auto-dismiss after duration (4.5s by default, override via options.duration)
      var duration = typeof options.duration === 'number' ? options.duration : 4500;
      var timer = setTimeout(function () { dismissToast(id); }, duration);
      toast.dataset.timer = timer;

      // store onClose handler
      if (typeof options.onClose === 'function') {
        toast.dataset.onclose = '1';
        toast._onClose = options.onClose;
      }

      // expose dismiss globally for compatibility
      window.dismissToast = function (tid) { dismissToast(tid); };
      return id;
    } catch (e) { console.error('showAuthToast failed', e); return null; }
  }

  function dismissToast(id) {
    var toast = document.getElementById(id);
    if (!toast) return;
    try { clearTimeout(Number(toast.dataset.timer)); } catch (e) {}
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(function () {
      try {
        // call onClose if provided
        if (toast._onClose && typeof toast._onClose === 'function') {
          try { toast._onClose(); } catch (e) { console.error('toast onClose error', e); }
        }
        toast.remove();
      } catch (e) {}
    }, 380);
  }

  function getCurrentUser() {
    return sessionState.user ? {
      id: sessionState.user.id,
      name: sessionState.user.name,
      email: sessionState.user.email,
      status: sessionState.user.status,
      phone: sessionState.user.phone || "",
      region: sessionState.user.region || "",
      province: sessionState.user.province || "",
      municipality: sessionState.user.municipality || "",
      barangay: sessionState.user.barangay || "",
      street_type: sessionState.user.street_type || "",
      street_address: sessionState.user.street_address || ""
    } : null;
  }

  function toInitials(name) {
    var parts = String(name || "User")
      .trim()
      .split(/\s+/)
      .slice(0, 2);
    if (!parts.length) return "U";
    return parts
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join("");
  }

  function setFeedback(container, message, kind) {
    if (!container) return;
    container.textContent = message || "";
    container.classList.remove("text-danger", "text-success");
    container.classList.add(kind === "success" ? "text-success" : "text-danger");
  }

  function resetFeedback() {
    var feedback = document.querySelectorAll(".auth-feedback");
    Array.prototype.forEach.call(feedback, function (el) {
      el.textContent = "";
      el.classList.remove("text-danger", "text-success");
    });
  }

  function updateNavAuthState() {
    var user = getCurrentUser();
    ensureCartMenuEntry();
    ensureOrdersMenuEntry();
    ensureAppointmentsMenuEntry();
    ensureProfileMenuHierarchy();
    var controls = document.querySelectorAll(".auth-controls");
    controls.forEach(function (control) {
      var loginBtn = control.querySelector(".js-auth-login");
      var menu = control.querySelector(".js-auth-menu");
      var avatar = control.querySelector(".auth-avatar");
      var label = control.querySelector(".auth-label");
      var emailEl = control.querySelector(".js-auth-email");

      if (!loginBtn || !menu) return;

      if (user) {
        loginBtn.classList.add("d-none");
        menu.classList.remove("d-none");
        if (avatar) avatar.textContent = toInitials(user.name);
        if (label) label.textContent = user.name || "Profile";
        if (emailEl) emailEl.textContent = user.email || "";
        // wire appointments link in profile menu to open appointments page
        var apptBtn = menu.querySelector('.js-auth-appointments');
        if (apptBtn) {
          try { apptBtn.onclick = function(){ window.location.href = 'appointments.html'; }; } catch(e){}
        }
      } else {
        loginBtn.classList.remove("d-none");
        menu.classList.add("d-none");
        if (avatar) avatar.textContent = "U";
        if (label) label.textContent = "Profile";
        if (emailEl) emailEl.textContent = "";
      }

      control.classList.remove("auth-pending");
      control.classList.add("auth-ready");
    });

    updateCartBadge();
    renderCartPanel();
  }

  function openModalTab(tabTriggerId) {
    if (!modalEl) return;
    var trigger = modalEl.querySelector(tabTriggerId);
    if (!trigger) return;
    if (window.bootstrap && window.bootstrap.Tab) {
      window.bootstrap.Tab.getOrCreateInstance(trigger).show();
    } else {
      trigger.click();
    }
  }

  function closeAuthModal() {
    if (modalInstance) {
      modalInstance.hide();
    }
  }

  function closeVerificationModal() {
    if (verificationModalInstance) {
      verificationModalInstance.hide();
    }
  }

  function closeForgotPasswordModal() {
    if (forgotPasswordModalInstance) {
      forgotPasswordModalInstance.hide();
    }
  }

  function closeResetPasswordModal() {
    if (resetPasswordModalInstance) {
      resetPasswordModalInstance.hide();
    }
  }

  function openAuthModal(view) {
    ensureModal();
    ensureProfileModals();
    resetFeedback();
    initSignupAddressControls();
    if (view === "signup") {
      openModalTab('[data-bs-target="#auth-signup"]');
    } else {
      openModalTab('[data-bs-target="#auth-signin"]');
    }
    syncAuthDialogWidth();

    if (modalInstance) {
      modalInstance.show();
    }
  }

  function openForgotPasswordModal() {
    ensureForgotPasswordModal();
    resetFeedback();
    if (forgotPasswordModalEl) {
      var emailInput = forgotPasswordModalEl.querySelector("#forgotPasswordEmail");
      if (emailInput) {
        emailInput.value = pendingPasswordResetEmail || (modalEl ? (modalEl.querySelector("#authSignInEmail") || {}).value || "" : "");
      }
    }
    if (forgotPasswordModalInstance) {
      forgotPasswordModalInstance.show();
    }
  }

  function openResetPasswordModal(email) {
    ensureResetPasswordModal();
    resetFeedback();
    pendingPasswordResetEmail = normalizeEmail(email || pendingPasswordResetEmail || "");
    if (resetPasswordModalEl) {
      var emailInput = resetPasswordModalEl.querySelector("#resetPasswordEmail");
      var codeInput = resetPasswordModalEl.querySelector("#resetPasswordCode");
      var newPasswordInput = resetPasswordModalEl.querySelector("#resetNewPassword");
      var confirmPasswordInput = resetPasswordModalEl.querySelector("#resetConfirmPassword");
      if (emailInput) emailInput.value = pendingPasswordResetEmail;
      if (codeInput) codeInput.value = "";
      if (newPasswordInput) newPasswordInput.value = "";
      if (confirmPasswordInput) confirmPasswordInput.value = "";
    }
    if (resetPasswordModalInstance) {
      resetPasswordModalInstance.show();
    }
  }

  function openVerificationModal(email) {
    var userId = arguments.length > 1 ? arguments[1] : 0;
    var mode = arguments.length > 2 ? arguments[2] : "";
    ensureVerificationModal();
    resetFeedback();
    pendingVerificationEmail = normalizeEmail(email || pendingVerificationEmail || localStorage.getItem("verification_email") || "");
    pendingVerificationUserId = Number(userId) || 0;
    if (verificationModalEl) {
      var emailInput = verificationModalEl.querySelector("#verificationEmail");
      var codeInput = verificationModalEl.querySelector("#verificationCode");
      var feedback = verificationModalEl.querySelector(".auth-feedback");
      var title = verificationModalEl.querySelector(".modal-title");
      var subtitle = verificationModalEl.querySelector(".auth-subtitle");
      var submitBtn = verificationModalEl.querySelector('button[type="submit"]');
      var resendBtn = verificationModalEl.querySelector(".js-resend-verification");
      if (emailInput) emailInput.value = pendingVerificationEmail;
      if (codeInput) codeInput.value = "";
      if (title) title.textContent = pendingVerificationUserId > 0 || mode === "existing" ? "Verify your email" : "Verify your email";
      if (subtitle) subtitle.textContent = pendingVerificationUserId > 0 || mode === "existing"
        ? "Please input the verification code sent to your email."
        : "Please input the verification code sent to your email.";
      if (submitBtn) submitBtn.textContent = pendingVerificationUserId > 0 || mode === "existing"
        ? "Verify Code"
        : "Verify Code & Create Account";
      if (resendBtn) resendBtn.classList.toggle("d-none", !pendingVerificationEmail);
      if (feedback) setFeedback(feedback, "Please enter the 6-digit code sent to your email.", "success");
    }
    if (verificationModalInstance) {
      verificationModalInstance.show();
    }
  }

  function openAccountModal() {
    ensureProfileModals();
    ensureAccountStreetAddressField();
    bindPasswordToggles(accountModalEl);
    var user = getCurrentUser();
    if (!user) {
      openAuthModal("signin");
      return;
    }
    resetFeedback();
    loadAccountProfileForEdit(user).then(function (freshUser) {
      return initAccountAddressControls(freshUser || user).then(function () {
        populateAccountForm(freshUser || user);
        if (accountModalInstance) {
          accountModalInstance.show();
        }
      });
    });
  }

  function ensureAccountStreetAddressField() {
    if (!accountModalEl) return;
    var accountForm = accountModalEl.querySelector(".js-form-account");
    if (!accountForm || accountForm.querySelector("#authAccountStreetAddress")) return;

    var fieldHtml = [
      '<div class="auth-field auth-signup-span-2">',
      '  <label for="authAccountStreetAddress" class="form-label">House No., Street, Subdivision</label>',
      '  <input id="authAccountStreetAddress" class="form-control" type="text" placeholder="House no., street, subdivision">',
      '</div>'
    ].join("");
    var barangayField = accountForm.querySelector("#authAccountBarangay");
    var insertAfter = barangayField ? barangayField.closest(".auth-field") : null;
    if (insertAfter) {
      insertAfter.insertAdjacentHTML("afterend", fieldHtml);
      return;
    }

    var grid = accountForm.querySelector(".auth-signup-grid") || accountForm;
    grid.insertAdjacentHTML("beforeend", fieldHtml);
  }

  function openCartModal() {
    var user = getCurrentUser();
    if (!user) {
      openAuthModal("signin");
      return;
    }
    // Navigate to dedicated cart page instead of modal
    window.location.href = 'cart.html';
  }

  function openOrdersModal() {
    ensureProfileModals();
    // make sure instance exists
    if (!ordersModalInstance && ordersModalEl && window.bootstrap && window.bootstrap.Modal) {
      ordersModalInstance = window.bootstrap.Modal.getOrCreateInstance(ordersModalEl);
    }
    var user = getCurrentUser();
    if (!user) {
      openAuthModal("signin");
      return;
    }
    // Redirect to dedicated orders page instead of showing modal
    try {
      window.location.href = 'orders.html';
    } catch (e) {
      // fallback: render panel if navigation fails
      renderOrdersPanel();
      if (ordersModalInstance) {
        ordersModalInstance.show();
      }
    }
  }

  function ensureProfileModals() {
    if (!accountModalEl) {
      var accountHtml = [
        '<div class="modal fade" id="profileAccountModal" tabindex="-1" aria-hidden="true">',
        '  <div class="modal-dialog modal-dialog-centered profile-modal-dialog profile-account-dialog">',
        '    <div class="modal-content profile-modal-card">',
        '      <div class="profile-modal-head">',
        '        <p class="profile-modal-kicker mb-1">Profile</p>',
        '        <h5 class="modal-title mb-1">Account Settings</h5>',
        '        <p class="profile-modal-subtitle mb-0">Manage your details and keep your account updated.</p>',
        "      </div>",
      '      <div class="modal-body pt-3">',
      '        <form class="js-form-account auth-form" novalidate>',
      '          <div class="auth-signup-layout">',
      '            <div class="auth-signup-form-wrap">',
      '              <div class="auth-signup-grid">',
      '                <div class="auth-field auth-signup-span-2"><label for="authAccountName" class="form-label">Full Name</label><input id="authAccountName" class="form-control" type="text" placeholder="Your full name" required></div>',
      '                <div class="auth-field auth-signup-span-2"><label for="authAccountEmail" class="form-label">Email</label><input id="authAccountEmail" class="form-control" type="email" placeholder="name@email.com" required></div>',
      '                <div class="auth-field auth-signup-span-2"><label for="authAccountPhone" class="form-label">Contact Number</label><input id="authAccountPhone" class="form-control" type="tel" placeholder="Enter contact number (11 digits)" inputmode="numeric" autocomplete="tel" maxlength="11" pattern="[0-9]{11}" title="Enter exactly 11 digits"></div>',
      '                <div class="auth-field auth-signup-span-2"><label for="authAccountRegion" class="form-label">Region</label><select id="authAccountRegion" class="form-select"><option value="">Loading regions...</option></select></div>',
      '                <div class="auth-field"><label for="authAccountProvince" class="form-label">Province</label><select id="authAccountProvince" class="form-select"><option value="">Select region first</option></select></div>',
      '                <div class="auth-field"><label for="authAccountMunicipality" class="form-label">Municipality / City</label><select id="authAccountMunicipality" class="form-select"><option value="">Select province first</option></select></div>',
      '                <div class="auth-field auth-signup-span-2"><label for="authAccountBarangay" class="form-label">Barangay</label><select id="authAccountBarangay" class="form-select"><option value="">Select municipality first</option></select></div>',
      '                <div class="auth-field auth-signup-span-2"><label for="authAccountStreetAddress" class="form-label">House No., Street, Subdivision</label><input id="authAccountStreetAddress" class="form-control" type="text" placeholder="House no., street, subdivision"></div>',
      '                <div class="auth-field auth-signup-span-2"><label for="authAccountPassword" class="form-label">New Password (optional)</label><div class="auth-password-wrap"><input id="authAccountPassword" class="form-control" type="password" placeholder="Leave blank to keep current" minlength="6">' + passwordToggleHtml("authAccountPassword") + '</div></div>',
      '              </div>',
      '            </div>',
      '          </div>',
      '          <p class="auth-feedback mb-2"></p>',
      '          <button class="btn btn-success auth-submit-btn w-100" type="submit">Save Changes</button>',
        "        </form>",
        "      </div>",
        '      <button type="button" class="btn-close profile-modal-close" data-bs-dismiss="modal" aria-label="Close"></button>',
        "    </div>",
        "  </div>",
        "</div>"
      ].join("");
      document.body.insertAdjacentHTML("beforeend", accountHtml);
      accountModalEl = document.getElementById("profileAccountModal");
      ensureAccountStreetAddressField();
      bindPasswordToggles(accountModalEl);
      if (accountModalEl && window.bootstrap && window.bootstrap.Modal) {
        accountModalInstance = window.bootstrap.Modal.getOrCreateInstance(accountModalEl);
      }

      var accountForm = accountModalEl ? accountModalEl.querySelector(".js-form-account") : null;
      if (accountForm) {
        accountForm.addEventListener("submit", function (event) {
          event.preventDefault();
          var currentUser = getCurrentUser();
          var feedback = accountForm.querySelector(".auth-feedback");
          var submitBtn = accountForm.querySelector('button[type="submit"]');
          if (!currentUser) {
            setFeedback(feedback, "Please sign in first.", "error");
            return;
          }

          var name = String(accountForm.querySelector("#authAccountName").value || currentUser.name || "").trim();
          var email = normalizeEmail(accountForm.querySelector("#authAccountEmail").value || currentUser.email || "");
          var phone = String(accountForm.querySelector("#authAccountPhone").value || currentUser.phone || "").replace(/\D/g, "").slice(0, 11);
          var region = String(accountForm.querySelector("#authAccountRegion").value || currentUser.region || "").trim();
          var province = String(accountForm.querySelector("#authAccountProvince").value || currentUser.province || "").trim();
          var municipality = String(accountForm.querySelector("#authAccountMunicipality").value || currentUser.municipality || "").trim();
          var barangay = String(accountForm.querySelector("#authAccountBarangay").value || currentUser.barangay || "").trim();
          var streetAddressInput = accountForm.querySelector("#authAccountStreetAddress");
          var streetAddress = String((streetAddressInput && streetAddressInput.value) || currentUser.street_address || "").trim();
          var newPassword = String(accountForm.querySelector("#authAccountPassword").value || "");
          if (name.length < 2) {
            setFeedback(feedback, "Please provide a valid name.", "error");
            return;
          }
          if (!email || email.indexOf("@") === -1) {
            setFeedback(feedback, "Please provide a valid email.", "error");
            return;
          }
          if (!phone || phone.length !== 11) {
            setFeedback(feedback, "Phone number must be exactly 11 digits.", "error");
            return;
          }
          if (newPassword) {
            if (newPassword.length < 6) {
              setFeedback(feedback, "New password must be at least 6 characters.", "error");
              return;
            }
          }
          setButtonLoading(submitBtn, true, "Saving...");
          saveUserToDatabase({
            id: currentUser.id,
            name: name,
            email: email,
            password: newPassword,
            phone: phone,
            region: region,
            province: province,
            municipality: municipality,
            barangay: barangay,
            street_address: streetAddress
          }).then(function (result) {
            if (!result || !result.success) {
              setFeedback(feedback, (result && result.message) || "Could not update account.", "error");
              return;
            }
            setSessionUser({
              id: currentUser.id,
              name: name,
              email: email,
              status: currentUser.status,
              phone: phone,
              region: region,
              province: province,
              municipality: municipality,
              barangay: barangay,
              street_address: streetAddress
            });
            if (accountForm.querySelector("#authAccountPassword")) {
              accountForm.querySelector("#authAccountPassword").value = "";
            }
            var checkoutSummaryMap = {
              summaryName: name,
              summaryPhone: phone,
              summaryAddress: [streetAddress, barangay, municipality, province, region].filter(Boolean).join(', ')
            };
            Object.keys(checkoutSummaryMap).forEach(function (key) {
              var el = document.getElementById(key);
              if (el) el.textContent = checkoutSummaryMap[key];
            });
            emitAuthSync();
            if (accountModalInstance) {
              accountModalInstance.hide();
            }
            updateNavAuthState();
            setFeedback(feedback, "Account updated successfully.", "success");
          }).finally(function () {
            setButtonLoading(submitBtn, false);
          });
        });
      }
    }

    if (!cartModalEl) {
      var cartHtml = [
        '<div class="modal fade" id="profileCartModal" tabindex="-1" aria-hidden="true">',
        '  <div class="modal-dialog modal-dialog-centered modal-lg profile-modal-dialog profile-cart-dialog">',
        '    <div class="modal-content profile-modal-card">',
        '      <div class="profile-modal-head">',
        '        <p class="profile-modal-kicker mb-1">Profile</p>',
        '        <h5 class="modal-title mb-1">Your Cart</h5>',
        '        <p class="profile-modal-subtitle mb-0">Review products, update quantities, and check your total.</p>',
        "      </div>",
        '      <div class="modal-body pt-3">',
        '        <div class="auth-cart-panel">',
        '          <p class="auth-cart-empty js-auth-cart-empty mb-0">Your cart is empty.</p>',
        '          <div class="auth-cart-list js-auth-cart-list mt-2"></div>',
        '          <div class="auth-cart-summary js-auth-cart-summary d-none mt-3">',
        '            <div class="auth-cart-total-row js-auth-cart-total-row d-none"><span>Total</span><strong class="js-auth-cart-total">PHP 0</strong></div>',
        '            <div class="auth-cart-total-row auth-cart-selected-row js-auth-cart-selected-row d-none"><span class="js-auth-cart-selected-count">0 selected</span></div>',
        '            <button type="button" class="btn btn-success btn-sm mt-2 js-auth-cart-checkout" disabled>Checkout</button>',
        '            <button type="button" class="btn btn-outline-danger btn-sm mt-2 js-auth-cart-clear">Clear Cart</button>',
        "          </div>",
        "        </div>",
        "      </div>",
        '      <button type="button" class="btn-close profile-modal-close" data-bs-dismiss="modal" aria-label="Close"></button>',
        "    </div>",
        "  </div>",
        "</div>"
      ].join("");
      document.body.insertAdjacentHTML("beforeend", cartHtml);
      cartModalEl = document.getElementById("profileCartModal");
      if (cartModalEl && window.bootstrap && window.bootstrap.Modal) {
        cartModalInstance = window.bootstrap.Modal.getOrCreateInstance(cartModalEl);
      }

      if (cartModalEl) {
        cartModalEl.addEventListener("change", function (event) {
          var checkEl = event.target.closest(".js-cart-check");
          if (checkEl) {
            setCartItemSelected(checkEl.dataset.id, !!checkEl.checked);
            renderCartPanel();
          }
        });

        cartModalEl.addEventListener("click", function (event) {
          var checkoutBtn = event.target.closest(".js-auth-cart-checkout");
          if (checkoutBtn) {
            checkoutSelectedItems();
            return;
          }

          var minusBtn = event.target.closest(".js-cart-minus");
          if (minusBtn) {
            changeCartQty(minusBtn.dataset.id, -1);
            return;
          }

          var plusBtn = event.target.closest(".js-cart-plus");
          if (plusBtn) {
            changeCartQty(plusBtn.dataset.id, 1);
            return;
          }

          var removeBtn = event.target.closest(".js-cart-remove");
          if (removeBtn) {
            removeCartItem(removeBtn.dataset.id);
            return;
          }

          var clearBtn = event.target.closest(".js-auth-cart-clear");
          if (clearBtn) {
            clearCartItems();
          }
        });
      }

    }
  }

  // create orders modal if missing (outside cart block)
  if (!ordersModalEl) {
    var ordersHtml = [
      '<div class="modal fade" id="profileOrdersModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-dialog-centered modal-lg profile-modal-dialog profile-orders-dialog">',
      '    <div class="modal-content profile-modal-card">',
      '      <div class="profile-modal-head">',
      '        <p class="profile-modal-kicker mb-1">Profile</p>',
      '        <h5 class="modal-title mb-1">My Orders</h5>',
      '        <p class="profile-modal-subtitle mb-0">View your past orders and track their status.</p>',
      '      </div>',
      '      <div class="modal-body pt-3">',
      '        <div class="orders-panel">',
      '          <p class="orders-empty mb-0">You have no orders.</p>',
      '          <div class="orders-list js-orders-list mt-2"></div>',
      '        </div>',
      '      </div>',
      '      <button type="button" class="btn-close profile-modal-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.insertAdjacentHTML('beforeend', ordersHtml);
    ordersModalEl = document.getElementById('profileOrdersModal');
    if (ordersModalEl && window.bootstrap && window.bootstrap.Modal) {
      ordersModalInstance = window.bootstrap.Modal.getOrCreateInstance(ordersModalEl);
    }
    ordersModalEl.addEventListener('click', function(event) {
      // If user clicked the product image, toggle the short description in the header
      var imgToggle = event.target.closest('.js-order-img-toggle');
      if (imgToggle) {
        var rowEl = imgToggle.closest('.order-row');
        if (rowEl) {
          var descEl = rowEl.querySelector('.js-order-desc');
          if (descEl) descEl.classList.toggle('d-none');
        }
        return;
      }

      var row = event.target.closest('.order-row');
      if (row) {
        var details = row.nextElementSibling;
        if (details && details.classList.contains('order-details')) {
          details.classList.toggle('d-none');
          row.classList.toggle('expanded');
        }
      }
    });
  }

  function populateAccountForm(user) {
    if (!accountModalEl || !user) return;
    var nameInput = accountModalEl.querySelector("#authAccountName");
    var emailInput = accountModalEl.querySelector("#authAccountEmail");
    var phoneInput = accountModalEl.querySelector("#authAccountPhone");
    var streetAddressInput = accountModalEl.querySelector("#authAccountStreetAddress");
    var passwordInput = accountModalEl.querySelector("#authAccountPassword");
    if (nameInput) nameInput.value = user.name || "";
    if (emailInput) emailInput.value = user.email || "";
    if (phoneInput) phoneInput.value = user.phone || "";
    if (streetAddressInput) {
      streetAddressInput.value = String(user.street_address || user.address || user.address_line || user.street || "").trim();
    }
    if (passwordInput) passwordInput.value = "";
  }

  function loadAccountProfileForEdit(user) {
    var baseUser = user || getCurrentUser();
    if (!baseUser) {
      return Promise.resolve(null);
    }
    if (!window.fetch || window.location.protocol === "file:") {
      return Promise.resolve(baseUser);
    }

    return fetch("api/get_my_profile.php", {
      credentials: "same-origin"
    }).then(function (response) {
      return response.json().catch(function () {
        return { authenticated: false, user: null };
      });
    }).then(function (result) {
      if (result && result.authenticated && result.user) {
        return Object.assign({}, baseUser, result.user);
      }
      return baseUser;
    }).catch(function () {
      return baseUser;
    });
  }

  function initAccountAddressControls(user) {
    if (!accountModalEl) return Promise.resolve();
    var currentUser = user || getCurrentUser();
    if (authAccountAddressBound) {
      var existingRegion = accountModalEl.querySelector("#authAccountRegion");
      if (existingRegion && String(existingRegion.options[0] && existingRegion.options[0].textContent || '').indexOf('Loading') === 0) {
        // fall through and refresh data below
      } else {
        return Promise.resolve();
      }
    }
    var regionSelect = accountModalEl.querySelector("#authAccountRegion");
    var provinceSelect = accountModalEl.querySelector("#authAccountProvince");
    var municipalitySelect = accountModalEl.querySelector("#authAccountMunicipality");
    var barangaySelect = accountModalEl.querySelector("#authAccountBarangay");
    if (!regionSelect || !provinceSelect || !municipalitySelect || !barangaySelect) return Promise.resolve();
    authAccountAddressBound = true;

    function getAccountSelectedOption(selectId) {
      return getSelectedOption(selectId, accountModalEl);
    }

    function selectAccountValue(select, value) {
      var target = String(value || '').trim();
      if (!select || !target) return false;
      var normalized = placeKey(target);
      var match = Array.prototype.slice.call(select.options || []).find(function (option) {
        return placeKey(option.value) === normalized || placeKey(option.textContent) === normalized;
      });
      if (match) {
        select.value = match.value;
        return true;
      }
      select.value = target;
      return !!select.value;
    }

    function resetAccountSelect(selectId, placeholder) {
      var select = accountModalEl.querySelector("#" + selectId);
      if (!select) return;
      select.innerHTML = "";
      var option = document.createElement("option");
      option.value = "";
      option.textContent = placeholder;
      select.appendChild(option);
      select.disabled = true;
    }

    function fillAccountSelect(selectId, items, placeholder, getValue, getLabel, getCode) {
      var select = accountModalEl.querySelector("#" + selectId);
      if (!select) return;
      var sortedItems = sortByName(Array.isArray(items) ? items : []);
      select.innerHTML = "";
      var placeholderOption = document.createElement("option");
      placeholderOption.value = "";
      placeholderOption.textContent = placeholder;
      select.appendChild(placeholderOption);
      sortedItems.forEach(function (item) {
        var option = document.createElement("option");
        option.value = getValue(item);
        option.textContent = getLabel(item);
        option.dataset.code = getCode(item);
        select.appendChild(option);
      });
      select.disabled = false;
    }

    async function loadAccountAddressData() {
      try {
        var regions = await apiFetchJson(`${PSGC_API_BASE}/regions`);
        fillAccountSelect(
          'authAccountRegion',
          Array.isArray(regions) ? regions : [],
          'Select region',
          function (item) { return normalizeRegionName(item.name); },
          function (item) { return normalizeRegionName(item.name); },
          function (item) { return item.code; }
        );
      } catch (error) {
        console.error('Failed to load account address data:', error);
        regionSelect.innerHTML = '<option value="">Failed to load regions</option>';
        regionSelect.disabled = true;
      }
    }

    function handleAccountRegionChange() {
      var regionOption = getAccountSelectedOption("authAccountRegion");
      var regionCode = regionOption ? regionOption.dataset.code || "" : "";
      var regionName = regionOption ? normalizeRegionName(regionOption.value || regionOption.textContent || "") : "";
      resetAccountSelect('authAccountProvince', 'Select province');
      resetAccountSelect('authAccountMunicipality', 'Select province first');
      resetAccountSelect('authAccountBarangay', 'Select municipality first');
      if (!regionCode) return Promise.resolve();
      if (regionName === 'Metro Manila') {
        return apiFetchJson(`${PSGC_API_BASE}/regions/${regionCode}/cities-municipalities`)
          .then(function (municipalities) {
            if (Array.isArray(municipalities) && municipalities.length) {
              fillAccountSelect('authAccountMunicipality', municipalities, 'Select municipality / city', function (item) { return item.name; }, function (item) { return item.name; }, function (item) { return item.code; });
            }
          });
      }
      return apiFetchJson(`${PSGC_API_BASE}/regions/${regionCode}/provinces`)
        .then(function (provinces) {
          if (Array.isArray(provinces) && provinces.length) {
            fillAccountSelect('authAccountProvince', provinces, 'Select province', function (item) { return item.name; }, function (item) { return item.name; }, function (item) { return item.code; });
            return;
          }
        });
    }

    function handleAccountProvinceChange() {
      var regionOption = getAccountSelectedOption("authAccountRegion");
      var provinceOption = getAccountSelectedOption("authAccountProvince");
      var regionCode = regionOption ? regionOption.dataset.code || "" : "";
      var regionName = regionOption ? normalizeRegionName(regionOption.value || regionOption.textContent || "") : "";
      var provinceCode = provinceOption ? provinceOption.dataset.code || "" : "";
      resetAccountSelect('authAccountMunicipality', 'Select municipality');
      resetAccountSelect('authAccountBarangay', 'Select municipality first');
      if (!regionCode) return Promise.resolve();
      if (provinceCode) {
        return apiFetchJson(`${PSGC_API_BASE}/provinces/${provinceCode}/cities-municipalities`)
          .then(function (municipalities) {
            if (Array.isArray(municipalities) && municipalities.length) {
              fillAccountSelect('authAccountMunicipality', municipalities, 'Select municipality', function (item) { return item.name; }, function (item) { return item.name; }, function (item) { return item.code; });
            }
          });
      }
      if (regionName === 'Metro Manila') {
        return apiFetchJson(`${PSGC_API_BASE}/regions/${regionCode}/cities-municipalities`)
          .then(function (municipalities) {
            if (Array.isArray(municipalities) && municipalities.length) {
              fillAccountSelect('authAccountMunicipality', municipalities, 'Select municipality / city', function (item) { return item.name; }, function (item) { return item.name; }, function (item) { return item.code; });
            }
          });
      }
      return Promise.resolve();
    }

    function handleAccountMunicipalityChange() {
      var municipalityOption = getAccountSelectedOption("authAccountMunicipality");
      var municipalityCode = municipalityOption ? municipalityOption.dataset.code || "" : "";
      resetAccountSelect('authAccountBarangay', 'Select barangay');
      if (!municipalityCode) return Promise.resolve();
      return apiFetchJson(`${PSGC_API_BASE}/cities-municipalities/${municipalityCode}/barangays`)
        .then(function (barangays) {
          if (Array.isArray(barangays) && barangays.length) {
            fillAccountSelect('authAccountBarangay', barangays, 'Select barangay', function (item) { return item.name; }, function (item) { return item.name; }, function (item) { return item.code; });
          }
        });
    }

    regionSelect.addEventListener('change', handleAccountRegionChange);
    provinceSelect.addEventListener('change', handleAccountProvinceChange);
    municipalitySelect.addEventListener('change', handleAccountMunicipalityChange);

    return loadAccountAddressData().then(function () {
      if (!currentUser) return;

      var chain = Promise.resolve();
      if (currentUser.region) {
        chain = chain.then(function () {
          selectAccountValue(regionSelect, currentUser.region);
          return handleAccountRegionChange();
        });
      }
      if (currentUser.province) {
        chain = chain.then(function () {
          selectAccountValue(provinceSelect, currentUser.province);
          return handleAccountProvinceChange();
        });
      } else if (normalizeRegionName(currentUser.region || '') === 'Metro Manila') {
        chain = chain.then(function () {
          if (provinceSelect) provinceSelect.value = '';
          return handleAccountProvinceChange();
        });
      }
      if (currentUser.municipality) {
        chain = chain.then(function () {
          selectAccountValue(municipalitySelect, currentUser.municipality);
          return handleAccountMunicipalityChange();
        });
      }
      if (currentUser.barangay) {
        chain = chain.then(function () {
          selectAccountValue(barangaySelect, currentUser.barangay);
          return Promise.resolve();
        });
      }
      return chain;
    });
  }

  function passwordToggleHtml(targetId) {
    return '<button type="button" class="auth-password-toggle js-auth-password-toggle" data-target="' + targetId + '" aria-label="Show password" title="Show password"><svg class="auth-eye auth-eye-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.1 12s3.6-6.5 9.9-6.5S21.9 12 21.9 12s-3.6 6.5-9.9 6.5S2.1 12 2.1 12Z"></path><circle cx="12" cy="12" r="2.8"></circle></svg><svg class="auth-eye auth-eye-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 5.7A9.8 9.8 0 0 1 12 5.5c6.3 0 9.9 6.5 9.9 6.5a17.2 17.2 0 0 1-3.2 3.9"></path><path d="M6.5 6.9A17.6 17.6 0 0 0 2.1 12s3.6 6.5 9.9 6.5a9.4 9.4 0 0 0 4.1-.9"></path></svg></button>';
  }

  function calculatePasswordStrength(password) {
    var strength = 0;
    var feedback = [];

    if (!password) {
      return { score: 0, level: 'none', feedback: [] };
    }

    var length = password.length;
    if (length >= 8) strength += 1;
    if (length >= 12) strength += 1;
    if (length >= 16) strength += 1;

    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength += 1;

    if (length < 8) feedback.push('Use at least 8 characters');
    if (!/[A-Z]/.test(password)) feedback.push('Add uppercase letters');
    if (!/[a-z]/.test(password)) feedback.push('Add lowercase letters');
    if (!/[0-9]/.test(password)) feedback.push('Add numbers');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) feedback.push('Add special characters');

    var level = 'weak';
    if (strength >= 6) level = 'very-strong';
    else if (strength >= 4) level = 'strong';
    else if (strength >= 2) level = 'weak';

    return { score: strength, level: level, feedback: feedback };
  }

  function updatePasswordStrengthIndicator(passwordInput) {
    if (!passwordInput) return;

    var container = passwordInput.closest('.auth-field');
    if (!container) return;

    var strengthIndicator = container.querySelector('.password-strength-indicator');
    if (!strengthIndicator) return;

    var password = passwordInput.value;
    var result = calculatePasswordStrength(password);

    var bars = strengthIndicator.querySelectorAll('.strength-bar');
    bars.forEach(function (bar) {
      bar.classList.remove('filled', 'weak', 'strong', 'very-strong');
    });

    strengthIndicator.classList.remove('show', 'weak', 'strong', 'very-strong');

    if (password.length > 0) {
      strengthIndicator.classList.add('show', result.level);

      var barCount = Math.ceil((result.score / 7) * 3);
      for (var i = 0; i < barCount && i < 3; i++) {
        bars[i].classList.add('filled', result.level);
      }
    }

    var feedbackEl = container.querySelector('.password-strength-feedback');
    if (feedbackEl) {
      if (password.length > 0 && result.feedback.length > 0) {
        feedbackEl.textContent = result.feedback[0];
        feedbackEl.style.display = 'block';
      } else {
        feedbackEl.style.display = 'none';
      }
    }
  }

  function bindPasswordToggles(root) {
    if (!root) return;
    root.querySelectorAll(".js-auth-password-toggle").forEach(function (button) {
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";
      button.addEventListener("click", function () {
        var targetId = button.getAttribute("data-target");
        var input = targetId ? root.querySelector("#" + targetId) || document.getElementById(targetId) : null;
        if (!input) return;
        var isVisible = input.type === "text";
        input.type = isVisible ? "password" : "text";
        button.classList.toggle("is-visible", !isVisible);
        button.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
        button.setAttribute("title", isVisible ? "Show password" : "Hide password");
      });
    });
  }

  function syncAuthDialogWidth() {
    if (!modalEl) return;
    var dialog = modalEl.querySelector(".auth-dialog");
    var signInPane = modalEl.querySelector("#auth-signin");
    if (!dialog || !signInPane) return;
    dialog.classList.toggle("auth-dialog-signin", signInPane.classList.contains("active"));
  }

  function ensureModal() {
    if (modalEl) return;

    var html = [
      '<div class="modal fade" id="authModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-dialog-centered auth-dialog">',
      '    <div class="modal-content auth-card">',
      '      <div class="auth-hero">',
      '        <p class="auth-kicker mb-1">Bulakena Garden</p>',
      '        <h5 class="modal-title mb-1">Welcome back</h5>',
      '        <p class="auth-subtitle mb-0">Sign in or create your account to manage your profile.</p>',
      "      </div>",
      '      <div class="modal-header border-0 pt-2 pb-1">',
      '        <span class="auth-header-label">Account Access</span>',
        '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      "      </div>",
      '      <div class="modal-body pt-0">',
      '        <ul class="nav nav-pills auth-tabs mb-3" role="tablist">',
      '          <li class="nav-item" role="presentation">',
      '            <button class="nav-link active" data-bs-toggle="pill" data-bs-target="#auth-signin" type="button" role="tab">Sign In</button>',
      "          </li>",
      '          <li class="nav-item" role="presentation">',
      '            <button class="nav-link" data-bs-toggle="pill" data-bs-target="#auth-signup" type="button" role="tab">Create Account</button>',
      "          </li>",
      "        </ul>",
      '        <div class="tab-content">',
      '          <div class="tab-pane fade show active" id="auth-signin" role="tabpanel">',
      '            <form class="js-form-signin auth-form" novalidate>',
      '              <div class="auth-field mb-2"><label for="authSignInEmail" class="form-label">Email</label><input id="authSignInEmail" class="form-control" type="email" placeholder="name@email.com" required></div>',
      '              <div class="auth-field mb-2"><label for="authSignInPassword" class="form-label">Password</label><div class="auth-password-wrap"><input id="authSignInPassword" class="form-control" type="password" placeholder="Enter your password" minlength="6" required>' + passwordToggleHtml("authSignInPassword") + '</div></div>',
      '              <div class="d-flex justify-content-end mb-2"><button type="button" class="btn btn-link p-0 js-forgot-password" style="text-decoration:none;color:#4dc98a;">Forgot password?</button></div>',
      '              <p class="auth-feedback mb-2"></p>',
      '              <button class="btn btn-success auth-submit-btn w-100" type="submit">Sign In</button>',
      "            </form>",
      "          </div>",
      '          <div class="tab-pane fade" id="auth-signup" role="tabpanel">',
      '            <div class="auth-signup-layout">',
      '              <div class="auth-signup-form-wrap">',
      '                <form class="js-form-signup auth-form" novalidate>',
      '                  <div class="auth-signup-grid">',
      '                    <div class="auth-field auth-signup-span-2"><label for="authSignUpName" class="form-label">Full Name</label><input id="authSignUpName" class="form-control" type="text" placeholder="Your full name" required></div>',
      '                    <div class="auth-field auth-signup-span-2"><label for="authSignUpEmail" class="form-label">Email</label><input id="authSignUpEmail" class="form-control" type="email" placeholder="name@email.com" required></div>',
      '                    <div class="auth-field"><label for="authSignUpPhone" class="form-label">Contact Number</label><input id="authSignUpPhone" class="form-control" type="tel" placeholder="Enter contact number (11 digits)" inputmode="numeric" autocomplete="tel" maxlength="11" pattern="[0-9]{11}" title="Enter exactly 11 digits" required></div>',
      '                    <div class="auth-field"><label for="country" class="form-label">Country/Region</label><input id="country" class="form-control" type="text" value="Philippines" disabled style="background-color:#e9ecef;"></div>',
      '                    <div class="auth-field"><label for="region" class="form-label">Region</label><select id="region" class="form-select" disabled><option value="">Loading regions...</option></select></div>',
      '                    <div class="auth-field"><label for="province" class="form-label">Province</label><select id="province" class="form-select" disabled><option value="">Select region first</option></select></div>',
      '                    <div class="auth-field"><label for="municipality" class="form-label">Municipality / City</label><select id="municipality" class="form-select" disabled><option value="">Select province first</option></select></div>',
      '                    <div class="auth-field"><label for="barangay" class="form-label">Barangay</label><select id="barangay" class="form-select" disabled><option value="">Select municipality first</option></select></div>',
      '                    <div class="auth-field auth-signup-span-2"><label for="authSignUpStreetAddress" class="form-label">House No., Street, Subdivision</label><input id="authSignUpStreetAddress" class="form-control" type="text" placeholder="House no., street, subdivision" required></div>',
      '                    <div class="auth-field auth-signup-span-2"><label for="authSignUpPassword" class="form-label">Password</label><div class="auth-password-wrap"><input id="authSignUpPassword" class="form-control" type="password" placeholder="Create a strong password" minlength="6" required>' + passwordToggleHtml("authSignUpPassword") + '</div><div class="password-strength-indicator"><div class="strength-bar"></div><div class="strength-bar"></div><div class="strength-bar"></div></div><div class="password-strength-feedback"></div></div>',
      '                    <div class="auth-field auth-signup-span-2"><label for="authSignUpConfirm" class="form-label">Confirm Password</label><div class="auth-password-wrap"><input id="authSignUpConfirm" class="form-control" type="password" placeholder="Re-enter your password" minlength="6" required>' + passwordToggleHtml("authSignUpConfirm") + '</div></div>',
      '                  </div>',
      '                  <p class="auth-feedback mb-2"></p>',
      '                  <button class="btn btn-success auth-submit-btn w-100" type="submit">Create Account</button>',
      "                </form>",
      "              </div>",
      "            </div>",
      "          </div>",
      "        </div>",
      "      </div>",
      "    </div>",
      "  </div>",
      "</div>",
    ].join("");

    document.body.insertAdjacentHTML("beforeend", html);
    modalEl = document.getElementById("authModal");
    if (!modalEl) return;

    if (window.bootstrap && window.bootstrap.Modal) {
      modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    }

    var signInForm = modalEl.querySelector(".js-form-signin");
    var signUpForm = modalEl.querySelector(".js-form-signup");
    var forgotPasswordBtn = modalEl.querySelector(".js-forgot-password");
    bindPasswordToggles(modalEl);

    // Setup password strength indicator
    var passwordInput = modalEl.querySelector("#authSignUpPassword");
    if (passwordInput) {
      passwordInput.addEventListener("input", function () {
        updatePasswordStrengthIndicator(passwordInput);
      });
      // Initialize on modal open
      modalEl.addEventListener("show.bs.modal", function () {
        updatePasswordStrengthIndicator(passwordInput);
      });
    }

    modalEl.querySelectorAll('[data-bs-toggle="pill"][data-bs-target^="#auth-"]').forEach(function (tabButton) {
      tabButton.addEventListener("shown.bs.tab", syncAuthDialogWidth);
    });
    syncAuthDialogWidth();

    if (forgotPasswordBtn) {
      forgotPasswordBtn.addEventListener("click", function () {
        var emailInput = modalEl ? modalEl.querySelector("#authSignInEmail") : null;
        if (emailInput && emailInput.value) {
          pendingPasswordResetEmail = normalizeEmail(emailInput.value);
        }
        closeAuthModal();
        setTimeout(function () {
          openForgotPasswordModal();
        }, 250);
      });
    }

    if (signInForm) {
      signInForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var submitBtn = signInForm.querySelector('button[type="submit"]');
        var emailInput = signInForm.querySelector("#authSignInEmail");
        var passwordInput = signInForm.querySelector("#authSignInPassword");
        var email = normalizeEmail(emailInput ? emailInput.value : "");
        var password = passwordInput ? passwordInput.value : "";
        var feedback = signInForm.querySelector(".auth-feedback");

        if (!email || email.indexOf("@") === -1) {
          setFeedback(feedback, "Please provide a valid email.", "error");
          return;
        }
        if (password.length < 6) {
          setFeedback(feedback, "Password must be at least 6 characters.", "error");
          return;
        }

        setButtonLoading(submitBtn, true, "Signing in...");
        loginWithServer(email, password).then(function (result) {
          if (!result || !result.success) {
            // Check if error is due to email not being verified
            if (result && result.code === 'EMAIL_NOT_VERIFIED') {
              setFeedback(feedback, result.message || "Please verify your email first.", "error");
              localStorage.setItem('verification_email', email);
              closeAuthModal();
              openVerificationModal(email, result.user_id, "existing");
              return;
            }
            setFeedback(feedback, (result && result.message) || "Invalid email or password.", "error");
            return;
          }
          updateNavAuthState();
          setFeedback(feedback, "Signed in successfully.", "success");
          setTimeout(closeAuthModal, 350);
          try { showAuthToast && showAuthToast('login'); } catch(e){}
        }).finally(function () {
          setButtonLoading(submitBtn, false);
        });
      });
    }

    if (signUpForm) {
      signUpForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var submitBtn = signUpForm.querySelector('button[type="submit"]');
        var nameInput = signUpForm.querySelector("#authSignUpName");
        var emailInput = signUpForm.querySelector("#authSignUpEmail");
        var phoneInput = signUpForm.querySelector("#authSignUpPhone");
        var streetAddressInput = signUpForm.querySelector("#authSignUpStreetAddress");
        var regionInput = signUpForm.querySelector("#region");
        var provinceInput = signUpForm.querySelector("#province");
        var municipalityInput = signUpForm.querySelector("#municipality");
        var barangayInput = signUpForm.querySelector("#barangay");
        var passwordInput = signUpForm.querySelector("#authSignUpPassword");
        var confirmInput = signUpForm.querySelector("#authSignUpConfirm");
        var name = String(nameInput ? nameInput.value : "").trim();
        var email = normalizeEmail(emailInput ? emailInput.value : "");
        var phone = String(phoneInput ? phoneInput.value : "").replace(/\D/g, "").slice(0, 11);
        var streetAddress = String(streetAddressInput ? streetAddressInput.value : "").trim();
        var region = String(regionInput ? regionInput.value : "").trim();
        var province = String(provinceInput ? provinceInput.value : "").trim();
        var municipality = String(municipalityInput ? municipalityInput.value : "").trim();
        var barangay = String(barangayInput ? barangayInput.value : "").trim();
        var password = passwordInput ? passwordInput.value : "";
        var confirmPassword = confirmInput ? confirmInput.value : "";
        var feedback = signUpForm.querySelector(".auth-feedback");
        if (name.length < 2) {
          setFeedback(feedback, "Please provide a valid name.", "error");
          return;
        }
        if (!email || email.indexOf("@") === -1) {
          setFeedback(feedback, "Please provide a valid email.", "error");
          return;
        }
        if (phone.length !== 11) {
          setFeedback(feedback, "Please provide a valid 11-digit phone number.", "error");
          return;
        }
        if (!streetAddress) {
          setFeedback(feedback, "Please provide your house number and street details.", "error");
          return;
        }
        if (!region || !province || !municipality || !barangay) {
          setFeedback(feedback, "Please complete your region, province, municipality, and barangay.", "error");
          return;
        }
        
        // Validate password strength
        if (password.length < 8) {
          setFeedback(feedback, "Password must be at least 8 characters.", "error");
          return;
        }
        if (!/[a-z]/.test(password)) {
          setFeedback(feedback, "Password must contain at least one lowercase letter.", "error");
          return;
        }
        if (!/[A-Z]/.test(password)) {
          setFeedback(feedback, "Password must contain at least one uppercase letter.", "error");
          return;
        }
        if (!/[0-9]/.test(password)) {
          setFeedback(feedback, "Password must contain at least one number.", "error");
          return;
        }
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
          setFeedback(feedback, "Password must contain at least one special character.", "error");
          return;
        }
        
        if (password !== confirmPassword) {
          setFeedback(feedback, "Passwords do not match.", "error");
          return;
        }
        setButtonLoading(submitBtn, true, "Creating account...");
        setTimeout(function () {
          registerWithServer(name, email, password, {
            phone: phone,
            region: region,
            province: province,
            municipality: municipality,
            barangay: barangay,
            street_address: streetAddress
          })
            .then(function (dbResult) {
              if (!dbResult || !dbResult.success) {
                var isDuplicate = dbResult && dbResult.code === "EMAIL_EXISTS";
                var serverMessage = dbResult && dbResult.message ? dbResult.message : "";
                var message = isDuplicate ? "Email is already in users." : (serverMessage || "Could not create account. Please try again.");
                setFeedback(feedback, message, "error");
                showToast(message, "error");
                return;
              }

              // Check if email verification is required
              if (dbResult.requires_verification) {
                // Open the verification modal instead of leaving the auth flow.
                localStorage.setItem('verification_email', email);
                closeAuthModal();
                showToast("Verification code sent! Complete your registration.", "success");
                openVerificationModal(email);
                if (dbResult.email_sent === false && verificationModalEl) {
                  var failFeedback = verificationModalEl.querySelector(".auth-feedback");
                  if (failFeedback) setFeedback(failFeedback, "The email could not be sent right now, but the verification step is open. Please check your Gmail SMTP settings and try again.", "error");
                }
                return;
              }

              // Send user to sign-in using the same created credentials.
              var signInEmail = modalEl.querySelector("#authSignInEmail");
              if (signInEmail) signInEmail.value = email;
              openModalTab('[data-bs-target="#auth-signin"]');

              signUpForm.reset();
              loadAddressData();
              setFeedback(feedback, "Account created successfully. Please sign in.", "success");
              showToast("Account created successfully. You can now sign in.", "success");
            })
            .finally(function () {
              setButtonLoading(submitBtn, false);
            });
        }, 800);
      });
    }

  }

  function ensureVerificationModal() {
    if (verificationModalEl) return;

    var html = [
      '<div class="modal fade" id="verificationModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-dialog-centered auth-dialog auth-dialog-compact">',
      '    <div class="modal-content auth-card">',
      '      <div class="auth-hero">',
      '        <p class="auth-kicker mb-1">Bulakena Garden</p>',
      '        <h5 class="modal-title mb-1">Verify your email</h5>',
      '        <p class="auth-subtitle mb-0">Please input the verification code sent to your email.</p>',
      '      </div>',
      '      <div class="modal-header border-0 pt-2 pb-1">',
      '        <span class="auth-header-label">Email Verification</span>',
      '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      '      </div>',
      '      <div class="modal-body pt-0">',
      '        <form class="js-form-verification auth-form" novalidate>',
      '          <div class="auth-field mb-2"><label for="verificationEmail" class="form-label">Email</label><input id="verificationEmail" class="form-control" type="email" readonly></div>',
      '          <div class="auth-field mb-2"><label for="verificationCode" class="form-label">Verification Code</label><input id="verificationCode" class="form-control" type="text" placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code" required></div>',
      '          <p class="auth-feedback mb-2"></p>',
      '          <button class="btn btn-success auth-submit-btn w-100" type="submit">Verify Code & Create Account</button>',
      '          <div class="text-center mt-3">',
      '            <button type="button" class="btn btn-link p-0 js-resend-verification" style="text-decoration:none;color:#4dc98a;">Resend verification code</button>',
      '            <div class="small text-muted mt-2 js-verification-timer"></div>',
      '          </div>',
      '        </form>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join("");

    document.body.insertAdjacentHTML("beforeend", html);
    verificationModalEl = document.getElementById("verificationModal");
    if (!verificationModalEl) return;

    if (window.bootstrap && window.bootstrap.Modal) {
      verificationModalInstance = window.bootstrap.Modal.getOrCreateInstance(verificationModalEl);
    }

    var verificationForm = verificationModalEl.querySelector(".js-form-verification");
    if (!verificationForm) return;

    var codeInput = verificationForm.querySelector("#verificationCode");
    if (codeInput) {
      codeInput.addEventListener("input", function (event) {
        event.target.value = event.target.value.replace(/[^0-9]/g, "").slice(0, 6);
      });
    }

    verificationModalEl.addEventListener("hidden.bs.modal", function () {
      var timer = verificationModalEl.querySelector(".js-verification-timer");
      if (timer) timer.textContent = "";
    });

    verificationForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var submitBtn = verificationForm.querySelector('button[type="submit"]');
      var feedback = verificationForm.querySelector(".auth-feedback");
      var emailInput = verificationForm.querySelector("#verificationEmail");
      var codeValue = String(codeInput ? codeInput.value : "").trim();
      var currentEmail = normalizeEmail(emailInput ? emailInput.value : pendingVerificationEmail);
      var isExistingAccount = pendingVerificationUserId > 0;

      if (!currentEmail) {
        setFeedback(feedback, "Missing email address. Please start the registration process again.", "error");
        return;
      }

      if (codeValue.length !== 6) {
        setFeedback(feedback, "Please enter a valid 6-digit code.", "error");
        return;
      }

      setButtonLoading(submitBtn, true, isExistingAccount ? "Verifying..." : "Creating account...");
      var request = isExistingAccount
        ? verifyExistingAccountWithServer(pendingVerificationUserId, codeValue)
        : completeRegistrationWithServer(codeValue);

      request.then(function (result) {
        if (!result || !result.success) {
          var message = (result && result.message) || "Verification failed. Please try again.";
          setFeedback(feedback, message, "error");
          showToast(message, "error");
          return;
        }

        pendingVerificationEmail = currentEmail;
        pendingVerificationUserId = 0;
        localStorage.removeItem("verification_email");
        closeVerificationModal();
        setTimeout(function () {
          showToast(
            isExistingAccount
              ? "Your email has been verified. You can now sign in."
              : "Your account was created successfully. You can now sign in.",
            "success"
          );

          openAuthModal("signin");
          if (modalEl) {
            var signInEmail = modalEl.querySelector("#authSignInEmail");
            var signInFeedback = modalEl.querySelector(".js-form-signin .auth-feedback");
            if (signInEmail) signInEmail.value = currentEmail;
            setFeedback(
              signInFeedback,
              isExistingAccount
                ? "Your email is verified. Please sign in."
                : "Your account has been created. Please sign in.",
              "success"
            );
          }
        }, 300);
      }).finally(function () {
        setButtonLoading(submitBtn, false);
      });
    });

    verificationModalEl.addEventListener("click", function (event) {
      var resendBtn = event.target.closest(".js-resend-verification");
      if (!resendBtn) return;

      var timer = verificationModalEl.querySelector(".js-verification-timer");
      var feedback = verificationModalEl.querySelector(".auth-feedback");
      var originalText = resendBtn.textContent;
      var email = normalizeEmail(pendingVerificationEmail || (verificationModalEl.querySelector("#verificationEmail") || {}).value || "");
      var userId = Number(pendingVerificationUserId) || 0;

      if (!email) {
        setFeedback(feedback, "Missing email address. Please start the registration process again.", "error");
        return;
      }

      resendBtn.disabled = true;
      resendBtn.textContent = "Sending...";
      resendVerificationCodeWithServer(email, userId).then(function (result) {
        if (!result || !result.success) {
          var message = (result && result.message) || "Failed to resend code. Please try again.";
          setFeedback(feedback, message, "error");
          showToast(message, "error");
          resendBtn.disabled = false;
          resendBtn.textContent = originalText;
          return;
        }

        setFeedback(feedback, "A new verification code has been sent to your email.", "success");
        showToast("New verification code sent.", "success");

        var seconds = 60;
        if (timer) timer.textContent = "You can resend in " + seconds + "s";
        var interval = setInterval(function () {
          seconds -= 1;
          if (timer) timer.textContent = seconds > 0 ? "You can resend in " + seconds + "s" : "";
          if (seconds <= 0) {
            clearInterval(interval);
            resendBtn.disabled = false;
            resendBtn.textContent = originalText;
          }
        }, 1000);
      }).catch(function () {
        resendBtn.disabled = false;
        resendBtn.textContent = originalText;
        setFeedback(feedback, "Network error. Please try again.", "error");
      });
    });
  }

  function ensureForgotPasswordModal() {
    if (forgotPasswordModalEl) return;

    var html = [
      '<div class="modal fade" id="forgotPasswordModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-dialog-centered auth-dialog auth-dialog-signin">',
      '    <div class="modal-content auth-card">',
      '      <div class="auth-hero">',
      '        <p class="auth-kicker mb-1">Bulakena Garden</p>',
      '        <h5 class="modal-title mb-1">Forgot password</h5>',
      '        <p class="auth-subtitle mb-0">Enter your email and we will send a reset code.</p>',
      '      </div>',
      '      <div class="modal-header border-0 pt-2 pb-1">',
      '        <span class="auth-header-label">Password Reset</span>',
      '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      '      </div>',
      '      <div class="modal-body pt-0">',
      '        <form class="js-form-forgot-password auth-form" novalidate>',
      '          <div class="auth-field mb-2"><label for="forgotPasswordEmail" class="form-label">Email</label><input id="forgotPasswordEmail" class="form-control" type="email" placeholder="name@email.com" required></div>',
      '          <p class="auth-feedback mb-2"></p>',
      '          <button class="btn btn-success auth-submit-btn w-100" type="submit">Send Reset Code</button>',
      '        </form>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join("");

    document.body.insertAdjacentHTML("beforeend", html);
    forgotPasswordModalEl = document.getElementById("forgotPasswordModal");
    if (!forgotPasswordModalEl) return;

    if (window.bootstrap && window.bootstrap.Modal) {
      forgotPasswordModalInstance = window.bootstrap.Modal.getOrCreateInstance(forgotPasswordModalEl);
    }

    var form = forgotPasswordModalEl.querySelector(".js-form-forgot-password");
    if (!form) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var submitBtn = form.querySelector('button[type="submit"]');
      var emailInput = form.querySelector("#forgotPasswordEmail");
      var feedback = form.querySelector(".auth-feedback");
      var email = normalizeEmail(emailInput ? emailInput.value : "");

      if (!email || email.indexOf("@") === -1) {
        setFeedback(feedback, "Please provide a valid email.", "error");
        return;
      }

      setButtonLoading(submitBtn, true, "Sending...");
      requestPasswordResetWithServer(email).then(function (result) {
        if (!result || !result.success) {
          setFeedback(feedback, (result && result.message) || "Could not send reset code. Please try again.", "error");
          showToast((result && result.message) || "Could not send reset code.", "error");
          return;
        }

        pendingPasswordResetEmail = email;
        closeForgotPasswordModal();
        showToast("Reset code sent to your email.", "success");
        openResetPasswordModal(email);
      }).finally(function () {
        setButtonLoading(submitBtn, false);
      });
    });
  }

  function ensureResetPasswordModal() {
    if (resetPasswordModalEl) return;

    var html = [
      '<div class="modal fade" id="resetPasswordModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-dialog-centered auth-dialog auth-dialog-signin">',
      '    <div class="modal-content auth-card">',
      '      <div class="auth-hero">',
      '        <p class="auth-kicker mb-1">Bulakena Garden</p>',
      '        <h5 class="modal-title mb-1">Reset password</h5>',
      '        <p class="auth-subtitle mb-0">Enter the code we sent and your new password.</p>',
      '      </div>',
      '      <div class="modal-header border-0 pt-2 pb-1">',
      '        <span class="auth-header-label">Set New Password</span>',
      '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      '      </div>',
      '      <div class="modal-body pt-0">',
      '        <form class="js-form-reset-password auth-form" novalidate>',
      '          <div class="auth-field mb-2"><label for="resetPasswordEmail" class="form-label">Email</label><input id="resetPasswordEmail" class="form-control" type="email" readonly></div>',
      '          <div class="auth-field mb-2"><label for="resetPasswordCode" class="form-label">Reset Code</label><input id="resetPasswordCode" class="form-control" type="text" placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code" required></div>',
      '          <div class="auth-field mb-2"><label for="resetNewPassword" class="form-label">New Password</label><div class="auth-password-wrap"><input id="resetNewPassword" class="form-control" type="password" placeholder="Create a strong password" minlength="6" required>' + passwordToggleHtml("resetNewPassword") + '</div><div class="password-strength-indicator"><div class="strength-bar"></div><div class="strength-bar"></div><div class="strength-bar"></div></div><div class="password-strength-feedback"></div></div>',
      '          <div class="auth-field mb-2"><label for="resetConfirmPassword" class="form-label">Confirm Password</label><div class="auth-password-wrap"><input id="resetConfirmPassword" class="form-control" type="password" placeholder="Re-enter new password" minlength="6" required>' + passwordToggleHtml("resetConfirmPassword") + '</div></div>',
      '          <p class="auth-feedback mb-2"></p>',
      '          <button class="btn btn-success auth-submit-btn w-100" type="submit">Update Password</button>',
      '        </form>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join("");

    document.body.insertAdjacentHTML("beforeend", html);
    resetPasswordModalEl = document.getElementById("resetPasswordModal");
    if (!resetPasswordModalEl) return;

    if (window.bootstrap && window.bootstrap.Modal) {
      resetPasswordModalInstance = window.bootstrap.Modal.getOrCreateInstance(resetPasswordModalEl);
    }

    var form = resetPasswordModalEl.querySelector(".js-form-reset-password");
    if (!form) return;
    bindPasswordToggles(resetPasswordModalEl);

    // Setup password strength indicator for reset password
    var resetPasswordInput = resetPasswordModalEl.querySelector("#resetNewPassword");
    if (resetPasswordInput) {
      resetPasswordInput.addEventListener("input", function () {
        updatePasswordStrengthIndicator(resetPasswordInput);
      });
    }

    var codeInput = form.querySelector("#resetPasswordCode");
    if (codeInput) {
      codeInput.addEventListener("input", function (event) {
        event.target.value = event.target.value.replace(/[^0-9]/g, "").slice(0, 6);
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var submitBtn = form.querySelector('button[type="submit"]');
      var emailInput = form.querySelector("#resetPasswordEmail");
      var codeValue = String(codeInput ? codeInput.value : "").trim();
      var newPasswordInput = form.querySelector("#resetNewPassword");
      var confirmPasswordInput = form.querySelector("#resetConfirmPassword");
      var feedback = form.querySelector(".auth-feedback");
      var email = normalizeEmail(emailInput ? emailInput.value : pendingPasswordResetEmail);
      var newPassword = newPasswordInput ? newPasswordInput.value : "";
      var confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : "";

      if (!email) {
        setFeedback(feedback, "Missing email address. Please request a new reset code.", "error");
        return;
      }
      if (codeValue.length !== 6) {
        setFeedback(feedback, "Please enter a valid 6-digit code.", "error");
        return;
      }
      
      var strength = calculatePasswordStrength(newPassword);
      if (newPassword.length < 8) {
        setFeedback(feedback, "Password must be at least 8 characters.", "error");
        return;
      }
      if (!/[a-z]/.test(newPassword)) {
        setFeedback(feedback, "Password must contain at least one lowercase letter.", "error");
        return;
      }
      if (!/[A-Z]/.test(newPassword)) {
        setFeedback(feedback, "Password must contain at least one uppercase letter.", "error");
        return;
      }
      if (!/[0-9]/.test(newPassword)) {
        setFeedback(feedback, "Password must contain at least one number.", "error");
        return;
      }
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
        setFeedback(feedback, "Password must contain at least one special character.", "error");
        return;
      }
      
      if (newPassword !== confirmPassword) {
        setFeedback(feedback, "Passwords do not match.", "error");
        return;
      }

      setButtonLoading(submitBtn, true, "Updating...");
      completePasswordResetWithServer(email, codeValue, newPassword).then(function (result) {
        if (!result || !result.success) {
          setFeedback(feedback, (result && result.message) || "Password reset failed. Please try again.", "error");
          showToast((result && result.message) || "Password reset failed.", "error");
          return;
        }

        pendingPasswordResetEmail = "";
        closeResetPasswordModal();
        showToast("Password updated successfully. You can now sign in.", "success");
        openAuthModal("signin");
        if (modalEl) {
          var signInEmail = modalEl.querySelector("#authSignInEmail");
          var signInFeedback = modalEl.querySelector(".js-form-signin .auth-feedback");
          if (signInEmail) signInEmail.value = email;
          setFeedback(signInFeedback, "Your password has been updated. Please sign in.", "success");
        }
      }).finally(function () {
        setButtonLoading(submitBtn, false);
      });
    });
  }

  function bindAuthActions() {
    var loginButtons = document.querySelectorAll(".js-auth-login");
    loginButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        openAuthModal("signin");
      });
    });

    var accountButtons = document.querySelectorAll(".js-auth-account");
    accountButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        openAccountModal();
      });
    });

    var ordersButtons = document.querySelectorAll(".js-auth-orders");
    ordersButtons.forEach(function(button){
      button.addEventListener("click", function(){
        openOrdersModal();
      });
    });

    document.addEventListener("click", function (event) {
      var cartBtn = event.target.closest(".js-auth-cart");
      if (cartBtn) {
        openCartModal();
      }
    });

    var signoutButtons = document.querySelectorAll(".js-auth-signout");
    signoutButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        logoutFromServer().finally(function () {
          updateNavAuthState();
          try {
            try {
              showAuthToast && showAuthToast('logout', {
                duration: 4200,
                onClose: function () {
                  try { window.location.href = 'index.html'; } catch (e) { try { window.location.reload(); } catch (ignore) {} }
                }
              });
            } catch (e) {}

            showAuthResultModal('Signed out', 'You have successfully signed out. See you again soon!', { buttonText: 'CLOSE WINDOW', closeOnBackdrop: false });
          } catch (e) {
            try { window.location.href = 'index.html'; } catch (error) { try { window.location.reload(); } catch (ignore) {} }
          }
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindAuthActions();
    ensureModal();
    ensureProfileModals();
    refreshSession();
    window.addEventListener("storage", function (event) {
      if (event.key === AUTH_SYNC_KEY) {
        refreshSession({ silent: true }).finally(updateNavAuthState);
        return;
      }
      updateNavAuthState();
    });
  });

  window.BulakenaAuth = {
    refreshSession: refreshSession,
    getSessionEmail: getSessionEmail,
    getCurrentUser: getCurrentUser,
    signOut: logoutFromServer,
    openAuthModal: openAuthModal,
    openAccountModal: openAccountModal
  };

  window.BulakenaCart = {
    addItem: addToCart,
    openCart: function () {
      openCartModal();
    },
    getCount: function () {
      return getCartCount();
    }
    ,
    // Public helper: directly place a product into pending checkout and navigate to checkout page
    checkoutNow: function(product, qty) {
      try {
        var currentUser = getCurrentUser();
        if (!currentUser) {
          try {
            var detailEl = document.getElementById('detailModal');
            if (detailEl && window.bootstrap && window.bootstrap.Modal) {
              window.bootstrap.Modal.getOrCreateInstance(detailEl).hide();
            }
          } catch (e) {
            // ignore
          }
          openAuthModal("signin");
          showToast("Please sign in before buying now.", "error");
          return { ok: false, reason: "not_signed_in" };
        }

        var p = product || null;
        if (!p) return { ok: false, reason: 'no_product' };
        var selectedSize = resolveProductSelection(p);
        var displayTitle = String(p.title || 'Product');
        if (selectedSize && selectedSize.label) {
          displayTitle += ' (' + selectedSize.label + ')';
        }
        var item = {
          id: p.id,
          cartKey: buildCartItemKey(p, selectedSize),
          title: displayTitle,
          baseTitle: p.title || displayTitle,
          desc: p.desc || '',
          price: selectedSize ? selectedSize.price : (p.price || 0),
          qty: Math.max(1, Number(qty)||1),
          img: resolvePublicAsset(p.img),
          sizeLabel: selectedSize ? selectedSize.label : '',
          type: String(p.type || p.category || ''),
          category: String(p.type || p.category || '')
        };
        // set pending items and persist using the checkout storage key so checkout.html can read it
        pendingCheckoutItems = [item];
        try { localStorage.setItem('bulakena_checkout_items', JSON.stringify([item])); } catch(e) { /* ignore storage errors */ }
        // Navigate to checkout and jump to the Place Order section
        window.location.href = 'checkout.html#place-order';
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: 'exception' };
      }
    }
  };
})();



/* ----------------------- */
/* Page: Home Animations */

/* ----------------------- */
(function(){
  if (!document.body.classList.contains('home-page')) return;
/* index page scripts */
/* Extracted from inline <script> blocks in index.html */

/* Section 1: extracted from inline <script> in index.html */
(function(){
      if (typeof gsap === 'undefined') return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const heroItems = Array.from(document.querySelectorAll('.home-hero-copy > *'));
      const heroImage = document.querySelector('.home-hero-image');
      const heroBadge = document.querySelector('.home-hero-badge');
      const revealEls = Array.from(document.querySelectorAll('.reveal-on-scroll, .home-section-card, .home-cta-wrap'));
      const cards = Array.from(document.querySelectorAll('.home-card'));

      gsap.registerPlugin(ScrollTrigger);

      if (reduced) {
        revealEls.forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none'; });
        if (heroImage) { heroImage.style.opacity = '1'; heroImage.style.transform = 'none'; }
        if (heroBadge) { heroBadge.style.opacity = '1'; heroBadge.style.transform = 'none'; }
        return;
      }

      gsap.fromTo(heroItems, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.46, stagger: 0.08, ease: 'power2.out' });
      if (heroImage) gsap.to(heroImage, { x: 0, opacity: 1, scale: 1, duration: 0.72, ease: 'power2.out' });
      if (heroBadge) gsap.to(heroBadge, { opacity: 1, y: 0, duration: 0.42, delay: 0.42, ease: 'power2.out' });
      gsap.to('.home-orb.left', { x: 20, y: 12, duration: 5.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.home-orb.right', { x: -22, y: -14, duration: 6.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });

      revealEls.forEach((el) => {
        gsap.fromTo(el, { opacity: 0, y: 18 }, {
          opacity: 1,
          y: 0,
          duration: 0.56,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 86%', once: true }
        });
      });

      cards.forEach((card) => {
        card.addEventListener('mousemove', (e) => {
          const rect = card.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width - 0.5;
          const y = (e.clientY - rect.top) / rect.height - 0.5;
          card.style.transform = `translateY(-3px) rotateX(${(-y * 8)}deg) rotateY(${(x * 10)}deg)`;
        });
        card.addEventListener('mouseleave', () => {
          card.style.transform = 'translateY(0) rotateX(0deg) rotateY(0deg)';
        });
      });
    })();


})();

/* -------------------------- */
/* Page: Products Behaviors */
/* -------------------------- */
(function(){
  if (!document.getElementById('productsGrid') || !document.getElementById('productTpl')) return;
/* products page scripts */
/* Extracted from inline <script> blocks in products.html */

/* Section 1: extracted from inline <script> in products.html */
(function(){
      function normalizeProductSizesForProductsPage(rawSizes) {
        var parsed = rawSizes;
        if (typeof parsed === 'string') {
          var text = parsed.trim();
          if (!text) return [];
          try {
            parsed = JSON.parse(text);
          } catch (e) {
            return [];
          }
        }
        if (!Array.isArray(parsed)) return [];
        return parsed.map(function(entry) {
          return {
            label: String(entry && (entry.label || entry.size || entry.name) || '').trim(),
            price: Number(entry && entry.price) || 0
          };
        }).filter(function(entry) {
          return entry.label && entry.price >= 0;
        });
      }

      const hasGSAP = typeof gsap !== 'undefined';
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Products are loaded from server; start with empty array until fetch completes
      let products = [];

      const tpl = document.getElementById('productTpl');
      const grid = document.getElementById('productsGrid');
      const searchInput = document.getElementById('productSearch');
      const typeSelect = document.getElementById('typeFilter');
      const priceSelect = document.getElementById('priceFilter');
      const newestToggle = document.getElementById('newestToggle');
      const pagination = document.getElementById('productsPagination');

      let filteredProducts = products.slice();
      let currentPage = 1;
      let selectedProduct = null;

      function animateProductCards(){
        const cols = Array.from(grid.querySelectorAll('.col-6, .col-md-3'));
        const cards = Array.from(grid.querySelectorAll('.product-card'));
        if (!hasGSAP || reducedMotion) {
          cols.forEach((c) => { c.style.opacity = '1'; c.style.transform = 'none'; });
          return;
        }

        gsap.set(cols, { opacity: 0, y: 18 });
        gsap.to(cols, { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: 'power2.out' });

        cards.forEach((card) => {
          card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            card.style.transform = `translateY(-3px) rotateX(${(-y * 8)}deg) rotateY(${(x * 10)}deg)`;
          });
          card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0) rotateX(0deg) rotateY(0deg)';
          });
        });
      }

      function getColumns(){
        return window.innerWidth >= 768 ? 4 : 2;
      }

      function getPerPage(){
        return getColumns() * 4; // 4 rows max
      }

      function render(list){
        grid.innerHTML = '';
        list.forEach((p, idx) => {
          const node = tpl.content.cloneNode(true);
          const col = node.querySelector('div');
          col.dataset.originalOrder = idx;
          const card = node.querySelector('.product-card');
          card.dataset.type = p.type;
          card.dataset.price = p.price;
          card.dataset.date = p.date;
          const img = node.querySelector('img'); img.src = resolvePublicAsset(p.img); img.alt = p.title;
            node.querySelector('.card-title').textContent = p.title;
            // Bind luxury "Quick Add" (adds to cart) if present
            try {
              var quickAddBtn = node.querySelector('.pc-quickadd');
              if (quickAddBtn) {
                var stockNum = Number(p.stock || 0);
                if (stockNum <= 0) {
                  quickAddBtn.disabled = true;
                  quickAddBtn.textContent = 'Out of Stock';
                } else {
                  quickAddBtn.disabled = false;
                  quickAddBtn.addEventListener('click', function(ev){
                    ev.preventDefault();
                    ev.stopPropagation();
                    try {
                      if (window.BulakenaCart && typeof window.BulakenaCart.addItem === 'function') {
                        window.BulakenaCart.addItem(p, 1);
                      }
                    } catch (e) {}
                  });
                }
              }
            } catch (e) { /* ignore quick add binding errors */ }

            // Bind luxury "View Product" button if present
            try {
              var viewBtnLux = node.querySelector('.pc-view-btn');
              if (viewBtnLux) {
                viewBtnLux.addEventListener('click', function(ev){
                  ev.preventDefault();
                  ev.stopPropagation();
                  try {
                    var id = p && p.id ? p.id : p && p.productId ? p.productId : null;
                    if (id) window.location.href = 'product.html?id=' + encodeURIComponent(id);
                  } catch (e) { /* ignore */ }
                });
              }
            } catch (e) { /* ignore view binding errors */ }
            // Keep the reference card description visible in the products grid.
            var cardTextEl = node.querySelector('.card-text');
            if (cardTextEl) {
              cardTextEl.textContent = p.desc;
              cardTextEl.classList.remove('d-none');
            }
            var starsEl = node.querySelector('.pc-stars');
            if (starsEl) {
              var ratingNum = p.rating == null || p.rating === '' ? null : Number(p.rating);
              if (ratingNum == null) {
                starsEl.innerHTML = '';
                starsEl.setAttribute('aria-label', 'No rating yet');
              } else {
                var clampedRating = Math.max(0, Math.min(5, ratingNum));
                var fillPercent = (clampedRating / 5) * 100;
                starsEl.innerHTML = '<span class="pc-stars-empty" aria-hidden="true">&#9733;&#9733;&#9733;&#9733;&#9733;</span><span class="pc-stars-fill" aria-hidden="true" style="width:' + fillPercent.toFixed(2) + '%;">&#9733;&#9733;&#9733;&#9733;&#9733;</span>';
                starsEl.setAttribute('aria-label', 'Rated ' + ratingNum.toFixed(1) + ' out of 5');
              }
            }
            var priceEl = node.querySelector('.product-footer .price-small');
            if (priceEl) priceEl.textContent = p.price ? 'FROM PHP ' + p.price.toLocaleString() : 'Contact Us';
            // Ensure the explicit "View" control is visible and navigates to product page
            var viewBtn = node.querySelector('.btn-view-details');
            if (viewBtn) {
              viewBtn.style.display = '';
              viewBtn.addEventListener('click', function () {
                try {
                  var id = p && p.id ? p.id : p && p.productId ? p.productId : null;
                  if (id) window.location.href = 'product.html?id=' + encodeURIComponent(id);
                } catch (e) { /* ignore */ }
              });
            }
            try {
              img.style.cursor = 'pointer';
              img.addEventListener('click', function () {
                // Open dedicated product page instead of floating modal
                try {
                  var id = p && p.id ? p.id : p && p.productId ? p.productId : null;
                  if (id) {
                    window.location.href = 'product.html?id=' + encodeURIComponent(id);
                    return;
                  }
                } catch (e) {}
              });
            } catch (e) {}
          card.style.setProperty('--card-delay', `${80 + (idx * 70)}ms`);
          grid.appendChild(node);
        });
      }

      function renderPagination(totalPages){
        pagination.innerHTML = '';

        if (totalPages <= 1) {
          pagination.classList.add('d-none');
          return;
        }

        pagination.classList.remove('d-none');

        const prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'products-page-btn';
        prev.textContent = '<';
        prev.disabled = currentPage === 1;
        prev.dataset.page = String(currentPage - 1);
        pagination.appendChild(prev);

        for (let page = 1; page <= totalPages; page += 1) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'products-page-btn';
          btn.textContent = String(page);
          btn.dataset.page = String(page);
          if (page === currentPage) {
            btn.classList.add('active');
            btn.setAttribute('aria-current', 'page');
          }
          pagination.appendChild(btn);
        }

        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'products-page-btn';
        next.textContent = '>';
        next.disabled = currentPage === totalPages;
        next.dataset.page = String(currentPage + 1);
        pagination.appendChild(next);
      }

      function renderCurrentPage(){
        const perPage = getPerPage();
        const totalPages = Math.max(1, Math.ceil(filteredProducts.length / perPage));
        currentPage = Math.min(currentPage, totalPages);
        const start = (currentPage - 1) * perPage;
        const pageItems = filteredProducts.slice(start, start + perPage);
        render(pageItems);
        renderPagination(totalPages);
        animateProductCards();
      }

      // Modal-based product detail was removed - product details are now shown
      // on the dedicated product page (product.html?id=<id>).

      function animateFlyToCart(sourceEl) {
        if (!sourceEl) return;
        const cartTarget = document.querySelector('.auth-profile-toggle') || document.querySelector('.js-auth-cart');
        if (!cartTarget) return;

        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = cartTarget.getBoundingClientRect();
        const flyer = sourceEl.cloneNode(true);
        flyer.classList.add('cart-flyer');
        flyer.style.left = `${sourceRect.left}px`;
        flyer.style.top = `${sourceRect.top}px`;
        flyer.style.width = `${sourceRect.width}px`;
        flyer.style.height = `${sourceRect.height}px`;
        document.body.appendChild(flyer);

        requestAnimationFrame(() => {
          const translateX = (targetRect.left + (targetRect.width / 2)) - (sourceRect.left + (sourceRect.width / 2));
          const translateY = (targetRect.top + (targetRect.height / 2)) - (sourceRect.top + (sourceRect.height / 2));
          flyer.style.transform = `translate(${translateX}px, ${translateY}px) scale(0.18)`;
          flyer.style.opacity = '0.15';
        });

        window.setTimeout(() => {
          flyer.remove();
        }, 700);
      }

      function applyFilters(){
        const q = (searchInput.value || '').trim().toLowerCase();
        const type = typeSelect.value;
        const priceSort = priceSelect.value;
        const newest = newestToggle.checked;

        let out = products.slice();
        if (type && type !== 'All') out = out.filter(p => p.type === type);
        if (q) out = out.filter(p => (p.title + ' ' + p.desc).toLowerCase().includes(q));

        if (newest) {
          out.sort((a,b)=> b.date.localeCompare(a.date));
        } else if (priceSort === 'low-high'){
          out.sort((a,b)=> a.price - b.price);
        } else if (priceSort === 'high-low'){
          out.sort((a,b)=> b.price - a.price);
        }

        filteredProducts = out;
        currentPage = 1;
        renderCurrentPage();
      }

      [searchInput, typeSelect, priceSelect, newestToggle].forEach(el => el.addEventListener('input', applyFilters));

      const initialParams = new URLSearchParams(window.location.search);
      const initialType = initialParams.get('type');
      if (initialType && Array.from(typeSelect.options).some(option => option.value === initialType)) {
        typeSelect.value = initialType;
      }

      pagination.addEventListener('click', (event) => {
        const target = event.target.closest('.products-page-btn');
        if (!target || target.disabled) return;
        const nextPage = Number(target.dataset.page);
        if (Number.isNaN(nextPage) || nextPage < 1) return;
        currentPage = nextPage;
        renderCurrentPage();
      });

      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => renderCurrentPage(), 120);
      });

      // Load products from server and render when ready
      fetch('api/get_products.php')
        .then(r => r.text())
        .then(text => {
          try {
            const list = JSON.parse(text);
            let raw = [];
            if (Array.isArray(list)) raw = list;
            else if (list && typeof list === 'object' && Object.keys(list).length) raw = [list];
            else raw = [];

            // Normalize fields expected by the frontend renderer
            products = raw.map(p => {
              const createdRaw = p.date || p.created_at || p.createdAt || '';
              // Normalize created date to full ISO string for reliable sorting
              let dateIso = '';
              try {
                const parsed = Date.parse(String(createdRaw));
                if (!isNaN(parsed)) dateIso = new Date(parsed).toISOString();
                else dateIso = new Date().toISOString();
              } catch (e) {
                dateIso = new Date().toISOString();
              }

              return {
                id: p.id ? Number(p.id) : (p.productId ? Number(p.productId) : undefined),
                title: p.title || p.name || '',
                type: p.type || '',
                price: Number(p.price || 0),
                // Use ISO datetime for consistent sorting
                date: dateIso,
                img: resolvePublicAsset(p.img),
                desc: p.desc || p.description || '',
                sizes: normalizeProductSizesForProductsPage(p.sizes || p.sizes_json),
                rating: p.rating == null || p.rating === '' ? null : Number(p.rating),
                review_count: Number(p.review_count || 0),
                stock: Number(p.stock || 0),
                // keep original created_at for reference
                created_at: p.created_at || p.createdAt || null
              };
            });
          } catch (err) {
            console.error('Failed to parse products JSON from server:', text);
            products = [];
          }
          applyFilters();
        })
        .catch(err => {
          console.error('Failed to fetch products from server:', err);
          applyFilters();
        });

      if (hasGSAP && !reducedMotion) {
        gsap.registerPlugin(ScrollTrigger);
        gsap.fromTo('.products-hero .container > *', { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.48, stagger: 0.08, ease: 'power2.out' });
        gsap.to('.products-orb.left', { x: 20, y: 12, duration: 5.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        gsap.to('.products-orb.right', { x: -22, y: -14, duration: 6.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        gsap.fromTo('.products-filters', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.46, ease: 'power2.out', delay: 0.15 });
      }

      // If someone opens products.html with ?product=<id>, redirect to product page
      (function(){
        const params = new URLSearchParams(window.location.search);
        const productId = params.get('product');
        if (productId) {
          try { window.location.href = 'product.html?id=' + encodeURIComponent(productId); } catch (e) { /* ignore */ }
        }
      })();
    })();


})();

/* -------------------------- */
/* Page: Services Behaviors */
/* -------------------------- */
(function(){
  if (!document.querySelector('.service-page')) return;
/* services page scripts */
/* Extracted from inline <script> blocks in services.html */

/* Section 1: extracted from inline <script> in services.html */
// Gardening flow data and controls
    (function(){
      const flowImage = document.getElementById('flowImage');
      const flowTitle = document.getElementById('flowTitle');
      const flowDesc = document.getElementById('flowDesc');
      const prevBtn = document.getElementById('flowPrev');
      const nextBtn = document.getElementById('flowNext');
      const pages = Array.from(document.querySelectorAll('.flow-page-btn'));
      if (!flowImage || !flowTitle || !flowDesc || !prevBtn || !nextBtn || !pages.length) return;

      const steps = [
        {title: 'Planting & bed preparation', desc: 'Prepare beds, amend soil, and plant selected species to ensure strong establishment and growth.', img: '../images/croton.png'},
        {title: 'Pruning & trimming', desc: 'Perform pruning and trimming to shape plants, remove deadwood, and promote healthy regrowth and flowering.', img: '../images/snake.png'},
        {title: 'Weeding & mulching', desc: 'Remove weeds and apply mulch to retain moisture, suppress weeds, and improve soil health over time.', img: '../images/bromeliad.png'},
        {title: 'Lawn care', desc: 'Mowing, edging, fertilization, and pest control to maintain a healthy, even, and attractive lawn.', img: '../images/landscape.jpg'}
      ];

      let current = 0;

      function render(i){
        const s = steps[i];
        // fade-out then change
        flowImage.classList.add('fade-out');
        flowTitle.classList.add('fade-out');
        flowDesc.classList.add('fade-out');
        setTimeout(()=>{
          flowImage.src = s.img;
          flowTitle.textContent = s.title;
          flowDesc.textContent = s.desc;
          // update pagination state
          pages.forEach((btn, idx) => {
            const active = idx === i;
            btn.classList.toggle('active', active);
            if (active) {
              btn.setAttribute('aria-current', 'page');
            } else {
              btn.removeAttribute('aria-current');
            }
          });
          flowImage.classList.remove('fade-out');
          flowTitle.classList.remove('fade-out');
          flowDesc.classList.remove('fade-out');
          // brief scale animation to emphasize image change
          flowImage.classList.add('animate');
          setTimeout(()=> flowImage.classList.remove('animate'), 420);
          updateNavState();
        }, 200);
      }

      function updateNavState(){
        prevBtn.disabled = current === 0;
        nextBtn.disabled = current === steps.length - 1;
      }

      prevBtn.addEventListener('click', ()=>{
        if (current > 0) {
          current -= 1;
          render(current);
        }
      });
      nextBtn.addEventListener('click', ()=>{
        if (current < steps.length - 1) {
          current += 1;
          render(current);
        }
      });

      pages.forEach((btn, idx) => btn.addEventListener('click', ()=>{
        current = idx;
        render(current);
      }));

      render(0);
    })();

/* Section 2: extracted from inline <script> in services.html */
// Tabs + hash routing for services
      (function(){
        const tabs = Array.from(document.querySelectorAll('#serviceTabs .nav-link'));
        const sections = Array.from(document.querySelectorAll('.service-section'));

        function show(targetId, push, animate = true){
          const targetSection = sections.find(s => '#'+s.id === targetId) || sections.find(s => s.id === 'gardening');
          const currentSection = sections.find(s => !s.classList.contains('d-none'));

          if (!targetSection) return;

          if (!animate) {
            sections.forEach((s) => s.classList.toggle('d-none', s !== targetSection));
          } else {
            if (currentSection && currentSection !== targetSection) {
              currentSection.classList.add('is-leaving');
              setTimeout(() => {
                currentSection.classList.add('d-none');
                currentSection.classList.remove('is-leaving');
              }, 420);
            }

            targetSection.classList.remove('d-none');
            targetSection.classList.add('is-entering');
            requestAnimationFrame(() => targetSection.classList.remove('is-entering'));
          }

          tabs.forEach(t => t.classList.toggle('active', t.dataset.target === targetId));
          if (push) history.pushState(null, '', targetId);
        }

        // Hook tab clicks
        tabs.forEach(t => t.addEventListener('click', (e)=>{
          const target = t.dataset.target;
          show(target, true);
        }));

        // On load, use hash or default to #gardening
        const initial = location.hash || '#gardening';
        // ensure tab active state matches
        tabs.forEach(t => t.classList.toggle('active', t.dataset.target === initial));
        show(initial, false, false);

        // Handle back/forward
        window.addEventListener('popstate', ()=>{
          const h = location.hash || '#gardening';
          show(h, false, true);
        });
      })();

/* Section 3: extracted from inline <script> in services.html */
// Landscaping gallery category filter
      (function(){
        const filterWrap = document.getElementById('landscapeFilters');
        if (!filterWrap) return;

        const buttons = Array.from(filterWrap.querySelectorAll('.landscape-filter-btn'));
        const items = Array.from(document.querySelectorAll('.landscaping-gallery-item'));
        const pagination = document.getElementById('landscapePagination');

        let currentFilter = 'landscaping';
        let currentPage = 1;

        function getColumns(){
          if (window.innerWidth <= 576) return 1;
          if (window.innerWidth <= 768) return 2;
          return 4;
        }

        buttons.forEach((btn) => {
          btn.addEventListener('click', () => {
            currentFilter = btn.dataset.filter;
            currentPage = 1;
            render(true);
          });
        });

        function getFilteredItems(){
          return items.filter((item) => item.dataset.category === currentFilter);
        }

        function renderPagination(totalPages){
          if (!pagination) return;
          pagination.innerHTML = '';

          if (totalPages <= 1) {
            pagination.classList.add('d-none');
            return;
          }

          pagination.classList.remove('d-none');

          const prev = document.createElement('button');
          prev.type = 'button';
          prev.className = 'landscape-page-btn';
          prev.textContent = 'Prev';
          prev.disabled = currentPage === 1;
          prev.dataset.page = String(currentPage - 1);
          pagination.appendChild(prev);

          for (let page = 1; page <= totalPages; page += 1) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'landscape-page-btn';
            btn.textContent = String(page);
            btn.dataset.page = String(page);
            if (page === currentPage) {
              btn.classList.add('active');
              btn.setAttribute('aria-current', 'page');
            }
            pagination.appendChild(btn);
          }

          const next = document.createElement('button');
          next.type = 'button';
          next.className = 'landscape-page-btn';
          next.textContent = 'Next';
          next.disabled = currentPage === totalPages;
          next.dataset.page = String(currentPage + 1);
          pagination.appendChild(next);
        }

        function render(animate){
          const filtered = getFilteredItems();
          const perPage = getColumns() * 2; // limit to 2 rows per page
          const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
          currentPage = Math.min(currentPage, totalPages);

          const start = (currentPage - 1) * perPage;
          const visible = new Set(filtered.slice(start, start + perPage));

          items.forEach((item) => {
            item.classList.remove('filter-enter');
            if (visible.has(item)) {
              if (item.classList.contains('d-none')) {
                item.classList.remove('d-none');
                if (animate) {
                  item.classList.add('filter-enter');
                  requestAnimationFrame(() => item.classList.remove('filter-enter'));
                }
              }
            } else {
              item.classList.add('d-none');
            }
          });

          buttons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.filter === currentFilter);
          });

          renderPagination(totalPages);
        }

        if (pagination) {
          pagination.addEventListener('click', (event) => {
            const target = event.target.closest('.landscape-page-btn');
            if (!target || target.disabled) return;

            const nextPage = Number(target.dataset.page);
            if (Number.isNaN(nextPage) || nextPage < 1) return;
            currentPage = nextPage;
            render(true);
          });
        }

        let resizeTimer;
        window.addEventListener('resize', () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => render(false), 120);
        });

        render(false);
      })();

/* Section 4: extracted from inline <script> in services.html */
// Modern GSAP section motion for services page
      (function(){
        if (typeof gsap === 'undefined') return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const heroItems = Array.from(document.querySelectorAll('.services-hero .container > *'));
        const sections = Array.from(document.querySelectorAll('.service-section, .booking-section'));
        const tabs = Array.from(document.querySelectorAll('#serviceTabs .nav-link'));
        const bookingFields = Array.from(document.querySelectorAll('.booking-form .form-control, .booking-form .form-select, .booking-form .booking-submit-btn'));

        if (reduced) {
          sections.forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none'; });
          return;
        }

        gsap.registerPlugin(ScrollTrigger);

        gsap.fromTo(heroItems,
          { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.48, stagger: 0.08, ease: 'power2.out' }
        );

        gsap.to('.services-orb.left', { x: 20, y: 12, duration: 5.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        gsap.to('.services-orb.right', { x: -22, y: -14, duration: 6.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });

        sections.forEach((section) => {
          gsap.to(section, {
            opacity: 1,
            y: 0,
            duration: 0.58,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: section,
              start: 'top 86%',
              once: true
            }
          });
        });

        tabs.forEach((tab) => {
          tab.addEventListener('click', () => {
            gsap.fromTo(tab, { scale: 0.95 }, { scale: 1, duration: 0.24, ease: 'power2.out' });
            const target = document.querySelector(tab.dataset.target);
            if (target) {
              gsap.fromTo(target, { opacity: 0.6, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' });
            }
          });
        });

        gsap.fromTo(bookingFields,
          { opacity: 0, y: 10 },
          {
            opacity: 1,
            y: 0,
            duration: 0.36,
            stagger: 0.03,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: '.booking-form',
              start: 'top 88%',
              once: true
            }
          }
        );

        // Consultation Section Animations
        const consultationIntro = Array.from(document.querySelectorAll('.consultation-intro > *'));
        const offerCards = Array.from(document.querySelectorAll('.offer-card'));
        const processSteps = Array.from(document.querySelectorAll('.process-step'));
        const processArrows = Array.from(document.querySelectorAll('.process-arrow'));

        // Animate consultation intro elements
        if (consultationIntro.length > 0) {
          gsap.fromTo(consultationIntro,
            { opacity: 0, y: 16 },
            {
              opacity: 1,
              y: 0,
              duration: 0.42,
              stagger: 0.06,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: '.consultation-intro',
                start: 'top 88%',
                once: true
              }
            }
          );
        }

        // Animate offer cards with stagger and scale
        if (offerCards.length > 0) {
          gsap.fromTo(offerCards,
            { opacity: 0, y: 20, scale: 0.96 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.48,
              stagger: 0.08,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: '.consultation-offers',
                start: 'top 85%',
                once: true
              }
            }
          );
        }

        // Animate process steps with rotation effect
        if (processSteps.length > 0) {
          gsap.fromTo(processSteps,
            { opacity: 0, y: 24, rotationX: 8 },
            {
              opacity: 1,
              y: 0,
              rotationX: 0,
              duration: 0.52,
              stagger: 0.1,
              ease: 'back.out(1.2)',
              scrollTrigger: {
                trigger: '.consultation-process',
                start: 'top 84%',
                once: true
              }
            }
          );
        }

        // Animate process arrows with pulse effect
        if (processArrows.length > 0) {
          gsap.fromTo(processArrows,
            { opacity: 0, scale: 0.6 },
            {
              opacity: 0.6,
              scale: 1,
              duration: 0.38,
              stagger: 0.08,
              ease: 'elastic.out(1, 0.5)',
              scrollTrigger: {
                trigger: '.consultation-process',
                start: 'top 84%',
                once: true
              }
            }
          );

          // Add continuous pulse animation to arrows after initial entrance
          processArrows.forEach((arrow, index) => {
            gsap.to(arrow, {
              duration: 1.8,
              delay: 0.8 + (index * 0.15),
              repeat: -1,
              yoyo: true,
              ease: 'sine.inOut',
              opacity: [0.6, 0.8, 0.6],
              x: [0, 3, 0]
            });
          });
        }
      })();


})();

/* -------------------------- */
/* Page: About Us Behaviors */
/* -------------------------- */
(function(){
  if (!document.querySelector('.about-page')) return;
/* aboutus page scripts */
/* Extracted from inline <script> blocks in aboutus.html */

/* Section 1: extracted from inline <script> in aboutus.html */
(() => {
      const hasGSAP = typeof gsap !== "undefined";
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const data = {
        plants: { t: "Indoor and Outdoor Plants", d: "Choose from curated plant collections suited for homes and commercial landscapes.", i: "../images/p3-image1.jpg", l: ["Low-maintenance indoor starters", "Statement tropical plants", "Outdoor flowering selections"] },
        landscaping: { t: "Landscaping and Garden Design", d: "Transform empty spaces into functional and aesthetic garden environments.", i: "../images/p3-image3.jpg", l: ["Concept-based layout design", "Hardscape and softscape planning", "Installation and finishing support"] },
        consultation: { t: "Plant Care Guidance and Consultation", d: "Get practical guidance for plant health, maintenance schedules, and problem diagnosis.", i: "../images/p3-image6.jpg", l: ["On-site inspection and recommendations", "Pest and disease prevention tips", "Long-term care planning"] }
      };

      // Offer tabs
      const tabs = [...document.querySelectorAll(".tab")], oimg = document.getElementById("oimg"), ot = document.getElementById("otitle"), od = document.getElementById("otext"), ol = document.getElementById("olist"), offer = document.getElementById("offer");
      function drawOffer(k){const x=data[k];if(!x)return;tabs.forEach(t=>t.classList.toggle("active",t.dataset.tab===k));oimg.src=x.i;ot.textContent=x.t;od.textContent=x.d;ol.innerHTML=x.l.map(v=>`<li>${v}</li>`).join("");if(hasGSAP&&!reduced)gsap.fromTo(offer,{opacity:.7,y:8},{opacity:1,y:0,duration:.28});}
      tabs.forEach(t=>t.addEventListener("click",()=>drawOffer(t.dataset.tab)));

      // Quiz
      const qq=document.getElementById("qq"), qo=document.getElementById("qo"), qp=document.getElementById("qp"), qr=document.getElementById("qr"), qrt=document.getElementById("qrt"), qrd=document.getElementById("qrd"), qreset=document.getElementById("qreset");
      const qset=[["How much sunlight does your space get?",["Mostly shaded|consultation","Partial sun|plants","Full sun|landscaping"]],["What is your primary goal?",["Beautify indoor corners|plants","Redesign outdoor area|landscaping","Fix current plant problems|consultation"]],["How much maintenance time can you do weekly?",["Less than 1 hour|consultation","1-3 hours|plants","3+ hours|landscaping"]],["What setup fits your budget now?",["Starter plants and essentials|plants","Step-by-step site upgrade|consultation","Full space transformation|landscaping"]]];
      const qres={plants:["Best Fit: Plant Collection Starter","Start with curated indoor/outdoor selections that match your space and care routine."],landscaping:["Best Fit: Landscape Design Service","A full layout and installation plan is best for your goals."],consultation:["Best Fit: Care Consultation","A guided consultation helps diagnose issues before major spending."]};
      let qi=0, score={plants:0,landscaping:0,consultation:0};
      function renderQ(){const q=qset[qi];qq.textContent=q[0];qp.textContent=`Question ${qi+1} of ${qset.length}`;qo.innerHTML="";q[1].forEach(s=>{const [label,key]=s.split("|");const b=document.createElement("button");b.className="opt ripple";b.type="button";b.textContent=label;b.onclick=()=>{score[key]++;qi++;qi>=qset.length?showQRes():renderQ();};qo.appendChild(b);});}
      function showQRes(){qo.innerHTML="";qp.textContent="Completed";const best=Object.keys(score).reduce((a,b)=>score[a]>score[b]?a:b);qrt.textContent=qres[best][0];qrd.textContent=qres[best][1];qr.style.display="block";}
      qreset?.addEventListener("click",()=>{qi=0;score={plants:0,landscaping:0,consultation:0};qr.style.display="none";renderQ();}); renderQ();

      // Testimonials from the database
      const tt = document.getElementById("tt");
      const tp = document.getElementById("tp");
      const tn = document.getElementById("tn");
      const td = document.getElementById("td");
      const tw = document.getElementById("tw");
      if (tt && tp && tn && td && tw) {
        const state = { index: 0, items: [] };

        function normalizeText(value) {
          return String(value || "").trim();
        }

        function getRating(entry) {
          return Math.max(0, Math.min(5, Number(entry && entry.rating) || 0));
        }

        function getName(entry) {
          return normalizeText((entry && (entry.reviewer_name || entry.name)) || "") || "Customer";
        }

        function getMessage(entry) {
          return normalizeText((entry && (entry.text || entry.message)) || "") || "No written feedback provided.";
        }

        function sortReviews(list) {
          return (list || []).slice().sort(function (a, b) {
            var ra = getRating(a);
            var rb = getRating(b);
            if (rb !== ra) return rb - ra;
            var ta = Date.parse(a && a.created_at ? a.created_at : 0) || 0;
            var tb = Date.parse(b && b.created_at ? b.created_at : 0) || 0;
            return tb - ta;
          });
        }

        function starString(rating) {
          return Array.from({ length: 5 }).map(function (_, idx) {
            return idx < rating ? "\u2605" : "\u2606";
          }).join("");
        }

        function makeSlide(entry) {
          var slide = document.createElement("div");
          slide.className = "slide";

          var quote = document.createElement("blockquote");
          quote.textContent = getMessage(entry);

          var stars = document.createElement("p");
          stars.style.color = "var(--g3)";
          stars.style.fontWeight = "600";
          stars.textContent = starString(getRating(entry));

          var name = document.createElement("p");
          name.textContent = "- " + getName(entry);

          slide.appendChild(quote);
          slide.appendChild(stars);
          slide.appendChild(name);
          return slide;
        }

        function renderDots(total) {
          td.innerHTML = "";
          for (var i = 0; i < total; i += 1) {
            (function (idx) {
              var btn = document.createElement("button");
              btn.type = "button";
              btn.className = "dot" + (idx === state.index ? " active" : "");
              btn.setAttribute("aria-label", "Show review " + (idx + 1) + " of " + total);
              btn.addEventListener("click", function () {
                state.index = idx;
                renderActive();
              });
              td.appendChild(btn);
            })(i);
          }
        }

        function renderActive() {
          var total = state.items.length;
          if (!total) return;
          state.index = (state.index + total) % total;
          tt.style.transform = "translateX(-" + (state.index * 100) + "%)";
          Array.from(td.querySelectorAll(".dot")).forEach(function (dot, idx) {
            dot.classList.toggle("active", idx === state.index);
          });
          tp.disabled = total < 2;
          tn.disabled = total < 2;
        }

        function renderReviews(list) {
          state.items = sortReviews(list).filter(function (entry) {
            return getRating(entry) > 0;
          }).slice(0, 3);
          tt.innerHTML = "";

          if (!state.items.length) {
            var empty = document.createElement("div");
            empty.className = "slide";
            empty.textContent = "No customer feedback available yet.";
            tt.appendChild(empty);
            td.innerHTML = "";
            tp.disabled = true;
            tn.disabled = true;
            return;
          }

          state.index = 0;
          state.items.forEach(function (entry) {
            tt.appendChild(makeSlide(entry));
          });
          renderDots(state.items.length);
          renderActive();
        }

        tp.addEventListener("click", function () {
          if (state.items.length < 2) return;
          state.index -= 1;
          renderActive();
        });

        tn.addEventListener("click", function () {
          if (state.items.length < 2) return;
          state.index += 1;
          renderActive();
        });

        fetch("api/get_reviews.php?limit=200", { credentials: "same-origin" })
          .then(function (res) { return res.text(); })
          .then(function (txt) {
            var parsed;
            try {
              parsed = JSON.parse(txt);
            } catch (error) {
              parsed = [];
            }
            renderReviews(Array.isArray(parsed) ? parsed : []);
          })
          .catch(function () {
            renderReviews([]);
          });
      }

      // Ripple + tilt
      document.querySelectorAll(".ripple").forEach(el=>el.addEventListener("click",e=>{const r=el.getBoundingClientRect(),s=Math.max(r.width,r.height),x=document.createElement("span");x.className="r";x.style.width=x.style.height=s+"px";x.style.left=(e.clientX-r.left-s/2)+"px";x.style.top=(e.clientY-r.top-s/2)+"px";el.appendChild(x);setTimeout(()=>x.remove(),560);}));
      document.querySelectorAll(".js-tilt").forEach(card=>{card.addEventListener("mousemove",e=>{const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;card.style.transform=`rotateX(${(-y*8)}deg) rotateY(${(x*10)}deg)`;});card.addEventListener("mouseleave",()=>card.style.transform="rotateX(0) rotateY(0)");});
      // Counters + GSAP
      if (hasGSAP) {
        gsap.registerPlugin(ScrollTrigger);
        document.querySelectorAll("[data-count]").forEach(el=>{const t=+el.dataset.count,o={v:0};if(reduced){el.textContent=t;return;}gsap.to(o,{v:t,duration:1.2,scrollTrigger:{trigger:el,start:"top 88%",once:true},onUpdate:()=>el.textContent=Math.floor(o.v)});});
        if (!reduced) {
          gsap.to(".ph.l",{x:26,rotate:-5,opacity:1,duration:.7,ease:"power2.out"});
          gsap.to(".ph.r",{x:-26,rotate:2,opacity:1,duration:.7,ease:"power2.out"});
          gsap.to(".hero-copy > *",{opacity:1,y:0,duration:.45,stagger:.08,delay:.35});
          gsap.to(".hero-orb-1",{x:24,y:14,duration:5.6,repeat:-1,yoyo:true,ease:"sine.inOut"});
          gsap.to(".hero-orb-2",{x:-22,y:-14,duration:6.1,repeat:-1,yoyo:true,ease:"sine.inOut"});
          gsap.utils.toArray(".js-reveal,.js-vision,.js-choose").forEach(el=>gsap.to(el,{opacity:1,y:0,duration:.6,scrollTrigger:{trigger:el,start:"top 86%",once:true}}));
          gsap.to(".js-pill",{opacity:1,y:0,duration:.32,stagger:.07,scrollTrigger:{trigger:".pills",start:"top 86%",once:true}});
        } else {
          document.querySelectorAll(".ph,.cardx,.mv,.js-choose,.pill").forEach(el=>{el.style.opacity=1;el.style.transform="none";});
        }
      } else {
        document.querySelectorAll(".ph,.cardx,.mv,.js-choose,.pill").forEach(el=>{el.style.opacity=1;el.style.transform="none";});
        document.querySelectorAll("[data-count]").forEach(el=>el.textContent=el.dataset.count);
      }
    })();


})();

/* ---------------------------- */
/* Page: Contact Us Animations */
/* ---------------------------- */
(function(){
  if (!document.querySelector('.contact-main')) return;
/* contactus page scripts */
/* Extracted from inline <script> blocks in contactus.html */

/* Section 1: extracted from inline <script> in contactus.html */
(function(){
      if (typeof gsap === 'undefined') return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const heroItems = Array.from(document.querySelectorAll('.contact-hero .container > *'));
      const cards = Array.from(document.querySelectorAll('.js-reveal'));
      if (reduced) { cards.forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none'; }); return; }
      gsap.registerPlugin(ScrollTrigger);
      gsap.fromTo(heroItems, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.46, stagger: 0.08, ease: 'power2.out' });
      gsap.to('.contact-orb.left', { x: 20, y: 12, duration: 5.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.contact-orb.right', { x: -22, y: -14, duration: 6.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      cards.forEach((el) => gsap.to(el, { opacity: 1, y: 0, duration: 0.56, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 86%', once: true } }));
    })();
})();
