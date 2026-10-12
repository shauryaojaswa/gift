import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://gift:gift@localhost:5432/gift',
  max: 10,
})

export function query(text, params) {
  return pool.query(text, params)
}

/** Run a function inside a transaction, rolling back on any thrown error. */
export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
