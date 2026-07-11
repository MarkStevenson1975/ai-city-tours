// Google Analytics 4 — Storied Tours
// Measurement ID is defined here once; all tour pages load this file.
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());

// If this browser has been flagged as one of ours (open any tour with
// ?internal=1 to flag it, ?internal=0 to unflag — handled by track.js),
// label every GA hit as internal traffic. Combined with the "internal"
// data filter in GA4 admin, our own devices disappear from reports.
var storiedGaConfig = {};
try {
  if (localStorage.getItem('storied_internal') === '1') {
    storiedGaConfig.traffic_type = 'internal';
  }
} catch (e) {}
gtag('config', 'G-K870M6C49G', storiedGaConfig);
