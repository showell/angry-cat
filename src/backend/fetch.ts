import type { Message, Stream, User } from "./db_types";

import * as config from "../config";
import { Database } from "./database";
import * as message_fetch from "./message_fetch";
import { MessageIndex } from "./message_index";
import { ReactionsMap } from "./reactions";
import { TopicMap } from "./topic_map";
import * as zulip_client from "./zulip_client";

async function fetch_streams(): Promise<Stream[]> {
    const subscriptions = await zulip_client.get_subscriptions();

    const streams: Stream[] = subscriptions.map((subscription: any) => {
        return {
            stream_id: subscription.stream_id,
            name: subscription.name,
            description: subscription.description,
            rendered_description: subscription.rendered_description,
            stream_weekly_traffic: subscription.stream_weekly_traffic,
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
            is_admin: row.is_admin ?? false,
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
    const message_map = new Map<number, Message>();
    const message_index = new MessageIndex();
    const reactions_map = new ReactionsMap();

    const db = {
        current_user_id,
        user_map,
        channel_map,
        topic_map,
        message_map,
        message_index,
        reactions_map,
    };

    await message_fetch.fetch_initial_messages(db);

    return db;
}
