// Storied Tours — anonymous guest usage tracking (client side).
//
// Loaded by every city tour page (alongside analytics.js). It assigns each
// browser a random, non-personal device id and pings /api/track/<city> at a
// few meaningful moments so we can see whether guests who never sign in are
// actually using and walking the tours.
//
// It is intentionally defensive: any failure here must never affect the tour,
// so everything is wrapped in try/catch and pings are fire-and-forget.
(function () {
  'use strict';

  // --- per-browser device id (random, no personal data) --------------------
  var DEVICE_KEY = 'storied_device_id';
  function deviceId() {
    try {
      var id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch (e) {
      // localStorage blocked (private mode etc.) — use an ephemeral id.
      if (!window.__storied_tmp_id) {
        window.__storied_tmp_id = 'tmp-' + Math.random().toString(36).slice(2, 12);
      }
      return window.__storied_tmp_id;
    }
  }

  // --- city slug from the URL ( /hereford/ -> "hereford" ) -----------------
  function citySlug() {
    try {
      var seg = window.location.pathname.split('/').filter(Boolean)[0];
      if (seg && /^[a-z0-9-]{1,40}$/.test(seg)) return seg;
    } catch (e) {}
    return 'unknown';
  }

  var SLUG = citySlug();
  var DID = deviceId();

  // --- internal (team) device opt-out --------------------------------------
  // A browser can be flagged as "ours" so its activity is left out of guest
  // reporting. Open any tour with ?internal=1 to flag this browser, or
  // ?internal=0 to undo. The flag is stored locally AND recorded server-side
  // (so the daily report excludes it even though the row stays in the table).
  var INTERNAL_KEY = 'storied_internal';
  function isInternal() {
    try { return localStorage.getItem(INTERNAL_KEY) === '1'; } catch (e) { return false; }
  }
  function setInternalLocal(on) {
    try {
      if (on) localStorage.setItem(INTERNAL_KEY, '1');
      else localStorage.removeItem(INTERNAL_KEY);
    } catch (e) {}
  }
  function postInternal(action) {
    try {
      fetch('/api/internal-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: DID,
          action: action,
          label: 'self-flagged via ' + SLUG,
        }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }
  function tinyToast(msg) {
    try {
      var d = document.createElement('div');
      d.textContent = msg;
      d.style.cssText =
        'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
        'z-index:99999;background:#1f5c3a;color:#fff;padding:12px 18px;' +
        'border-radius:10px;font:14px/1.3 -apple-system,Arial,sans-serif;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:80%;text-align:center;';
      var put = function () { document.body && document.body.appendChild(d); };
      if (document.body) put(); else window.addEventListener('DOMContentLoaded', put);
      setTimeout(function () { try { d.remove(); } catch (e) {} }, 5000);
    } catch (e) {}
  }
  // Handle the flag / unflag links.
  try {
    var q = window.location.search || '';
    if (/[?&]internal=1\b/.test(q)) {
      setInternalLocal(true);
      postInternal('add');
      tinyToast('This device is now marked as internal and will not be counted in tour reporting.');
    } else if (/[?&]internal=0\b/.test(q)) {
      setInternalLocal(false);
      postInternal('remove');
      tinyToast('This device is no longer marked as internal. Visits will be counted again.');
    }
  } catch (e) {}

  // If this browser is one of ours, record nothing at all. Also suppress the
  // "try it" example demo tours (slug example-...) so anonymous prospects
  // previewing a demo never enter the real guest analytics.
  var SUPPRESS = isInternal() || /^example-/.test(SLUG || '');

  // Mirror every journey event into Google Analytics 4 so GA shows the same
  // funnel as our own guest_events table. gtag is loaded by analytics.js on
  // every tour page; if it is missing or blocked this quietly does nothing.
  function sendGA(event, opts) {
    try {
      if (typeof window.gtag !== 'function') return;
      opts = opts || {};
      var params = { city: SLUG };
      if (opts.stopId != null) params.stop_id = String(opts.stopId);
      if (opts.meta && opts.meta.name) {
        if (event.indexOf('sponsor') === 0) params.sponsor_name = String(opts.meta.name).slice(0, 100);
        else params.stop_name = String(opts.meta.name).slice(0, 100);
      }
      window.gtag('event', event, params);
    } catch (e) {}
  }

  function send(event, opts) {
    if (SUPPRESS) return;
    try {
      opts = opts || {};
      sendGA(event, opts);
      var payload = { deviceId: DID, event: event };
      if (opts.stopId != null) payload.stopId = opts.stopId;
      if (opts.meta != null) payload.meta = opts.meta;
      fetch('/api/track/' + SLUG, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  // Expose for ad-hoc use if ever needed.
  window.StoriedTrack = { send: send, deviceId: DID, city: SLUG };

  // Fire "tour opened" as soon as the page loads.
  send('tour_open');

  // --- hook the tour's global functions once they exist --------------------
  // track.js loads in <head>, before the page's inline script, so we wait for
  // load and then wrap the now-defined global functions. Wrapping (rather than
  // editing the big per-city files) keeps this change tiny and identical
  // across every tour.
  function wrap(name, before) {
    try {
      var orig = window[name];
      if (typeof orig !== 'function') return;
      window[name] = function () {
        try { before.apply(null, arguments); } catch (e) {}
        return orig.apply(this, arguments);
      };
    } catch (e) {}
  }

  var firedWalkStarted = false;
  var firedComplete = false;

  function install() {
    // Started the walk: first time the stop list is shown.
    wrap('showScreen', function (id) {
      if (id === 'stoplist' && !firedWalkStarted) {
        firedWalkStarted = true;
        send('walk_started');
      }
    });

    // Logged a stop. Only fire when the stop is genuinely newly logged,
    // mirroring markStopComplete's own "already visited" guard, so counts
    // and stop ids stay accurate.
    wrap('markStopComplete', function () {
      try {
        if (typeof state !== 'undefined' && typeof CONFIG !== 'undefined') {
          var s = CONFIG.stops && CONFIG.stops[state.currentStopIndex];
          if (s && !(state.visitedStops && state.visitedStops.has && state.visitedStops.has(s.id))) {
            // Prefer the stop's permanent uid (survives reordering/renaming);
            // fall back to the display number for configs published before
            // uid existed. The name is captured as it was at this moment.
            send('stop_logged', { stopId: s.uid || s.id, meta: { name: s.name } });
          }
        } else {
          send('stop_logged');
        }
      } catch (e) {
        send('stop_logged');
      }
    });

    // Finished the whole tour.
    wrap('showTourComplete', function () {
      if (!firedComplete) {
        firedComplete = true;
        send('tour_complete');
      }
    });

    // Opened a stop's detail screen (viewed it, whether or not they ever
    // press Log visit). Fires on every open so revisits are visible too.
    wrap('openStopDetail', function (idx) {
      try {
        var s = (typeof CONFIG !== 'undefined' && CONFIG.stops) ? CONFIG.stops[idx] : null;
        if (s) send('stop_viewed', { stopId: s.uid || s.id, meta: { name: s.name } });
        else send('stop_viewed');
      } catch (e) {
        send('stop_viewed');
      }
    });

    // Physically reached a stop: GPS arrival within range, or the "I've
    // arrived" tap. triggerArrival marks the stop visited internally but
    // otherwise emits nothing, so most walkers who navigate to stops without
    // opening the detail screen never registered. Log stop_viewed here too.
    // Reporting counts distinct stop ids, so a stop the visitor also opens is
    // not double-counted.
    wrap('triggerArrival', function (idx) {
      try {
        var s = (typeof CONFIG !== 'undefined' && CONFIG.stops) ? CONFIG.stops[idx] : null;
        if (s) send('stop_viewed', { stopId: s.uid || s.id, meta: { name: s.name } });
        else send('stop_viewed');
      } catch (e) {
        send('stop_viewed');
      }
    });

    // Started playing a stop's narration audio (the core product moment).
    wrap('playNarrationTrack', function (text, label) {
      try {
        var opts = null;
        if (typeof state !== 'undefined' && typeof CONFIG !== 'undefined' && CONFIG.stops) {
          var s = CONFIG.stops[state.currentStopIndex];
          if (s) opts = { stopId: s.uid || s.id, meta: { name: s.name } };
        }
        if (!opts && label) opts = { meta: { name: String(label).slice(0, 120) } };
        send('narration_played', opts || {});
      } catch (e) {
        send('narration_played');
      }
    });

    // Played an interesting fact.
    wrap('playFact', function () { send('fact_played'); });

    // Opened the "find me something nearby" feature.
    wrap('openFindSomething', function () { send('find_nearby'); });

    // A sponsor callout was shown.
    wrap('triggerSponsorCallout', function (sponsor) {
      var meta = sponsor && sponsor.name ? { name: sponsor.name } : null;
      send('sponsor_shown', meta ? { stopId: sponsor.id, meta: meta } : {});
    });
  }

  if (document.readyState === 'complete') {
    install();
  } else {
    window.addEventListener('load', install);
  }
})();
