import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing } from 'react-native';
import { useTheme } from '@/lib/theme';
import type { DealPhase } from '@/lib/database.types';

const MESSAGES: Partial<Record<DealPhase, { emoji: string; title: string; sub: string }>> = {
  offer_made: { emoji: '🎯', title: 'Offer Submitted!', sub: "Now we wait. We'll keep you posted." },
  under_contract: { emoji: '🎉', title: "You're Under Contract!", sub: 'Big step. Onward to closing.' },
  closing: { emoji: '🔑', title: 'Closing Time', sub: 'Final stretch — almost yours.' },
  closed: { emoji: '🏡', title: 'Welcome Home!', sub: "Congrats — it's officially yours." },
};

/**
 * Full-screen takeover shown when a deal phase advances. Auto-dismisses
 * after ~4 seconds. Driven by the parent passing a `phase` and `visible`.
 *
 * Wire this up in (client)/index.tsx by listening for changes to
 * activeSearch.phase and toggling visible when it changes.
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
      <Animated.View style={[styles.backdrop, { opacity, backgroundColor: colors.primary + 'E6' }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <Text style={styles.emoji}>{msg.emoji}</Text>
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
  emoji: { fontSize: 96, marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 12 },
  sub: { fontSize: 16, color: '#fff', opacity: 0.9, textAlign: 'center' },
});
