import * as address from "./address";

function assert_equal(a: any, b: any) {
    if (a !== b) {
        console.log("\n-----------\n");
        console.log("Not equal!");
        console.log(a);
        console.log(b);
        console.log("\n-----------\n");
        throw new Error("assert_equal failed");
    }
}

function test_paths() {
    const path =
        "/#narrow/channel/554653-gif-picker-project/topic/resizable.20gif.20picker/near/576031852";
    const path_info = address.parse_path(path)!;
    assert_equal(path_info.channel_id, 554653);
    assert_equal(path_info.topic_name, "resizable gif picker");
    assert_equal(path_info.message_id, 576031852);
}

test_paths();
console.log("SUCCESS!");
