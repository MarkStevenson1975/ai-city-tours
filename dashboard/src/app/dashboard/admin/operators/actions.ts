'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function deleteOperator(operatorId: string): Promise<{ ok: boolean; error?: string }> {
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

  // Prevent self-deletion
  if (operatorId === user.id) return { ok: false, error: 'You cannot delete your own account.' };

  // Remove city assignments and profile first
  await admin.from('city_operators').delete().eq('user_id', operatorId);
  await admin.from('user_profiles').delete().eq('id', operatorId);

  // Delete the auth account
  const { error } = await admin.auth.admin.deleteUser(operatorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/operators');
  return { ok: true };
}
