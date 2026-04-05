import {client} from "./ai.js";

interface ScrapedRecipe {
  title: string;
  sourceUrl: string;
  imageUrl: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredients: {
    name: string;
    quantity: number;
    unit: string;
    category: string;
  }[];
  instructions: {
    step: number;
    text: string;
  }[];
}

export async function scrapeRecipe(url: string, distinctId?: string): Promise<ScrapedRecipe> {
  const prompt = `Ga naar deze URL en extraheer het recept: ${url}

Antwoord ALLEEN met een JSON object (geen markdown, geen uitleg) met deze velden:
- "title": naam van het recept
- "imageUrl": URL van de hoofdafbeelding van het recept, of null
- "servings": aantal personen (getal)
- "prepTimeMinutes": voorbereidingstijd in minuten, of null
- "cookTimeMinutes": kooktijd in minuten, of null
- "ingredients": array van objecten met:
  - "name": naam van het ingrediënt (geen keukengerei zoals ovenschaal, bakpapier, etc.)
  - "quantity": hoeveelheid als getal
  - "unit": eenheid (bijv. "g", "ml", "el", "tl", "stuk")
  - "category": "Overig"
- "instructions": array van objecten met:
  - "step": stapnummer (getal)
  - "text": beschrijving van de stap

Negeer keukengerei en gereedschap in de ingrediëntenlijst.
Als je een veld niet kunt vinden, gebruik dan een standaardwaarde (4 personen, null voor tijden).`;

  // @posthog/ai types don't include MonitoringParams on the non-streaming overload
  const create = client.messages.create.bind(client.messages) as any;

  let response = await create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
      },
    ],
    messages: [{ role: "user", content: prompt }],
    posthogDistinctId: distinctId,
  });

  // Handle pause_turn (server-side tool loop continuation)
  let continuations = 0;
  while (response.stop_reason === "pause_turn" && continuations < 3) {
    response = await create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: response.content },
      ],
      posthogDistinctId: distinctId,
    });
    continuations++;
  }

  // Extract text from response
  const text = response.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("\n");

  // Parse JSON from response (may be wrapped in code fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to extract recipe data from web search response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    title: string;
    imageUrl?: string | null;
    servings?: number;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    ingredients: { name: string; quantity: number; unit: string; category?: string }[];
    instructions: { step: number; text: string }[];
  };

  return {
    title: parsed.title || "Naamloos recept",
    sourceUrl: url,
    imageUrl: parsed.imageUrl || null,
    servings: parsed.servings || 4,
    prepTimeMinutes: parsed.prepTimeMinutes ?? null,
    cookTimeMinutes: parsed.cookTimeMinutes ?? null,
    ingredients: (parsed.ingredients || []).map((ing) => ({
      name: ing.name,
      quantity: ing.quantity || 1,
      unit: ing.unit || "stuk",
      category: ing.category || "Overig",
    })),
    instructions: (parsed.instructions || []).map((s, i) => ({
      step: s.step || i + 1,
      text: s.text,
    })),
  };
}
