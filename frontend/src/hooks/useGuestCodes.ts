import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/ToastProvider';
import { ApiError, apiClient } from '../lib/apiClient';
import { formatDate } from '../lib/format';
import { downloadGuestCodeCard } from '../lib/guestCodeCard';
import type { GuestCode, GuestCodeSignin, GuestCodesSnapshot } from '../types/api';

export const GUEST_CODES_KEY = ['guest-codes'];
/** Pending requests show up without a reload while the page is open. */
const REFETCH_MS = 15_000;

export function platformLabel(platform: GuestCodeSignin['platform']): string {
  return platform === 'android' ? 'Android' : platform === 'web' ? 'Web' : 'Unknown app';
}

/** Devices a code signed in from, told apart by app and user agent: as close as the log gets to "devices". */
export function deviceCount(code: GuestCode): number {
  return new Set(code.signins.map((s) => `${s.platform ?? ''}|${s.userAgent ?? ''}`)).size;
}

/** The guest codes snapshot (A42/A43/A67/A69): requests, codes, and the require-a-code switch. */
export function useGuestCodes() {
  return useQuery({
    queryKey: GUEST_CODES_KEY,
    queryFn: () => apiClient.get<GuestCodesSnapshot>('/guest-codes'),
    refetchInterval: REFETCH_MS,
  });
}

/** Everything the Users tab does to guest codes, with its toasts. */
export function useGuestCodeActions() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fail = (err: unknown, fallback: string) =>
    showToast(err instanceof ApiError ? err.message : fallback, 'error');
  const refresh = () => queryClient.invalidateQueries({ queryKey: GUEST_CODES_KEY });

  const setRequired = useMutation({
    mutationFn: (required: boolean) => apiClient.put<GuestCodesSnapshot>('/guest-codes/settings', { required }),
    // The box flips on click; a refused save puts it back.
    onMutate: (required) => {
      const previous = queryClient.getQueryData<GuestCodesSnapshot>(GUEST_CODES_KEY);
      if (previous) queryClient.setQueryData(GUEST_CODES_KEY, { ...previous, required });
      return { previous };
    },
    onSuccess: (snapshot) => queryClient.setQueryData(GUEST_CODES_KEY, snapshot),
    onError: (err, _required, context) => {
      if (context?.previous) queryClient.setQueryData(GUEST_CODES_KEY, context.previous);
      fail(err, 'Could not change that setting');
    },
  });

  const create = useMutation({
    mutationFn: () => apiClient.post<GuestCode>('/guest-codes'),
    onSuccess: () => refresh(),
    onError: (err) => fail(err, 'Could not make a code'),
  });

  const revoke = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/guest-codes/${id}`),
    onSuccess: () => {
      void refresh();
      // A used code's guest is deleted with it.
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => fail(err, 'Could not revoke that code'),
  });

  const answer = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'approve' | 'deny' }) =>
      apiClient.post<GuestCodesSnapshot>(`/guest-codes/requests/${id}/${action}`),
    onSuccess: (snapshot, { action }) => {
      queryClient.setQueryData(GUEST_CODES_KEY, snapshot);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast(action === 'approve' ? 'Let in. Their device signs in by itself.' : 'Request turned down');
    },
    onError: (err) => {
      fail(err, 'Could not answer that request');
      void refresh();
    },
  });

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what} copied`);
    } catch {
      // Clipboard access needs HTTPS; on the plain-HTTP LAN it is refused. The text stays on screen to select.
      showToast('Copying is blocked here. Select it and copy it by hand.', 'error');
    }
  }

  async function download(code: GuestCode) {
    try {
      await downloadGuestCodeCard(code.code, formatDate(code.expiresAt));
    } catch {
      showToast('Could not make the image', 'error');
    }
  }

  return { setRequired, create, revoke, answer, copy, download };
}
