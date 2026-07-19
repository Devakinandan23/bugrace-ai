import { z } from "zod";

export const aiEvaluationSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    rootCauseScore: z.union([
      z.literal(0),
      z.literal(10),
      z.literal(20),
      z.literal(35),
    ]),
    fixScore: z.union([
      z.literal(0),
      z.literal(10),
      z.literal(20),
      z.literal(35),
    ]),
    reasoningScore: z.union([
      z.literal(0),
      z.literal(5),
      z.literal(10),
      z.literal(15),
      z.literal(20),
    ]),
    feedback: z.string().trim().min(1).max(500),
    detectedConcepts: z.array(z.string().trim().min(1).max(80)).max(10),
    missingConcepts: z.array(z.string().trim().min(1).max(80)).max(10),
  })
  .strict();

export const semanticEvaluationSchema = aiEvaluationSchema.extend({
  source: z.enum(["OPENAI", "MOCK", "MOCK_FALLBACK"]),
});
