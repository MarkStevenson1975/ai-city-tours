'use client';

import { useState } from 'react';
import { deleteVisitor } from './actions';

export function DeleteVisitorButton({ userId, email }: { userId: string; email: string }) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete account for ${email}?\n\nThis will permanently remove their account and all tour progress. This cannot be undone.`)) return;
    setPending(true);
    const result = await deleteVisitor(userId);
    if (!result.ok) {
      alert(`Failed to delete account: ${result.error}`);
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="text-red-500 hover:text-red-700 text-xs font-bold transition disabled:opacity-40 whitespace-nowrap"
    >
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
