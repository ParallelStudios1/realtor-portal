'use client';

import { useState } from 'react';

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

          <button
            type="submit"
            className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            {role === 'realtor' ? 'Create my firm' : 'Create account'} →
          </button>
        </>
      )}
    </form>
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
      className={
        'rounded-lg border px-3 py-3 text-center transition ' +
        (active
          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-inner'
          : 'border-slate-200 hover:border-slate-300')
      }
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="text-[11px] text-slate-500">{desc}</div>
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
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
