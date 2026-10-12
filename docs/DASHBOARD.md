# Dashboard guide (shop owners)

Sign in at `/login` and you land on your store's dashboard. If you have no store
yet you are taken to the setup wizard at `/onboarding`.

## Setup wizard

1. **Store details** — display name, campaign URL slug, logo.
2. **Brand & reviews** — primary/secondary colours and an optional Google
   Review URL.
3. **Gifts & purchase tiers** — pre-filled with sensible defaults; edit anything
   that does not match your shop.
4. **Publish** — your public campaign URL, a QR code and a preview link.

Creating the store also creates your owner membership, the default rewards and
tiers, and a free trial subscription.

## Navigation

| Page | What it does |
|---|---|
| **Overview** | Entries, purchase value, customers, gifts awaiting collection, collected gifts, latest entries, and shortcuts. |
| **Customers** | Search and filter every entry; open a record; mark a gift collected; export CSV where your plan allows. |
| **Gifts & Rewards** | Edit gifts and purchase tiers. |
| **My QR Code** | Download the QR (PNG), copy the campaign link, open the print standee. |
| **Store Settings** | Name, logo, colours, campaign copy, Google Review URL, minimum qualifying purchase. |
| **Subscription & Billing** | Plan, trial status, usage this month, upgrade/cancel. |

## Gifts

Each gift has a **gift name** (shown on the reward page), a short **wheel label**
(shown inside the wheel sector), a description, an optional voucher amount,
a claim-code prefix, validity text and an active flag.

Keep wheel labels short — the editor warns above 14 characters so the eight
sectors never overlap.

## Purchase tiers

Each tier has a minimum, an optional maximum, a gift and a wheel segment.
Maximums are **exclusive**: ₹10,000–₹19,999 is entered as `10000` to `20000`.

Saving is validated server-side. You will be told if tiers overlap, contain a
gap, point to a deleted or disabled gift, or start above your minimum qualifying
purchase.

Changing tiers affects **new** customers only. A reward already given keeps the
name, description and value it was assigned, because each entry stores its own
snapshot.

## Gift collection

Every entry starts as **Awaiting collection**. Marking it **Collected** records
the time and the staff member. A gift cannot be marked collected twice — the
second attempt is rejected rather than silently overwriting the first.

## CSV export

Available on plans with CSV export enabled (Growth and above). If your plan does
not include it, the export control explains why instead of failing silently.
