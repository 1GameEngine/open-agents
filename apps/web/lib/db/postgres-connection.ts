import postgres from "postgres";

type PostgresClientOptions = NonNullable<Parameters<typeof postgres>[1]>;

function parsePostgresUrl(url: string): {
  user: string;
  password: string;
  database: string;
} {
  const prefixMatch = /^(postgres(?:ql)?:\/\/)/i.exec(url);
  if (!prefixMatch) {
    throw new Error("Invalid POSTGRES_URL");
  }
  const prefix = prefixMatch[1];
  const rest = url.slice(prefix.length);
  const at = rest.lastIndexOf("@");
  if (at === -1) {
    throw new Error("Invalid POSTGRES_URL");
  }
  const auth = rest.slice(0, at);
  const afterAt = rest.slice(at + 1);
  const slash = afterAt.indexOf("/");
  if (slash === -1) {
    throw new Error("Invalid POSTGRES_URL");
  }
  const hostPort = afterAt.slice(0, slash);
  const pathAndQuery = afterAt.slice(slash + 1);
  const database = pathAndQuery.split(/[?#]/)[0] ?? "";

  const colon = auth.indexOf(":");
  const user = colon === -1 ? auth : auth.slice(0, Math.max(0, colon));
  const password = colon === -1 ? "" : auth.slice(colon + 1);

  if (!hostPort || !database) {
    throw new Error("Invalid POSTGRES_URL");
  }

  return {
    user: decodeURIComponent(user),
    password: decodeURIComponent(password),
    database: decodeURIComponent(database),
  };
}

/**
 * When `POSTGRES_SOCKET_PATH` is set (local PGlite over Unix socket), connect
 * with `postgres.js` `path` option. Otherwise use `POSTGRES_URL` as a normal
 * TCP connection string.
 */
export function createPostgresClient(
  overrides: PostgresClientOptions = {},
): ReturnType<typeof postgres> {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("POSTGRES_URL environment variable is required");
  }

  const poolMaxEnv = process.env.POSTGRES_POOL_MAX;
  const poolMax =
    poolMaxEnv !== undefined && poolMaxEnv !== ""
      ? Number.parseInt(poolMaxEnv, 10)
      : undefined;

  const socketPath = process.env.POSTGRES_SOCKET_PATH;
  if (socketPath) {
    const { user, password, database } = parsePostgresUrl(url);
    // PGlite's socket server accepts one active client at a time; a larger
    // pool deadlocks waiting for additional connections.
    return postgres({
      max: 1,
      ...overrides,
      user,
      password,
      database,
      path: socketPath,
    });
  }

  return postgres(url, {
    ...(Number.isFinite(poolMax) && poolMax! > 0 ? { max: poolMax } : {}),
    ...overrides,
  });
}
