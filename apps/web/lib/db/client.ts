import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { createPostgresClient } from "./postgres-connection";

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

const globalSymbols = globalThis as typeof globalThis & {
  __openHarnessPostgresClient?: ReturnType<typeof createPostgresClient>;
  __openHarnessDrizzleDb?: DrizzleClient;
};

function getDrizzle(): DrizzleClient {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL environment variable is required");
  }

  if (!globalSymbols.__openHarnessDrizzleDb) {
    if (!globalSymbols.__openHarnessPostgresClient) {
      globalSymbols.__openHarnessPostgresClient = createPostgresClient();
    }
    globalSymbols.__openHarnessDrizzleDb = drizzle(
      globalSymbols.__openHarnessPostgresClient,
      { schema },
    );
  }

  return globalSymbols.__openHarnessDrizzleDb;
}

export const db = new Proxy({} as DrizzleClient, {
  get(_, prop) {
    return Reflect.get(getDrizzle(), prop);
  },
});
