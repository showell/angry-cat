// Central log of user actions. Other modules call record() to log an
// action; the activity plugin reads get_entries() to display them.

export const enum ActionType {
    TOPIC_VIEWED = "Viewed topic",
    MESSAGE_SENT = "Sent message",
    TOPIC_MARKED_READ = "Marked read",
    TOPIC_MARKED_UNREAD = "Marked unread",
}

export type ActionEntry = {
    timestamp: number;
    action: ActionType;
    channel_name: string;
    topic_name: string;
};

const entries: ActionEntry[] = [];

export function record(
    action: ActionType,
    channel_name: string,
    topic_name: string,
): void {
    entries.push({ timestamp: Date.now(), action, channel_name, topic_name });
}

export function get_entries(): readonly ActionEntry[] {
    return entries;
}
