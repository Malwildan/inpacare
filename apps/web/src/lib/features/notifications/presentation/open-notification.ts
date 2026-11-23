import { goto } from '$app/navigation';
import { sessionFailure } from '$lib/shared/presentation/session';
import { toast } from '$lib/shared/ui/sonner/index.js';
import type { Notifications } from '../application/notifications';
import type { Notification } from '../domain/models';

export async function openNotification(notice: Notification, service: Notifications, onread: (readAt: string) => void) {
    if (!notice.readAt) {
        try {
            await service.markRead(notice.id);
            onread(new Date().toISOString());
        } catch (cause) {
            toast.error(sessionFailure(cause, 'save', 'status baca notifikasi'));
            return false;
        }
    }
    if (!notice.cycleId) {
        if (!notice.readAt) toast.success('Notifikasi ditandai sebagai sudah dibaca.');
        return false;
    }
    const query = new URLSearchParams({ cycleId: notice.cycleId });
    if (notice.requestId) query.set('requestId', notice.requestId);
    try {
        await goto(`/dashboard?${query}`);
        return true;
    } catch (cause) {
        toast.error(sessionFailure(cause, 'load', 'Tujuan notifikasi'));
        return false;
    }
}
