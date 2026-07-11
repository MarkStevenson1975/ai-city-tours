// Operator pipeline Kanban — column definitions and card shape.
// Each operator appears in exactly one column: the furthest stage they
// have reached. Admin accounts are excluded from the board.

export type ColumnKey =
  | 'registered'
  | 'no_tour'
  | 'tour_created'
  | 'stripe_abandoned'
  | 'in_trial'
  | 'cancelled_trial'
  | 'paying'
  | 'at_risk';

export type KanbanNote = {
  id: string;
  authorName: string;
  note: string;
  createdAt: string; // ISO
};

export type OperatorCard = {
  id: string; // auth user id
  email: string;
  displayName: string | null;
  organisation: string | null; // captured at signup, e.g. Tourist Information
  signedUpAt: string | null; // formatted date
  stageSince: string | null; // formatted date + time they entered this column
  areaNames: string[]; // tour areas, if any
  note: string | null; // stage-specific detail, e.g. trial end date
  badge: string | null; // short status badge, e.g. Paused
  column: ColumnKey;
  columnTitle: string;
  hidden: boolean;
  notes: KanbanNote[]; // engagement log, newest first
};

export const COLUMNS: { key: ColumnKey; title: string; hint: string }[] = [
  {
    key: 'registered',
    title: 'Registered',
    hint: 'Signed up, email not yet verified',
  },
  {
    key: 'no_tour',
    title: 'No Tour',
    hint: 'Verified, no tour created',
  },
  {
    key: 'tour_created',
    title: 'Tour Created',
    hint: 'Built a tour, not yet reached Stripe',
  },
  {
    key: 'stripe_abandoned',
    title: 'Stripe Abandoned',
    hint: 'Opened checkout but did not complete',
  },
  {
    key: 'in_trial',
    title: 'In Trial',
    hint: 'Active 7-day free trial',
  },
  {
    key: 'cancelled_trial',
    title: 'Cancelled Trial',
    hint: 'Cancelled without converting',
  },
  {
    key: 'paying',
    title: 'Paying',
    hint: 'Active paid subscription',
  },
  {
    key: 'at_risk',
    title: 'At Risk',
    hint: 'Paused or payment failed',
  },
];

export const COLUMN_TITLES: Record<ColumnKey, string> = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c.title])
) as Record<ColumnKey, string>;
