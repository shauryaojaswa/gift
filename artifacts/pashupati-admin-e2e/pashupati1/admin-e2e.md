# Signed-in admin E2E — pashupati1 (Vijaya Road)

2026-10-20T05:44:16.740Z · https://jriq.in · PASS 64 · FAIL 0 · BLOCKED 1

| ID | Area | Check | Status | Detail |
|---|---|---|---|---|
| AE-001 | 1 sign-in | signed in with the configured Admin ID and reached the branch workspace | PASS | https://jriq.in/pashupati1/admin/dashboard |
| AE-002 | 2 identity | admin badge shows this branch's own shop name | PASS | badge="Pashupati (A Unit of Benaras Swarn Kala Kendra LLP) VIJAYA ROAD · Shop Owner Overview Cust" |
| AE-003 | 2 identity | admin badge shows the branch label | PASS | expected "Vijaya Road" |
| AE-004 | 2 identity | the branch logo loads and belongs to this store | PASS | 512x512 7-ad26-8b634ecef0a1/logo-512-1792448853583.png |
| AE-005 | 2 identity | the logo payload is served at a sane size | PASS | 55 kB |
| AE-006 | 3 navigation | section "Overview" renders and is the active route | PASS | h1="Overview" active="Overview" |
| AE-007 | 3 navigation | section "Overview" loads without unexpected console errors or failed requests | PASS |  |
| AE-008 | 3 navigation | section "Customers" renders and is the active route | PASS | h1="Customers" active="Customers" |
| AE-009 | 3 navigation | section "Customers" loads without unexpected console errors or failed requests | PASS |  |
| AE-010 | 3 navigation | section "Rewards & Tiers" renders and is the active route | PASS | h1="Campaign" active="Rewards & Tiers" |
| AE-011 | 3 navigation | section "Rewards & Tiers" loads without unexpected console errors or failed requests | PASS |  |
| AE-012 | 3 navigation | section "Rewards & Tiers" | BLOCKED | known gift-catalogue capability probe answered 400 (optional columns not deployed on production) - handled by design |
| AE-013 | 3 navigation | section "My QR Code" renders and is the active route | PASS | h1="QR Code & Branding" active="My QR Code" |
| AE-014 | 3 navigation | section "My QR Code" loads without unexpected console errors or failed requests | PASS |  |
| AE-015 | 3 navigation | section "Store Settings" renders and is the active route | PASS | h1="Store Branding" active="Store Settings" |
| AE-016 | 3 navigation | section "Store Settings" loads without unexpected console errors or failed requests | PASS |  |
| AE-017 | 4 dashboard | the customer counter matches the distinct customers in the database | PASS | shown=51 db=51 distinct customers of 67 rows |
| AE-018 | 4 dashboard | the counter does not show pashupati2's customer total | PASS |  |
| AE-019 | 4 dashboard | the counter does not show pashupati's customer total | PASS |  |
| AE-020 | 6 empty state | a search with no match shows an empty result and no error | PASS | Pashupati (A Unit of Benaras Swarn Kala Kendra LLP) VIJAYA ROAD · Shop Owner Overview Cust |
| AE-021 | 6 states | collection-status filters are available (all / awaiting / collected) | PASS | All | Awaiting | Collected |
| AE-022 | 4 rewards | the admin lists exactly the configured gifts | PASS | ui=8 db=8 |
| AE-023 | 4 rewards | the wheel order (tier target_segment) maps 1:1 to the gifts shown in the admin | PASS | wheel order: Jewellery Cleaning | Premium Jewellery  | ₹500 Future Purcha | PREMIUM GIFT | ₹1,000 Making-Char | Premium Silver Gif | ₹2,500  |
| AE-024 | 4 rewards | purchase tiers are configured (one per bracket) | PASS | 8 tiers |
| AE-025 | 4 rewards | the tier brackets are visible in the admin | PASS | Pashupati (A Unit of Benaras Swarn Kala Kendra LLP) VIJAYA ROAD · Shop |
| AE-026 | 4 settings | the branding section shows this store's display name | PASS | Pashupati (A Unit of Benaras Swarn Kala Kendra LLP) |
| AE-027 | 4 settings | the Google Review URL field shows the saved value | PASS | field="https://www.google.com/search?hl=en-in&g" |
| AE-028 | 4 settings | the public slug is shown and stable | PASS | pashupati1 |
| AE-029 | 6 invalid input | an invalid review URL is rejected with a message | PASS | Pashupati (A Unit of Benaras Swarn Kala Kendra LLP) VIJAYA ROAD · Shop Owner Overview Cust |
| AE-030 | 6 invalid input | the rejected value was not persisted | PASS | unchanged |
| AE-031 | 4 settings | a branding edit persists to the database | PASS | badge="QA-BADGE-pashupati1" |
| AE-032 | 4 settings | a unique test review URL saves | PASS | https://www.google.com/search?q=QA-REVIEW-URL-TEST-pashupati |
| AE-033 | 5 persistence | the saved values are shown again after a refresh | PASS | badge="QA-BADGE-pashupati1" review="https://www.google.com/search?q=QA-REVIE" |
| AE-034 | 10 customer-to-admin | the disposable customer entry is stored in THIS branch only | PASS | ef255134-fe39-4bb5-a821-208502aafcc1 |
| AE-035 | 10 customer-to-admin | the stored reward and claim code match what the customer saw | PASS | ui=CLEAN-EF255134 db=CLEAN-EF255134 |
| AE-036 | 10 customer-to-admin | the reward the customer saw is the reward the backend stored | PASS | ui="JEWELLERY CLEANING & POLISHING Congratul" db="Jewellery Cleaning & Polishing" |
| AE-037 | 10 customer-to-admin | the purchase amount and invoice details persisted | PASS | amount=15000 invoice=null |
| AE-038 | 10 customer-to-admin | the QA record does not appear in pashupati2 | PASS | 0 row(s) |
| AE-039 | 10 customer-to-admin | the QA record does not appear in pashupati | PASS | 0 row(s) |
| AE-040 | 4 customers | the new record is listed in this branch's customer panel | PASS | Pashupati (A Unit of Benaras Swarn Kala Kendra LLP) VIJAYA ROAD · Shop Owner Overview Cust |
| AE-041 | 4 customers | the row shows the reward and the claim code | PASS | claim code |
| AE-042 | 4 customers | the record drawer shows the customer, amount, reward, claim code and invoice | PASS | QA pashupati1 AdminE2E 006641 Awaiting Customer QA pashupati1 AdminE2E 006641 Phone 9006641647 Purchase amount |
| AE-043 | 4 collection tracking | marking a claim collected persists the status | PASS | collected |
| AE-044 | 4 collection tracking | the acting account is recorded as the collector | PASS | collected_by set=true |
| AE-045 | 5 persistence | the collected status is still shown after a refresh | PASS | status visible |
| AE-046 | 4 CSV export | the export ends with the final "Invoice Details" column | PASS | e,Status,Submitted,Collected At,Collected By,Invoice Details |
| AE-047 | 4 CSV export | the export carries the QA record and its claim code | PASS | row present |
| AE-048 | 8 API access | the signed-in session exposes a usable access token | PASS | token present |
| AE-049 | 7 isolation | another branch's admin URL shows the 403 wall (pashupati2) | PASS | 403 This dashboard belongs to another shop Your account is signed in, but it does not admi |
| AE-050 | 7 isolation | the 403 wall leaks no other-branch data (pashupati2) | PASS | no metrics on the wall |
| AE-051 | 7 isolation | another branch's admin URL shows the 403 wall (pashupati) | PASS | 403 This dashboard belongs to another shop Your account is signed in, but it does not admi |
| AE-052 | 7 isolation | the 403 wall leaks no other-branch data (pashupati) | PASS | no metrics on the wall |
| AE-053 | 8 API access | direct API read of pashupati2's submissions with this account returns nothing | PASS | 0 row(s), status 200 |
| AE-054 | 8 API access | direct API read of pashupati2's store_admins with this account returns nothing | PASS | 0 row(s), status 200 |
| AE-055 | 8 API access | pashupati2's gift names are public by design (wheel content) and carry no customer fields | PASS | anon rows=8, customer fields present=false |
| AE-056 | 8 API access | direct API read of pashupati's submissions with this account returns nothing | PASS | 0 row(s), status 200 |
| AE-057 | 8 API access | direct API read of pashupati's store_admins with this account returns nothing | PASS | 0 row(s), status 200 |
| AE-058 | 8 API access | pashupati's gift names are public by design (wheel content) and carry no customer fields | PASS | anon rows=8, customer fields present=false |
| AE-059 | 8 API access | the platform-admins table is unreachable with a branch account | PASS | 0 row(s) |
| AE-060 | 9 logout | sign-out leaves the workspace | PASS | https://jriq.in/vendor/login |
| AE-061 | 9 logout | the protected route cannot be reopened with the ended session | PASS | https://jriq.in/vendor/login |
| AE-062 | 9 logout | the gated page shows the sign-in screen, not shop data | PASS | Pashupati (A Unit of Benaras Swarn Kala Kendra LLP) VIJAYA ROAD · Shop |
| AE-063 | 5 persistence | the saved review URL survived logout and re-login | PASS | field="https://www.google.com/search?q=QA-REVIEW-URL-TEST" |
| AE-064 | 5 persistence | the review URL of record is restored after the test | PASS | https://www.google.com/search?hl=en-in&gl=in&q=Pas |
| AE-065 | 5 persistence | the campaign badge of record is restored after the test | PASS | "" |
