// Splash screen shown during startup while data loads.
// All splash DOM and progress reporting is self-contained here.
//
// run_backfill returns two promises:
//   threshold — resolves when BACKFILL_THRESHOLD messages are cached
//               (or when backfill finishes, if the server has fewer).
//               main.ts awaits this to dismiss the splash.
//   complete  — resolves when backfill truly finishes (all batches done
//               or MAX_SIZE reached). main.ts uses this to trigger a
//               final refresh of all channel choosers.

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

    run_backfill(db: Database): {
        threshold: Promise<void>;
        complete: Promise<void>;
    } {
        let backfill_line: HTMLDivElement | undefined;

        // threshold resolves early (at BACKFILL_THRESHOLD) so the splash
        // can dismiss while backfill continues in the background.
        let threshold_resolved = false;
        let threshold_resolve!: () => void;
        const threshold = new Promise<void>((resolve) => {
            threshold_resolve = resolve;
        });

        function resolve_threshold(): void {
            if (!threshold_resolved) {
                threshold_resolved = true;
                threshold_resolve();
            }
        }

        const complete = message_fetch
            .backfill(db, (count) => {
                if (!backfill_line) {
                    backfill_line = document.createElement("div");
                    this.log.append(backfill_line);
                }
                backfill_line.innerText = `Backfilling... ${count.toLocaleString()} messages cached.`;

                if (count >= BACKFILL_THRESHOLD) {
                    resolve_threshold();
                }
            })
            // If the server has fewer than BACKFILL_THRESHOLD messages,
            // backfill finishes before the threshold is reached. Resolve
            // threshold here so the splash still dismisses.
            .then(resolve_threshold);

        return { threshold, complete };
    }

    remove(): void {
        this.element.remove();
    }
}

export function create(): Splash {
    return new Splash();
}
