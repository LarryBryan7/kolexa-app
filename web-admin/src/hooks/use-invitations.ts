import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

export interface UserInvitation {
  token: string;
  shortCode: string;
  expiresAt: string;
  email: string | null;
}

export function useActiveInvitationForUser(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['user-invitation', userId],
    queryFn: async () => {
      try {
        return await api<UserInvitation>(`/invitations/user/${userId}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled,
  });
}

export function useGenerateUserInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { userId: string; email: string; role: 'teacher' | 'school_admin' }) =>
      api<{ token: string; shortCode: string; expiresAt: string; inviteLink: string }>('/invitations', {
        method: 'POST',
        body: { email, role },
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-invitation', variables.userId] });
    },
  });
}
