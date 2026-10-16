# Deploy preview → produktion

## 1. GitHub
Lägg hela projektroten i `joshualvarez011-stack/gojo`.

Behåll `main` som stabil bas. Skapa exempelvis `booking-system-v1` för bokningssystemet och låt Netlify skapa Deploy Preview från den branchen/PR:n.

## 2. Koppla befintlig Netlify-site
När GitHub-repot är komplett kan `gojo-restaurang.netlify.app` kopplas till repot under Netlifys Continuous deployment-inställningar. Gör inte kopplingen medan assets/filer saknas i repot.

## 3. Databas
Netlify Database använder migrationerna i `netlify/database/migrations/`. Kontrollera deploy-loggen och låt preview-databasens migration lyckas innan production publish.

## 4. Admin secrets
Sätt i Netlify Environment variables:
- `GOJO_ADMIN_PASSWORD_HASH`
- `GOJO_ADMIN_SESSION_SECRET`
- `RESTAURANT_SLUG=gojo`
- `LOCATION_SLUG=stockholm`

## 5. Email (valfritt under pilot)
För riktiga confirmations via e-post:
- `RESEND_API_KEY`
- `GOJO_EMAIL_FROM`

Utan dessa skapas reservationen ändå och notification-event markeras som inte konfigurerat.

## 6. Testmatris i deploy preview
- 1, 2, 4, 6 och 8 gäster.
- Fredag/lördag runt stängning 00:00.
- Mån/tis stängt.
- Två samtidiga försök på sista bordet.
- Avbokning frigör bordet.
- Ombokning frigör gammalt bord och tar nytt.
- Admin ändrar status.
- Manuell admin-bokning konkurrerar korrekt med webbokning.
- Väntelista när fullbokat.
- Mobil i Safari/Chrome.

## 7. Innan skarp publicering
Gå igenom `GOJO_CONFIRM_BEFORE_LIVE.md` med restaurangen och ersätt development-defaults.
