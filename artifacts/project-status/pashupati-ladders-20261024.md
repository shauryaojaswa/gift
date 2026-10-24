# Pashupati reward-ladder reconfiguration — 2026-10-24

## Scope

All three Pashupati stores re-laddered to the owner-approved 10-tier spec (identical on
all three), per-store, in-place. No other store touched; each store's submissions,
branding, location label, review policy and other settings preserved.

| Store | slug | id | location label |
|---|---|---|---|
| Pashupati Vijaya Road | `pashupati1` | `eb2c608c-0248-4127-ad26-8b634ecef0a1` | Vijaya Road (preserved) |
| Pashupati Lohta | `pashupati2` | `1842b881-1b8c-45e7-a5bf-553bddf0e597` | Lohta (preserved) |
| Pashupati Godowlia | `pashupati` | `da8b52d7-d227-414d-9965-bb8606054d6c` | Godowlia (preserved) |

## Approved ladder (engine semantics: min ≤ amount < max, admin displays max−1)

| Wheel col | Purchase range | Reward | Claim prefix |
|---|---|---|---|
| 1 | ₹0 – ₹24,999 | Mug | `MUG-` |
| 2 | ₹25,000 – ₹49,999 | Cup Set | `CUP-` |
| 3 | ₹50,000 – ₹99,999 | Varmora Tiffin | `TIFFIN-` |
| 4 | ₹1,00,000 – ₹1,99,999 | ₹999 Gift Voucher | `V999-` |
| 5 | ₹2,00,000 – ₹2,99,999 | Kettle | `KETTLE-` |
| 6 | ₹3,00,000 – ₹3,99,999 | Iron | `IRON-` |
| 7 | ₹4,00,000 – ₹4,99,999 | Omega Blower | `OMEGA-` |
| 8 | ₹5,00,000 – ₹5,99,999 | Mixer | `MIXER-` |
| 9 | ₹6,00,000 – ₹6,99,999 | Induction | `INDUC-` |
| — | ₹7,00,000 – ₹99,99,999 | **UNSPECIFIED — no tier row (designed rejection)** | — |
| 10 | ₹1,00,00,000+ | 100% Off Making Charges (applies to making charges only, not the entire purchase value; 90-day validity) | `MC100-` |

Implementation: the 8 legacy per-store `rewards` rows were rewritten in place (row IDs
preserved so past submissions' snapshot contract was untouched) and 2 rewards + 2 tiers
added per store → 10 active rewards + 10 tier rows per store. Descriptions carry the
making-charges clarification on the special reward.

## Schema support (production migration)

`supabase/migrations/20261024110000_pashupati_ten_tier_ladder.sql` (recorded in
`supabase_migrations.schema_migrations`, applied 2026-10-24): additive constraint
relaxations only — `reward_tiers.min_amount >= 0` (was `> 0`) and
`target_segment <= 9` (was `<= 7`). No data or RLS change.

## Store setting deliberately preserved (owner-visible deviation)

`stores.min_spin_amount` stays ₹1,000 on all three stores (a store setting per the
owners; the DB enforces `> 0`). The engine floors tier selection at
`greatest(tier.min, store.min_spin_amount)`, so:

- ₹1,000 – ₹24,999 → Mug (full tier-1 coverage above the store minimum),
- ₹0 – ₹999 purchases cannot enter the spin flow at all (details validation + engine),
- the tier row itself starts at ₹0 (API-correct; wheel col shows ₹0 – ₹24,999).

If the owners ever want sub-₹1,000 bills to spin, the store owner can raise the
Store Settings → minimum themselves.

## Incident during apply (contained + repaired)

The first apply attempt used value-based idempotent matching
(`.in('min_amount', [old, new])`); cascade collisions folded three tiers into
duplicate Kettle rows and dropped the ₹50k/₹1L brackets on all three stores mid-apply.
Repaired within minutes by `scripts/fix-pashupati-tiers-by-id-20261024.mjs`
(primary-key-based rewrite of all 10 rows per store, vectorised read-back assertion
PASS × 3). Payments: no customer was live-affected between fold and repair other than
the designed rejection appearing for ₹50k–₹1,99,999; no wrong reward was ever issued.

## Verification

1. **Engine boundary matrix** (`scripts/test-pashupati-matrix-20261024.mjs`): 26 amounts
   × 3 stores = **78/78 PASS / 0 FAIL** through the real production
   `submit_customer_entry`, covering every tier interior, every boundary
   (24,999|25,000 … 6,99,999|7,00,000, 999|1,000, 99,99,999|1,00,00,000), and the
   designed rejections (₹0 → "Invalid customer entry"; ₹999 and every ₹7,00,000–₹99,99,999
   amount → "No unique active reward is configured for this purchase amount").
   Claim codes verified to start with the right reward prefix (MUG-, CUP-, …, MC100-).
   All 63 awarded test submissions + rate-limit rows deleted; residue check 0.
2. **Live customer journeys** (deployed bundle on jriq.in): pashupati1 ₹30,000 → CUP SET
   (`CUP-9E7E2287`), pashupati2 ₹62,500 → VARMORA TIFFIN (`TIFFIN-576E9BA1`), pashupati
   ₹3,25,000 → IRON (`IRON-C169974E`); details → review (Google CTA correctly disabled,
   no review URL) → spin → landing on the assigned reward → thank-you with masked phone.
   All cleaned afterward.
3. **Gap-amount UI test (live)**: ₹7,50,000 on pashupati2 shows the designed
   "REWARDS ARE BEING SET UP" screen (no wheel, no prize, retry link) — unspecified
   ranges cannot receive an incorrect reward.
4. **Admin panel display (live, owner sign-in per store)**: Campaign panel shows all
   10 rewards active and all 10 tier ranges exactly as approved, on all three stores.
   Screenshots: `artifacts/pashupati-e2e-20261024/<slug>-admin.png` (also
   `-admin.txt` dumps; ₹ renders correctly on the live UI, mojibake is in the dump
   file only). `scripts/pashupati-visual-e2e-20261024.mjs` rides: 3/3 PASS
   (`CUP-7302E117`, `TIFFIN-9A83BAD0`, `IRON-A7D058C8`).

## Rollback

`C:\Users\ojaswa\backups\jriq\pashupati-ladder-pre-20261024.json` holds the full
pre-change ladder (stores/rewards/reward_tiers) for all three stores.

## Follow-ups flagged

- §7L–₹99,99,999 remains owner-unspecified; currently consumes a safe rejection. If the
  owners later define those brackets, they can add/edit tiers from the Campaign panel
  (header ranges will then show in the wheel automatically).
- Owner panel note: the vendor panel's tier editor was built for 8 columns; with the
  ladder now 10 long, the wheel column selector shows only 1–8 on very old panel
  builds. The displayed panel on production renders all 10 and owners should avoid
  re-segmenting beyond the approved order without asking.
- Voucher vouchers: the ₹999 voucher has no platform value-policy row (legacy reward);
  if the owners want it to route through catalogue policies later, migrate the reward.
- Other tenants' oversized logos from the earlier audit remain unoptimized (3.7 MB,
  2.2 MB, 342 KB).
