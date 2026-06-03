'use client';

import { useState } from 'react';
import Link from 'next/link';
import { acceptInviteAction } from './actions';

type Firm = {
  name: string;
  brand_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  tagline: string | null;
};
type Realtor = { full_name: string | null; email: string | null };
type Search = {
  id: string;
  name: string | null;
  kind: string | null;
  phase: string | null;
  realtor: Realtor | null;
  client: { id: string; full_name: string | null; email: string | null } | null;
};
type Invite = {
  id: string;
  token: string;
  role: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  search_id: string;
  firm_id: string;
  accepted_at: string | null;
  firm: Firm | null;
  search: Search | null;
};

/**
 * The role-aware "you've been invited" landing.
 *
 * What it does:
 *  1. Shows a fully-branded splash with the inviting firm's logo + brand
 *     color so the recipient knows immediately who this is from.
 *  2. Explains the deal: who the principal client is, what kind of deal
 *     (buyer/seller/listing), and which phase it's in.
 *  3. Branches the call-to-action by role:
 *       realtor / co_realtor → "Set up your free Realtor Portal account
 *         to co-broker this deal" with firm-name field
 *       attorney             → "Set up your attorney account" — no firm
 *         field, attaches to host firm.
 *       buyer / seller       → "Set up your client account to track this
 *         deal" with just name + password
 *       other                → "Claim your access" — simple name + password
 *  4. Branches on existing-account state:
 *       existing user        → "Welcome back — sign in to accept"
 *       new user             → role-specific signup form
 *  5. Single button completes everything: account create, sign-in,
 *     deal-participant link, redirect to the right post-accept screen.
 */
export function InviteClient({
  invite,
  expired,
  hasAccount,
  alreadySignedInAsRecipient,
}: {
  invite: Invite;
  expired: boolean;
  hasAccount: boolean;
  alreadySignedInAsRecipient: boolean;
}) {
  const firm = invite.firm;
  const search = invite.search;
  const brand = firm?.brand_color || '#0F172A';
  const accent = firm?.accent_color || brand;
  const realtor = search?.realtor;
  const firmName = firm?.name || "your realtor's firm";
  const realtorName = realtor?.full_name || realtor?.email || 'Your realtor';
  const role = invite.role;
  const roleLabel = roleToLabel(role);
  const isRealtor = role === 'realtor' || role === 'co_realtor';
  const isAttorney = role === 'attorney';
  const isClient = role === 'buyer' || role === 'seller';

  const [fullName, setFullName] = useState(invite.name || '');
  const [email, setEmail] = useState(invite.email || '');
  const [password, setPassword] = useState('');
  const [firmName_, setFirmName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (invite.accepted_at) {
    return (
      <Shell brand={brand} firm={firm}>
        <h1 className="text-3xl font-bold tracking-tight">Already accepted</h1>
        <p className="mt-2 text-sm text-ink-600">
          This invite has already been accepted. Sign in to open the deal.
        </p>
        <Link
          href={
            '/login?next=' +
            encodeURIComponent(
              isAttorney
                ? '/attorney'
                : isClient
                  ? '/client'
                  : '/dashboard/deals/' + invite.search_id
            )
          }
          className="btn-primary mt-6 w-full justify-center"
          style={{ backgroundColor: brand, color: '#fff' }}
        >
          Sign in
        </Link>
      </Shell>
    );
  }

  if (expired) {
    return (
      <Shell brand={brand} firm={firm}>
        <h1 className="text-3xl font-bold tracking-tight">Invite expired</h1>
        <p className="mt-2 text-sm text-ink-600">
          This invite link has expired. Ask {realtorName} to send you a
          new one.
        </p>
      </Shell>
    );
  }

  if (alreadySignedInAsRecipient) {
    // They're already signed in as the same email — just send them to
    // the right place.
    return (
      <Shell brand={brand} firm={firm}>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {invite.name || invite.email}
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          You&rsquo;re already signed in. Open the deal to keep going.
        </p>
        <Link
          href={
            isAttorney
              ? '/attorney'
              : isClient
                ? '/client'
                : '/dashboard/deals/' + invite.search_id
          }
          className="btn-primary mt-6 w-full justify-center"
          style={{ backgroundColor: brand, color: '#fff' }}
        >
          Open the deal &rarr;
        </Link>
      </Shell>
    );
  }

  // Existing-account branch: just collect the password and sign them in.
  if (hasAccount) {
    return (
      <Shell brand={brand} firm={firm}>
        <Header
          firmName={firmName}
          realtorName={realtorName}
          roleLabel={roleLabel}
          search={search}
        />
        <form
          action={acceptInviteAction}
          className="mt-6 space-y-4"
          onSubmit={() => setSubmitting(true)}
        >
          <input type="hidden" name="token" value={invite.token} />
          <input type="hidden" name="full_name" value={fullName || invite.name || ''} />
          <Field
            label="Email"
            name="email"
            type="email"
            defaultValue={invite.email || ''}
            disabled
          />
          <Field
            label="Password"
            name="password"
            type="password"
            placeholder="Your Realtor Portal password"
            required
            value={password}
            onChange={setPassword}
          />
          <Submit submitting={submitting} brand={brand} label="Open the deal &rarr;" />
        </form>
        <p className="mt-4 text-xs text-ink-500">
          Forgot your password? <Link href="/login" className="underline">Reset it</Link>.
        </p>
      </Shell>
    );
  }

  // New-account branch: role-specific form.
  return (
    <Shell brand={brand} firm={firm}>
      <Header
        firmName={firmName}
        realtorName={realtorName}
        roleLabel={roleLabel}
        search={search}
      />

      {/* Role-specific explainer block. */}
      <RoleExplainer
        role={role}
        firmName={firmName}
        brand={accent}
      />

      <form
        action={acceptInviteAction}
        className="mt-6 space-y-4"
        onSubmit={() => setSubmitting(true)}
      >
        <input type="hidden" name="token" value={invite.token} />
        <Field
          label="Your name"
          name="full_name"
          placeholder="Jane Smith"
          required
          value={fullName}
          onChange={setFullName}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          required
          value={email}
          onChange={setEmail}
        />
        {isRealtor && (
          <Field
            label="Your firm or brokerage"
            name="firm_name"
            placeholder="Acme Realty"
            hint="If you don't have one, put your own name — you can change this later."
            value={firmName_}
            onChange={setFirmName}
          />
        )}
        <Field
          label="Set a password"
          name="password"
          type="password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          value={password}
          onChange={setPassword}
        />

        <Submit
          submitting={submitting}
          brand={brand}
          label={
            isRealtor
              ? 'Set up free firm & open the deal &rarr;'
              : isAttorney
                ? 'Open my attorney dashboard &rarr;'
                : isClient
                  ? 'Open my deal &rarr;'
                  : 'Claim access &rarr;'
          }
        />
      </form>
    </Shell>
  );
}

function roleToLabel(role: string): string {
  switch (role) {
    case 'realtor':
      return 'co-broker';
    case 'co_realtor':
      return 'co-realtor';
    case 'attorney':
      return 'attorney';
    case 'buyer':
      return 'buyer';
    case 'seller':
      return 'seller';
    case 'inspector':
      return 'inspector';
    case 'lender':
      return 'lender';
    case 'mortgage_broker':
      return 'mortgage broker';
    default:
      return 'party';
  }
}

function Shell({
  brand,
  firm,
  children,
}: {
  brand: string;
  firm: { name: string; logo_url: string | null; tagline: string | null } | null;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-ink-50 py-10">
      <div className="mx-auto max-w-md px-6">
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-lg">
          {/* Branded header strip */}
          <div className="flex items-center gap-3 px-6 py-4" style={{ backgroundColor: brand }}>
            {firm?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={firm.logo_url}
                alt={firm.name}
                className="h-9 w-9 rounded-md bg-white object-contain p-1"
              />
            ) : (
              <span className="inline-block h-9 w-9 rounded-md bg-white/15" />
            )}
            <div className="min-w-0 text-white">
              <div className="truncate text-sm font-semibold">
                {firm?.name || 'Realtor Portal'}
              </div>
              {firm?.tagline && (
                <div className="truncate text-[11px] opacity-80">
                  {firm.tagline}
                </div>
              )}
            </div>
          </div>
          <div className="p-7">{children}</div>
        </div>
        <p className="mt-4 text-center text-[11px] font-medium text-ink-400">
          Realtor Portal
        </p>
      </div>
    </main>
  );
}

function Header({
  firmName,
  realtorName,
  roleLabel,
  search,
}: {
  firmName: string;
  realtorName: string;
  roleLabel: string;
  search: Search | null;
}) {
  const principal =
    search?.client?.full_name || search?.client?.email || 'their client';
  const kindWord =
    search?.kind === 'seller' ? 'listing' : `${search?.kind || 'real-estate'} deal`;
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        You&rsquo;re invited as <span className="capitalize">{roleLabel}</span>
      </h1>
      <p className="mt-2 text-sm text-ink-600">
        <strong>{realtorName}</strong> at <strong>{firmName}</strong> added you
        to a {kindWord}
        {search?.client?.full_name || search?.client?.email
          ? ' for ' + principal
          : ''}
        {search?.name ? ' — ' + search.name : ''}.
      </p>
    </div>
  );
}

function RoleExplainer({
  role,
  firmName,
  brand,
}: {
  role: string;
  firmName: string;
  brand: string;
}) {
  let title = '';
  let bullets: string[] = [];
  if (role === 'realtor' || role === 'co_realtor') {
    title = 'How co-brokering works';
    bullets = [
      `You get a free Realtor Portal account with your OWN firm.`,
      `On this deal, all premium features are covered by ${firmName} — no plan needed.`,
      `For your own clients and listings, your free trial starts now; pick a plan later.`,
    ];
  } else if (role === 'attorney') {
    title = 'Your attorney dashboard';
    bullets = [
      `You'll see this deal and any others ${firmName} adds you to.`,
      `Track key dates, contract status, and message the realtor + parties.`,
      `No fee — you're a guest on the firm's plan.`,
    ];
  } else if (role === 'buyer' || role === 'seller') {
    title = 'Your client portal';
    bullets = [
      `Track every step of your deal — offer, contract, closing.`,
      `Message your realtor, view documents, see important dates.`,
      `Use the mobile app to get push notifications when things change.`,
    ];
  } else {
    title = 'Your access on this deal';
    bullets = [
      `You'll see whatever the realtor shared with you on this specific deal.`,
      `Documents, dates, messages — depending on your role.`,
    ];
  }
  return (
    <div
      className="mt-5 rounded-lg border p-3 text-xs"
      style={{ borderColor: brand + '40', backgroundColor: brand + '0C' }}
    >
      <p className="font-semibold text-ink-900">{title}</p>
      <ul className="mt-1.5 space-y-1 text-ink-700">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-1.5">
            <span style={{ color: brand }}>•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  label,
  name,
  type = 'text',
  placeholder,
  hint,
  required,
  minLength,
  value,
  defaultValue,
  disabled,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onChange?: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        defaultValue={defaultValue}
        value={onChange ? value : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        disabled={disabled}
        className="input mt-1.5 disabled:bg-ink-50 disabled:text-ink-500"
      />
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function Submit({
  submitting,
  brand,
  label,
}: {
  submitting: boolean;
  brand: string;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={submitting}
      data-loading={submitting ? 'true' : undefined}
      className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-soft-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      style={{ backgroundColor: brand }}
      dangerouslySetInnerHTML={{ __html: submitting ? 'Working&hellip;' : label }}
    />
  );
}
