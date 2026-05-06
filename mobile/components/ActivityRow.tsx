import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Activity, User } from '@/lib/database.types';
import { formatRelativeTime } from '@/lib/format';
import { Avatar } from './Avatar';
import { useTheme } from '@/lib/theme';

interface ActivityRowProps {
  activity: Activity;
  actor?: User;
}

export function ActivityRow({ activity, actor }: ActivityRowProps) {
  const { colors } = useTheme();

  const initials = useMemo(() => {
    if (!actor?.full_name) return '?';
    return actor.full_name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  }, [actor?.full_name]);

  return (
    <View style={styles.container}>
      <Avatar initials={initials} imageUrl={actor?.avatar_url ?? undefined} size={40} />
      <View style={styles.content}>
        <Text style={[styles.text, { color: colors.text }]}>
          <Text style={styles.bold}>{actor?.full_name || 'Unknown'}</Text>
          {' '}
          {activity.action}
          {' '}
          <Text style={styles.bold}>{activity.target}</Text>
        </Text>
        <Text style={[styles.time, { color: colors.textSecondary }]}>
          {formatRelativeTime(activity.created_at)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  content: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  bold: {
    fontWeight: '600',
  },
  time: {
    fontSize: 12,
    marginTop: 4,
  },
});
