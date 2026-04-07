import assert from "node:assert/strict";
import { parse_path } from "../address";

// Full narrow URL with channel, topic, and message
{
    const path =
        "/#narrow/channel/554653-gif-picker-project/topic/resizable.20gif.20picker/near/576031852";
    const info = parse_path(path)!;
    assert.equal(info.channel_id, 554653);
    assert.equal(info.topic_name, "resizable gif picker");
    assert.equal(info.message_id, 576031852);
}

// Channel-only URL
{
    const info = parse_path("/#narrow/channel/3-ChitChat")!;
    assert.equal(info.channel_id, 3);
    assert.equal(info.topic_name, undefined);
    assert.equal(info.message_id, undefined);
}

// Channel + topic, no message
{
    const info = parse_path("/#narrow/channel/2-Angry%20Gopher/topic/dev%20log")!;
    assert.equal(info.channel_id, 2);
    assert.equal(info.topic_name, "dev log");
    assert.equal(info.message_id, undefined);
}

// Non-narrow path returns undefined
{
    const info = parse_path("/some/other/path");
    assert.equal(info, undefined);
}

// Leading slash stripped
{
    const info = parse_path("#narrow/channel/1-test/topic/hello")!;
    assert.equal(info.channel_id, 1);
    assert.equal(info.topic_name, "hello");
}

console.log("  address_test: OK");
