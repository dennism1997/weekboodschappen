import {categorizeIngredient} from "../utils/categories.js";

interface ParsedIngredient {
  name: string;
  quantity: number;
  unit: string;
  category: string;
}

// Common Dutch units and their normalized forms
const UNIT_MAP: Record<string, string> = {
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
  plak: "plakken",
  plakken: "plakken",
  teen: "tenen",
  tenen: "tenen",
  teentje: "tenen",
  teentjes: "tenen",
  snuf: "snuf",
  snufje: "snuf",
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

// Regex: optional quantity, optional unit, then the ingredient name
const INGREDIENT_REGEX =
  /^(?:(?:ca\.?\s*)?(\d+(?:[.,/]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*)?(\w+\.?)?\s*(.+)$/i;

function parseQuantity(raw: string): number {
  // Handle fractions like "1/2"
  if (raw.includes("/")) {
    const parts = raw.split("/");
    return parseFloat(parts[0]) / parseFloat(parts[1]);
  }
  // Handle ranges like "2-3" — take the average
  if (raw.includes("-") || raw.includes("–")) {
    const parts = raw.split(/[-–]/);
    return (parseFloat(parts[0].replace(",", ".")) + parseFloat(parts[1].replace(",", "."))) / 2;
  }
  return parseFloat(raw.replace(",", "."));
}

export function parseIngredient(raw: string): ParsedIngredient {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  const match = cleaned.match(INGREDIENT_REGEX);

  if (!match) {
    return {
      name: cleaned,
      quantity: 1,
      unit: "stuks",
      category: categorizeIngredient(cleaned),
    };
  }

  const [, rawQty, rawUnit, rawName] = match;

  let quantity = rawQty ? parseQuantity(rawQty) : 1;
  let unit = "stuks";
  let name = rawName?.trim() || cleaned;

  if (rawUnit) {
    const normalizedUnit = rawUnit.toLowerCase().replace(".", "");
    if (UNIT_MAP[normalizedUnit]) {
      unit = UNIT_MAP[normalizedUnit];
    } else {
      // The "unit" is actually part of the name
      name = `${rawUnit} ${name}`.trim();
    }
  }

  // Remove common suffixes like ", gesneden" or "(fijngesneden)"
  name = name
    .replace(/\s*[,(].*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    name,
    quantity: isNaN(quantity) ? 1 : quantity,
    unit,
    category: categorizeIngredient(name),
  };
}
