# AI-röstbokning — integrationsplan

Booking engine är redan förberedd för AI. AI:n får aldrig skriva direkt i reservations-tabellen utan går via samma validerade server-actions som webben.

## Skyddad endpoint

`POST /api/ai/tools`

Header:

`x-gojo-ai-secret: <GOJO_AI_TOOL_SECRET>`

Endpointen är inaktiv tills secret sätts i Netlify.

## Actions i V1

### `getRestaurantInformation`
Ingen extra payload.

### `checkAvailability`
```json
{
  "action": "checkAvailability",
  "date": "2026-10-17",
  "partySize": 4
}
```

### `createReservation`
```json
{
  "action": "createReservation",
  "name": "Anna Andersson",
  "phone": "+46700000000",
  "email": "anna@example.com",
  "partySize": 4,
  "date": "2026-10-17",
  "time": "19:00",
  "note": "Barnstol"
}
```

Source sparas som `phone_ai`.

### `findReservation`
Kräver confirmation code + privat manage token. För framtida riktig telefon-AI bör vi även lägga till verifiering via telefonnummer + engångskod innan en befintlig bokning ändras.

### `cancelReservation`
Samma privata credentials som ovan.

## Nästa voice-fas

Rekommenderad struktur:

Telefonileverantör → OpenAI Realtime voice agent → tool calls → `/api/ai/tools` → booking engine → Postgres.

AI:n ska:
- alltid kontrollera availability innan den erbjuder/bekräftar en tid,
- läsa tillbaka datum/tid/party size innan create,
- inte lova allergeninformation som inte finns i verifierad knowledge base,
- eskalera stora sällskap, specialfrågor och osäkerhet till personal,
- kunna överföra samtalet till människa.

## Säkerhet före voice launch

- Rotera och lagra AI tool secret endast server-side.
- Lägg till caller/OTP-verifiering för ändra/avboka befintlig reservation.
- Sätt separat rate limit och usage monitoring.
- Definiera knowledge base med verifierade restaurangfakta.
- Definiera fallback om AI eller telefoni ligger nere.
