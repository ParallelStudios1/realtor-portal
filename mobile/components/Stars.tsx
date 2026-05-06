import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme';

/**
 * A 1–5 star rating row.
 *
 * - `value` is the current selection (0 = none, 1..5 = stars).
 * - When `onChange` is provided, the row is interactive (used in the rating prompt).
 * - When omitted, it's read-only (used in the realtor view to show what the client said).
 *
 * Rendered as plain text emoji stars rather than icon fonts so we don't pull in
 * an icon package. Looks fine cross-platform.
 */
export function Stars({
  value,
  onChange,
  size = 32,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  const { colors } = useTheme();
  const filledColor = colors.warning ?? '#FFB400';

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = (
          <Text
            style={[
              styles.star,
              {
                fontSize: size,
                color: filled ? filledColor : '#D1D5DB',
              },
            ]}
          >
            {filled ? '★' : '☆'}
          </Text>
        );
        if (!onChange) return <View key={n}>{star}</View>;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            hitSlop={6}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  star: { lineHeight: undefined as any },
});
