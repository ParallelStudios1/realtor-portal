import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ImportantDate } from '@/lib/database.types';
import { formatDateShort, daysUntil, isDateOverdue } from '@/lib/format';
import { useTheme } from '@/lib/theme';

interface ImportantDateRowProps {
  date: ImportantDate;
}

export function ImportantDateRow({ date }: ImportantDateRowProps) {
  const { colors } = useTheme();
  const days = daysUntil(date.date);
  const overdue = isDateOverdue(date.date);

  let dotColor = colors.primary;
  if (overdue) {
    dotColor = colors.error;
  } else if (days <= 7) {
    dotColor = colors.warning;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.text }]}>
          {date.label}
        </Text>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {formatDateShort(date.date)}
        </Text>
      </View>
      <View style={styles.daysContainer}>
        <Text
          style={[
            styles.days,
            {
              color: dotColor,
              fontWeight: '600',
            },
          ]}
        >
          {overdue ? 'Overdue' : days === 0 ? 'Today' : `${days}d`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
  },
  daysContainer: {
    alignItems: 'flex-end',
  },
  days: {
    fontSize: 13,
  },
});
