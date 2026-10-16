import fs from 'node:fs'
const sql = fs.readFileSync('supabase/migrations/20261016130000_public_gift_pool_read.sql', 'utf8')
const out =
  "insert into supabase_migrations.schema_migrations (version, name, statements)\r\n" +
  "select '20261016130000', 'public_gift_pool_read', array[$sql$" +
  sql +
  '$sql$]\r\n' +
  "where not exists (\r\n  select 1 from supabase_migrations.schema_migrations where version = '20261016130000'\r\n);\r\n"
fs.writeFileSync('logs/insert-version.sql', out, 'utf8')
console.log('built', out.length, 'bytes')
