import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  Linking,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import {
  getProducts,
  initIap,
  endIap,
  purchase,
  restore,
  iapAvailable,
  type IapProduct,
} from '@/lib/iap';

/**
 * Subscription paywall (App Store guideline 3.1.1).
 *
 * On iOS the plan is bought here with StoreKit. On Android we keep sending
 * people to the existing Stripe billing page, which Google permits.
 */
const BENEFITS = [
  'Unlimited active deals',
  'Client messaging and document sharing',
  'Deal phases, key dates, and reminders',
  'Showings, offers, and closing tracking',
];

const MANAGE_URL = 'https://realtorportal.parallelstudios.co/dashboard/billing';

export default function SubscribeScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { userProfile } = useAuth();

  const [products, setProducts] = useState<IapProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!iapAvailable) {
        if (alive) setLoading(false);
        return;
      }
      await initIap();
      const list = await getProducts();
      if (!alive) return;
      setProducts(list);
      setSelected(list[0]?.id ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
      endIap();
    };
  }, []);

  const buy = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const ok = await purchase(selected);
      if (ok) {
        toast.show('You’re all set — welcome to Pro.', { variant: 'success' });
        router.back();
      } else {
        toast.show('Purchase could not be confirmed.', { variant: 'error' });
      }
    } catch (e: any) {
      // StoreKit throws on user cancel; don't shout about it.
      const msg = String(e?.message || '');
      if (!/cancel/i.test(msg)) {
        toast.show(msg || 'Purchase failed.', { variant: 'error' });
      }
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    setBusy(true);
    try {
      const ok = await restore();
      toast.show(
        ok ? 'Subscription restored.' : 'No active subscription found.',
        { variant: ok ? 'success' : 'error' }
      );
      if (ok) router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={() => router.back()} style={styles.close}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>

        <Text style={[styles.title, { color: colors.text }]}>
          Keep your deals moving
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Your free trial has ended. Subscribe to keep running your business in
          Realtor Portal.
        </Text>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text style={[styles.benefitText, { color: colors.text }]}>{b}</Text>
            </View>
          ))}
        </View>

        {!iapAvailable ? (
          // Android: Stripe billing page on the web.
          <Pressable
            onPress={() => Linking.openURL(MANAGE_URL)}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.ctaText}>Manage plan</Text>
          </Pressable>
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : products.length === 0 ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Plans aren’t available right now. Please try again in a moment.
          </Text>
        ) : (
          <>
            {products.map((p) => {
              const isSel = selected === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setSelected(p.id)}
                  style={[
                    styles.plan,
                    {
                      borderColor: isSel ? colors.primary : colors.border,
                      backgroundColor: isSel ? colors.primary + '11' : 'transparent',
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planTitle, { color: colors.text }]}>
                      {p.title}
                    </Text>
                    {!!p.description && (
                      <Text style={[styles.planDesc, { color: colors.textSecondary }]}>
                        {p.description}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.planPrice, { color: colors.text }]}>
                    {p.displayPrice}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              onPress={buy}
              disabled={busy || !selected}
              style={[
                styles.cta,
                { backgroundColor: busy ? colors.border : colors.primary },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>Subscribe</Text>
              )}
            </Pressable>

            <Pressable onPress={doRestore} disabled={busy} style={styles.restore}>
              <Text style={[styles.restoreText, { color: colors.primary }]}>
                Restore purchases
              </Text>
            </Pressable>
          </>
        )}

        {/* Apple requires subscription terms to be visible at point of sale. */}
        {iapAvailable && (
          <Text style={[styles.legal, { color: colors.textSecondary }]}>
            Subscriptions renew automatically unless cancelled at least 24 hours
            before the end of the current period. Your Apple account is charged
            on confirmation. Manage or cancel in your Apple account settings.
          </Text>
        )}
        <View style={styles.legalLinks}>
          <Pressable
            onPress={() =>
              Linking.openURL('https://realtorportal.parallelstudios.co/terms')
            }
          >
            <Text style={[styles.legalLink, { color: colors.primary }]}>
              Terms of Use
            </Text>
          </Pressable>
          <Text style={{ color: colors.textSecondary }}>·</Text>
          <Pressable
            onPress={() =>
              Linking.openURL('https://realtorportal.parallelstudios.co/privacy')
            }
          >
            <Text style={[styles.legalLink, { color: colors.primary }]}>
              Privacy Policy
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 24, paddingBottom: 48 },
  close: { alignSelf: 'flex-end', padding: 4 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  subtitle: { fontSize: 15, marginTop: 8, lineHeight: 21 },
  benefits: { marginTop: 24, gap: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { fontSize: 15, flex: 1 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  planTitle: { fontSize: 16, fontWeight: '700' },
  planDesc: { fontSize: 12, marginTop: 2 },
  planPrice: { fontSize: 17, fontWeight: '800' },
  cta: {
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  restore: { marginTop: 14, alignItems: 'center', padding: 8 },
  restoreText: { fontSize: 15, fontWeight: '600' },
  legal: { fontSize: 11, lineHeight: 16, marginTop: 24 },
  legalLinks: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12,
  },
  legalLink: { fontSize: 12, fontWeight: '600' },
});
