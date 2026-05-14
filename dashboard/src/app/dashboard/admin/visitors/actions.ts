'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function deleteVisitor(userId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const admin = createAdminClient();

  // Verify the caller is an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return { ok: false, error: 'Unauthorised' };

  // Prevent an admin from deleting their own account here
  if (userId === user.id) return { ok: false, error: 'You cannot delete your own account.' };

  // Delete all user data first (admin client bypasses RLS)
  await admin.from('tour_progress').delete().eq('user_id', userId);
  await admin.from('user_tours').delete().eq('user_id', userId);
  await admin.from('user_profiles').delete().eq('id', userId);

  // Finally delete the auth account
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/visitors');
  return { ok: true };
}
