import Anthropic from "@anthropic-ai/sdk";
import {cacheCategory, DEFAULT_CATEGORIES} from "../utils/categories.js";

const client = new Anthropic();

let aiCallCount = 0;

export function getAICallCount(): number {
  return aiCallCount;
}

/**
 * Categorize a batch of ingredient names into Dutch supermarket categories using Claude.
 * Results are cached in-memory for future lookups.
 */
export async function categorizeBatchWithAI(
  ingredientNames: string[],
): Promise<Record<string, string>> {
  if (ingredientNames.length === 0) return {};

  aiCallCount++;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Categorize these Dutch grocery ingredients into supermarket categories.

Categories: ${DEFAULT_CATEGORIES.join(", ")}

Ingredients: ${ingredientNames.join(", ")}

Respond with ONLY valid JSON: {"ingredient_name": "category", ...}
Use exact category names from the list above. Use "Overig" if unsure.`,
      },
    ],
  });

  try {
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(text) as Record<string, string>;

    // Validate and cache results — only allow known categories
    const validated: Record<string, string> = {};
    for (const [name, category] of Object.entries(result)) {
      const validCategory = DEFAULT_CATEGORIES.includes(category) ? category : "Overig";
      validated[name] = validCategory;
      cacheCategory(name, validCategory);
    }

    return validated;
  } catch {
    // If parsing fails, return empty — ingredients will stay "Overig"
    return {};
  }
}
