# StudForge Brick Bounties — product spec (draft, not built)

**Status:** idea, not scheduled. **Owner:** Tony. **Last edit:** 2026‑10‑12.

## 1. The idea in one paragraph

You forge a build in StudForge and get a parts list. Instead of hunting the pieces yourself, you post the
list as a **bounty**: "find me these 212 pieces, here's what I'll pay, ship to Kansas City by the 30th".
**Hunters** (people who already haunt second-hand brick shops, bulk bins, garage sales and incomplete-set
shelves) claim the bounty, pick the pieces, pack them against the checklist and ship. The buyer checks the
delivery against the list, rates it, and the payment releases. Hunters earn a **rank** from how accurate,
fast and well-reviewed they are, which unlocks bigger and more bounties. The cup-of-bricks economy gets a
demand side, and StudForge gets a reason to come back.

## 2. Who it's for

| Role | Who | What they want |
|---|---|---|
| **Builder** (buyer) | Anyone who forged a model and wants it in their hands | Correct parts, fair price, no sorting bins themselves |
| **Hunter** (seller) | Resellers, hobbyists near a bulk bin, parents with a tub of loose brick | Turn time at the bin into money; a reputation that compounds |
| **Shop** (later) | Mom-and-pop second-hand stores | A feed of wanted lists to pull from their stock, and foot traffic |

## 3. End-to-end flow

1. **Forge** a model in StudForge. The BUY panel already shows an estimated cost and lets the builder
   mark bricks they own, so the bounty starts from the *missing* parts only.
2. **Post a bounty** (button in the BUY panel): the builder sets
   - the parts list (auto, editable; each line = part + colour + qty),
   - **flex rules** per line or globally: *exact colour*, *any shade of this colour*, *any colour*;
     *exact part*, *equivalent parts allowed* (two 2×2 bricks for a 2×4), *used OK / new only*,
   - **fill rule**: *all or nothing* vs *partial OK* (pay per piece delivered, with a minimum fill, say 80%),
   - **bounty price**: suggested from the price table (estimate × 1.3 + a flat hunter fee), builder can
     raise it to attract hunters; shipping is quoted separately at label time,
   - deadline, ship-to region (country/state only is public; the full address is released to the hunter
     at claim time, and only then),
   - a photo of the forged model and its share link, so the bounty page looks like something worth building.
   The builder pre-authorises the bounty amount (escrow) when posting.
3. **Bounty board**: public list, filterable by region, size (pieces), price, deadline, flex-friendliness,
   and a "**match my stock**" filter for hunters who've uploaded their own inventory (see §7).
4. **Claim**: a hunter claims the bounty (or a **lot** of it, see below). A claim holds the bounty for a
   window (e.g. 7 days, longer for big lists). Claim limits depend on rank (§5).
5. **Pick**: the hunter gets a phone-friendly **pick list** grouped by part type then colour, with the
   StudForge part render, colour swatch, qty, and a tally control ("found 7 of 12"). A printable version
   for the shop floor. Progress is visible to the builder.
6. **Pack & verify**: before shipping, the hunter photographs the pieces laid out on the printed checklist
   sheet (one photo per group). The app stores the photos with the claim; they're the hunter's evidence
   in a dispute.
7. **Ship**: label bought in-app (EasyPost/Shippo); tracking attached to the claim; builder notified.
8. **Receive & check**: the builder walks the same checklist, marking each line *correct / short by N /
   wrong colour / wrong part / damaged*. This takes 5–10 minutes for a 200-piece build and is the heart
   of the accuracy score. A "looks good, release it" shortcut marks everything correct.
9. **Settle**: escrow releases to the hunter minus the platform fee (§6). Partial deliveries pay per
   accepted piece. The builder leaves a short review (stars + tags: *clean*, *well packed*, *fast*,
   *great substitutions*); the hunter can review the builder (*clear list*, *quick to confirm*).
10. **Dispute** (rare path): either side opens one within 7 days; both sides' photos are attached;
    support decides; outcomes feed the rank (§5).

### Lots: splitting one bounty across hunters

Big builds (500+ pieces, lots of colours) are hard for one hunter. The builder can allow **lots**: the
parts list is auto-split into sensible groups (plates, bricks, slopes/specials, by colour family), and
hunters claim individual lots. Each lot ships separately and settles separately. The bounty completes when
all lots are accepted. The suggested price is split by estimated value with a small per-lot floor so a
"12 trans-blue 1×1 round plates" lot is still worth picking.

## 4. Accuracy, the core metric

For every settled claim:

- **requested** = Σ qty on the lines the hunter claimed
- **accepted** = Σ pieces the builder marked correct (including accepted substitutions)
- **accuracy** = accepted / requested (0–1)
- **fill** = pieces delivered / requested (differs from accuracy when wrong pieces were sent)
- **on‑time** = shipped before the claim window ended
- **condition** = builder's condition grade vs what was promised

Rolling hunter score (last 20 claims, newer weighted higher):

```
score = 0.45·accuracy + 0.20·fill + 0.15·on‑time rate + 0.15·avg review (0–1) + 0.05·builder repeat rate
         − 0.25·dispute‑loss rate − 0.10·abandoned‑claim rate
```

Published on the profile as a 0–100 number plus the raw stats, so the number is explainable.

## 5. Ranks

| Rank | Requirement | Unlocks |
|---|---|---|
| **Scout** | new, verified email + payout account | 1 open claim, bounties ≤ $25, no lots over 60 pieces |
| **Picker** | 3 settled claims, score ≥ 70 | 2 open claims, ≤ $75 |
| **Sorter** | 10 settled, score ≥ 80, ≤ 1 dispute lost | 4 open claims, ≤ $200, can claim lots of big bounties |
| **Master Sorter** | 30 settled, score ≥ 88, 0 disputes lost in last 20 | 8 open claims, no cap, **priority claim** (24 h head start on new bounties) |
| **Brickmaster** | 100 settled, score ≥ 92, builder repeat rate ≥ 25% | featured on the board, can set *shop* storefronts (§7), reduced fee |

Ranks can drop one level after a lost dispute or a score fall below the threshold for 5 consecutive claims.
A badge row shows specialities earned from the data: *Trans‑clear whisperer* (high accuracy on trans parts),
*Colour matcher* (low wrong-colour rate), *Speed picker*, *Big lot hauler*.

Builders have a lighter reputation too (*confirms fast*, *fair checker*), because a builder who marks
everything wrong hurts hunters; the dispute process protects both sides.

## 6. Money

- **Suggested bounty** = parts estimate (BUY table) × 1.3 + $4 handling, rounded up to the dollar.
  Builders can set any price ≥ estimate × 0.9; the board shows a "generous / fair / low" tag so cheap
  bounties simply sit there rather than getting bad fulfilment.
- **Shipping**: quoted at claim time from the hunter's location, paid by the builder at label purchase
  (flat tiers: small box / medium box). Shown as an estimate on the bounty page before posting.
- **Platform fee**: 12% from the hunter's side (10% for Brickmasters) + $0.50 per settled claim from the
  builder. Escrow and payouts via Stripe Connect (Express accounts, so tax forms and KYC are Stripe's job).
- **Partial fill**: pay per accepted piece at the bounty's per-piece rate (line value share), only if the
  builder allowed partial fills and the minimum fill was met; otherwise the hunter can ship what they have
  and the builder may accept it anyway (a "take it" button).
- **Abandoned claim**: no penalty for the first within 30 days, then the abandoned rate counts.

## 7. Hunter inventory and the reverse flow

Hunters (and shops) can upload what they have, using the same lenient parser as the BUY panel's
"I own these bricks" box, a BrickLink inventory XML export, or a photo of a sorted tray (later: photo
recognition). Two things fall out:

- **Match my stock**: the board ranks bounties by how much of the list the hunter already holds
  ("you have 78% of this one"), so they only go bin-diving for the rest.
- **Forge from a bin** (the fun one): a shop or hunter can publish a lot ("3 lb mixed, mostly classic
  colours") with its rough inventory, and StudForge suggests models the lot can build, with the exact
  missing pieces listed. The lot page becomes a mini bounty board for its own contents, and the shop gets
  a reason to sell lots with a plan attached.

## 8. Incomplete sets

Many shops have incomplete sets. If a hunter lists one with its missing part numbers, StudForge can show
"what you can build with this set as-is" and builders can post bounties *for the missing parts of a set*
(same mechanics, the parts list just comes from a set inventory instead of a forge). Set inventories come
from the builder's own BrickLink export; we don't need to host a set database for v1.

## 9. Trust and safety

- Verified email + Stripe-verified payout identity before claiming; phone verification for Sorter and up.
- Full ship-to address released only after a claim, and shown only to that hunter.
- Photo evidence on both ends; disputes decided by support with a 7-day window; repeat dispute losers
  are suspended.
- Payment holdback: payouts settle 3 days after acceptance for Scouts/Pickers, instantly for Sorter+.
- Minors: hunters must be 18+ (Stripe requirement); builders under 18 need a parent's account.
- Content rules: no counterfeit brands, no sets sold as "complete" unless verified; the bounty is for
  parts, not for StudForge models (the model is free).

## 10. Where it lives in the app

- **StudForge BUY panel**: "🏷️ POST A BOUNTY" button → bounty composer prefilled with the missing-parts
  list, model photo (share card), estimate and share link.
- **/studforge/bounties**: the board (public), a bounty page, and the hunter/builder dashboards.
- **Profile pages**: `/studforge/hunters/<handle>` with rank, score, stats, badges, reviews.
- **Portfolio desktop**: a "Bounty Board" window in the Projects folder once it exists.

## 11. Data model (sketch)

```
users           id, handle, email, role flags, stripe_account_id, verified_at, region
bounties        id, builder_id, model_id, share_url, title, status (draft/open/claimed/shipped/settled/cancelled),
                price_cents, fill_rule, min_fill, deadline, ship_region, allow_lots, created_at
bounty_lines    id, bounty_id, lot_id, part_id, color_id, qty, color_flex, part_flex, condition
lots            id, bounty_id, label, price_cents, status
claims          id, bounty_id, lot_id, hunter_id, status, claimed_at, expires_at, shipped_at, tracking
claim_lines     claim_id, line_id, found_qty, delivered_qty, accepted_qty, outcome (ok/short/wrong_color/wrong_part/damaged)
claim_photos    claim_id, side (hunter/builder), url, created_at
reviews         claim_id, from_user, to_user, stars, tags[], text
disputes        claim_id, opened_by, reason, status, resolution, resolved_at
hunter_stats    user_id, score, rank, settled_count, accuracy_avg, fill_avg, on_time_rate, disputes_lost
inventories     user_id, part_id, color_id, qty, source (manual/xml/photo), updated_at
```

Postgres (Neon or Supabase, same as the rest of the site), auth via magic-link email, Stripe Connect for
money, Vercel Blob for photos, EasyPost for labels. Next.js route handlers; the StudForge static app talks
to them with `fetch` like the Claude idea route does.

## 12. MVP vs later

**MVP (v0, 3–4 weeks of focused work)**
- Post a bounty from the BUY panel (missing parts only), public board, claim, pick list with tally, mark
  shipped with tracking typed in, builder checklist, accuracy + fill, simple score and the first three
  ranks, Stripe escrow + payout, email notifications. No lots, no photo uploads beyond one per side,
  no inventory matching.

**v1**
- Lots, photo evidence per group, disputes UI, labels in-app, hunter inventory + "match my stock",
  badges, builder reputation.

**v2**
- Forge-from-a-bin, shops as first-class accounts with storefront lots, incomplete-set flows, photo
  recognition of trays.

## 13. Open questions

1. Is this a feature of the portfolio site or its own product/domain? (Money changing hands argues for
   its own domain, terms, and an LLC.)
2. Cold start: seed the hunter side first (post a few of my own bounties with generous prices) or the
   builder side (free "wanted" board with no payments, hunters quote by message)?
3. Per-piece pricing vs flat bounty for partial fills: flat is simpler to reason about, per-piece is fairer.
4. International: start US-only (shipping and Stripe simplicity), add Canada/UK/EU later.
5. Should ranks be global or per-region? Global for now; most hunters are local anyway.

## 14. Why it fits StudForge

StudForge already produces the three artefacts a bounty needs: an exact parts list, a price estimate and a
"this is what you're building" picture. The owned-bricks input is the missing-parts list. The share card
is the bounty poster. The hunter pick list is the instruction booklet's parts tables, regrouped. Almost all
the UI primitives exist today; the new work is accounts, money and the board.
