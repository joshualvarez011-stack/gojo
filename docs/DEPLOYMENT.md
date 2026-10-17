# Deploy preview → produktion

## 1. GitHub
Lägg hela projektroten i `joshualvarez011-stack/gojo`.

Behåll `main` som stabil bas. Skapa exempelvis `booking-system-v1` för bokningssystemet och låt Netlify skapa Deploy Preview från den branchen/PR:n.

## 2. Koppla befintlig Netlify-site
`gojo-restaurang.netlify.app` kopplades till `joshualvarez011-stack/gojo` den 16 oktober 2026 med `main` som production branch.

Efter kopplingen triggas Deploy Preview från nya commits på `booking-system-v1`/PR #1. Production ska fortsatt bygga från `main` tills preview + database-tests är godkända.

## 3. Public build
`npm run build` skapar `dist/`, och `netlify.toml` publicerar endast den katalogen. Kontrollera i deploy-loggen att backendkällor/migrations inte hamnar som statiska publika filer.

## 4. Databas
Netlify Database använder migrationerna i `netlify/database/migrations/`. Kontrollera deploy-loggen och låt preview-databasens migration lyckas innan production publish.

## 5. Admin secrets
Sätt i Netlify Environment variables:
- `GOJO_ADMIN_PASSWORD_HASH`
- `GOJO_ADMIN_SESSION_SECRET`
- `RESTAURANT_SLUG=gojo`
- `LOCATION_SLUG=stockholm`

## 6. Automatiska bekräftelsemejl (Resend)

Bokning, ombokning och avbokning skickar separata svenska HTML+textmejl. Bokningen förblir sparad även när mejltjänsten inte fungerar.

1. Skapa ett konto på https://resend.com och lägg till en domän som restaurangen äger. Verifiera de DNS-poster Resend anger för SPF och DKIM.
2. Skapa en sending-API-nyckel. Lägg enbart i Netlify Project configuration → Environment variables, Functions-scope:
   - `RESEND_API_KEY` (hemlig)
   - `GOJO_EMAIL_FROM` (t.ex. `GOJO <bokning@restaurangens-verifierade-domän.se>`)
   - `GOJO_PUBLIC_BASE_URL` (valfri HTTPS-produktionsdomän om Netlify URL inte räcker)
   - `GOJO_EMAIL_MODE=production` (enbart i Production när restaurangen är redo att gå live)
3. Sätt olika värden för **Production** och **Deploy Previews**. Ändrad variabel kräver en ny deploy.
4. Utskick är **avstängda i alla miljöer om `GOJO_EMAIL_MODE` saknas**. Netlify Functions har inte automatiskt tillgång till byggvariablerna `CONTEXT` eller `DEPLOY_PRIME_URL` – använd egna, kontextstyrda nycklar i Netlify.
   - `GOJO_EMAIL_MODE=preview` (Deploy Previews)
   - `GOJO_ENABLE_PREVIEW_EMAILS=true` (Deploy Previews)
   - `GOJO_EMAIL_TEST_RECIPIENTS=din-registrerade-resend-adress@example.com` (Deploy Previews)
   - `GOJO_PREVIEW_BASE_URL=https://deploy-preview-1--gojo-restaurang.netlify.app` (Deploy Previews, motsvarande rätt PR-nummer)
   - `RESEND_API_KEY` och `GOJO_EMAIL_FROM` i Deploy Previews. För ren testavsändare: `GOJO <onboarding@resend.dev>`, och skicka bara till din egen registrerade Resend-adress.
   - Testlänken valideras mot Netlifys read-only `SITE_NAME`. Riktig leverans via egen avsändardomän kräver verifiering.
   - Om din Netlify-plan inte visar separat deploy-context väljer du att inte aktivera utskick förrän säker separation finns.
5. Testa enbart med tillåten testadress: bokning → inkorg → hantera → ombokning → avbokning. Stäng sedan gärna preview-utskick.

`accepted:true` betyder endast att Resend accepterade utskicket — inte att mejlet nått inkorgen. Verifierad domän, rättslig grund och godkänd hantering av personuppgifter krävs före skarp drift.


## 7. Testmatris i deploy preview
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

## 8. Innan skarp publicering
Gå igenom `GOJO_CONFIRM_BEFORE_LIVE.md` med restaurangen och ersätt development-defaults.

## Dataregion
Netlify Functions använder normalt plattformens standardregion om inget annat valts. Innan riktiga personuppgifter används ska region/DPA-dataflöde verifieras. Om EU-region krävs, konfigurera exempelvis Frankfurt/Dublin/London på en plan som stöder regionval och låt Database provisioneras i samma region.
