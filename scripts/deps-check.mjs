import fs from 'node:fs'
const out = []
const mods = ['playwright', 'jsqr', 'pngjs', '@supabase/supabase-js']
for (const m of mods) {
  try {
    await import(m)
    out.push(m + '=present')
  } catch {
    out.push(m + '=missing')
  }
}
fs.writeFileSync('logs/deps-check.txt', out.join('\n'), 'ascii')
console.log(out.join(' | '))
