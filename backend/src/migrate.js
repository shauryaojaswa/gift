import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool } from './db.js'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

export async function migrate() {
  await pool.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  )
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const { rowCount } = await pool.query('select 1 from schema_migrations where name = $1', [file])
    if (rowCount > 0) continue
    const sql = await readFile(join(migrationsDir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into schema_migrations (name) values ($1)', [file])
      await client.query('commit')
      console.log(`applied migration ${file}`)
    } catch (error) {
      await client.query('rollback')
      throw new Error(`migration ${file} failed: ${error.message}`)
    } finally {
      client.release()
    }
  }
}

// Allow running directly: `node src/migrate.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => pool.end())
    .then(() => console.log('migrations complete'))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
