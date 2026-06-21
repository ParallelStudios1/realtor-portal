import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';

/**
 * Realtor tabs - Home (overview), Clients, Messages, Settings.
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
      {/* This screen lists DEALS (one row per deal workspace), not people -
          calling it "Clients" made "2 clients / 1 deal" look like a bug. */}
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Deals',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="briefcase" size={size} color={color} />
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
      {/* Stacked routes - keep them out of the tab bar */}
      <Tabs.Screen name="firm" options={{ href: null, title: 'Firm control' }} />
      <Tabs.Screen name="oversight" options={{ href: null, title: 'Oversight' }} />
      <Tabs.Screen name="invite" options={{ href: null, title: 'Invite client' }} />
      <Tabs.Screen name="clients/[id]" options={{ href: null, title: 'Deal' }} />
      <Tabs.Screen name="clients/[id]/upload" options={{ href: null, title: 'Upload document' }} />
      <Tabs.Screen name="clients/[id]/add-date" options={{ href: null, title: 'Add date' }} />
      <Tabs.Screen name="clients/[id]/add-house" options={{ href: null, title: 'Add house' }} />
      <Tabs.Screen name="clients/[id]/houses/[houseId]" options={{ href: null, title: 'House' }} />
      <Tabs.Screen name="clients/[id]/financials" options={{ href: null, title: 'Financials' }} />
      <Tabs.Screen name="clients/[id]/under-contract" options={{ href: null, title: 'Under contract' }} />
      <Tabs.Screen name="clients/[id]/phase" options={{ href: null, title: 'Update phase' }} />
      <Tabs.Screen name="clients/[id]/deal-chat" options={{ href: null, title: 'Deal chat' }} />
      <Tabs.Screen name="clients/[id]/alert" options={{ href: null, title: 'Send alert' }} />
      <Tabs.Screen name="clients/[id]/attorney" options={{ href: null, title: 'Attorney' }} />
      <Tabs.Screen name="clients/[id]/docusign" options={{ href: null, title: 'DocuSign' }} />
      {/* add-party was missing here, so expo-router auto-generated a junk
          tab for it (raw route name + placeholder icon, bottom-right). Every
          stacked route MUST be listed with href:null to stay out of the bar. */}
      <Tabs.Screen name="clients/[id]/add-party" options={{ href: null, title: 'Add party' }} />
    </Tabs>
  );
}
