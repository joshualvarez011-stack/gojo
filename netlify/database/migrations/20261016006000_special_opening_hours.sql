CREATE TABLE IF NOT EXISTS special_opening_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  opens_at time,
  closes_at time,
  closed boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, service_date),
  CHECK (closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS special_opening_hours_location_date_idx
  ON special_opening_hours(location_id, service_date);
