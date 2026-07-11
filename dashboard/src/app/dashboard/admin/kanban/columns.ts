// Operator pipeline Kanban — column definitions and card shape.
// Stage 1: board structure only. Stage 2 will populate `OperatorCard[]`
// per column from Supabase auth users, cities and Stripe subscription state.

export type ColumnKey =
  | 'registered'
  | 'email_verified'
  | 'no_tour'
  | 'tour_created'
  | 'stripe_abandoned'
  | 'in_trial'
  | 'cancelled_trial'
  | 'paying';

export type OperatorCard = {
  id: string; // auth user id
  email: string;
  displayName: string | null;
  signedUpAt: string | null; // ISO date
  areaName: string | null; // first/primary tour area, if any
  note: string | null; // stage-specific detail, e.g. trial end date
};

export const COLUMNS: { key: ColumnKey; title: string; hint: string }[] = [
  {
    key: 'registered',
    title: 'Registered',
    hint: 'Signed up, email not yet verified',
  },
  {
    key: 'email_verified',
    title: 'Email Verified',
    hint: 'Verified but not yet started a tour',
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
    hint: 'Trial ended or cancelled without converting',
  },
  {
    key: 'paying',
    title: 'Paying',
    hint: 'Active paid subscription',
  },
];
