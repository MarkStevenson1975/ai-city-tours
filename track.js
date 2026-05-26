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

  function send(event, opts) {
    try {
      opts = opts || {};
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
            send('stop_logged', { stopId: s.id, meta: { name: s.name } });
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
