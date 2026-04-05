import {integer, real, sqliteTable, text} from "drizzle-orm/sqlite-core";

// Re-export Better Auth tables so Drizzle migrations include them
export * from "./auth-schema.js";

// App-specific tables below.
// householdId columns store the Better Auth organization ID as a plain string.

export const recipe = sqliteTable("recipe", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  imageUrl: text("image_url"),
  servings: integer("servings").notNull().default(4),
  prepTimeMinutes: integer("prep_time_minutes"),
  cookTimeMinutes: integer("cook_time_minutes"),
  ingredients: text("ingredients", { mode: "json" }).notNull().$type<
    {
      name: string;
      quantity: number;
      unit: string;
      category: string;
    }[]
  >(),
  instructions: text("instructions", { mode: "json" }).notNull().$type<
    {
      step: number;
      text: string;
    }[]
  >(),
  tags: text("tags", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
  timesCooked: integer("times_cooked").notNull().default(0),
  lastCookedAt: text("last_cooked_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const weeklyPlan = sqliteTable("weekly_plan", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  weekStart: text("week_start").notNull(),
  name: text("name"),
  status: text("status", {
    enum: ["planning", "shopping", "completed"],
  })
    .notNull()
    .default("planning"),
  store: text("store", {
    enum: ["jumbo", "albert_heijn"],
  }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const weeklyPlanRecipe = sqliteTable("weekly_plan_recipe", {
  id: text("id").primaryKey(),
  weeklyPlanId: text("weekly_plan_id")
    .notNull()
    .references(() => weeklyPlan.id),
  recipeId: text("recipe_id")
    .notNull()
    .references(() => recipe.id),
  servingsOverride: integer("servings_override"),
  dayOfWeek: integer("day_of_week"),
});

export const groceryList = sqliteTable("grocery_list", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  weeklyPlanId: text("weekly_plan_id")
    .references(() => weeklyPlan.id),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const groceryItem = sqliteTable("grocery_item", {
  id: text("id").primaryKey(),
  groceryListId: text("grocery_list_id")
    .notNull()
    .references(() => groceryList.id),
  name: text("name").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull(),
  category: text("category").notNull(),
  source: text("source", {
    enum: ["recipe", "staple", "manual"],
  }).notNull(),
  sourceRecipeId: text("source_recipe_id").references(() => recipe.id),
  status: text("status", {
    enum: ["pending", "checked", "skipped"],
  })
    .notNull()
    .default("pending"),
  sortOrder: integer("sort_order").notNull().default(0),
  discountInfo: text("discount_info", { mode: "json" }).$type<{
    store: string;
    percentage: number;
    originalPrice: number;
    salePrice: number;
  } | null>(),
  checkedBy: text("checked_by"),
  checkedAt: text("checked_at"),
});

export const weeklyStaple = sqliteTable("weekly_staple", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  name: text("name").notNull(),
  defaultQuantity: real("default_quantity").notNull(),
  unit: text("unit").notNull(),
  category: text("category").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  autoSuggested: integer("auto_suggested", { mode: "boolean" })
    .notNull()
    .default(false),
  frequencyWeeks: integer("frequency_weeks").notNull().default(1),
});

export const storeConfig = sqliteTable("store_config", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  store: text("store", {
    enum: ["jumbo", "albert_heijn"],
  }).notNull(),
  categoryOrder: text("category_order", { mode: "json" })
    .notNull()
    .$type<string[]>(),
});

export const productDiscount = sqliteTable("product_discount", {
  id: text("id").primaryKey(),
  store: text("store", {
    enum: ["jumbo", "albert_heijn"],
  }).notNull(),
  productName: text("product_name").notNull(),
  productId: text("product_id"),
  category: text("category").notNull(),
  originalPrice: real("original_price").notNull(),
  salePrice: real("sale_price").notNull(),
  discountPercentage: real("discount_percentage").notNull(),
  validFrom: text("valid_from").notNull(),
  validUntil: text("valid_until").notNull(),
  fetchedAt: text("fetched_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const cachedSuggestion = sqliteTable("cached_suggestion", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  data: text("data", { mode: "json" }).notNull().$type<{
    title: string;
    description: string;
    ingredients: string[];
    discountMatches: string[];
    isExisting: boolean;
    existingRecipeId?: string;
    recipeUrl?: string;
    rating?: number;
    source: "eigen" | "website";
  }>(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const favoriteWebsite = sqliteTable("favorite_website", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  url: text("url").notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const shoppingHistory = sqliteTable("shopping_history", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  groceryItemId: text("grocery_item_id")
    .notNull()
    .references(() => groceryItem.id),
  itemName: text("item_name").notNull(),
  category: text("category").notNull(),
  wasPurchased: integer("was_purchased", { mode: "boolean" }).notNull(),
  weekStart: text("week_start").notNull(),
  store: text("store", {
    enum: ["jumbo", "albert_heijn"],
  }).notNull(),
});
