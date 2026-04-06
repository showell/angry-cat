// Splash screen shown during startup while data loads.
// All splash DOM and progress reporting is self-contained here.

import * as message_fetch from "./backend/message_fetch";
import type { Database } from "./backend/database";

const BACKFILL_THRESHOLD = 40_000;

class Splash {
    private element: HTMLDivElement;
    private log: HTMLDivElement;

    constructor() {
        const splash = document.createElement("div");
        splash.style.display = "flex";
        splash.style.flexDirection = "column";
        splash.style.alignItems = "center";
        splash.style.paddingTop = "40px";
        splash.style.height = "100vh";
        splash.style.boxSizing = "border-box";
        splash.style.fontFamily = "sans-serif";

        const title = document.createElement("div");
        title.innerText = "Angry Cat Zulip Client";
        title.style.fontSize = "28px";
        title.style.fontWeight = "bold";
        title.style.color = "#000080";
        title.style.marginBottom = "20px";
        splash.append(title);

        const img = document.createElement("img");
        img.src = "images/angry_cat.png";
        img.style.width = "312px";
        img.style.height = "auto";
        img.style.marginBottom = "20px";
        splash.append(img);

        const log = document.createElement("div");
        log.style.fontSize = "16px";
        log.style.color = "#265a70";
        log.style.textAlign = "center";
        log.style.lineHeight = "1.6";
        splash.append(log);

        document.body.style.margin = "0";
        document.body.append(splash);

        this.element = splash;
        this.log = log;
    }

    add_line(text: string): void {
        const line = document.createElement("div");
        line.innerText = text;
        this.log.append(line);
    }

    async run_backfill(db: Database): Promise<void> {
        let backfill_line: HTMLDivElement | undefined;

        return new Promise<void>((resolve) => {
            let resolved = false;

            const done = () => {
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            };

            message_fetch.backfill(db, (count) => {
                if (!backfill_line) {
                    backfill_line = document.createElement("div");
                    this.log.append(backfill_line);
                }
                backfill_line.innerText =
                    `Backfilling... ${count.toLocaleString()} messages cached.`;
                if (count >= BACKFILL_THRESHOLD) {
                    done();
                }
            }).then(done);
        });
    }

    remove(): void {
        this.element.remove();
    }
}

export function create(): Splash {
    return new Splash();
}
