import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';

/**
 * Realtor tabs — Home (overview), Clients, Messages, Settings.
 * Hidden routes (clients/[id], add-house, etc.) stack inside Clients.
 */
export default function RealtorTabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: 4,
          height: 56,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-sharp" size={size} color={color} />
          ),
        }}
      />
      {/* Stacked routes — keep them out of the tab bar */}
      <Tabs.Screen name="invite" options={{ href: null }} />
      <Tabs.Screen name="clients/[id]" options={{ href: null }} />
      <Tabs.Screen name="clients/[id]/upload" options={{ href: null }} />
      <Tabs.Screen name="clients/[id]/add-date" options={{ href: null }} />
      <Tabs.Screen name="clients/[id]/add-house" options={{ href: null }} />
      <Tabs.Screen name="clients/[id]/houses/[houseId]" options={{ href: null }} />
    </Tabs>
  );
}
