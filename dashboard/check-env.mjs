// Build-time environment variable check for the StorieD dashboard.
//
// Imported by next.config.mjs, so it runs at the very start of every build
// (locally and on Vercel). A missing REQUIRED var fails the build with a
// clear list instead of letting checkout, AI narration or webhooks silently
// break at runtime. OPTIONAL vars only print a warning.
//
// If you genuinely need to build without the check (e.g. CI lint job),
// set SKIP_ENV_CHECK=1.

const REQUIRED = [
  // Supabase
  ['NEXT_PUBLIC_SUPABASE_URL', 'Supabase project URL (dashboard cannot talk to the database without it)'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Supabase anon key (login breaks without it)'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Supabase service-role key (publishing and admin features break without it)'],
  // AI
  ['CLAUDE_API_KEY', 'Anthropic API key (tour narration drafts and AI chat break without it)'],
  // Stripe
  ['STRIPE_SECRET_KEY', 'Stripe secret key (checkout and billing break without it)'],
  ['STRIPE_WEBHOOK_SECRET', 'Stripe webhook signing secret (subscription status updates break without it)'],
  // Maps
  ['GOOGLE_MAPS_API_KEY', 'Google Maps server key (place lookups and map embeds break without it)'],
  // URLs
  ['PUBLIC_TOUR_URL', 'Public tour base URL, e.g. https://storiedtours.co.uk (publish links break without it)'],
  ['DASHBOARD_URL', 'Dashboard base URL, e.g. https://app.storiedtours.co.uk (Stripe redirects break without it)'],
];

const OPTIONAL = [
  ['NEXT_PUBLIC_GOOGLE_MAPS_KEY', 'browser Maps key: map picker will not render without it'],
  ['MAKE_FEEDBACK_WEBHOOK_URL', 'feedback widget will accept but not email feedback without it'],
  ['STORIED_DRAFT_MODEL', 'narration model override: defaults to the built-in model'],
];

export function checkEnv() {
  if (process.env.SKIP_ENV_CHECK === '1') return;

  const missing = REQUIRED.filter(([name]) => !process.env[name]);
  const missingOptional = OPTIONAL.filter(([name]) => !process.env[name]);

  for (const [name, note] of missingOptional) {
    console.warn(`[env-check] Optional env var ${name} is not set — ${note}.`);
  }

  if (missing.length) {
    console.error('\n[env-check] BUILD STOPPED — required environment variables are missing:\n');
    for (const [name, note] of missing) {
      console.error(`  ✗ ${name} — ${note}`);
    }
    console.error(
      '\nAdd them in Vercel: Project → Settings → Environment Variables,' +
        '\nor in .env.local for local development, then redeploy.\n'
    );
    throw new Error(`Missing required env vars: ${missing.map(([n]) => n).join(', ')}`);
  }

  console.log('[env-check] All required environment variables are present.');
}
