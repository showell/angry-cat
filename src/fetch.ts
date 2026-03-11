import * as database from "./backend/database";
import * as model from "./backend/model";

async function test(): Promise<void> {
    await database.fetch_original_data();

    console.log(model.get_channel_rows().slice(0, 2));
}

test();
