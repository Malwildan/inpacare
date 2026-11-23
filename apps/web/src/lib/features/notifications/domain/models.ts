export type Notification = {
    id: string;
    cycleId: string | null;
    requestId?: string | null;
    message: string;
    readAt: string | null;
    createdAt: string;
};
