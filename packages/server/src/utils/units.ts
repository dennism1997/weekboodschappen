// Unit normalization and merging for Dutch grocery units

const UNIT_ALIASES: Record<string, string> = {
  gram: "g",
  gr: "g",
  g: "g",
  kilogram: "kg",
  kilo: "kg",
  kg: "kg",
  milliliter: "ml",
  ml: "ml",
  liter: "L",
  l: "L",
  deciliter: "dl",
  dl: "dl",
  eetlepel: "el",
  eetlepels: "el",
  el: "el",
  theelepel: "tl",
  theelepels: "tl",
  tl: "tl",
  stuk: "stuks",
  stuks: "stuks",
  snuf: "snuf",
  snufje: "snuf",
  plak: "plakken",
  plakken: "plakken",
  teen: "tenen",
  tenen: "tenen",
  teentje: "tenen",
  teentjes: "tenen",
  bos: "bos",
  bosje: "bos",
  tak: "takken",
  takjes: "takken",
  takje: "takken",
  blik: "blik",
  blikje: "blik",
  pot: "pot",
  potje: "pot",
  pakje: "pak",
  pak: "pak",
  zakje: "zak",
  zak: "zak",
  kopje: "kopje",
  kop: "kopje",
};

// Base units for conversion: g for weight, ml for volume
interface BaseConversion {
  baseUnit: string;
  factor: number;
}

const WEIGHT_CONVERSIONS: Record<string, BaseConversion> = {
  g: { baseUnit: "g", factor: 1 },
  kg: { baseUnit: "g", factor: 1000 },
};

const VOLUME_CONVERSIONS: Record<string, BaseConversion> = {
  ml: { baseUnit: "ml", factor: 1 },
  dl: { baseUnit: "ml", factor: 100 },
  L: { baseUnit: "ml", factor: 1000 },
};

/**
 * Normalize a Dutch unit string to its standard form.
 */
export function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim().replace(".", "");
  return UNIT_ALIASES[normalized] || unit;
}

/**
 * Convert a quantity + unit to the base unit (g for weight, ml for volume).
 * Returns null if the unit is not convertible (e.g. "stuks", "el").
 */
export function convertToBaseUnit(
  quantity: number,
  unit: string,
): { quantity: number; unit: string } | null {
  const norm = normalizeUnit(unit);

  if (WEIGHT_CONVERSIONS[norm]) {
    const conv = WEIGHT_CONVERSIONS[norm];
    return { quantity: quantity * conv.factor, unit: conv.baseUnit };
  }

  if (VOLUME_CONVERSIONS[norm]) {
    const conv = VOLUME_CONVERSIONS[norm];
    return { quantity: quantity * conv.factor, unit: conv.baseUnit };
  }

  return null;
}

/**
 * Check if two units belong to the same unit family and can be merged.
 */
function unitsAreCompatible(unitA: string, unitB: string): boolean {
  const normA = normalizeUnit(unitA);
  const normB = normalizeUnit(unitB);

  if (normA === normB) return true;

  const bothWeight =
    normA in WEIGHT_CONVERSIONS && normB in WEIGHT_CONVERSIONS;
  const bothVolume =
    normA in VOLUME_CONVERSIONS && normB in VOLUME_CONVERSIONS;

  return bothWeight || bothVolume;
}

/**
 * Pick a human-friendly display unit for a merged base quantity.
 * For weight: >= 1000g -> kg, otherwise g.
 * For volume: >= 1000ml -> L, >= 100ml -> dl stays ml, otherwise ml.
 */
function toDisplayUnit(
  quantity: number,
  baseUnit: string,
): { quantity: number; unit: string } {
  if (baseUnit === "g") {
    if (quantity >= 1000) {
      return { quantity: Math.round((quantity / 1000) * 100) / 100, unit: "kg" };
    }
    return { quantity: Math.round(quantity * 100) / 100, unit: "g" };
  }

  if (baseUnit === "ml") {
    if (quantity >= 1000) {
      return { quantity: Math.round((quantity / 1000) * 100) / 100, unit: "L" };
    }
    return { quantity: Math.round(quantity * 100) / 100, unit: "ml" };
  }

  return { quantity: Math.round(quantity * 100) / 100, unit: baseUnit };
}

export interface MergeableItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  source?: "recipe" | "staple" | "manual";
  sourceRecipeId?: string | null;
}

/**
 * Merge items with the same ingredient name, combining quantities
 * when units are compatible (e.g. 500g + 1kg = 1.5kg).
 *
 * Uses fuzzy name matching: lowercased, trimmed, and stripped of
 * common suffixes.
 */
export function mergeQuantities(items: MergeableItem[]): MergeableItem[] {
  const merged = new Map<
    string,
    {
      name: string;
      entries: { quantity: number; unit: string }[];
      category: string;
      source: "recipe" | "staple" | "manual";
      sourceRecipeId: string | null;
    }
  >();

  for (const item of items) {
    const key = normalizeName(item.name);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        name: item.name,
        entries: [{ quantity: item.quantity, unit: normalizeUnit(item.unit) }],
        category: item.category,
        source: item.source || "recipe",
        sourceRecipeId: item.sourceRecipeId ?? null,
      });
    } else {
      existing.entries.push({
        quantity: item.quantity,
        unit: normalizeUnit(item.unit),
      });
      // Keep recipe source if any contributor is a recipe
      if (item.source === "recipe") {
        existing.source = "recipe";
      }
    }
  }

  const result: MergeableItem[] = [];

  for (const entry of merged.values()) {
    // Group entries by compatible unit families
    const groups: { quantity: number; unit: string }[][] = [];

    for (const e of entry.entries) {
      let placed = false;
      for (const group of groups) {
        if (unitsAreCompatible(group[0].unit, e.unit)) {
          group.push(e);
          placed = true;
          break;
        }
      }
      if (!placed) {
        groups.push([e]);
      }
    }

    for (const group of groups) {
      // Try converting all to base unit
      const baseConverted = group.map((e) => convertToBaseUnit(e.quantity, e.unit));

      if (baseConverted.every((c) => c !== null)) {
        // All convertible — sum in base unit
        const totalBase = baseConverted.reduce((sum, c) => sum + c!.quantity, 0);
        const display = toDisplayUnit(totalBase, baseConverted[0]!.unit);
        result.push({
          name: entry.name,
          quantity: display.quantity,
          unit: display.unit,
          category: entry.category,
          source: entry.source,
          sourceRecipeId: entry.sourceRecipeId,
        });
      } else {
        // Same normalized unit (e.g. "el") — just sum quantities
        const total = group.reduce((sum, e) => sum + e.quantity, 0);
        result.push({
          name: entry.name,
          quantity: Math.round(total * 100) / 100,
          unit: group[0].unit,
          category: entry.category,
          source: entry.source,
          sourceRecipeId: entry.sourceRecipeId,
        });
      }
    }
  }

  return result;
}

/**
 * Normalize an ingredient name for fuzzy matching.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[,.()\[\]]/g, "");
}
