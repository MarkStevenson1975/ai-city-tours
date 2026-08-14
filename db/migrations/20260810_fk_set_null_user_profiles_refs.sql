-- 2026-08-10  Fix: "Database error deleting user" when deleting an operator.
--
-- Deleting an operator failed if they had created or published a tour, because
-- these tables referenced user_profiles with ON DELETE NO ACTION, so the
-- database refused to remove the profile they were still pointed at.
--
-- Switch them to ON DELETE SET NULL: the operator can be deleted and their
-- tours, versions, orders and audit rows are preserved, with the personal
-- reference simply nulled.
--
-- Applied to production via Supabase migration
-- fk_set_null_user_profiles_refs_for_operator_delete.

alter table public.cities drop constraint cities_created_by_fkey,
  add constraint cities_created_by_fkey foreign key (created_by)
  references public.user_profiles(id) on delete set null;

alter table public.cities drop constraint cities_published_by_fkey,
  add constraint cities_published_by_fkey foreign key (published_by)
  references public.user_profiles(id) on delete set null;

alter table public.config_versions drop constraint config_versions_published_by_fkey,
  add constraint config_versions_published_by_fkey foreign key (published_by)
  references public.user_profiles(id) on delete set null;

alter table public.signage_orders drop constraint signage_orders_ordered_by_fkey,
  add constraint signage_orders_ordered_by_fkey foreign key (ordered_by)
  references public.user_profiles(id) on delete set null;

alter table public.audit_log drop constraint audit_log_user_id_fkey,
  add constraint audit_log_user_id_fkey foreign key (user_id)
  references public.user_profiles(id) on delete set null;
