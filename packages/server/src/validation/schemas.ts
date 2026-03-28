import {z} from "zod";
import type {NextFunction, Request, Response} from "express";

export const scrapeRecipeSchema = z.object({
  url: z.string().url(),
});

export const createStapleSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive().optional(),
  defaultQuantity: z.number().positive().optional(),
  unit: z.string().min(1),
  category: z.string().min(1),
});

export const addRecipeToPlanSchema = z.object({
  recipeId: z.string().uuid(),
  servings: z.number().positive().optional(),
  day: z.enum(["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"]).optional(),
});

export const addListItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
});

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
