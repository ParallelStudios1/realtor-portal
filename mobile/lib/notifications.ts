import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { Platform } from 'react-native';

/**
 * Push notifications require a development build (or production app) — they
 * don't work inside Expo Go on SDK 53+. We detect that environment and skip
 * the registration silently so the dev experience isn't spammed with errors.
 */
function isExpoGo() {
  return Constants.appOwnership === 'expo';
}

export async function registerPushToken(userId: string) {
  if (isExpoGo()) {
    // Silently skip in Expo Go — feature requires a real build.
    return;
  }

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

    // Pull projectId from app.json EAS config (only available in real builds).
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const token = (
      await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      )
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
  try {
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
  } catch (err) {
    // Native module not available (Expo Go, web, misconfigured build) —
    // don't crash the whole app over notifications.
    console.warn('Notification handler setup failed:', err);
    return () => {};
  }
}
