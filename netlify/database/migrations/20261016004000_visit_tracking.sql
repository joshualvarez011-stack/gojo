ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS visit_count_recorded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_count_recorded boolean NOT NULL DEFAULT false;
