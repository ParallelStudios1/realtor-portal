import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { Platform } from 'react-native';

export async function registerPushToken(userId: string) {
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Failed to get push notification permissions');
      return;
    }

    const token = (
      await Notifications.getExpoPushTokenAsync()
    ).data;

    // Store token in database
    await supabase.from('push_tokens').upsert({
      user_id: userId,
      token,
      platform: Platform.OS as 'ios' | 'android',
    });

    return token;
  } catch (error) {
    console.error('Error registering push token:', error);
  }
}

export function setupNotificationHandlers() {
  // Handle notifications when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      };
    },
  });

  // Handle notification when app is opened from notification
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      // TODO(v1.1): Handle notification tap — navigate to relevant screen
      console.log('Notification response:', response);
    }
  );

  return () => subscription.remove();
}
