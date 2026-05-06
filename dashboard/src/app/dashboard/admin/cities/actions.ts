'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ---- Create a new city ----
export async function createCity(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') redirect('/dashboard');

  const name = String(formData.get('name') ?? '').trim();
  const slug = String(formData.get('slug') ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const guideName = String(formData.get('guide_name') ?? 'Harriet').trim();

  if (!name || !slug) {
    throw new Error('City name and slug are required.');
  }

  // Use the admin client for the insert so the service role bypasses RLS.
  // We've already verified above that the calling user is an admin.
  const admin = createAdminClient();
  const { data: city, error } = await admin
    .from('cities')
    .insert({ name, slug, guide_name: guideName })
    .select('slug')
    .single();

  if (error) throw new Error(error.message);

  redirect(`/dashboard/${city.slug}`);
}

// ---- Invite an operator to a city ----
export async function inviteOperator(formData: FormData) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') redirect('/dashboard');

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const citySlug = String(formData.get('city_slug') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim();

  if (!email || !citySlug) {
    throw new Error('Email and city are required.');
  }

  // Get city ID
  const { data: city, error: cityError } = await supabase
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .single();
  if (cityError || !city) throw new Error('City not found.');

  // Invite via Supabase Auth (sends the invite email automatically)
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://storied-dashboard.vercel.app';

  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/setup-password`,
      data: { display_name: displayName || null },
    });

  if (inviteError) throw new Error(inviteError.message);

  const newUserId = inviteData.user.id;

  // Create user_profiles row
  await admin.from('user_profiles').upsert({
    id: newUserId,
    role: 'operator',
    display_name: displayName || null,
  });

  // Link operator to city
  await admin.from('city_operators').upsert({
    user_id: newUserId,
    city_id: city.id,
  });

  redirect(`/dashboard/${citySlug}?invited=1`);
}
