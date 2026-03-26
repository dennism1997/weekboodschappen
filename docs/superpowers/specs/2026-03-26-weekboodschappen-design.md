# Weekboodschappen - Weekly Grocery Shopping App

## Problem

Weekly grocery shopping for a Dutch household involves multiple friction points: deciding what to cook, building a grocery list from recipes, remembering weekly staples, knowing what's on discount, and navigating the store efficiently. This app automates and streamlines the entire workflow.

## Solution

A mobile-first Progressive Web App (PWA) that:
1. Recommends recipes factoring in discounts, season, and household preferences
2. Generates a merged grocery list from selected recipes + weekly staples
3. Sorts the list by store-specific category ordering (Jumbo or Albert Heijn)
4. Learns from usage over time to improve recommendations and staple suggestions
5. Supports shared household access with real-time sync

Hosted at `boodschappen.mouwen.casa`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TailwindCSS + PWA |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite via `better-sqlite3` + Drizzle ORM |
| Recipe scraping | `recipe-scrapers` npm package |
| Store integrations | `jumbo-wrapper` + `albert-heijn-wrapper` |
| AI recommendations | Claude API via [RTK](https://github.com/rtk-ai/rtk) (token-efficient proxy) |
| Real-time sync | Socket.IO (WebSocket with fallback) |
| Auth | Household invite-link system |
| Deployment | Docker + Docker Compose |

---

## Architecture

```
boodschappen.mouwen.casa
         |
    [Nginx reverse proxy]
         |
    [Express API server]
    /    |    \       \
[SQLite] [Recipe] [Store] [Claude API]
         Scraper   APIs
         |
    [React SPA - PWA]
    (served as static files)
```

### Frontend (React SPA + PWA)
- Mobile-first responsive design with TailwindCSS
- PWA with service worker for offline grocery list access during shopping
- Socket.IO client for real-time list sync between household members
- Pages: Meal Planner, Grocery List, Weekly Staples, Store Settings, Recipe History

### Backend (Express + TypeScript)
- REST API for all CRUD operations
- WebSocket server (Socket.IO) for real-time grocery list updates
- Scheduled jobs: weekly discount fetching, recipe recommendation generation
- Recipe URL scraping endpoint

### Database (SQLite)
- Single file database, easy to back up
- Drizzle ORM for type-safe queries and migrations

---

## Data Model

### household
- `id` (UUID, PK)
- `name` (text)
- `invite_code` (text, unique) — for sharing access
- `preferred_store` (enum: jumbo | albert_heijn)
- `created_at` (timestamp)

### user
- `id` (UUID, PK)
- `household_id` (FK -> household)
- `name` (text)
- `password_hash` (text) — simple auth
- `created_at` (timestamp)

### recipe
- `id` (UUID, PK)
- `household_id` (FK -> household)
- `title` (text)
- `source_url` (text, nullable)
- `image_url` (text, nullable)
- `servings` (integer)
- `prep_time_minutes` (integer, nullable)
- `cook_time_minutes` (integer, nullable)
- `ingredients` (JSON) — structured: [{name, quantity, unit, category}]
- `instructions` (JSON) — structured: [{step, text}]
- `tags` (JSON) — e.g., ["vegetarian", "quick", "dutch"]
- `times_cooked` (integer, default 0)
- `last_cooked_at` (timestamp, nullable)
- `created_at` (timestamp)

### weekly_plan
- `id` (UUID, PK)
- `household_id` (FK -> household)
- `week_start` (date) — Monday of the week
- `status` (enum: planning | shopping | completed)
- `store` (enum: jumbo | albert_heijn)
- `created_at` (timestamp)

### weekly_plan_recipe
- `weekly_plan_id` (FK -> weekly_plan)
- `recipe_id` (FK -> recipe)
- `servings_override` (integer, nullable)
- `day_of_week` (integer, nullable) — 0=Monday..6=Sunday

### grocery_list
- `id` (UUID, PK)
- `weekly_plan_id` (FK -> weekly_plan)
- `created_at` (timestamp)

### grocery_item
- `id` (UUID, PK)
- `grocery_list_id` (FK -> grocery_list)
- `name` (text) — display name
- `quantity` (real)
- `unit` (text) — g, kg, ml, L, stuks, etc.
- `category` (text) — e.g., "groente & fruit", "zuivel"
- `source` (enum: recipe | staple | manual)
- `source_recipe_id` (FK -> recipe, nullable)
- `status` (enum: pending | checked | skipped)
- `sort_order` (integer) — based on store category ordering
- `discount_info` (JSON, nullable) — {store, percentage, original_price, sale_price}
- `checked_by` (FK -> user, nullable)
- `checked_at` (timestamp, nullable)

### weekly_staple
- `id` (UUID, PK)
- `household_id` (FK -> household)
- `name` (text)
- `default_quantity` (real)
- `unit` (text)
- `category` (text)
- `active` (boolean, default true)
- `auto_suggested` (boolean, default false) — true if suggested by learning system

### store_config
- `id` (UUID, PK)
- `household_id` (FK -> household)
- `store` (enum: jumbo | albert_heijn)
- `category_order` (JSON) — ordered array of category names

### product_discount
- `id` (UUID, PK)
- `store` (enum: jumbo | albert_heijn)
- `product_name` (text)
- `product_id` (text, nullable) — store-specific product ID
- `category` (text)
- `original_price` (real)
- `sale_price` (real)
- `discount_percentage` (real)
- `valid_from` (date)
- `valid_until` (date)
- `fetched_at` (timestamp)

### shopping_history
- `id` (UUID, PK)
- `household_id` (FK -> household)
- `grocery_item_id` (FK -> grocery_item)
- `item_name` (text) — denormalized for history queries
- `category` (text)
- `was_purchased` (boolean)
- `week_start` (date)
- `store` (enum: jumbo | albert_heijn)

---

## Features

### 1. Recipe Management
- **Paste URL to scrape**: User pastes a recipe URL, backend uses `recipe-scrapers` to extract structured data (title, ingredients, instructions, image, times)
- **Ingredient parsing**: Extracted ingredients are normalized (quantity + unit + name + category). Categories are auto-assigned based on a mapping table (e.g., "melk" -> "zuivel", "ui" -> "groente & fruit")
- **Recipe library**: All scraped recipes are saved to the household's library for reuse
- **Manual additions**: Users can add custom ingredients to any recipe

### 2. Meal Planning (Weekly)
- Each week starts with a planning phase
- **AI recommendations**: Claude API (via RTK for reduced token usage) suggests 5-7 recipes based on:
  - Current weekly discounts from Jumbo and/or AH
  - Household cooking history (what they liked, frequency)
  - Seasonal ingredients
  - Variety (don't suggest pasta 5 times)
  - Tags/preferences (vegetarian days, quick meals for busy nights)
- **Discount highlighting**: Recommended recipes show which ingredients are currently discounted and at which store
- **User selection**: Pick recipes for the week, optionally assign to specific days
- **Servings adjustment**: Override default servings per recipe

### 3. Weekly Staples
- Household maintains a list of items bought every week (e.g., melk, brood, eieren, boter)
- **Auto-suggestions**: After several weeks, items that appear frequently but aren't staples get suggested ("You've bought kaas 4 weeks in a row — add as a staple?")
- **Discount awareness**: If a staple is on discount at one store, highlight it
- **Seasonal staples**: Option to set staples as seasonal (e.g., "only in winter")

### 4. Grocery List Generation
- Triggered after meal planning is done
- **Ingredient merging**: Multiple recipes needing the same ingredient are combined (e.g., 2 recipes each needing 1 ui = 2 uien)
- **Unit normalization**: Convert compatible units (500ml + 1L = 1.5L)
- **Staples added**: Weekly staples automatically included
- **Category assignment**: Each item gets a grocery category
- **Store sorting**: List sorted by the selected store's category order
- **Discount annotations**: Items currently on discount are marked with price info

### 5. Shopping Mode
- **Store-sorted view**: Items grouped by category in store-walking order
- **Check-off**: Tap to mark items as purchased. Synced in real-time to other household members via WebSocket
- **Skip**: Swipe to skip items (tracked for learning)
- **Add on-the-fly**: Add items while shopping that weren't on the list
- **Offline support**: PWA service worker caches the list. Check-offs sync when back online

### 6. Discount Integration
- **Scheduled fetch**: Backend job runs weekly (e.g., Monday morning) to pull current discounts from both Jumbo and AH using their respective wrapper packages
- **Product matching**: Fuzzy matching between discount product names and recipe ingredients / staples
- **Store comparison**: When generating the grocery list, show a summary: "Your list is EUR X at Jumbo, EUR Y at AH" (approximate, based on available discount data)
- **Recommendation boost**: Recipes using discounted ingredients get a recommendation score boost

### 7. Learning System
- Tracks all shopping history: what was purchased, skipped, added manually
- **Staple detection**: Items bought N weeks in a row get suggested as staples
- **Preference learning**: Recipes that are frequently cooked, or whose ingredients are never skipped, get higher recommendation scores
- **Seasonal patterns**: Detects seasonal shopping patterns over time
- Data feeds into Claude API prompts for smarter recommendations

### 8. Shared Household Access
- **Invite link**: Household creator gets a shareable invite link/code
- **Simple auth**: Username + password per member, session-based (JWT)
- **Real-time sync**: Socket.IO broadcasts grocery list changes to all connected household members
- **Activity**: See who checked off what (optional)

---

## Default Category Ordering

Initial default categories (customizable per store per household):

1. Groente & Fruit
2. Bakkerij & Brood
3. Vlees & Vis
4. Kaas & Vleeswaren
5. Zuivel & Eieren
6. Kant-en-klaar & Salades
7. Diepvries
8. Pasta, Rijst & Wereldkeuken
9. Soepen, Sauzen & Kruiden
10. Conserven & Granen
11. Broodbeleg & Ontbijt
12. Snoep & Koek
13. Chips & Noten
14. Dranken
15. Koffie & Thee
16. Huishouden & Schoonmaak
17. Persoonlijke Verzorging
18. Baby & Kind
19. Diervoeding
20. Overig

Users can drag-and-drop to reorder these per store.

---

## API Endpoints

### Auth
- `POST /api/auth/register` — create household + first user
- `POST /api/auth/login` — login, returns JWT
- `POST /api/auth/join` — join household via invite code

### Recipes
- `POST /api/recipes/scrape` — scrape recipe from URL
- `GET /api/recipes` — list household recipes
- `GET /api/recipes/:id` — get recipe details
- `PUT /api/recipes/:id` — update recipe
- `DELETE /api/recipes/:id` — delete recipe

### Meal Planning
- `POST /api/plans` — create weekly plan
- `GET /api/plans/current` — get current week's plan
- `PUT /api/plans/:id` — update plan (add/remove recipes)
- `GET /api/plans/:id/recommendations` — get AI recipe recommendations

### Grocery List
- `POST /api/plans/:id/generate-list` — generate grocery list from plan
- `GET /api/lists/:id` — get grocery list
- `PATCH /api/lists/:id/items/:itemId` — update item status (check/skip)
- `POST /api/lists/:id/items` — add manual item
- WebSocket: `list:update` event for real-time sync

### Staples
- `GET /api/staples` — list weekly staples
- `POST /api/staples` — add staple
- `PUT /api/staples/:id` — update staple
- `DELETE /api/staples/:id` — remove staple
- `GET /api/staples/suggestions` — get auto-suggested staples

### Discounts
- `GET /api/discounts` — get current week's discounts (both stores)
- `GET /api/discounts/compare?items=...` — price comparison for specific items
- `POST /api/discounts/refresh` — manually trigger discount refresh

### Store Config
- `GET /api/stores/config` — get store category orderings
- `PUT /api/stores/config/:store` — update category order for a store

---

## Verification Plan

1. **Recipe scraping**: Paste an AH Allerhande URL and a random recipe site URL, verify ingredients are extracted correctly
2. **Discount fetching**: Trigger a manual refresh, verify Jumbo and AH discounts are stored and displayed
3. **List generation**: Create a weekly plan with 3 recipes + staples, generate list, verify ingredient merging and category sorting
4. **Real-time sync**: Open app on two devices, check off an item on one, verify it appears checked on the other
5. **PWA offline**: Enable airplane mode on phone, verify grocery list is still accessible and check-offs queue for sync
6. **AI recommendations**: Request recommendations, verify they reference current discounts and past history
7. **Store sorting**: Switch between Jumbo and AH, verify list reorders according to store-specific category config
