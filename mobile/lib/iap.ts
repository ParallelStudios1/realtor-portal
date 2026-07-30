import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

/**
 * Apple In-App Purchase (StoreKit 2) helper.
 *
 * Required by App Store guideline 3.1.1: on iOS the subscription must be
 * purchasable inside the app. Android/web continue to use the existing Stripe
 * billing page, which Google and the web both permit.
 *
 * The server is the source of truth — after StoreKit reports a purchase we
 * hand the signed transaction to /api/iap/apple/verify, which validates the
 * signature and flips firms.status to 'active'.
 */

/** Auto-renewing subscription product IDs, as configured in App Store Connect. */
export const IAP_PRODUCT_IDS = [
  'com.parallelstudios.realtorportal.pro.monthly',
  'com.parallelstudios.realtorportal.pro.yearly',
] as const;

export type IapProduct = {
  id: string;
  title: string;
  description: string;
  displayPrice: string;
};

export const iapAvailable = Platform.OS === 'ios';

/** Lazy import so Android/Expo Go never touch the native module. */
async function mod(): Promise<any | null> {
  if (!iapAvailable) return null;
  try {
    return await import('expo-iap');
  } catch (err) {
    console.warn('[iap] expo-iap unavailable', err);
    return null;
  }
}

export async function initIap(): Promise<boolean> {
  const m = await mod();
  if (!m) return false;
  try {
    await (m.initConnection?.() ?? Promise.resolve());
    return true;
  } catch (err) {
    console.warn('[iap] initConnection failed', err);
    return false;
  }
}

export async function endIap(): Promise<void> {
  const m = await mod();
  try {
    await (m?.endConnection?.() ?? Promise.resolve());
  } catch {}
}

/** Fetch the subscription products, with their localized App Store prices. */
export async function getProducts(): Promise<IapProduct[]> {
  const m = await mod();
  if (!m) return [];
  try {
    const fn = m.getSubscriptions || m.requestProducts || m.getProducts;
    const raw = await fn.call(m, {
      skus: [...IAP_PRODUCT_IDS],
      type: 'subs',
    });
    const list = Array.isArray(raw) ? raw : raw?.subscriptions || [];
    return list.map((p: any) => ({
      id: p.id || p.productId,
      title: p.title || p.displayName || 'Realtor Portal Pro',
      description: p.description || '',
      displayPrice:
        p.displayPrice || p.localizedPrice || p.price?.toString() || '',
    }));
  } catch (err) {
    console.warn('[iap] getProducts failed', err);
    return [];
  }
}

/** Send a StoreKit signed transaction to our server for verification. */
async function verifyWithServer(signedTransaction: string): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base =
    process.env.EXPO_PUBLIC_API_URL || 'https://realtorportal.parallelstudios.co';
  const res = await fetch(base + '/api/iap/apple/verify', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ signedTransaction }),
  });
  if (!res.ok) return false;
  const json = await res.json().catch(() => null);
  return Boolean(json?.active);
}

/** Pull the signed JWS off whatever shape the purchase object has. */
function signedFrom(purchase: any): string | null {
  return (
    purchase?.jwsRepresentationIos ||
    purchase?.jwsRepresentation ||
    purchase?.purchaseToken ||
    purchase?.transactionReceipt ||
    null
  );
}

/**
 * Buy a subscription. Resolves true once our server confirms the entitlement.
 * Throws on user cancellation so the UI can stay quiet.
 */
export async function purchase(productId: string): Promise<boolean> {
  const m = await mod();
  if (!m) throw new Error('In-app purchase is not available on this device.');

  const req = m.requestPurchase || m.requestSubscription;
  const result = await req.call(m, {
    request: { ios: { sku: productId }, sku: productId },
    type: 'subs',
  });

  const purchases = Array.isArray(result) ? result : [result];
  for (const p of purchases) {
    const signed = signedFrom(p);
    if (!signed) continue;
    const ok = await verifyWithServer(signed);
    if (ok) {
      // Tell StoreKit we delivered the content, or Apple re-prompts forever.
      try {
        await (m.finishTransaction?.({ purchase: p, isConsumable: false }) ??
          Promise.resolve());
      } catch {}
      return true;
    }
  }
  return false;
}

/**
 * Restore purchases — required by Apple for any app with a subscription.
 * Re-verifies every active entitlement against our server.
 */
export async function restore(): Promise<boolean> {
  const m = await mod();
  if (!m) return false;
  try {
    const fn = m.getAvailablePurchases || m.getPurchaseHistories;
    const purchases = (await fn.call(m, { onlyIncludeActiveItems: true })) || [];
    for (const p of Array.isArray(purchases) ? purchases : []) {
      const signed = signedFrom(p);
      if (!signed) continue;
      if (await verifyWithServer(signed)) return true;
    }
    return false;
  } catch (err) {
    console.warn('[iap] restore failed', err);
    return false;
  }
}
