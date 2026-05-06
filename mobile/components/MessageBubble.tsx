import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message } from '@/lib/database.types';
import { formatRelativeTime } from '@/lib/format';
import { useTheme } from '@/lib/theme';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.container,
        isOwn ? styles.ownContainer : styles.otherContainer,
      ]}
    >
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isOwn ? colors.primary : colors.surface,
          },
        ]}
      >
        <Text
          style={[
            styles.text,
            {
              color: isOwn ? '#FFFFFF' : colors.text,
            },
          ]}
        >
          {message.body}
        </Text>
      </View>
      <Text
        style={[
          styles.time,
          {
            color: colors.textSecondary,
            textAlign: isOwn ? 'right' : 'left',
          },
        ]}
      >
        {formatRelativeTime(message.created_at)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    marginHorizontal: 12,
  },
  ownContainer: {
    alignItems: 'flex-end',
  },
  otherContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '80%',
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  time: {
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 12,
  },
});
