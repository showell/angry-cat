export type StreamType = "stream";

export type Message = {
    code_snippets: string[];
    content: string;
    github_refs: string[];
    id: number;
    is_super_new: boolean;
    local_message_id: string | undefined;
    sender_id: number;
    stream_id: number;
    timestamp: number;
    topic_id: number;
    type: "stream";
    unread: boolean;
    reactions: Reaction[];
};

// We only support unicode emoji right now,
// so reaction_type is out of the question.
export type Reaction = {
    emoji_name: string;
    emoji_code: string;
    user_ids: number[];
};

export type Stream = {
    stream_id: number;
    name: string;
    rendered_description: string;
    stream_weekly_traffic: number;
};

export type User = {
    id: number;
    email: string;
    full_name: string;
};

export type Topic = {
    topic_id: number;
    channel_id: number;
    topic_name: string;
};
