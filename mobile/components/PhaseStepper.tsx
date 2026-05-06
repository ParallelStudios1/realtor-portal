import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DealPhase } from '@/lib/database.types';
import { formatPhase } from '@/lib/format';
import { useTheme } from '@/lib/theme';

interface PhaseStepperProps {
  currentPhase: DealPhase;
  size?: 'small' | 'large';
}

const phases: DealPhase[] = ['searching', 'offer_made', 'under_contract', 'closing', 'closed'];

export function PhaseStepper({ currentPhase, size = 'large' }: PhaseStepperProps) {
  const { colors } = useTheme();
  const currentIndex = phases.indexOf(currentPhase);

  const isSmall = size === 'small';
  const dotSize = isSmall ? 24 : 40;
  const lineHeight = isSmall ? 2 : 4;

  return (
    <View style={styles.container}>
      <View style={styles.stepper}>
        {phases.map((phase, index) => {
          const isCompleted = index <= currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <React.Fragment key={phase}>
              {/* Dot */}
              <View
                style={[
                  styles.dot,
                  {
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    backgroundColor: isCompleted
                      ? colors.primary
                      : colors.border,
                  },
                ]}
              >
                {isCurrent && (
                  <View
                    style={[
                      styles.innerDot,
                      { width: dotSize - 6, height: dotSize - 6, borderRadius: (dotSize - 6) / 2 },
                    ]}
                  />
                )}
              </View>

              {/* Connecting line */}
              {index < phases.length - 1 && (
                <View
                  style={[
                    styles.line,
                    {
                      height: lineHeight,
                      flex: 1,
                      backgroundColor: isCompleted ? colors.primary : colors.border,
                    },
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* Labels */}
      {!isSmall && (
        <View style={styles.labels}>
          {phases.map((phase) => (
            <Text
              key={phase}
              style={[
                styles.label,
                {
                  color: phase === currentPhase ? colors.primary : colors.textSecondary,
                  fontWeight: phase === currentPhase ? '600' : '400',
                },
              ]}
            >
              {formatPhase(phase)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dot: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerDot: {
    backgroundColor: '#FFFFFF',
  },
  line: {
    marginHorizontal: 8,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  label: {
    fontSize: 12,
    textAlign: 'center',
    flex: 1,
  },
});
