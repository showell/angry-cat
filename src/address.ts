import { DB } from "./backend/database";
import * as model from "./backend/model";

export enum AddressType {
    NADA,
    CHANNEL,
    TOPIC,
    MESSAGE,
}

// We should eventually make this a discriminated union.
export type Address = {
    channel_id: number | undefined;
    topic_id: number | undefined;
    message_id: number | undefined;
};

export type PathInfo = {
    channel_id: number | undefined;
    topic_name: string | undefined;
    message_id: number | undefined;
};

export function nada(): Address {
    return {
        channel_id: undefined,
        topic_id: undefined,
        message_id: undefined,
    };
}

export function address_type(address: Address): AddressType {
    if (address.message_id) return AddressType.MESSAGE;
    if (address.topic_id) return AddressType.TOPIC;
    if (address.channel_id) return AddressType.CHANNEL;
    return AddressType.NADA;
}

function unescape(str: string) {
    return decodeURIComponent(str.replace(/\./g, "%"));
}

export function parse_path(path: string): PathInfo | undefined {
    if (path.startsWith("/")) {
        path = path.slice(1);
    }

    if (!path.startsWith("#narrow/channel")) {
        return undefined;
    }

    const [channel_part, _topic, topic_part, with_near, message_part] = path
        .split("/")
        .slice(2);

    const channel_id_str = channel_part.split("-")[0]!;
    const channel_id = parseInt(channel_id_str);
    const topic_name =
        topic_part !== undefined ? unescape(topic_part) : undefined;

    const message_id =
        message_part && with_near === "near"
            ? parseInt(message_part)
            : undefined;

    return { channel_id, topic_name, message_id };
}

function topic_id_lookup(channel_id: number, topic_name: string): number {
    return DB.topic_map.get_topic_id(channel_id, topic_name);
}

// --- Persistence ---
//
// Topic IDs are local to the current session (invented by Angry Cat,
// not Zulip). To persist an Address across sessions, we dump it as
// { channel_id, message_id } — dropping topic_id. If the original
// address had a topic but no message, we find the first message in
// the topic to use as a representative. On load, we recover topic_id
// by looking up the message in DB.message_map.

export type DumpedAddress = {
    channel_id: number | undefined;
    message_id: number | undefined;
};

export function dump_address(address: Address): DumpedAddress {
    let message_id = address.message_id;

    // If we have a topic but no message, find the first message in
    // the topic to serve as a representative for later recovery.
    if (message_id === undefined && address.topic_id !== undefined) {
        const messages = model.messages_for_topic(address.topic_id);
        if (messages.length > 0) {
            message_id = messages[0].id;
        }
    }

    return {
        channel_id: address.channel_id,
        message_id,
    };
}

export function load_address(dumped: DumpedAddress): Address {
    let topic_id: number | undefined;

    // Recover topic_id from the message's topic assignment.
    if (dumped.message_id !== undefined) {
        const message = DB.message_map.get(dumped.message_id);
        if (message) {
            topic_id = message.topic_id;
        }
    }

    return {
        channel_id: dumped.channel_id,
        topic_id,
        message_id: dumped.message_id,
    };
}

export function get_address_from_path(path: string): Address | undefined {
    if (path.startsWith("/")) {
        path = path.slice(1);
    }

    if (!path.startsWith("#narrow/channel")) {
        return undefined;
    }

    const path_info = parse_path(path);

    if (path_info === undefined) {
        return undefined;
    }

    const channel_id = path_info.channel_id;
    const topic_name = path_info.topic_name;
    const topic_id =
        channel_id && topic_name
            ? topic_id_lookup(channel_id, topic_name)
            : undefined;

    return {
        channel_id,
        topic_id,
        message_id: path_info.message_id,
    };
}
