# Persistent Plannen met Historie — Ontwerp

## Probleem

Het weekplan is gekoppeld aan de huidige week via `getCurrentWeekStart()`. Zodra een nieuwe week begint, is het oude plan onvindbaar via de API. Gebruikers willen:
- Een plan dat blijft bestaan totdat ze het zelf verwijderen
- Meerdere plannen tegelijk (bijv. deze week en volgende week)
- Terug kunnen kijken naar vorige weken
- Een plan een eigen naam kunnen geven

## Ontwerp

### Database wijziging

Voeg een `name` kolom toe aan de `weeklyPlan` tabel:
- Type: `text`, nullable, standaard `null`
- Als `name` null is, wordt de weergavenaam afgeleid van `weekStart` (bijv. "Week 13")

### Server wijzigingen

**`GET /plans`** (nieuw) — Geeft alle plannen van het huishouden terug, gesorteerd op `weekStart` (nieuwste eerst). Elke plan bevat zijn recepten en een `displayName` veld.

**`GET /plans/current`** (aanpassen) — Zoekt nu het **meest recente** plan in plaats van alleen het plan van de huidige week. Fallback: zoek op `weekStart` van huidige week, anders het nieuwste plan ongeacht week.

**`POST /plans`** (aanpassen) — Maakt een plan aan. `weekStart` wordt nog steeds gezet op de huidige week als default, maar het plan is niet meer beperkt tot één per week.

**`PATCH /plans/:id`** (aanpassen) — Accepteert nu ook `name` in de request body om het plan te hernoemen.

**`DELETE /plans/:id`** (nieuw) — Verwijdert een plan en alle bijbehorende `weeklyPlanRecipe` records. Verwijdert NIET de bijbehorende `groceryList`/`groceryItem` records (die blijven als historie).

### Client wijzigingen

**Bestand:** `packages/client/src/pages/MealPlanner.tsx`

#### Plan selector bovenaan
- Horizontale lijst met plan-namen als knoppen/chips
- Standaard naam: "Week {nummer}" afgeleid van `weekStart`
- Custom naam indien ingesteld
- Actieve plan is gehighlight
- "+ Nieuw plan" knop aan het eind

#### Hernoem functie
- Klik op de plan-naam → wordt een inline tekstveld
- Enter of blur slaat op via `PATCH /plans/:id` met `{ name: "..." }`
- Leeg veld → terug naar weeknummer-weergave

#### Verwijder functie
- Verwijder-knop per plan (in de plan-header of via lang drukken)
- Bevestigingsdialoog: "Weet je zeker dat je dit plan wilt verwijderen?"
- Na verwijderen: selecteer het vorige plan, of toon "Nog geen weekplan" als er geen meer zijn

#### Week-label
- Toont nog steeds het datumbereik (bijv. "23 mrt – 29 mrt") onder de plan-naam
- Afgeleid van `weekStart` van het geselecteerde plan

### Helper: weeknummer berekenen

```typescript
function getWeekNumber(weekStart: string): number {
  const date = new Date(weekStart);
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
  return Math.ceil((days + jan1.getDay() + 1) / 7);
}
```

### Weergavenaam logica

```
displayName = plan.name || `Week ${getWeekNumber(plan.weekStart)}`
```

## Bestanden die wijzigen

1. `packages/server/src/db/schema.ts` — `name` kolom op `weeklyPlan`
2. `packages/server/src/routes/plans.ts` — nieuwe GET /plans, DELETE, aangepaste GET /current en PATCH
3. `packages/client/src/pages/MealPlanner.tsx` — plan selector, hernoemen, verwijderen

## Migratie

- Drizzle migratie genereren voor de `name` kolom
- Bestaande plannen krijgen `name = null` (weeknummer als default weergave)

## Verificatie

1. `pnpm dev` starten
2. Maak een plan → toont als "Week {nummer}"
3. Klik op naam → hernoem naar iets anders → naam blijft staan
4. Maak een tweede plan → beide zichtbaar in de lijst
5. Selecteer oud plan → recepten worden getoond
6. Verwijder een plan → verdwijnt uit de lijst
7. Na een week: plan is nog steeds zichtbaar en toegankelijk
