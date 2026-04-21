import { createHash } from "crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./client";
import { apiKeys, users } from "./schema";

/**
 * Compute the SHA-256 hex digest of a raw API key.
 * Only the hash is stored in the database.
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Generate a new raw API key string.
 * Format: "oha_<random>" (open-harness-apikey prefix)
 */
export function generateRawApiKey(): string {
  return `oha_${nanoid(40)}`;
}

/**
 * Create a new API key for a user.
 * Returns the raw key (shown once) and the stored record id.
 */
export async function createApiKey(
  userId: string,
  name = "default",
  expiresAt?: Date,
): Promise<{ rawKey: string; keyId: string }> {
  const rawKey = generateRawApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyId = nanoid();

  await db.insert(apiKeys).values({
    id: keyId,
    userId,
    keyHash,
    name,
    expiresAt: expiresAt ?? null,
    createdAt: new Date(),
  });

  return { rawKey, keyId };
}

/**
 * Validate a raw API key and return the associated userId.
 * Returns null if the key is invalid, expired, or not found.
 * Also updates lastUsedAt on success.
 */
export async function validateApiKey(
  rawKey: string,
): Promise<{ userId: string; username: string } | null> {
  const keyHash = hashApiKey(rawKey);
  const now = new Date();

  const result = await db
    .select({
      keyId: apiKeys.id,
      userId: apiKeys.userId,
      username: users.username,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(
      and(
        eq(apiKeys.keyHash, keyHash),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
      ),
    )
    .limit(1);

  if (!result[0]) return null;

  // Update lastUsedAt asynchronously (fire-and-forget, non-blocking)
  db.update(apiKeys)
    .set({ lastUsedAt: now })
    .where(eq(apiKeys.id, result[0].keyId))
    .catch(() => {
      // Non-critical — ignore errors
    });

  return { userId: result[0].userId, username: result[0].username };
}

/**
 * List all API keys for a user (without the raw key or hash).
 */
export async function listApiKeys(userId: string) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(apiKeys.createdAt);
}

/**
 * Delete an API key by id, ensuring it belongs to the given user.
 */
export async function deleteApiKey(
  keyId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });

  return result.length > 0;
}
