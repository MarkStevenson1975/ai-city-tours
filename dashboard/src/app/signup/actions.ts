'use server';

// Creates an operator account that is already email-confirmed, so a new user
// goes straight into building with no verification step and no "check your
// email" screen. Uses the service-role admin client (server only). The
// on_auth_user_created trigger still creates their user_profiles row; the
// client then signs in with the same password to get a session.
import { createAdminClient } from '@/lib/supabase/admin';

export async function createOperatorAccount(input: {
  email: string;
  password: string;
  fullName: string;
  organisation: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    return { ok: false, error: 'Please fill in your email and a password.' };
  }
  if (password.length < 8) {
    return {
      ok: false,
      error: 'Please choose a password of at least 8 characters.',
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no verification step: they go straight into building
    user_metadata: {
      full_name: input.fullName.trim(),
      organisation: input.organisation.trim(),
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
    },
  });

  if (error) {
    const msg = error.message || '';
    if (/already|registered|exist/i.test(msg)) {
      return {
        ok: false,
        error:
          'An account with that email already exists. Please sign in instead.',
      };
    }
    return {
      ok: false,
      error: msg || 'Could not create your account. Please try again.',
    };
  }

  return { ok: true };
}
