import { Alert } from 'react-native';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

const REASONS = [
  'Harassment or bullying',
  'Inappropriate or offensive content',
  'Spam or scam',
  'Impersonation',
  'Other',
];

/**
 * Report / block flows for user-generated content (messages, people on a
 * deal). Required for App Store (Guideline 1.2) and Google Play UGC policies.
 */
export function useModeration() {
  const toast = useToast();

  const submitReport = async (opts: {
    reportedUserId?: string;
    searchId?: string;
    messageId?: string;
    kind: string;
    reason: string;
  }) => {
    try {
      await apiFetch('/api/moderation/report', {
        method: 'POST',
        body: {
          reported_user_id: opts.reportedUserId,
          search_id: opts.searchId,
          message_id: opts.messageId,
          kind: opts.kind,
          reason: opts.reason,
        },
      });
      toast.show('Report submitted. Our team will review it.', { variant: 'success' });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    }
  };

  const pickReason = (onPick: (reason: string) => void) => {
    Alert.alert('Report - choose a reason', undefined, [
      ...REASONS.map((r) => ({ text: r, onPress: () => onPick(r) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const blockUser = async (userId: string, name: string) => {
    Alert.alert(
      `Block ${name}?`,
      "You won't see their messages, and they won't see yours on shared deals.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch('/api/moderation/block', {
                method: 'POST',
                body: { blocked_user_id: userId, action: 'block' },
              });
              toast.show(`${name} blocked.`, { variant: 'success' });
            } catch (e: any) {
              toast.show(humanError(e), { variant: 'error' });
            }
          },
        },
      ]
    );
  };

  /** Action sheet offering Report or Block for a person. */
  const reportOrBlockUser = (opts: {
    userId?: string;
    name: string;
    searchId?: string;
  }) => {
    Alert.alert(opts.name, 'Report or block this person?', [
      {
        text: 'Report',
        onPress: () =>
          pickReason((reason) =>
            submitReport({
              reportedUserId: opts.userId,
              searchId: opts.searchId,
              kind: 'user',
              reason,
            })
          ),
      },
      ...(opts.userId
        ? [
            {
              text: 'Block',
              style: 'destructive' as const,
              onPress: () => blockUser(opts.userId!, opts.name),
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  /** Report a specific message (with optional block of its sender). */
  const reportMessage = (opts: {
    messageId: string;
    senderId?: string;
    searchId?: string;
  }) => {
    pickReason((reason) =>
      submitReport({
        messageId: opts.messageId,
        reportedUserId: opts.senderId,
        searchId: opts.searchId,
        kind: 'message',
        reason,
      })
    );
  };

  return { reportOrBlockUser, reportMessage, blockUser };
}
