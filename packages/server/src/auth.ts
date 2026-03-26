import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/connection.js";

const SECRET = process.env.BETTER_AUTH_SECRET;
if (!SECRET) {
  throw new Error("BETTER_AUTH_SECRET environment variable must be set");
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  secret: SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  basePath: "/api/auth",
  emailAndPassword: { enabled: true },
  session: {
    cookieCache: { enabled: true, maxAge: 300 },
  },
  plugins: [
    organization({ allowUserToCreateOrganization: true }),
  ],
});
