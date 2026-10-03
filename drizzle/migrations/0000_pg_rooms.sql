CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  check_in timestamptz NOT NULL,
  check_out timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in),
  CONSTRAINT no_overlap EXCLUDE USING gist (room_id WITH =, tstzrange(check_in, check_out) WITH &&) WHERE (status = 'active')
);
CREATE INDEX ON public.rooms(floor_id);
CREATE INDEX ON public.bookings(room_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.floors, public.rooms, public.customers, public.bookings TO authenticated;
GRANT ALL ON public.floors, public.rooms, public.customers, public.bookings TO service_role;

ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all" ON public.floors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON public.bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);