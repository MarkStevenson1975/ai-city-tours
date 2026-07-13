'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { trackOperator } from '@/lib/track-operator';

/**
 * Self-serve tour creation. Any signed-in operator can create and own a city.
 * Calls the create_my_city Postgres function (SECURITY DEFINER) which inserts
 * the city, links the caller as its operator, and writes an audit row.
 */
/** Looks like a bare UK postcode (e.g. "HR1 2NG", "hr12ng"). */
function isBarePostcode(v: string): boolean {
  return /^[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}$/i.test(v.trim());
}

/**
 * Title-case a place so "hereford" and "HEREFORD" both become "Hereford".
 * Only capitalises after a start, space or hyphen, so "bishop's castle"
 * becomes "Bishop's Castle" rather than "Bishop'S Castle".
 */
function tidyPlace(v: string): string {
  return v
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

export async function createMyTour(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Step 1 now asks only where the tour is. The tour name is derived from it,
  // so operators are never asked to invent anything before they see value.
  const place = String(formData.get('place') ?? '').trim();
  const kind = String(formData.get('kind') ?? 'town') === 'venue' ? 'venue' : 'town';
  const guideName = 'Harriet';

  if (!place) {
    redirect('/dashboard/new?error=name');
  }
  if (isBarePostcode(place)) {
    // A postcode makes a poor tour name; ask for the town, they can refine the
    // exact area with a postcode in the build step.
    redirect('/dashboard/new?error=postcode');
  }

  const name = tidyPlace(place);

  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Two operators may well both run a tour of Hereford, or of the same stately
  // home. That is not an error and we must never block them on it. The tour
  // NAME can repeat; only the public URL has to be unique, so we quietly find
  // the next free slug (hereford, hereford-2, hereford-3 …).
  //
  // The admin client bypasses RLS so this sees every tour, not just the
  // caller's.
  const admin = createAdminClient();
  const { data: taken } = await admin
    .from('cities')
    .select('slug')
    .like('slug', `${baseSlug}%`);

  const used = new Set((taken ?? []).map((c) => c.slug));
  let slug = baseSlug;
  for (let i = 2; used.has(slug) && i < 200; i++) {
    slug = `${baseSlug}-${i}`;
  }

  const { data: createdSlug, error } = await supabase.rpc('create_my_city', {
    p_name: name,
    p_slug: slug,
    p_guide_name: guideName,
  });

  if (!error) {
    await trackOperator(user.id, 'place_submitted', {
      meta: { kind, place: name, slug },
    });
  }

  if (error) {
    // Belt and braces: a race could still hit the unique constraint.
    const friendly = /duplicate|unique|already exists/i.test(error.message)
      ? 'Someone just took that address. Please press the button again.'
      : error.message;
    redirect(`/dashboard/new?error=${encodeURIComponent(friendly)}`);
  }

  // A town gets its landmarks swept automatically (auto=1). A venue does not:
  // Google has no record of their walled garden, so we send them to the map
  // picker to drop their own pins, with a tight radius.
  redirect(
    kind === 'venue'
      ? `/dashboard/${createdSlug}/build?venue=1`
      : `/dashboard/${createdSlug}/build?auto=1`
  );
}
