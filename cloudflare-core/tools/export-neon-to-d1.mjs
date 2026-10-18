/**
 * OFFLINE source data export to a private SQL import file for a NEW EMPTY D1 database.
 * This tool is intentionally never called by the Worker or automatically by CI.
 * Never upload resulting output to GitHub. Uses DATABASE_URL from your terminal.
 */
import pg from 'pg';
import { readFile, mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const { Client } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required (do not put it in source files).');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schema = await readFile(resolve(root, 'migrations/0001_neon_schema_draft.sql'), 'utf8');
const tables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS "([a-z0-9_]+)"/g)].map(m => m[1]);
if (tables.length !== 25) throw new Error('Expected 25 verified source tables; schema has ' + tables.length);
const skip = new Set([
  'admin_sessions', 'admin_login_challenges', 'admin_login_attempts', 'email_verifications'
]);
const sqlLiteral = value => {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return "'" + value.toISOString().replace(/'/g, "''") + "'";
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid numeric field');
    return String(value);
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return "'" + text.replace(/'/g, "''") + "'";
};
await mkdir(resolve(root, '.private'), { recursive: true, mode: 0o700 });
const outputFile = resolve(root, '.private/neon-data-for-d1.sql');
const file = await open(outputFile, 'wx', 0o600); // fail rather than overwrite a previous private backup
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await file.write('-- PRIVATE DATA; NEVER COMMIT OR SEND TO CHAT. Import only into a verified EMPTY D1 database.\n');
  for (const table of tables) {
    if (skip.has(table)) continue;
    const result = await client.query('SELECT * FROM "' + table + '"');
    for (const row of result.rows) {
      const cols = Object.keys(row);
      const quotedCols = cols.map(c => '"' + c + '"').join(',');
      const values = cols.map(c => sqlLiteral(row[c])).join(',');
      await file.write('INSERT INTO "' + table + '" (' + quotedCols + ') VALUES (' + values + ');\n');
    }
    console.log(table + ': ' + result.rows.length + ' rows exported');
  }
  console.log('Private export prepared: cloudflare-core/.private/neon-data-for-d1.sql');
  console.log('Do not use this until staging data parity and security review are complete.');
} finally {
  await client.end().catch(() => {});
  await file.close();
}
