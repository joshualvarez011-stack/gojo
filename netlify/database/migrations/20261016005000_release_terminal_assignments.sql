CREATE OR REPLACE FUNCTION release_terminal_reservation_assignments()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('completed'::reservation_status, 'cancelled'::reservation_status, 'no_show'::reservation_status)
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE reservation_table_assignments
       SET active = false
     WHERE reservation_id = NEW.id
       AND active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservations_release_terminal_assignments ON reservations;
CREATE TRIGGER reservations_release_terminal_assignments
AFTER UPDATE OF status ON reservations
FOR EACH ROW
EXECUTE FUNCTION release_terminal_reservation_assignments();
