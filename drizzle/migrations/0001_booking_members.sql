CREATE TABLE public.booking_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  position integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_members_booking_idx ON public.booking_members(booking_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_members TO authenticated;
GRANT ALL ON public.booking_members TO service_role;
ALTER TABLE public.booking_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.booking_members FOR ALL TO authenticated USING (true) WITH CHECK (true);