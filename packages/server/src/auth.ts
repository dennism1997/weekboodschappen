import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/connection.js";

const SECRET = process.env.BETTER_AUTH_SECRET;
if (!SECRET) {
  throw new Error("BETTER_AUTH_SECRET environment variable must be set");
}

// @ts-ignore - inferred type not portable due to @simplewebauthn/server
export const auth: ReturnType<typeof betterAuth> = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  secret: SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:6883",
  basePath: "/api/auth",
  trustedOrigins: (process.env.TRUSTED_ORIGINS || "http://localhost:5173").split(","),
  emailAndPassword: { enabled: true },
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
