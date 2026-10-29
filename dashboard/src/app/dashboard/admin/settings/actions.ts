'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VOICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') throw new Error('Admins only.');
  return user;
}

export async function addVoice(formData: FormData) {
  const user = await requireAdmin();

  const name = String(formData.get('name') ?? '').trim();
  const voiceId = String(formData.get('voice_id') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  if (!name) return { ok: false as const, error: 'Voice name is required.' };
  if (!VOICE_ID_RE.test(voiceId)) {
    return { ok: false as const, error: 'Enter a valid ElevenLabs Voice ID.' };
  }

  const admin = createAdminClient();
  const { data: last } = await admin
    .from('guide_voices')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? 0) + 1;

  const { error } = await admin.from('guide_voices').insert({
    name,
    voice_id: voiceId,
    description: description || null,
    sort_order: nextOrder,
    created_by: user.id,
  });

  if (error) {
    if (error.code === '23505') {
      return { ok: false as const, error: 'That Voice ID is already in the catalogue.' };
    }
    return { ok: false as const, error: error.message };
  }

  revalidatePath('/dashboard/admin/settings');
  return { ok: true as const };
}

export async function deleteVoice(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false as const, error: 'Missing id.' };

  const admin = createAdminClient();
  const { error } = await admin.from('guide_voices').delete().eq('id', id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard/admin/settings');
  return { ok: true as const };
}
