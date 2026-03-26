import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/connection.js";

const SECRET = process.env.BETTER_AUTH_SECRET;
if (!SECRET) {
  throw new Error("BETTER_AUTH_SECRET environment variable must be set");
}

const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(",").map((e) => e.trim().toLowerCase())
  : [];

// @ts-ignore - inferred type not portable due to @simplewebauthn/server
export const auth: ReturnType<typeof betterAuth> = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  secret: SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  basePath: "/api/auth",
  trustedOrigins: (process.env.TRUSTED_ORIGINS || "http://localhost:5173").split(","),
  emailAndPassword: { enabled: true },
  databaseHooks: {
    user: {
      create: {
        before: async (user: any) => {
          const email = user.email?.toLowerCase();
          if (ALLOWED_EMAILS.length > 0 && (!email || !ALLOWED_EMAILS.includes(email))) {
            throw new Error("Registratie niet toegestaan voor dit e-mailadres");
          }
          return { data: user };
        },
      },
    },
  },
  session: {
    cookieCache: { enabled: true, maxAge: 300 },
  },
  plugins: [
    organization({ allowUserToCreateOrganization: true }),
    passkey({
      rpID: process.env.PASSKEY_RP_ID || "localhost",
      rpName: "Weekboodschappen",
      origin: process.env.PASSKEY_ORIGIN || "http://localhost:5173",
    }),
  ],
});
