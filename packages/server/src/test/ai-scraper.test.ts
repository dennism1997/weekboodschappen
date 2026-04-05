import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {createTestUser, getTestDb, setupAuthMock, setupTestDb, teardownTestDb} from "./setup.js";
import {eq} from "drizzle-orm";

setupAuthMock();

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock Playwright
vi.doMock("../services/website-scraper.js", () => ({
  fetchWithBrowser: vi.fn(async () => null) as any,
}));

// Mock AI client
vi.doMock("../services/ai.js", () => ({
  client: {
    messages: {
      create: vi.fn(async () => ({
        content: [{
          type: "text",
          text: JSON.stringify({
            title: "AI Parsed Recipe",
            imageUrl: "https://example.com/ai-image.jpg",
            servings: 2,
            prepTimeMinutes: 10,
            cookTimeMinutes: 20,
            ingredients: ["200 g pasta", "1 ui"],
            instructions: ["Kook de pasta", "Bak de ui"],
          }),
        }],
        stop_reason: "end_turn",
      })),
    },
  },
  categorizeBatchWithAI: vi.fn(async () => ({})),
  getAICallCount: vi.fn(() => 0),
}));

setupTestDb();

const {scrapeRecipe, enrichRecipe} = await import("../services/ai-scraper.js");
const {fetchWithBrowser} = await import("../services/website-scraper.js");
const {client} = await import("../services/ai.js");
const {recipe} = await import("../db/schema.js");

const JSON_LD_HTML = `
<html>
<head><title>Pasta Carbonara - Lekker Recepten</title></head>
<body>
<script type="application/ld+json">
{
  "@type": "Recipe",
  "name": "Pasta Carbonara",
  "image": "https://example.com/carbonara.jpg",
  "recipeYield": "4 servings",
  "prepTime": "PT10M",
  "cookTime": "PT20M",
  "recipeIngredient": ["400 g spaghetti", "200 g spekjes", "4 eieren", "100 g Parmezaanse kaas"],
  "recipeInstructions": [
    {"@type": "HowToStep", "text": "Kook de spaghetti"},
    {"@type": "HowToStep", "text": "Bak de spekjes"},
    {"@type": "HowToStep", "text": "Meng de eieren met kaas"},
    {"@type": "HowToStep", "text": "Combineer alles"}
  ]
}
</script>
</body>
</html>`;

const JSON_LD_GRAPH_HTML = `
<html>
<head><title>Test</title></head>
<body>
<script type="application/ld+json">
{
  "@graph": [
    {"@type": "WebPage", "name": "Some Page"},
    {
      "@type": "Recipe",
      "name": "Graph Recipe",
      "recipeYield": "2",
      "recipeIngredient": ["1 ui", "2 tomaten"],
      "recipeInstructions": [{"@type": "HowToStep", "text": "Snij alles"}]
    }
  ]
}
</script>
</body>
</html>`;

const NO_JSON_LD_HTML = `
<html>
<head>
<title>Stamppot Boerenkool - Oma's Keuken</title>
<meta property="og:image" content="https://example.com/stamppot.jpg">
</head>
<body><p>Some recipe content</p></body>
</html>`;

describe("ai-scraper", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeAll(() => {
    db = getTestDb();
    createTestUser(db, "Scraper Test User");
  });

  afterAll(() => {
    teardownTestDb();
  });

  beforeEach(() => {
    vi.mocked(mockFetch).mockReset();
    vi.mocked(fetchWithBrowser).mockReset();
    vi.mocked(client.messages.create).mockClear();
  });

  describe("scrapeRecipe", () => {
    it("extracts recipe from JSON-LD", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => JSON_LD_HTML });

      const result = await scrapeRecipe("https://example.com/recipe");

      expect(result.needsEnrichment).toBe(false);
      expect(result.title).toBe("Pasta Carbonara");
      expect(result.imageUrl).toBe("https://example.com/carbonara.jpg");
      expect(result.servings).toBe(4);
      expect(result.prepTimeMinutes).toBe(10);
      expect(result.cookTimeMinutes).toBe(20);
      expect(result.ingredients).toHaveLength(4);
      expect(result.ingredients[0].name).toBe("spaghetti");
      expect(result.instructions).toHaveLength(4);
    });

    it("extracts recipe from JSON-LD @graph", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => JSON_LD_GRAPH_HTML });

      const result = await scrapeRecipe("https://example.com/recipe");

      expect(result.needsEnrichment).toBe(false);
      expect(result.title).toBe("Graph Recipe");
      expect(result.ingredients).toHaveLength(2);
    });

    it("returns basic recipe with needsEnrichment when no JSON-LD", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => NO_JSON_LD_HTML });

      const result = await scrapeRecipe("https://example.com/recipe");

      expect(result.needsEnrichment).toBe(true);
      expect(result.title).toBe("Stamppot Boerenkool");
      expect(result.imageUrl).toBe("https://example.com/stamppot.jpg");
      expect(result.ingredients).toHaveLength(0);
      expect(result.instructions).toHaveLength(0);
    });

    it("returns minimal recipe when HTTP fetch fails (403)", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

      const result = await scrapeRecipe("https://example.com/recipe");

      expect(result.needsEnrichment).toBe(true);
      expect(result.title).toBe("Naamloos recept");
      expect(result.ingredients).toHaveLength(0);
    });

    it("returns minimal recipe when fetch throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await scrapeRecipe("https://example.com/recipe");

      expect(result.needsEnrichment).toBe(true);
      expect(result.title).toBe("Naamloos recept");
    });

    it("filters out equipment from ingredients", async () => {
      const htmlWithEquipment = JSON_LD_HTML.replace(
        '"recipeIngredient": ["400 g spaghetti", "200 g spekjes", "4 eieren", "100 g Parmezaanse kaas"]',
        '"recipeIngredient": ["400 g spaghetti", "ovenschaal", "bakpapier vel", "200 g spekjes"]',
      );
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => htmlWithEquipment });

      const result = await scrapeRecipe("https://example.com/recipe");

      const names = result.ingredients.map((i) => i.name);
      expect(names).not.toContain("ovenschaal");
      expect(names).not.toContain("bakpapier vel");
      expect(result.ingredients).toHaveLength(2);
    });
  });

  describe("enrichRecipe", () => {
    it("enriches via JSON-LD when Playwright succeeds", async () => {
      // HTTP fetch fails, Playwright returns JSON-LD HTML
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
      vi.mocked(fetchWithBrowser).mockResolvedValueOnce(JSON_LD_HTML);

      const recipeId = crypto.randomUUID();
      db.insert(recipe).values({
        id: recipeId,
        householdId: "test",
        title: "Naamloos recept",
        servings: 4,
        ingredients: [],
        instructions: [],
        tags: [],
      }).run();

      await enrichRecipe(recipeId, "https://example.com/recipe");

      const updated = db.select().from(recipe).where(eq(recipe.id, recipeId)).get();
      expect(updated!.title).toBe("Pasta Carbonara");
      expect(updated!.status).toBe("ready");
      expect((updated!.ingredients as any[]).length).toBe(4);
      expect((updated!.instructions as any[]).length).toBe(4);
      expect(client.messages.create).not.toHaveBeenCalled();
    });

    it("enriches via Claude when no JSON-LD available and sets status to ready", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => NO_JSON_LD_HTML });

      const recipeId = crypto.randomUUID();
      db.insert(recipe).values({
        id: recipeId,
        householdId: "test",
        title: "Naamloos recept",
        servings: 4,
        ingredients: [],
        instructions: [],
        tags: [],
        status: "pending",
      }).run();

      await enrichRecipe(recipeId, "https://example.com/recipe");

      expect(client.messages.create).toHaveBeenCalledOnce();
      const updated = db.select().from(recipe).where(eq(recipe.id, recipeId)).get();
      expect(updated!.title).toBe("AI Parsed Recipe");
      expect(updated!.status).toBe("ready");
      expect((updated!.ingredients as any[]).length).toBe(2);
      expect((updated!.instructions as any[]).length).toBe(2);
    });

    it("sets status to failed when both HTTP and Playwright fail", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
      vi.mocked(fetchWithBrowser).mockRejectedValueOnce(new Error("Browser failed"));

      const recipeId = crypto.randomUUID();
      db.insert(recipe).values({
        id: recipeId,
        householdId: "test",
        title: "Original Title",
        servings: 4,
        ingredients: [],
        instructions: [],
        tags: [],
        status: "pending",
      }).run();

      await enrichRecipe(recipeId, "https://example.com/recipe");

      const updated = db.select().from(recipe).where(eq(recipe.id, recipeId)).get();
      expect(updated!.title).toBe("Original Title");
      expect(updated!.status).toBe("failed");
      expect(client.messages.create).not.toHaveBeenCalled();
    });

    it("sets status to failed when Claude returns no JSON", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => NO_JSON_LD_HTML });
      vi.mocked(client.messages.create).mockResolvedValueOnce({
        content: [{ type: "text", text: "Ik kan dit recept niet extraheren." }],
        stop_reason: "end_turn",
      } as any);

      const recipeId = crypto.randomUUID();
      db.insert(recipe).values({
        id: recipeId,
        householdId: "test",
        title: "Original Title",
        servings: 4,
        ingredients: [],
        instructions: [],
        tags: [],
        status: "pending",
      }).run();

      await enrichRecipe(recipeId, "https://example.com/recipe");

      const updated = db.select().from(recipe).where(eq(recipe.id, recipeId)).get();
      expect(updated!.status).toBe("failed");
    });
  });
});
