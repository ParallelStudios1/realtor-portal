import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import type { DealPhase } from '@/lib/database.types';

const MESSAGES: Partial<
  Record<DealPhase, { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }>
> = {
  offer_made: {
    icon: 'paper-plane',
    title: 'Offer submitted',
    sub: "Now we wait. We'll keep you posted.",
  },
  under_contract: {
    icon: 'document-text',
    title: "You're under contract",
    sub: 'Big step. Onward to closing.',
  },
  closing: {
    icon: 'key',
    title: 'Closing time',
    sub: 'Final stretch - almost yours.',
  },
  closed: {
    icon: 'home',
    title: 'Welcome home',
    sub: "It's officially yours.",
  },
};

/**
 * Full-screen takeover shown when a deal phase advances. Auto-dismisses
 * after ~4 seconds. Driven by the parent passing a `phase` and `visible`.
 *
 * Flat-ink treatment: brand-color backdrop, a single line icon in a white
 * ring, no emojis or confetti.
 */
export function MilestoneCelebration({
  phase,
  visible,
  onDismiss,
}: {
  phase: DealPhase | null;
  visible: boolean;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const opacity = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (!visible) return;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 12,
        stiffness: 110,
      }),
    ]).start();

    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        onDismiss();
        scale.setValue(0.8);
      });
    }, 4000);

    return () => clearTimeout(t);
  }, [visible, opacity, scale, onDismiss]);

  if (!phase) return null;
  const msg = MESSAGES[phase];
  if (!msg) return null;

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View
        style={[
          styles.backdrop,
          { opacity, backgroundColor: colors.primary + 'E6' },
        ]}
      >
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <View style={styles.iconRing}>
            <Ionicons name={msg.icon} size={44} color="#fff" />
          </View>
          <Text style={styles.title}>{msg.title}</Text>
          <Text style={styles.sub}>{msg.sub}</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { alignItems: 'center', padding: 32 },
  iconRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  sub: { fontSize: 16, color: '#fff', opacity: 0.9, textAlign: 'center' },
});
