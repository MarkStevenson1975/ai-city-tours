import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { VoicesManager } from './voices-manager';

export default async function AdminSettingsPage() {
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

  const admin = createAdminClient();
  const { data: voicesData } = await admin
    .from('guide_voices')
    .select('id, name, voice_id, description, sort_order')
    .order('sort_order', { ascending: true });
  const voices = (voicesData ?? []).map((v) => ({
    id: v.id as string,
    name: v.name as string,
    voiceId: v.voice_id as string,
    description: (v.description as string | null) ?? null,
  }));

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-600 shadow-sm hover:border-primary hover:text-primary transition"
      >
        ← Back to Mission Control
      </Link>

      <header className="mt-4 mb-8">
        <p className="text-xs uppercase tracking-widest text-accent font-bold mb-2">
          Admin
        </p>
        <h1 className="text-4xl font-semibold">Settings</h1>
        <p className="text-gray-600 mt-2">
          Platform-wide settings that apply across every tour.
        </p>
      </header>

      <section>
        <h2 className="text-2xl font-semibold mb-1">AI guide voices</h2>
        <p className="text-sm text-gray-600 mb-4">
          The voices operators can choose from. Add a voice once here and it
          becomes available in the guide voice dropdown on every tour.
        </p>
        <VoicesManager voices={voices} />
      </section>
    </div>
  );
}
