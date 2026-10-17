CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  CREATE TYPE reservation_status AS ENUM ('pending','confirmed','arrived','seated','completed','cancelled','no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE waitlist_status AS ENUM ('waiting','offered','booked','expired','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_mode AS ENUM ('none','deposit','card_guarantee','prepaid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Stockholm',
  phone text,
  email text,
  website_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country_code char(2) NOT NULL DEFAULT 'SE',
  phone text,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, slug)
);

CREATE TABLE IF NOT EXISTS staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','host','viewer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, email)
);

CREATE TABLE IF NOT EXISTS dining_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  min_capacity integer NOT NULL DEFAULT 1 CHECK (min_capacity > 0),
  max_capacity integer NOT NULL CHECK (max_capacity > 0),
  x numeric(7,2),
  y numeric(7,2),
  width numeric(7,2),
  height numeric(7,2),
  shape text NOT NULL DEFAULT 'rectangle' CHECK (shape IN ('rectangle','round','square','bar')),
  active boolean NOT NULL DEFAULT true,
  is_development_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, code),
  CHECK (max_capacity >= min_capacity)
);

CREATE TABLE IF NOT EXISTS table_combinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  min_capacity integer NOT NULL CHECK (min_capacity > 0),
  max_capacity integer NOT NULL CHECK (max_capacity >= min_capacity),
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  is_development_default boolean NOT NULL DEFAULT false,
  UNIQUE (location_id, code)
);

CREATE TABLE IF NOT EXISTS table_combination_members (
  combination_id uuid NOT NULL REFERENCES table_combinations(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
  PRIMARY KEY (combination_id, table_id)
);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  weekday smallint CHECK (weekday BETWEEN 1 AND 7),
  starts_at time,
  ends_at time,
  active boolean NOT NULL DEFAULT true,
  is_development_default boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS opening_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  opens_at time,
  closes_at time,
  closed boolean NOT NULL DEFAULT false,
  valid_from date,
  valid_until date,
  note text,
  source text,
  UNIQUE (location_id, weekday, valid_from)
);

CREATE TABLE IF NOT EXISTS booking_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL UNIQUE REFERENCES locations(id) ON DELETE CASCADE,
  slot_interval_minutes integer NOT NULL DEFAULT 30 CHECK (slot_interval_minutes BETWEEN 5 AND 120),
  default_duration_minutes integer NOT NULL DEFAULT 120 CHECK (default_duration_minutes BETWEEN 30 AND 480),
  buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 120),
  buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_after_minutes BETWEEN 0 AND 120),
  min_party_size integer NOT NULL DEFAULT 1 CHECK (min_party_size > 0),
  max_online_party_size integer NOT NULL DEFAULT 8 CHECK (max_online_party_size > 0),
  large_party_threshold integer NOT NULL DEFAULT 9 CHECK (large_party_threshold > 1),
  min_lead_minutes integer NOT NULL DEFAULT 60 CHECK (min_lead_minutes >= 0),
  max_advance_days integer NOT NULL DEFAULT 90 CHECK (max_advance_days BETWEEN 1 AND 730),
  grace_period_minutes integer NOT NULL DEFAULT 15 CHECK (grace_period_minutes BETWEEN 0 AND 120),
  payment_mode payment_mode NOT NULL DEFAULT 'none',
  deposit_amount_minor integer CHECK (deposit_amount_minor IS NULL OR deposit_amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'SEK',
  is_development_default boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_online_party_size >= min_party_size)
);

CREATE TABLE IF NOT EXISTS capacity_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  weekday smallint CHECK (weekday BETWEEN 1 AND 7),
  starts_at time,
  ends_at time,
  window_minutes integer NOT NULL DEFAULT 30 CHECK (window_minutes BETWEEN 5 AND 180),
  max_arriving_covers integer CHECK (max_arriving_covers > 0),
  max_active_covers integer CHECK (max_active_covers > 0),
  active boolean NOT NULL DEFAULT true,
  is_development_default boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS blocked_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  table_id uuid REFERENCES dining_tables(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  internal_notes text,
  visit_count integer NOT NULL DEFAULT 0,
  no_show_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_restaurant_phone_idx ON customers(restaurant_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_restaurant_email_idx ON customers(restaurant_id, lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  confirmation_code text NOT NULL UNIQUE,
  manage_token_hash text NOT NULL UNIQUE,
  guest_name text NOT NULL,
  guest_phone text NOT NULL,
  guest_email text,
  party_size integer NOT NULL CHECK (party_size > 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status reservation_status NOT NULL DEFAULT 'confirmed',
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','admin','walk_in','phone_ai','chat_ai','import')),
  guest_note text,
  internal_note text,
  payment_mode payment_mode NOT NULL DEFAULT 'none',
  payment_status text NOT NULL DEFAULT 'not_required' CHECK (payment_status IN ('not_required','pending','authorized','paid','refunded','failed')),
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS reservations_location_start_idx ON reservations(location_id, starts_at);
CREATE INDEX IF NOT EXISTS reservations_customer_idx ON reservations(customer_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS reservations_active_idx ON reservations(location_id, starts_at) WHERE status IN ('pending','confirmed','arrived','seated');

CREATE TABLE IF NOT EXISTS reservation_table_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
  during tstzrange NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, table_id)
);
ALTER TABLE reservation_table_assignments DROP CONSTRAINT IF EXISTS no_overlapping_active_table_assignments;
ALTER TABLE reservation_table_assignments
  ADD CONSTRAINT no_overlapping_active_table_assignments
  EXCLUDE USING gist (table_id WITH =, during WITH &&)
  WHERE (active);
CREATE INDEX IF NOT EXISTS reservation_assignments_reservation_idx ON reservation_table_assignments(reservation_id);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  guest_name text NOT NULL,
  guest_phone text NOT NULL,
  guest_email text,
  party_size integer NOT NULL CHECK (party_size > 0),
  requested_date date NOT NULL,
  earliest_time time NOT NULL,
  latest_time time NOT NULL,
  status waitlist_status NOT NULL DEFAULT 'waiting',
  offer_token_hash text UNIQUE,
  offered_until timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latest_time >= earliest_time)
);
CREATE INDEX IF NOT EXISTS waitlist_location_date_idx ON waitlist_entries(location_id, requested_date, status);

CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES reservations(id) ON DELETE CASCADE,
  waitlist_entry_id uuid REFERENCES waitlist_entries(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('booking_created','booking_modified','booking_cancelled','reminder','waitlist_available')),
  channel text NOT NULL DEFAULT 'mock' CHECK (channel IN ('mock','email','sms')),
  recipient text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','suppressed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  actor_type text NOT NULL CHECK (actor_type IN ('guest','staff','system','ai')),
  actor_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_restaurant_created_idx ON audit_logs(restaurant_id, created_at DESC);

INSERT INTO restaurants (id, slug, name, timezone, phone, email, website_url)
VALUES ('11111111-1111-4111-8111-111111111111', 'gojo', 'GOJO Restaurang', 'Europe/Stockholm', '+46737470491', 'info@gojorestaurang.se', 'https://www.gojorestaurang.se/')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, timezone = EXCLUDED.timezone, phone = EXCLUDED.phone,
  email = EXCLUDED.email, website_url = EXCLUDED.website_url, updated_at = now();

INSERT INTO locations (id, restaurant_id, slug, name, address_line1, postal_code, city, country_code, phone, email)
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'stockholm', 'GOJO Stockholm', 'Ringvägen 161', '116 31', 'Stockholm', 'SE', '+46737470491', 'info@gojorestaurang.se')
ON CONFLICT (restaurant_id, slug) DO UPDATE SET
  name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email, updated_at = now();

INSERT INTO opening_hours (location_id, weekday, opens_at, closes_at, closed, note, source, valid_from) VALUES
('22222222-2222-4222-8222-222222222222',1,NULL,NULL,true,'Stängt','public website','2026-10-15'),
('22222222-2222-4222-8222-222222222222',2,NULL,NULL,true,'Stängt','public website','2026-10-15'),
('22222222-2222-4222-8222-222222222222',3,'16:00','23:00',false,NULL,'public website','2026-10-15'),
('22222222-2222-4222-8222-222222222222',4,'16:00','23:00',false,NULL,'public website','2026-10-15'),
('22222222-2222-4222-8222-222222222222',5,'16:00','00:00',false,NULL,'public website','2026-10-15'),
('22222222-2222-4222-8222-222222222222',6,'13:00','00:00',false,NULL,'public website','2026-10-15'),
('22222222-2222-4222-8222-222222222222',7,'13:00','23:00',false,NULL,'public website','2026-10-15')
ON CONFLICT (location_id, weekday, valid_from) DO NOTHING;

INSERT INTO booking_rules (
  location_id, slot_interval_minutes, default_duration_minutes, buffer_before_minutes, buffer_after_minutes,
  min_party_size, max_online_party_size, large_party_threshold, min_lead_minutes, max_advance_days,
  grace_period_minutes, payment_mode, is_development_default
) VALUES (
  '22222222-2222-4222-8222-222222222222', 30, 120, 0, 0, 1, 8, 9, 60, 90, 15, 'none', true
)
ON CONFLICT (location_id) DO NOTHING;

INSERT INTO dining_tables (id, location_id, code, label, min_capacity, max_capacity, x, y, width, height, shape, is_development_default) VALUES
('30000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','T1','Bord 1',1,2,8,12,14,14,'round',true),
('30000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','T2','Bord 2',1,2,27,12,14,14,'round',true),
('30000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222','T3','Bord 3',2,4,52,12,18,14,'rectangle',true),
('30000000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222','T4','Bord 4',2,4,76,12,18,14,'rectangle',true),
('30000000-0000-4000-8000-000000000005','22222222-2222-4222-8222-222222222222','T5','Bord 5',2,6,8,48,24,16,'rectangle',true),
('30000000-0000-4000-8000-000000000006','22222222-2222-4222-8222-222222222222','T6','Bord 6',1,2,42,49,14,14,'square',true),
('30000000-0000-4000-8000-000000000007','22222222-2222-4222-8222-222222222222','T7','Bord 7',2,4,69,48,18,14,'rectangle',true)
ON CONFLICT (location_id, code) DO NOTHING;

INSERT INTO table_combinations (id, location_id, code, label, min_capacity, max_capacity, priority, is_development_default) VALUES
('40000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','C12','Bord 1 + 2',3,4,50,true),
('40000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','C34','Bord 3 + 4',5,8,60,true)
ON CONFLICT (location_id, code) DO NOTHING;

INSERT INTO table_combination_members (combination_id, table_id) VALUES
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'),
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002'),
('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003'),
('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004')
ON CONFLICT DO NOTHING;
