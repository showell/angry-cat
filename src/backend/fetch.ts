import type { Message, Reaction, Stream, User } from "./db_types";

import * as config from "../config";
import { Database } from "./database";
import { TopicMap } from "./topic_map";
import * as parse from "./parse";
import * as zulip_client from "./zulip_client";

const BATCH_SIZE = 5000;

async function fetch_streams(): Promise<Stream[]> {
    const subscriptions = await zulip_client.get_subscriptions();

    const streams: Stream[] = subscriptions.map((subscription: any) => {
        return {
            stream_id: subscription.stream_id,
            rendered_description: subscription.rendered_description,
            stream_weekly_traffic: subscription.stream_weekly_traffic,
            name: subscription.name,
        };
    });

    return streams;
}

async function fetch_users(): Promise<User[]> {
    const rows: any[] = await zulip_client.get_users();

    return rows.map((row) => {
        return {
            id: row.user_id,
            email: row.email,
            full_name: row.full_name,
        };
    });
}

export async function fetch_model_data(): Promise<Database> {
    console.log("start fetch");

    const users = await fetch_users();

    const user_map = new Map<number, User>();

    let current_user_id = -1;

    for (const user of users) {
        user_map.set(user.id, user);

        if (user.email === config.get_email_for_current_realm()) {
            current_user_id = user.id;
        }
    }

    const streams = await fetch_streams();

    const channel_map = new Map<number, Stream>();

    for (const stream of streams) {
        channel_map.set(stream.stream_id, stream);
    }

    const topic_map = new TopicMap();

    const rows = await zulip_client.get_messages(BATCH_SIZE);

    const messages: Message[] = rows
        .filter((row: any) => row.type === "stream")
        .map((row: any) => {
            const local_message_id = undefined; // is only in events

            const topic = topic_map.get_or_make_topic_for(
                row.stream_id,
                row.subject,
            );
            const unread =
                row.flags.find((flag: string) => flag === "read") === undefined;

            const raw_reactions = row.reactions.filter(
                (reaction: any) => reaction.reaction_type === "unicode_emoji",
            );
            // Maps emoji name to a Reaction object.
            const reaction_map = new Map<string, Reaction>();

            for (const raw_reaction of raw_reactions) {
                if (!reaction_map.has(raw_reaction.emoji_name)) {
                    const reaction: Reaction = {
                        emoji_code: raw_reaction.emoji_code,
                        emoji_name: raw_reaction.emoji_name,
                        user_ids: [raw_reaction.user_id],
                    };
                    reaction_map.set(raw_reaction.emoji_name, reaction);
                } else {
                    reaction_map
                        .get(raw_reaction.emoji_name)!
                        .user_ids.push(raw_reaction.user_id);
                }
            }

            const message: Message = {
                code_snippets: [],
                content: row.content,
                github_refs: [],
                id: row.id,
                is_super_new: false,
                local_message_id,
                sender_id: row.sender_id,
                stream_id: row.stream_id,
                timestamp: row.timestamp,
                topic_id: topic.topic_id,
                type: row.type,
                reactions: [...reaction_map.values()],
                unread,
            };
            if (message.reactions.length > 0) {
                console.log(message.reactions);
            }
            parse.parse_content(message);
            return message;
        });

    for (const row of rows) {
        if (!user_map.has(row.sender_id)) {
            const id = row.sender_id;
            const email = row.sender_email;
            const full_name = row.sender_full_name;
            const user = { id, email, full_name };
            user_map.set(id, user);
        }
    }

    const message_map = new Map(
        messages.map((message) => [message.id, message]),
    );

    console.log(`${message_map.size} messages fetched!`);

    return {
        current_user_id,
        user_map,
        channel_map,
        topic_map,
        message_map,
    };
}
