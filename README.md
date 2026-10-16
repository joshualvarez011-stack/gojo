# GOJO Booking System — development V1

Detta repo bygger vidare på GOJOs befintliga statiska webbplats med ett eget restaurangbokningssystem. Systemet är byggt för Netlify + Netlify Database (Postgres), med ett statiskt demo-läge som kan testas innan databasen aktiveras.

## Vad som finns nu

### Gäst
- Snabbt flöde: gäster → datum → lediga tider → kontaktuppgifter → bekräftelse.
- Availability från samma booking engine som backend använder vid skrivning.
- Automatisk bordsallokering som föredrar minsta lämpliga bord.
- Stöd för kombinerbara bord.
- Väntelista.
- Privat hanteringslänk utan konto.
- Hämta, boka om och avboka egen bokning.
- Resend-bekräftelsemejl när det är konfigurerat.
- Demo-läge: `boka.html?demo=1`.

### Personal
- `/admin/` med server-side skyddad sessionscookie.
- Dagens bokningar, covers, väntelista och stora sällskap.
- Status: confirmed / arrived / seated / completed / no-show / cancelled.
- Manuell bokning.
- Visuell floor plan.
- Dra bord för att spara x/y-position i riktig drift.
- Ändra centrala bokningsregler i admin.
- Audit log i databasen för viktiga administrativa actions.
- Demo-läge: `/admin/?demo=1`.

### Backend
- Netlify Functions med `/api/...` routes.
- Netlify Database / Postgres migration under `netlify/database/migrations/`.
- Multi-tenant-ready datamodell: restaurants, locations, tables, combinations, opening hours, rules, reservations, customers, waitlist, notifications och audit logs.
- Restaurant/location väljs via env (`RESTAURANT_SLUG`, `LOCATION_SLUG`) i stället för att kärnlogiken behöver skrivas om för nästa restaurang.

## Skydd mot dubbelbokning

Två lager används:
1. `pg_advisory_xact_lock` serialiserar bokningsskrivningar per location + datum.
2. Postgres `EXCLUDE USING gist` förbjuder överlappande aktiva tidsintervall på samma bord.

Det andra lagret är databasskyddet och gäller även om två requests träffar servern samtidigt.

## Development defaults — INTE bekräftade av GOJO

Följande är tillfälliga och tydligt markerade i databasen:
- 7 exempelbord / ca 24 platser.
- Två exempel på bordskombinationer.
- 120 min sittningstid.
- 30 min bokningsintervall.
- 1–8 gäster online.
- 60 min minsta framförhållning.
- 90 dagar bokningshorisont.
- ingen deposition/kortgaranti.

Öppettiderna i seed-data är däremot hämtade från den publika GOJO-information som användes för webbplatsen (kontrollerad 15 oktober 2026).

Se `docs/GOJO_CONFIRM_BEFORE_LIVE.md` innan skarp drift.

## Testa utan databas

Öppna:

- `boka.html?demo=1`
- `admin/?demo=1`

Demo-läget använder endast browserns localStorage och skapar inga riktiga reservationer.

## Public build

Netlify publicerar endast `dist/`. `npm run build` kopierar endast publika HTML/CSS/JS/assets dit, så `netlify/functions`, migrations, tester och docs exponeras inte som statiska filer.

## Netlify Database

Projektet följer Netlifys native migrationsstruktur:

`netlify/database/migrations/20261016003000_booking_core.sql`

När repot kopplas till ett Netlify-projekt och `@netlify/database` installeras kan Netlify provisionera databas och applicera migrations under deploy/deploy preview.

## Environment variables

Kopiera inte secrets till GitHub. Se `.env.example`.

Obligatoriskt för admin i riktig drift:
- `GOJO_ADMIN_PASSWORD_HASH`
- `GOJO_ADMIN_SESSION_SECRET`

Skapa password hash:

```bash
npm run hash-admin-password -- "ett-långt-lösenord"
```

Valfritt:
- `RESEND_API_KEY`
- `GOJO_EMAIL_FROM`
- `GOJO_AI_TOOL_SECRET`
- framtida Twilio/Stripe/OpenAI-nycklar

## API

Publikt:
- `GET /api/restaurant`
- `GET /api/availability?date=YYYY-MM-DD&partySize=2`
- `POST /api/reservations`
- `POST /api/reservation/manage` (lookup/modify/cancel; private token skickas i request body)
- `POST /api/waitlist`

Admin:
- `GET|POST /api/admin/session`
- `GET /api/admin/reservations`
- `POST /api/admin/action`
- `GET|POST /api/admin/settings`

AI-ready, avstängt tills secret konfigureras:
- `POST /api/ai/tools`

## Tester

```bash
npm test
```

Nuvarande pure logic-suite: 11 tester för bordsval, kombinationer, tidsintervall, overlap samt inputvalidering.

## Dataregion före skarp drift

På Netlify Free kan Functions-regionen inte väljas fritt. För riktig gästdatabehandling ska GOJO:s dataskyddsupplägg och Netlify-region verifieras innan production; om EU-region krävs bör Functions/Database placeras i en EU-region på en plan som stödjer regionval.

## Känd gräns i denna arbetsmiljö

Netlify Database kunde inte startas lokalt här eftersom package-installationen från npm inte slutfördes i container-miljön. JavaScript-syntax, pure booking logic och statiska filreferenser har testats. SQL-migrationen ska därför alltid provas i en Netlify deploy preview innan merge/publish till produktion.
