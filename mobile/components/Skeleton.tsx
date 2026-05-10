import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';

/**
 * Shimmering rounded rect placeholder. Pulses opacity to roughly mimic the
 * shimmer effect we'd otherwise need a gradient lib for. Keeps the dependency
 * graph small and works on iOS + Android out of the box.
 */
export function Skeleton({
  width,
  height,
  borderRadius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        {
          backgroundColor: colors.border,
          width: width as any,
          height: height as any,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * Common multi-line list-row skeleton. Matches the shape of most rows in the
 * app: a title bar with two stacked sub-rows. Drop-in replacement so layouts
 * don't shift when real data lands.
 */
export function SkeletonRow({
  withChip = false,
}: {
  withChip?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} />
      </View>
      {withChip && <Skeleton width={64} height={20} borderRadius={10} />}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
});
