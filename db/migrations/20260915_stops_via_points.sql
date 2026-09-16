-- Route guidance (applied LIVE 2026-09-15 via Supabase MCP).
-- Optional ordered via-points from this stop to the NEXT stop, so the walking
-- route follows a published path (towpath, coast path, field gate) instead of
-- the router's shortest line. Stored as [{"lat":..,"lng":..}], max 30.
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS via_points jsonb;
ALTER TABLE public.stops DROP CONSTRAINT IF EXISTS stops_via_points_is_array;
ALTER TABLE public.stops ADD CONSTRAINT stops_via_points_is_array
  CHECK (via_points IS NULL OR (jsonb_typeof(via_points) = 'array' AND jsonb_array_length(via_points) <= 30));
COMMENT ON COLUMN public.stops.via_points IS 'Optional ordered via-points (max 30) on the way to the next stop: [{lat,lng}]. Shapes the route line and Take me there directions.';

-- build_city_config: one line added inside the stops object, after nextDirections:
--   'viaPoints', coalesce(s.via_points, '[]'::jsonb),
-- (full function body lives in Supabase; see migration emit_via_points_in_config)
