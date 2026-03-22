import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

let pool: Pool | null = null;

export function hasPostgresConfig(): boolean {
  return !!process.env.DATABASE_URL?.trim();
}

export function getPostgresPool(): Pool {
  if (!hasPostgresConfig()) {
    throw new Error("DATABASE_URL не настроен.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 15),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10_000)
    });
  }

  return pool;
}

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  const currentPool = getPostgresPool();
  return currentPool.query<T>(text, values);
}

export async function withTransaction<T>(
  action: (client: PoolClient) => Promise<T>
): Promise<T> {
  const currentPool = getPostgresPool();
  const client = await currentPool.connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
