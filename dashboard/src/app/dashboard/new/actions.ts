'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Self-serve tour creation. Any signed-in operator can create and own a city.
 * Calls the create_my_city Postgres function (SECURITY DEFINER) which inserts
 * the city, links the caller as its operator, and writes an audit row.
 */
export async function createMyTour(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const name = String(formData.get('name') ?? '').trim();
  const guideName = String(formData.get('guide_name') ?? 'Harriet').trim() || 'Harriet';

  if (!name) {
    redirect('/dashboard/new?error=name');
  }

  // Derive a slug from the tour name; the DB function normalises it too.
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const { data: createdSlug, error } = await supabase.rpc('create_my_city', {
    p_name: name,
    p_slug: slug,
    p_guide_name: guideName,
  });

  if (error) {
    // Most likely a duplicate slug. Send the message back to the form.
    redirect(`/dashboard/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/dashboard/${createdSlug}/build`);
}
