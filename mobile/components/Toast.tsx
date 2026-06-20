import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Lightweight in-app toast.
 *
 * Wrap the app in <ToastProvider> (done in app/_layout.tsx) and call
 * `useToast().show('Saved!', { variant: 'success' })` anywhere underneath.
 *
 * Design:
 *  - Slides down from the top.
 *  - Auto-dismisses after `duration` ms (default 3500).
 *  - Tap to dismiss early.
 *  - Only one toast at a time - calling show() while one is up replaces it.
 *
 * Deliberately tiny: no portal, no third-party deps. We mount a single
 * <Animated.View> at the top of the tree and animate translateY/opacity.
 */

export type ToastVariant = 'success' | 'error' | 'info';

export type ToastOptions = {
  variant?: ToastVariant;
  duration?: number;
};

type ToastContextValue = {
  show: (message: string, options?: ToastOptions) => void;
  hide: () => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 3500;

const VARIANT_STYLE: Record<
  ToastVariant,
  { background: string; border: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  success: {
    background: '#0F9D58',
    border: '#0B7A45',
    icon: 'checkmark-circle',
  },
  error: { background: '#D93025', border: '#A52419', icon: 'alert-circle' },
  info: { background: '#1F6FEB', border: '#1556B8', icon: 'information-circle' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [variant, setVariant] = useState<ToastVariant>('info');

  // We use refs for the animated values so they survive re-renders; setVisible
  // drives the actual mount/unmount.
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setVisible(false);
    });
  }, [opacity, translateY]);

  const show = useCallback(
    (msg: string, options?: ToastOptions) => {
      clearTimer();
      setMessage(msg);
      setVariant(options?.variant ?? 'info');
      setVisible(true);
      // Reset to off-screen, then animate in.
      translateY.setValue(-100);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const duration = options?.duration ?? DEFAULT_DURATION;
      timer.current = setTimeout(hide, duration);
    },
    [hide, opacity, translateY]
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => clearTimer();
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ show, hide }), [show, hide]);

  const styleForVariant = VARIANT_STYLE[variant];

  return (
    <ToastContext.Provider value={value}>
      {children}
      {visible ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrapper,
            {
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <Pressable
            onPress={hide}
            style={[
              styles.toast,
              {
                backgroundColor: styleForVariant.background,
                borderColor: styleForVariant.border,
              },
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Ionicons
              name={styleForVariant.icon}
              size={18}
              color="#fff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.text} numberOfLines={3}>
              {message}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Don't throw - toasts are nice-to-have. If used outside the provider
    // we no-op so a missing provider doesn't crash a screen.
    return {
      show: (msg) => {
        if (__DEV__) console.warn('[toast] no provider mounted; message:', msg);
      },
      hide: () => {},
    };
  }
  return ctx;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    // Account for the status bar / dynamic island. SafeAreaView in screens
    // doesn't apply here because we're a sibling to the navigator.
    top: Platform.OS === 'ios' ? 56 : 24,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 12,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
});
