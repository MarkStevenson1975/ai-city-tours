'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tour';
}

// Convert an anonymous example tour (built via /try) into a real tour owned by
// the now-signed-in operator: gives it an owner, clears the example flag, frees
// a real slug (the example-... slug is discarded), and keeps the stop they built.
export async function claimExample(
  exampleSlug: string
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const admin = createAdminClient();

  const { data: city } = await admin
    .from('cities')
    .select('id, name, slug, is_example, example_claimed_at, created_by')
    .eq('slug', exampleSlug)
    .single();

  if (!city) return { ok: false, error: 'That demo could not be found (it may have expired).' };

  // Already claimed by this same user (e.g. they refreshed) — send them to it.
  if (city.created_by === user.id) {
    return { ok: true, slug: city.slug };
  }
  if (!city.is_example || city.example_claimed_at || city.created_by) {
    return { ok: false, error: 'That demo has already been claimed.' };
  }

  // Find a free real slug based on the town name (worcester, worcester-2, ...).
  const base = slugify(city.name);
  const { data: taken } = await admin.from('cities').select('slug').like('slug', `${base}%`);
  const used = new Set((taken ?? []).map((c) => c.slug));
  let slug = base;
  for (let i = 2; used.has(slug) && i < 300; i++) slug = `${base}-${i}`;

  const { error } = await admin
    .from('cities')
    .update({
      created_by: user.id,
      is_example: false,
      example_claimed_at: new Date().toISOString(),
      expires_at: null,
      slug,
      // Republish under the real slug so the live tour resolves at the new URL.
      published_config: null,
      published_version: 0,
      published_at: null,
    })
    .eq('id', city.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, slug };
}
