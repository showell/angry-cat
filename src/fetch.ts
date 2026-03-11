import * as config from "./config";
import * as database from "./backend/database";
import * as model from "./backend/model";
import { TEST_CONFIG } from "./test_config";

async function test(): Promise<void> {
    config.set_current_realm_config(TEST_CONFIG);

    await database.fetch_original_data();

    console.log(model.get_channel_rows().slice(0, 2));
}

test();
