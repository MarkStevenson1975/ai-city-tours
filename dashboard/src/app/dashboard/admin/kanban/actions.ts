'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type ActionResult = { ok: boolean; error?: string };

// Every action verifies the caller is an admin before touching data.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') return null;
  return { user, displayName: profile?.display_name ?? null };
}

export async function addKanbanNote(
  operatorId: string,
  note: string
): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, error: 'Unauthorised' };

  const trimmed = note.trim();
  if (!trimmed) return { ok: false, error: 'Note is empty.' };
  if (trimmed.length > 2000) return { ok: false, error: 'Note is too long (2000 characters max).' };

  const admin = createAdminClient();
  const { error } = await admin.from('operator_kanban_notes').insert({
    operator_id: operatorId,
    author_id: caller.user.id,
    author_name: caller.displayName || caller.user.email || 'Admin',
    note: trimmed,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/kanban');
  return { ok: true };
}

export async function hideOperator(operatorId: string): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, error: 'Unauthorised' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('user_profiles')
    .update({ kanban_hidden_at: new Date().toISOString() })
    .eq('id', operatorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/kanban');
  return { ok: true };
}

export async function restoreOperator(operatorId: string): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, error: 'Unauthorised' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('user_profiles')
    .update({ kanban_hidden_at: null })
    .eq('id', operatorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/kanban');
  return { ok: true };
}

export async function hideDemoLead(dedupeKey: string): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, error: 'Unauthorised' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('demo_leads')
    .update({ hidden_at: new Date().toISOString() })
    .eq('dedupe_key', dedupeKey);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/kanban');
  return { ok: true };
}

export async function restoreDemoLead(dedupeKey: string): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (!caller) return { ok: false, error: 'Unauthorised' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('demo_leads')
    .update({ hidden_at: null })
    .eq('dedupe_key', dedupeKey);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/kanban');
  return { ok: true };
}
