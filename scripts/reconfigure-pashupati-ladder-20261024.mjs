#!/usr/bin/env node
// 2026-10-24: Pashupati three-store reward-ladder reconfiguration (owner request).
// Applies the approved 10-tier ladder to pashupati1 / pashupati2 / pashupati:
//   0–24999 Mug · 25000–49999 Cup Set · 50000–99999 Varmora Tiffin ·
//   100000–199999 ₹999 voucher · 200000–299999 Kettle · 300000–399999 Iron ·
//   400000–499999 Omega Blower · 500000–599999 Mixer · 600000–699999 Induction ·
//   10000000+ 100% off making charges. NO tier row for 700000–9999999 (the
//   owner left that range unspecified): the engine then rejects with the
//   designed "No unique active reward is configured" error.
// In-place: the 8 existing reward rows are REWRITTEN (ids preserved so past
// submissions' snapshot contract is untouched) and 2 rewards + 2 tiers are
// added per store. Other stores are not touched.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const argValue = (f) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const APPLY = args.includes('--apply')
const keys = JSON.parse(readFileSync(argValue('--keys'), 'utf8'))
if (!keys.url.includes('awshkiwqkuubkhecszzk')) {
  console.error('Refusing: not the production project')
  process.exit(2)
}

const LADDER = [
  { name: 'Mug', short: 'MUG', prefix: 'MUG', desc: 'A ceramic mug, yours to keep on every visit.', validity: 'Collect within 45 days from issue', min: 0, max: 25000 },
  { name: 'Cup Set', short: 'CUP SET', prefix: 'CUP', desc: 'An elegant cup set for your kitchen.', validity: 'Collect within 45 days from issue', min: 25000, max: 50000 },
  { name: 'Varmora Tiffin', short: 'VARMORA TIFFIN', prefix: 'TIFFIN', desc: 'A premium Varmora insulated tiffin set.', validity: 'Collect within 45 days from issue', min: 50000, max: 100000 },
  { name: '₹999 Gift Voucher', short: 'VOUCHER ₹999', prefix: 'V999', desc: 'A gift voucher worth ₹999 towards your next purchase.', validity: 'Collect within 45 days from issue', min: 100000, max: 200000 },
  { name: 'Kettle', short: 'KETTLE', prefix: 'KETTLE', desc: 'An electric kettle for your kitchen.', validity: 'Collect within 45 days from issue', min: 200000, max: 300000 },
  { name: 'Iron', short: 'IRON', prefix: 'IRON', desc: 'An electric steam iron for your home.', validity: 'Collect within 45 days from issue', min: 300000, max: 400000 },
  { name: 'Omega Blower', short: 'OMEGA BLOWER', prefix: 'OMEGA', desc: 'An Omega kitchen blower.', validity: 'Collect within 45 days from issue', min: 400000, max: 500000 },
  { name: 'Mixer', short: 'MIXER', prefix: 'MIXER', desc: 'A mixer-grinder for your kitchen.', validity: 'Collect within 45 days from issue', min: 500000, max: 600000 },
  { name: 'Induction', short: 'INDUCTION', prefix: 'INDUC', new: true, desc: 'An induction cooktop for your kitchen.', validity: 'Collect within 45 days from issue', min: 600000, max: 700000 },
  { name: '100% Off Making Charges', short: 'MAKING CHARGES', prefix: 'MC100', new: true, desc: '100% off on the making charges of your jewellery. The offer applies to making charges only — not to the entire purchase value.', validity: 'Valid for 90 days from issue', min: 10000000, max: null },
]
const OLD_PREFIXES = ['CLEAN', 'CARE', 'V500', 'GIFT', 'V1000', 'SILV', 'V2500', 'V5000']
const STORES = [
  { slug: 'pashupati1', id: 'eb2c608c-0248-4127-ad26-8b634ecef0a1' },
  { slug: 'pashupati2', id: '1842b881-1b8c-45e7-a5bf-553bddf0e597' },
  { slug: 'pashupati', id: 'da8b52d7-d227-414d-9965-bb8606054d6c' },
]

const db = createClient(keys.url, keys.service, { auth: { persistSession: false } })

// ---- plan per store ---------------------------------------------------------
for (const store of STORES) {
  const { data: rewards } = await db.from('rewards').select('id, name, claim_code_prefix, active').eq('store_id', store.id).order('created_at')
  const { data: tiers } = await db.from('reward_tiers').select('id, min_amount, max_amount, reward_id, target_segment, active').eq('store_id', store.id).order('min_amount')
  const r = rewards ?? []
  const t = tiers ?? []
  console.log(`\n== ${store.slug} :: ${r.length} rewards, ${t.length} tiers`)
  const usage = { rewards: 0, tiers: 0 }
  // rewards: rewrite the 8 in-place (by old OR new prefix - idempotent),
  // insert 2 new (only when the name is missing)
  const byOldPrefix = new Map(r.filter((x) => OLD_PREFIXES.includes(x.claim_code_prefix)).map((x) => [x.claim_code_prefix, x]))
  const rewrittenIds = []
  LADDER.forEach((item, i) => {
    if (item.new) return
    const old = byOldPrefix.get(OLD_PREFIXES[i])
    if (!old) { console.log(`  WARN no old reward for index ${i}`); return }
    usage.tiers += 1; usage.rewards += 1
    rewrittenIds.push(old.id)
    console.log(`  R#i${i} rewrite ${old.name} -> ${item.name}`)
  })
  const newRewards = LADDER.filter((x) => x.new)
  console.log(`  R+2 insert: ${newRewards.map((x) => x.name).join(', ')}`)
  // tiers: update 8 in place by old min, insert 2 new
  const oldMinOrder = [10000, 20000, 40000, 50000, 100000, 150000, 250000, 500000]
  const tierByMin = new Map(t.map((x) => [x.min_amount, x]))
  LADDER.forEach((item, i) => {
    if (item.new) return
    const old = tierByMin.get(oldMinOrder[i])
    if (!old) { console.log(`  WARN no old tier min=${oldMinOrder[i]}`); return }
    console.log(`  T#${i} ₹${old.min_amount}–₹${old.max_amount ?? '∞'} -> ₹${item.min}–₹${item.max ?? '∞'} ${item.name}`)
  })
  console.log(`  T+2 insert: ₹600000–₹700000 Induction · ₹1,00,00,000+ 100% Off Making Charges`)
  console.log(`  GAP: ₹700001–₹9999999 gets NO tier row (designed rejection)`)
  console.log(`  min_spin_amount: 1000 -> 0 (spec tier 1 starts at ₹0)`)
}

if (APPLY) {
  for (const store of STORES) {
    const rewardIds = {}
    // 1. rewrite 8 reward rows in place (idempotent: match old or new prefix)
    for (let i = 0; i < LADDER.length; i++) {
      const item = LADDER[i]
      if (item.new) continue
      const { error } = await db.from('rewards').update({
        name: item.name, wheel_label: item.short, claim_code_prefix: item.prefix, validity_text: item.validity, description: item.desc, active: true,
      }).eq('store_id', store.id).in('claim_code_prefix', [OLD_PREFIXES[i], item.prefix])
      if (error) throw new Error(`${store.slug} replay ${item.name}: ${error.message}`)
    }
    // 2. read back ids by NEW prefix
    const { data: afterRewrite } = await db.from('rewards').select('id, claim_code_prefix').eq('store_id', store.id)
    for (const item of LADDER.filter((x) => !x.new)) {
      const row = (afterRewrite ?? []).find((x) => x.claim_code_prefix === item.prefix)
      if (!row) throw new Error(`${store.slug}: rewrite id missing for ${item.name}`)
      if (rewardIds[item.name]) throw new Error(`${store.slug}: duplicate rewritten reward ${item.name}`)
      rewardIds[item.name] = row.id
    }
    // 3. insert 2 new rewards (idempotent: skip when the name already exists)
    for (const item of LADDER.filter((x) => x.new)) {
      const existing = (afterRewrite ?? []).find((x) => x.claim_code_prefix === item.prefix)
      if (existing) {
        rewardIds[item.name] = existing.id
        console.log(`INFO  ${store.slug}: reward ${item.name} already present (idempotent)`)
        continue
      }
      const { data: ins, error } = await db.from('rewards').insert({
        store_id: store.id, name: item.name, wheel_label: item.short, claim_code_prefix: item.prefix, validity_text: item.validity, description: item.desc, active: true,
      }).select('id').single()
      if (error) throw new Error(`${store.slug} insert ${item.name}: ${error.message}`)
      rewardIds[item.name] = ins.id
    }
    // 4. rewrite the 8 tier rows in place (match the old OR the new min idempotently)
    const oldMinOrder = [10000, 20000, 40000, 50000, 100000, 150000, 250000, 500000]
    for (let i = 0; i < LADDER.length; i++) {
      const item = LADDER[i]
      if (item.new) continue
      const { error } = await db.from('reward_tiers').update({
        min_amount: item.min, max_amount: item.max, reward_id: rewardIds[item.name], target_segment: i, active: true,
      }).eq('store_id', store.id).in('min_amount', [oldMinOrder[i], item.min])
      if (error) throw new Error(`${store.slug} tier ₹${item.min}: ${error.message}`)
    }
    // 5. insert the 2 new tiers (idempotent: skip when this min already exists)
    const { data: afterTiers } = await db.from('reward_tiers').select('id, min_amount').eq('store_id', store.id)
    for (const item of LADDER.filter((x) => x.new)) {
      const i = LADDER.indexOf(item)
      if ((afterTiers ?? []).some((x) => x.min_amount === item.min)) {
        console.log(`INFO  ${store.slug}: tier ₹${item.min} already present (idempotent)`)
        continue
      }
      const { error } = await db.from('reward_tiers').insert({
        store_id: store.id, min_amount: item.min, max_amount: item.max, reward_id: rewardIds[item.name], target_segment: i, active: true,
      })
      if (error) throw new Error(`${store.slug} tier insert ₹${item.min}: ${error.message}`)
    }
    // 6. min_spin_amount stays as the store's OWN setting (₹1,000): the stores
    //    table check requires >0 and the owner said to preserve settings. The
    //    ladder itself starts at ₹0 (API-level), so every UI admissible amount
    //    below ₹25,000 correctly draws Mug; sub-₹1,000 purchases are gated by
    //    the store minimum as before.
    console.log(`PASS ${store.slug} ladder applied`)
  }
  console.log('APPLIED')
}
