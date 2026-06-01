'use client';

import { useState } from 'react';

/**
 * Public, mobile-first showing-feedback form. No login, no app chrome — it's
 * served on /feedback/[token] which sits outside the dashboard. Styling is
 * inline (flat ink palette, Inter) so it has zero dependency on the
 * dashboard's component library or Tailwind config being present on this route.
 *
 * One clean screen: stars → interest → price opinion → what you liked →
 * concerns → "share with seller" toggle → submit. Posts to
 * /api/showings/feedback, which re-verifies the HMAC token.
 */

const INK_900 = '#0f172a';
const INK_700 = '#334155';
const INK_500 = '#64748b';
const INK_300 = '#cbd5e1';
const INK_200 = '#e2e8f0';
const ACCENT = '#1f6feb';

const INTEREST_OPTIONS = [
  { value: 'not_interested', label: 'Not for me' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'interested', label: 'Interested' },
  { value: 'offer_likely', label: 'Likely to offer' },
] as const;

const PRICE_OPTIONS = [
  { value: 'overpriced', label: 'Overpriced' },
  { value: 'about_right', label: 'About right' },
  { value: 'underpriced', label: 'Underpriced' },
] as const;

export function FeedbackForm({
  valid,
  showingId,
  email,
  token,
  address,
  firmName,
  alreadySubmitted,
}: {
  valid: boolean;
  showingId: string;
  email: string;
  token: string;
  address: string | null;
  firmName: string | null;
  alreadySubmitted: boolean;
}) {
  const [stars, setStars] = useState(0);
  const [hoverStars, setHoverStars] = useState(0);
  const [interest, setInterest] = useState<string>('');
  const [priceOpinion, setPriceOpinion] = useState<string>('');
  const [name, setName] = useState('');
  const [liked, setLiked] = useState('');
  const [concerns, setConcerns] = useState('');
  const [shareWithSeller, setShareWithSeller] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!valid) {
    return (
      <Card>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
          This link isn&rsquo;t valid
        </h1>
        <p style={{ color: INK_500, fontSize: 15, margin: 0, lineHeight: 1.5 }}>
          This feedback link has expired or was mistyped. If you&rsquo;d still
          like to share your thoughts on the showing, reply to your agent&rsquo;s
          email and they can send you a fresh link.
        </p>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <div style={{ fontSize: 32, marginBottom: 8 }} aria-hidden>
          <span
            style={{
              display: 'inline-flex',
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#dcfce7',
              color: '#15803d',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            &#10003;
          </span>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
          Thank you
        </h1>
        <p style={{ color: INK_500, fontSize: 15, margin: 0, lineHeight: 1.5 }}>
          Your feedback was sent to {firmName || 'your agent'}. You can close
          this page.
        </p>
      </Card>
    );
  }

  const canSubmit = stars >= 1 && stars <= 5 && interest && !submitting;

  async function submit() {
    setError(null);
    if (stars < 1) {
      setError('Please pick a star rating first.');
      return;
    }
    if (!interest) {
      setError('Let us know how interested you are.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/showings/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          showingId,
          email,
          name: name.trim() || undefined,
          stars,
          interest,
          price_opinion: priceOpinion || undefined,
          liked: liked.trim() || undefined,
          concerns: concerns.trim() || undefined,
          share_with_seller: shareWithSeller,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
        How was the showing?
      </h1>
      <p
        style={{
          color: INK_500,
          fontSize: 14,
          margin: '0 0 20px',
          lineHeight: 1.5,
        }}
      >
        {address ? (
          <>
            Your quick take on <strong style={{ color: INK_700 }}>{address}</strong>{' '}
            helps {firmName || 'your agent'} guide your search.
          </>
        ) : (
          <>Your quick take helps {firmName || 'your agent'} guide your search.</>
        )}
        {alreadySubmitted && (
          <>
            {' '}
            <span style={{ color: ACCENT }}>
              You&rsquo;ve already submitted &mdash; sending again will update it.
            </span>
          </>
        )}
      </p>

      {/* Stars */}
      <Label>Overall rating</Label>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = (hoverStars || stars) >= n;
          return (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              onClick={() => setStars(n)}
              onMouseEnter={() => setHoverStars(n)}
              onMouseLeave={() => setHoverStars(0)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 2,
                fontSize: 34,
                lineHeight: 1,
                color: active ? '#f59e0b' : INK_300,
                transition: 'color 120ms',
              }}
            >
              {active ? '★' : '☆'}
            </button>
          );
        })}
      </div>

      {/* Interest */}
      <Label>How interested are you?</Label>
      <PillGroup
        options={INTEREST_OPTIONS as any}
        value={interest}
        onChange={setInterest}
      />

      {/* Price opinion */}
      <Label style={{ marginTop: 20 }}>What about the price?</Label>
      <PillGroup
        options={PRICE_OPTIONS as any}
        value={priceOpinion}
        onChange={(v) => setPriceOpinion(v === priceOpinion ? '' : v)}
      />

      {/* Liked */}
      <Label style={{ marginTop: 20 }}>What did you like? (optional)</Label>
      <textarea
        value={liked}
        onChange={(e) => setLiked(e.target.value)}
        rows={2}
        placeholder="The kitchen, the natural light, the location…"
        style={inputStyle}
      />

      {/* Concerns */}
      <Label style={{ marginTop: 16 }}>Any concerns? (optional)</Label>
      <textarea
        value={concerns}
        onChange={(e) => setConcerns(e.target.value)}
        rows={2}
        placeholder="The street noise, the small yard, needs updating…"
        style={inputStyle}
      />

      {/* Name */}
      <Label style={{ marginTop: 16 }}>Your name (optional)</Label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="So your agent knows who said what"
        style={inputStyle}
      />

      {/* Share with seller toggle */}
      <button
        type="button"
        onClick={() => setShareWithSeller((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          marginTop: 20,
          padding: '12px 14px',
          background: '#fff',
          border: `1px solid ${INK_200}`,
          borderRadius: 12,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            position: 'relative',
            width: 40,
            height: 24,
            borderRadius: 999,
            background: shareWithSeller ? ACCENT : INK_300,
            flex: '0 0 auto',
            transition: 'background 120ms',
          }}
          aria-hidden
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: shareWithSeller ? 18 : 2,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 120ms',
            }}
          />
        </span>
        <span style={{ fontSize: 14, color: INK_700, lineHeight: 1.4 }}>
          Share this feedback with the seller (anonymized in their summary).
        </span>
      </button>

      {error && (
        <p
          style={{
            color: '#b91c1c',
            fontSize: 14,
            margin: '16px 0 0',
          }}
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        style={{
          marginTop: 20,
          width: '100%',
          padding: '13px 16px',
          borderRadius: 12,
          border: 'none',
          background: canSubmit ? INK_900 : INK_300,
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {submitting && <Spinner />}
        {submitting ? 'Sending…' : 'Send feedback'}
      </button>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${INK_200}`,
        borderRadius: 16,
        padding: 24,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}
    >
      {children}
    </div>
  );
}

function Label({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: INK_500,
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PillGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: '9px 14px',
              borderRadius: 999,
              border: `1px solid ${active ? INK_900 : INK_200}`,
              background: active ? INK_900 : '#fff',
              color: active ? '#fff' : INK_700,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 120ms',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 15,
        height: 15,
        border: '2px solid rgba(255,255,255,0.4)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'fbspin 0.7s linear infinite',
      }}
    >
      <style>{`@keyframes fbspin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 10,
  border: `1px solid ${INK_300}`,
  fontSize: 15,
  fontFamily: 'inherit',
  color: INK_900,
  resize: 'vertical',
  outline: 'none',
};
