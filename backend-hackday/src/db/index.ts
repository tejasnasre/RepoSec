import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

// node-postgres (not Bun.sql): Drizzle's bun-sql driver double-encodes jsonb values as JSON strings.
// pg also supports interactive transactions, which the pipeline relies on.
// pg already treats sslmode=require/prefer/verify-ca as verify-full (full certificate verification) and warns that
// this alias changes in pg v9. Spelling it out keeps today's strict behavior and silences the warning.
const connectionString = env.DATABASE_URL.replace(/sslmode=(require|prefer|verify-ca)\b/, "sslmode=verify-full");
export const pool = new Pool({ connectionString, max: 12 });
pool.on("error", (e) => console.error("[db] idle client error", e.message));

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
