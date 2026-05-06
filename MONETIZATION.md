# Monetization

How you charge, what you charge, and how the money flows.

## TL;DR pricing — tiered by firm size

The original "$99/month flat" was leaving money on the table for big firms. Here's the right tier structure given that your dad's network skews toward established brokerages:

| Tier | Per firm / month | Realtors at firm | What they get |
|---|---|---|---|
| **Starter** | $99 | up to 3 | All v1 features. Best for solo agents and tiny boutique teams. |
| **Team** | $299 | up to 15 | Same features. Just bigger seat cap. |
| **Brokerage** | $799 | up to 50 | Same features. Bigger seat cap. Optional priority support. |
| **Enterprise (white-label app)** | $1,500–$3,000 + $2,500 setup | unlimited | Dedicated App Store + Play Store listing under their name + branding. |

Per-client cost: zero across all tiers. Firms pay flat regardless of how many buyer/seller clients they invite.

### Why this beats flat $99

A 30-agent brokerage and a solo agent get the same value-per-dollar at flat $99, even though the brokerage extracts 10x the value. By the time the brokerage is on Team or Brokerage tier, you're capturing real value for both sides. Firms in this size range pay $300–800/agent/month for kvCORE / MoxiWorks / BoomTown — the comparable "client portal" feature in those bundles is half the value of yours and they barely notice $799/firm.

### Why the Enterprise tier exists

Some firms will insist their app shows up in the App Store under their name with their icon, not as "Realtor Portal." That's a **dedicated branded build** — same codebase, but `eas build` is run against a different `app.json` configured with their bundle ID, name, and icon. Each new dedicated app is a separate App Store / Play Store submission you have to maintain forever. So we charge for it: $1,500–$3,000/month plus $2,500 one-time setup. Almost no firms will need this. The 1–2 that do will more than make up for the operational cost.

The default everyone else gets is **one shared app, branding swaps at runtime after login**. That's how Bonzo, Practifi, AgentMethods, and most other white-label SaaS products do it — Apple's Guideline 4.3 increasingly rejects "spam-like" duplicate apps, so per-tenant App Store listings are actively a worse business model than they look.

## Why monthly subscription, not one-time

- Predictable recurring revenue is the only way SaaS becomes interesting.
- One-time payments tempt firms to "just buy it and be done" but then they don't use it, churn anyway, and tell everyone the product is bad.
- Firms expect SaaS pricing for software. A $299/month line item is below their phone bill.

## Handling the "we're already doing fine without this" objection

Real, but reframable. Every firm thinks they're fine. The pitch isn't "you're broken." It's:

> "Your clients ask the same five questions on every deal — *where are we in the process, when's closing, did the inspection happen, what paperwork do I need to sign, what's next.* You answer them by phone and text, in fragments, after hours. This portal answers those five questions for you, automatically, in real time, with your branding. Your existing clients call you less. Your new clients pick you over the realtor without one. **Three deals a year saved from the friction = the year of the subscription pays for itself ten times over.**"

If they still don't bite, they're not your customer — go to the next one. Realistic conversion from your dad's intros is probably ~25%, not 100%. That's fine. You only need 5 paying firms across tiers to clear $2K MRR fast.

## Billing — how to actually collect money

### Phase 1 (first 1–3 firms): manual Stripe Payment Links

Don't bother integrating Stripe Billing yet. Use:

1. **Stripe Payment Links** — Dashboard → Payment Links → "Recurring, $X/month." Create one per tier ($99, $299, $799, $1500). Paste the link into a kickoff email after the demo.
2. Stripe handles cards, ACH, recurring, and emails you when they pay.
3. Suspend access manually from your admin panel (the "Suspend firm" button) if they stop paying.

This works fine until you have ~5–10 firms. Don't over-engineer until you have to.

### Phase 2 (firms 4–20): Stripe Customer Portal

When manual is too painful:

1. Add Stripe Customer Portal to admin panel.
2. New firm onboarding flow → Vercel route → Stripe checkout → on success, Stripe webhook fires → admin panel writes `firms.stripe_customer_id` and `firms.is_active = true`.
3. Firms can self-serve cancel/upgrade.

This is a 1–2 week implementation. v1.5.

### Phase 3 (20+ firms): proper SaaS billing infra

Stripe Billing with metered usage if you want, but you probably don't want it for this product. Flat tier pricing scales fine.

## Apple / Google take rates — DOES NOT APPLY HERE

Important: Apple's 30% / 15% take applies to **in-app purchases by consumers**. It does NOT apply to:

- B2B SaaS subscriptions sold outside the app.
- Real-world services (real estate is a service business — Apple's "Reader" rules don't apply).
- Anything billed via Stripe directly to the firm's company credit card.

You'll bill firms via Stripe directly. Not via App Store. Apple gets nothing.

## Things you DON'T charge for in v1

- Per-active-client metering. Adds friction; incentivizes firms to *not* invite clients.
- Setup fees on Starter/Team/Brokerage. Setup fees only on Enterprise tier where there's actual setup work.
- Storage overage. Supabase free tier covers ~1 GB which fits dozens of firms with a few PDFs each. Don't worry about this until 50+ firms.

## Money math at different scales

Assumptions: Supabase Pro ($25/mo) covers 10–25 firms, Apple Dev $99/year, Vercel free for admin panel, EAS free tier. Mix assumes 60% Starter, 30% Team, 10% Brokerage at scale.

| Firms | MRR | Monthly costs | Net |
|---|---|---|---|
| 1 (Starter) | $99 | $10 | $89 |
| 5 (3 Starter, 2 Team) | $895 | $35 | $860 |
| 10 (6 Starter, 3 Team, 1 Brokerage) | $2,290 | $50 | $2,240 |
| 25 (15 Starter, 8 Team, 2 Brokerage) | $5,463 | $100 | $5,363 |
| 50 (30 Starter, 15 Team, 5 Brokerage) | $11,455 | $200 | $11,255 |
| 100 (60 / 30 / 10) + 2 Enterprise | $25,910 | $400 | $25,510 |

At 25 firms you're netting more than most starter jobs pay. At 100 firms you have a real business with eight figures lifetime value at typical SaaS retention rates.

## Refunds, cancels, and difficult conversations

- **Refund policy**: prorated if they cancel mid-month, full refund within first 30 days "if it didn't fit your workflow." Don't fight refunds — happy ex-customers don't trash you publicly.
- **Cancellation**: low-friction. They email or use Stripe portal. Don't make them call.
- **Annual prepay discount**: 2 months free for annual prepay (e.g. $1,188 for Starter year vs $1,188 monthly = $0 saving on Starter, $598 saving on Team at $2,990 vs $3,588). Cash flow is nice; for v1 only offer if they ask.

## Pricing experiments to run after firm 5

A/B candidates, in this order:

1. **Move Starter from $99 to $149.** Test on firms 6–10. Did anyone push back?
2. **Move Team from $299 to $399.** Same test logic.
3. **Bundle a "Premium" add-on** with DocuSign integration and unlimited storage at $99/month on top of any tier.

Run one experiment at a time, 30+ days each. Don't try to ABCD test with 5 customers — sample size is too small to learn anything.

## Where the money lives — practical setup

You're 16. Some of this needs your parent's help unless your state has different rules:

1. **Stripe account**: requires a tax ID. Either form an LLC under Parallel Studios (use ZenBusiness or LegalZoom for ~$200) or have a parent's name on the account.
2. **Bank account**: Stripe deposits into a real bank account. Most banks won't open an account for a 16-year-old without a parent. A parent can co-sign.
3. **Taxes**: 1099 income above $400/year requires filing. You'll get a 1099-K from Stripe at year-end. Have a parent or a CPA help the first year.
4. **LLC formation** is worth the $200 once you have ~$1k MRR. Liability protection + cleaner taxes.

## What to do before charging anyone

- [ ] Privacy Policy live at a URL (placeholder text in `legal/PRIVACY.md`).
- [ ] Terms of Service live at a URL (placeholder text in `legal/TERMS.md`).
- [ ] A simple Master Services Agreement for firms (1-page PDF). Use Bonsai or Stripe Atlas for templates. Doesn't need to be fancy — covers what you provide, monthly fee, mutual termination, IP ownership.
- [ ] Stripe account set up + first Payment Links created for each tier.
- [ ] An email address that isn't @gmail.com (use Google Workspace under your domain — $6/month — looks 10x more credible).

You don't need a lawyer for v1 contracts. Save that for when something goes wrong, and frankly your dad can probably advise on the contract since he is one (just not in real estate transactions for his own family — he might pass you to a colleague).
