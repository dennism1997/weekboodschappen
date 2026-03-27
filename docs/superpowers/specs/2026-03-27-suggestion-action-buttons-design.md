# Suggestie actieknoppen — Ontwerp

## Probleem

Suggesties in het Plan-tabje zijn niet direct bruikbaar. Bestaande recepten hebben alleen een "+ Plan" knop, en nieuwe suggesties (van AI) hebben helemaal geen knoppen. Gebruikers moeten suggesties met één klik aan hun weekplan of receptenbibliotheek kunnen toevoegen.

## Ontwerp

### Twee knoppen per suggestie

Elke suggestiekaart krijgt twee knoppen:

1. **"+ Plan"** — voegt het recept toe aan het huidige weekplan
2. **Recepten-knop (bookmark icoon)** — slaat het op in de receptenbibliotheek

### Gedrag per type suggestie

| Actie | Nieuw recept (`isExisting: false`) | Bestaand recept (`isExisting: true`) |
|-------|-----------------------------------|-------------------------------------|
| **+ Plan** | 1. Maakt recept aan via `POST /recipes/from-suggestion` 2. Voegt toe aan plan via `POST /plans/:id/recipes` | Voegt direct toe via `POST /plans/:id/recipes` |
| **Recepten-knop** | Klikbaar — slaat op via `POST /recipes/from-suggestion`, update suggestie-state naar "opgeslagen" | "Ingedrukt" (filled accent kleur), niet klikbaar — recept staat al in bibliotheek |

### Visueel

- Recepten-knop gebruikt een bookmark/boek icoon (Lucide `BookmarkPlus` / `Bookmark`)
- Wanneer opgeslagen: filled variant met accent achtergrond (zelfde stijl als ingedrukte knop)
- "+ Plan" knop: bestaande accent stijl, altijd klikbaar zolang recept niet al in plan zit

## Server wijziging

### Nieuw endpoint: `POST /recipes/from-suggestion`

Route: `packages/server/src/routes/recipes.ts`

Request body:
```json
{
  "title": "Naam van het gerecht",
  "description": "Korte beschrijving",
  "ingredients": ["ingrediënt1", "ingrediënt2"]
}
```

Logica:
1. Maak een nieuw recept aan met `title`, `description` als tag of notitie
2. Zet `servings` op 4 (standaard)
3. Categoriseer ingrediënten via bestaande `categorizeIngredientSync` + `categorizeBatchWithAI` fallback (zelfde patroon als `/scrape`)
4. Sla op in database, return het volledige recept (inclusief `id`)

Response: het aangemaakte recept-object met `id`.

## Client wijzigingen

Bestand: `packages/client/src/pages/MealPlanner.tsx`

### Nieuwe functie: `saveSuggestionAsRecipe`
- Roept `POST /recipes/from-suggestion` aan
- Returnt het aangemaakte recept (met `id`)
- Invalideert `recipe-search` queries

### Aangepaste functie: `addSuggestionToPlan`
- Als `isExisting: true` → bestaand gedrag (direct toevoegen)
- Als `isExisting: false` → eerst `saveSuggestionAsRecipe`, dan toevoegen aan plan met het nieuwe `id`

### Nieuwe functie: `saveSuggestionToRecipes`
- Roept `saveSuggestionAsRecipe` aan
- Houdt lokale state bij welke suggesties opgeslagen zijn (voor de "ingedrukte" knop-stijl)

### UI per suggestiekaart
- Twee knoppen rechts van de kaart-inhoud
- Bookmark-knop: toggle-stijl (outline → filled bij opgeslagen)
- "+ Plan" knop: bestaande stijl

### Lokale state
- `savedSuggestions: Record<number, string>` — map van suggestie-index naar recipeId, bijgehouden voor de sessie
- Bij opslaan wordt de suggestie als "bestaand" behandeld in verdere interacties

## Bestanden die wijzigen

1. `packages/server/src/routes/recipes.ts` — nieuw `POST /recipes/from-suggestion` endpoint
2. `packages/client/src/pages/MealPlanner.tsx` — knoppen, functies, state

## Verificatie

1. Start dev server: `pnpm dev`
2. Ga naar Plan-tabje
3. Controleer dat suggesties twee knoppen tonen
4. Klik "+ Plan" op een nieuwe suggestie → recept wordt aangemaakt + toegevoegd aan plan
5. Klik bookmark op een nieuwe suggestie → recept wordt opgeslagen, knop wordt "ingedrukt"
6. Bestaande suggesties tonen ingedrukte bookmark + werkende "+ Plan"
