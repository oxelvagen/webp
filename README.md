# Bildverktyg för Edge

Ett fristående Edge-tillägg för snabb bildredigering direkt i webbläsaren. Du kan beskära, ändra storlek, rotera, spegla och konvertera bilder utan att lämna sidan.

## Översikt

Bildverktyg för Edge fungerar både med lokala bildfiler och bilder som hämtas från den aktiva fliken. Tillägget visar en live-förhandsvisning av resultatet och använder samma redigeringar när bilden exporteras.

## Funktioner

- Beskär bilder manuellt med pixelvärden eller snabba förval som `Kvadrat`, `16:9` och `4:5`
- Ändra storlek med exakt bredd och höjd eller snabbskalor som `25%`, `50%`, `75%` och `100%`
- Rotera och spegla innan export
- Konvertera till `PNG`, `JPG`, `WEBP` och `AVIF` när formatet stöds av den installerade Edge-versionen
- Välj bakgrundsfärg för `JPG`-export när transparens behöver fyllas ut
- Hämta bilder direkt från den aktiva fliken
- Högerklicka på en bild och öppna den direkt i tillägget

## Installera i Edge

1. Öppna `edge://extensions`
2. Aktivera `Developer mode`
3. Klicka på `Load unpacked`
4. Välj mappen där tilläggets filer ligger

## Användning

### Lokal bild

1. Klicka på tilläggsikonen i Edge
2. Välj eller dra in en lokal bild
3. Justera beskärning, storlek, rotation eller spegling
4. Välj målformat och eventuellt kvalitetsläge
5. Spara den färdiga bilden

### Bild från webbsida

1. Öppna en sida med bilder i Edge
2. Klicka på tilläggsikonen
3. Tryck på `Hämta bilder`
4. Välj den bild du vill redigera
5. Justera inställningarna och exportera

### Högerklick på bild

1. Högerklicka på en bild på en webbsida
2. Välj `Redigera bild med Bildverktyg för Edge`
3. Bilden öppnas direkt i verktyget för vidare redigering

## Format och export

| Format | När det passar |
| --- | --- |
| `PNG` | När du vill behålla transparens och bred kompatibilitet |
| `JPG` | När du vill ha mindre filer och kan använda bakgrundsfärg |
| `WEBP` | När du vill ha bra balans mellan kvalitet och filstorlek |
| `AVIF` | När du vill pressa filstorleken ytterligare och stödet finns |

## Att tänka på

- Tillägget använder `<all_urls>` för att kunna läsa bilder från olika webbplatser
- Vid export till `JPG` ersätts transparens med den bakgrundsfärg du har valt
- Animerade `WEBP`-filer exporteras som en enskild bildruta när de ritas till canvas
