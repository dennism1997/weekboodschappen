import { db } from "./connection.js";
import { storeConfig } from "./schema.js";
import { eq, and } from "drizzle-orm";

const DEFAULT_CATEGORIES = [
  "Groente & Fruit",
  "Bakkerij & Brood",
  "Vlees & Vis",
  "Kaas & Vleeswaren",
  "Zuivel & Eieren",
  "Kant-en-klaar & Salades",
  "Diepvries",
  "Pasta, Rijst & Wereldkeuken",
  "Soepen, Sauzen & Kruiden",
  "Conserven & Granen",
  "Broodbeleg & Ontbijt",
  "Snoep & Koek",
  "Chips & Noten",
  "Dranken",
  "Koffie & Thee",
  "Huishouden & Schoonmaak",
  "Persoonlijke Verzorging",
  "Baby & Kind",
  "Diervoeding",
  "Overig",
];

export function getDefaultCategories(): string[] {
  return [...DEFAULT_CATEGORIES];
}

export async function seedStoreConfig(householdId: string) {
  const stores = ["jumbo", "albert_heijn"] as const;

  for (const store of stores) {
    const existing = db
      .select()
      .from(storeConfig)
      .where(
        and(
          eq(storeConfig.householdId, householdId),
          eq(storeConfig.store, store),
        ),
      )
      .get();

    if (!existing) {
      db.insert(storeConfig)
        .values({
          id: crypto.randomUUID(),
          householdId,
          store,
          categoryOrder: DEFAULT_CATEGORIES,
        })
        .run();
    }
  }
}

// Run directly if called as script
if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")) {
  console.log("Default categories available for new households:");
  DEFAULT_CATEGORIES.forEach((cat, i) => console.log(`  ${i + 1}. ${cat}`));
  console.log("\nStore configs are seeded per-household on registration.");
}
