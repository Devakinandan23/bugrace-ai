import { z } from "zod";

const environmentSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65_535),
  WEB_ORIGIN: z.url(),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error(
    "Invalid server environment:",
    parsedEnvironment.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsedEnvironment.data;
