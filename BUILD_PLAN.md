# 12-Week Build Plan

A real timeline for going from "code on disk" to "first paying firm" without burning out. Adjust dates as needed; the *order* matters more than the calendar.

The cardinal rule: **don't build week 5+ stuff until your dad has set up at least 1 conversation with a real realtor.** Validation beats velocity. If realtors won't take the meetings, the architecture choice doesn't matter.

---

## Week 1 — Stand it up locally (you are here-ish)

Goal: app runs on your phone connected to a real Supabase project.

- [ ] Create a Supabase project (`realtor-portal-prod` or `-dev`).
- [ ] Run `supabase/schema.sql` in the SQL editor.
- [ ] Create the `logos` and `documents` buckets per `supabase/README.md`.
- [ ] Copy `.env.example` to `.env` in `mobile/`, paste Supabase URL + anon key.
- [ ] `cd mobile && npm install && npx expo start`. Scan with Expo Go on your iPhone.
- [ ] Sign up two test accounts (`sarah@coastalhomes.test`, `eric@example.test`).
- [ ] Run the UPDATE blocks in `supabase/seed.sql` to assign roles + firm.
- [ ] Confirm: signing in as Sarah shows realtor tabs; signing in as Eric shows client tabs.
- [ ] Confirm: home dashboard for Eric shows the demo phase stepper.

Risk: Apple Developer cert flow when running on a real device. Fix: free Apple ID works for personal install via Expo Go (no cert needed). Build for TestFlight comes later.

## Week 2 — Smooth the demo

Goal: the demo is polished enough that you'd be willing to walk a realtor through it on a video call.

- [ ] Create a real "Coastal Homes" demo firm with a fake but credible logo (Canva, 30 min).
- [ ] Add 3 sample houses, 4 important dates, 5 activity rows, 3 messages.
- [ ] Walk through the realtor side: change phase, upload a PDF, add a date. Make sure each one shows up correctly on the client side.
- [ ] Record a 90-second screen capture showing client + realtor side-by-side. This becomes your sales asset.
- [ ] Fix the 3 most embarrassing UI bugs you find while doing this.

## Week 3 — Dad warm intro begins

Goal: dad has emailed/texted 3-5 of his realtor clients introducing you. You have at least 1 video call scheduled.

- [ ] Read `PITCH.md`. Send dad the message template — he forwards or texts intro.
- [ ] Within 48 hours of each intro, you reach out personally with the demo video.
- [ ] Goal for end of week: 1-2 demo calls scheduled.
- [ ] **DO NOT** build new features this week. Use the time to research each realtor before their call (LinkedIn, their firm's website, recent listings).

## Week 4 — Demo, listen, iterate

Goal: 3+ demo calls done. You know which features they actually care about and what they hate.

- [ ] Run each call: 5 min product demo, 20 min listening to their workflow, 5 min "would you pay $X for this?"
- [ ] After each call: write up what they said while it's fresh. What features did they ask for? What features in your demo did they not care about?
- [ ] End of week: pick the **top 1-2 features** to add and the **bottom 2-3 features** to cut. Don't add everything everyone asks for. Build for the *median* of your callers.
- [ ] If 3 of 3 say "I like it but I'd never pay" — stop. Talk to me. We're solving the wrong problem.
- [ ] If 1 of 3 says "How do I get this for my firm?" — that's gold. Move to Week 5.

## Week 5 — Build admin panel

Goal: you can onboard a new firm without writing SQL.

- [ ] Bootstrap `admin/` (Next.js 14 App Router + Tailwind + shadcn/ui).
- [ ] Auth: same Supabase project, but only `super_admin` role can sign in.
- [ ] CRUD for firms: name, slug, logo upload, color picker, contact email.
- [ ] CRUD for users in a firm: invite by email, set role.
- [ ] Deploy to Vercel free tier.

I can scaffold this in one shot when we get here. Don't build it in week 1 because you don't need it yet — Supabase Studio is fine for the first firm.

## Week 6 — Onboard your first paying firm

Goal: the first firm to license the app is using it with a real client.

- [ ] Use the admin panel to create their firm with their real branding.
- [ ] Have a kickoff call: walk a real realtor at the firm through the realtor app.
- [ ] Help them invite their first client. Watch the messages flow.
- [ ] Charge them. Send a Stripe link or invoice. Whatever. Get money.

If pricing pushback: $99/month for v1, you can revisit pricing when you have more leverage.

## Week 7-8 — TestFlight + Play Console

Goal: the app is on actual app stores so customers can install it from a link instead of Expo Go.

- [ ] Apple: enroll your dev cert ($99 you already have), set up App Store Connect listing, EAS build, submit to TestFlight, invite your firm.
- [ ] Android: Play Console one-time fee ($25), upload .aab from EAS, internal testing track.
- [ ] When the firm asks "can our clients download this from the App Store?" — TestFlight is fine for v1, public submission is week 10.

## Week 9-10 — Public store submission

Goal: anyone can download the app, the firm's branded view loads after login.

- [ ] App Store: write the description, capture screenshots (5 per platform), submit for review. Apple will scrutinize white-label apps under Guideline 4.3 — be ready to explain that each firm provides unique content/branding to its client base. Reviews can take 1-3 days, sometimes a week.
- [ ] Play Store: similar process. Less strict review.
- [ ] When approved, share the App Store link with the firm.

## Week 11 — Get firm #2 and #3

Goal: 3 paying firms, $300/month MRR.

- [ ] Re-engage every realtor your dad introduced you to. "We're live on the App Store, here's the link, [Firm 1] is using it for their fall closings."
- [ ] Each new firm gets onboarded via the admin panel. Should take you ~30 minutes per firm now.
- [ ] If churn happens (realtor signs up, never logs in again), call them. Find out why.

## Week 12 — Pricing experiment + decide what's next

Goal: you've earned the right to think about scaling.

- [ ] Try moving new firms to $149/month. Existing firms grandfathered.
- [ ] Look at the data: which features get used? Which don't? Which firms message us with feature requests?
- [ ] Decide: spend month 4 on one big feature (DocuSign? MLS feed? In-app messaging realtime?) or on sales (5 new firms)?

For most founders: **sales**. The product is good enough. Distribution is the bottleneck.

---

## What you should NOT do during this 12-week window

- Add a new feature because a realtor asked for it on the first call. Wait until 3 ask.
- Rebrand the whole product because someone said "the name should be different."
- Move to a different tech stack because some Reddit thread said React Native is dying.
- Hire anyone. Not yet. Money first.
- Promise an integration you haven't built. "It's on our roadmap" is your friend.
- Quit school for this. Seriously.

---

## What success at week 12 looks like

- 3-5 paying firms.
- $300-1500 MRR.
- A real product that real realtors are using with real clients.
- A list of clear feature requests prioritized by how many firms asked.
- Confidence in your sales motion: you know how many emails it takes to get a meeting and how many meetings to get a yes.

If you have all 5 of those at week 12, you have a real business. We talk about scaling it. If you have 0-1 of those, we talk about why and pivot or kill.
