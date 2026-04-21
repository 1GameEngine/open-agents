#!/usr/bin/env bun
/**
 * Bootstrap script for self-hosted deployments.
 *
 * Creates the first admin user and generates an initial API key.
 * Run once after the database has been migrated:
 *
 *   bun run scripts/bootstrap-admin.ts
 *
 * Environment variables required:
 *   POSTGRES_URL — PostgreSQL connection string
 *
 * Optional:
 *   ADMIN_USERNAME — username for the admin user (default: "admin")
 *   ADMIN_EMAIL    — email for the admin user (default: "admin@localhost")
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { createPostgresClient } from "../lib/db/postgres-connection";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import * as schema from "../lib/db/schema";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error("Error: POSTGRES_URL environment variable is required.");
  process.exit(1);
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost";

const client = createPostgresClient();
const db = drizzle(client, { schema });

async function main() {
  console.log("Bootstrapping self-hosted admin user...\n");

  const existingUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .limit(1);

  const existingKeys = await db
    .select({ id: schema.apiKeys.id })
    .from(schema.apiKeys)
    .limit(1);

  if (existingKeys.length > 0) {
    console.log(
      "Database already has API keys. Use the API to create additional API keys.\n",
    );
    await client.end();
    process.exit(0);
  }

  let userId: string;
  const now = new Date();

  if (existingUsers.length > 0) {
    userId = existingUsers[0].id;
    console.log(
      `Found existing user (id: ${userId}) but no API keys — creating initial bootstrap key.\n`,
    );
  } else {
    userId = nanoid();
    await db.insert(schema.users).values({
      id: userId,
      provider: "github", // placeholder provider for self-hosted
      externalId: `self-hosted:${userId}`,
      accessToken: "", // not used in API key mode
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      name: ADMIN_USERNAME,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    });

    console.log(`Created admin user: ${ADMIN_USERNAME} (id: ${userId})`);
  }

  const rawKey = `oha_${nanoid(40)}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyId = nanoid();

  await db.insert(schema.apiKeys).values({
    id: keyId,
    userId,
    keyHash,
    name: "bootstrap",
    createdAt: now,
  });

  console.log("\n=== Initial API Key ===");
  console.log(`Key: ${rawKey}`);
  console.log("(Store this securely — it will not be shown again)\n");
  console.log("Usage:");
  console.log(
    `  curl -H "Authorization: Bearer ${rawKey}" http://localhost:3000/api/models`,
  );

  await client.end();
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
