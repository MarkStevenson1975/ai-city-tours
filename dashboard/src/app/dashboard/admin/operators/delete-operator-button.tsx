'use client';

import { useState } from 'react';
import { deleteOperator } from './actions';

export function DeleteOperatorButton({ operatorId, email }: { operatorId: string; email: string }) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete operator account for ${email}?\n\nThis will remove their dashboard access and all city assignments. This cannot be undone.`)) return;
    setPending(true);
    const result = await deleteOperator(operatorId);
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
