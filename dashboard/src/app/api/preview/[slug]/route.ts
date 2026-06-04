// GET /api/preview/<slug>
// Small payload powering the live preview pinned in the dashboard sidebar.
// Returns the tour name, stop count, subscription status, and the first stop.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: city } = await supabase
    .from('cities')
    .select('id, name, subscription_status')
    .eq('slug', slug)
    .single();
  if (!city) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: stops } = await supabase
    .from('stops')
    .select('name, short_description, hero_image_url, hero_image_override_url')
    .eq('city_id', city.id)
    .order('position')
    .limit(1);

  const { count } = await supabase
    .from('stops')
    .select('id', { count: 'exact', head: true })
    .eq('city_id', city.id);

  const first = stops?.[0];
  return NextResponse.json({
    name: city.name,
    subscriptionStatus: city.subscription_status,
    totalStops: count ?? 0,
    firstStop: first
      ? {
          name: first.name,
          shortDescription: first.short_description,
          image: first.hero_image_override_url || first.hero_image_url || null,
        }
      : null,
  });
}
