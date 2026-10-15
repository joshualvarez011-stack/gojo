# GOJO – kundpreview för Netlify

En komplett statisk webbplats: fem HTML-sidor, CSS, JavaScript och lokala bilder.
Inga paket behöver installeras och ingen byggprocess behövs.

## Dela med kunden via Netlify

1. Packa upp gojo-netlify.zip.
2. Logga in på Netlify och öppna https://app.netlify.com/drop
3. Dra in den uppackade mappen gojo-netlify. index.html ska ligga direkt i den mappen.
4. Öppna den adress Netlify ger dig och dela den med kunden.
5. Om din Netlify-miljö skapar privata projekt, ändra projektets åtkomst så kunden kan öppna länken.

En egen Gojo-domän behövs inte för kundvisningen.
Vid en uppdatering drar du in hela den nya mappen på det befintliga projektets Deploys-sida.

## Senaste layoutjustering – 16 oktober 2026

GOJO har full radhöjd så bokstäverna inte beskärs. Den svarta ytan följer textens
höjd på mobil och surfplatta, och restaurangbilden får mer utrymme.

## Innehåll och kontroller – 15 oktober 2026

Meny, priser, kontaktuppgifter och öppettider är jämförda mot:
https://www.gojorestaurang.se/

- Alla 15 menyrätter och priser överensstämmer.
- Telefon: 073-747 04 91.
- E-post: info@gojorestaurang.se.
- Adress: Ringvägen 161 / Renstiernasgatan 48, 116 31 Stockholm.
- Mån–tis: stängt. Ons–tors: 16–23. Fre: 16–00. Lör: 13–00. Sön: 13–23.
- Kitfo beskrivs som serverad stekt, enligt restaurangens meny.
- 105 interna länkar och filreferenser är kontrollerade.
- Alla bilder kan avkodas och alla CSS-bildreferenser finns.
- 31 automatiska beteendekontroller passerade i en simulerad DOM: navigation,
  Escape-tangent, scrollframträdande, reservbeteenden, datum/tid, mejlutkast och kopiering.

Betyget 4,1 visas med hänvisning till Google via Wanderlog och kontrollens datum.
Det är ett avläst värde, inte en automatisk liveintegration.
Citatens avsändare och datum har kontrollerats här:
https://thatsup.se/stockholm/restaurang/gojo
https://wanderlog.com/place/details/1178314/gojo

## Bokningen

Det är en bokningsförfrågan via gästens e-postapp, inte ett system som visar lediga bord
eller bekräftar bokningar. Knappen förbereder ett mejl. Gästen måste skicka mejlet själv,
och restaurangen måste svara och bekräfta. En kopieringslösning finns om e-postappen
inte öppnas.

Formuläret avvisar passerade datum/tider, måndag/tisdag och tider utanför ordinarie
öppettider. Alla tider tolkas i Europe/Stockholm. Helgdagar, kökets sista beställningstid,
kapacitet och särskilda öppettider behöver bekräftas med restaurangen.
Inga provbokningar eller mejl har skickats.

## Verifieringens gränser

Visuell rendering och klicktest i en riktig webbläsare har inte kunnat genomföras i
denna körning. Sluttesta därför mobil/desktop samt din e-postapp på Netlify-länken
innan den används som restaurangens skarpa webbplats. Mejlmottagning hos restaurangen
har inte verifierats.

Sidorna är märkta noindex, nofollow för kundvisning. Ta bort dessa robots-metataggar
när en godkänd version ska ersätta restaurangens riktiga webbplats.
Bekräfta då också aktuella priser, öppettider, bokningshantering och bildanvändning med ägaren.

## Filer

- index.html – startsida
- meny.html – fullständig meny
- om-gojo.html – matkultur och vanliga frågor
- boka.html – bokningsförfrågan via e-post
- kontakt.html – kontaktuppgifter och kartlänk
- styles.css – layout och animationer
- script.js – navigation, animationer och formulär
- assets/ – restaurangbilderna från det tillhandahållna materialet

Netlify-dokumentation: https://docs.netlify.com/deploy/create-deploys/
