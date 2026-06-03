'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

type Role = 'realtor' | 'buyer' | 'seller' | null;

export function SignupForm({
  action,
  initialRole,
  prefilledEmail,
  next,
}: {
  action: (formData: FormData) => Promise<void> | void;
  initialRole: Role;
  prefilledEmail?: string;
  next?: string;
}) {
  const [role, setRole] = useState<Role>(initialRole);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="role" value={role || ''} />
      {next && <input type="hidden" name="next" value={next} />}

      {/* Role picker */}
      <div className="grid grid-cols-3 gap-2">
        <RoleButton
          label="Realtor"
          desc="I help people"
          active={role === 'realtor'}
          onClick={() => setRole('realtor')}
        />
        <RoleButton
          label="Buyer"
          desc="Looking for a home"
          active={role === 'buyer'}
          onClick={() => setRole('buyer')}
        />
        <RoleButton
          label="Seller"
          desc="Selling a home"
          active={role === 'seller'}
          onClick={() => setRole('seller')}
        />
      </div>

      {role && (
        <>
          <Field label="Your name" name="full_name" placeholder="Turner Logan" />
          <Field
            label="Email"
            name="email"
            type="email"
            placeholder="you@example.com"
            defaultValue={prefilledEmail}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            minLength={8}
            placeholder="At least 8 characters"
          />

          {role === 'realtor' && (
            <Field
              label="Firm or brokerage name"
              name="firm_name"
              placeholder="Logan Realty Group"
            />
          )}

          {(role === 'buyer' || role === 'seller') && (
            <Field
              label="Your realtor's email"
              name="realtor_email"
              type="email"
              placeholder="agent@brokerage.com"
              hint="We'll connect you to their portal."
            />
          )}

          <SignupSubmit role={role} />
        </>
      )}
    </form>
  );
}

function SignupSubmit({ role }: { role: Role }) {
  const { pending } = useFormStatus();
  const idleLabel =
    role === 'realtor' ? 'Create my firm' : 'Create account';
  const pendingLabel =
    role === 'realtor' ? 'Creating your firm…' : 'Creating your account…';
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-loading={pending ? 'true' : undefined}
      className="btn-primary mt-2 w-full px-4 py-2.5 disabled:cursor-not-allowed"
    >
      {pending && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden
        >
          <path d="M22 12a10 10 0 1 1-10-10" strokeLinecap="round" />
        </svg>
      )}
      <span>{pending ? pendingLabel : `${idleLabel} →`}</span>
    </button>
  );
}

function RoleButton({
  label,
  desc,
  active,
  onClick,
}: {
  label: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-xl border px-3 py-3.5 text-center transition active:scale-[0.98] ' +
        (active
          ? 'border-ink-900 bg-ink-900 text-white shadow-soft-sm'
          : 'border-ink-200 bg-white text-ink-900 hover:border-ink-300 hover:bg-ink-50')
      }
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className={'text-[11px] ' + (active ? 'text-white/70' : 'text-ink-500')}>
        {desc}
      </div>
    </button>
  );
}

function Field({
  label,
  name,
  type = 'text',
  placeholder,
  minLength,
  hint,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  minLength?: number;
  hint?: string;
  defaultValue?: string;
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
        required
        minLength={minLength}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="input mt-1.5"
      />
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
