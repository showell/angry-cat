import * as colors from "./colors";

export let StatusBar: StatusBarWidget;

class StatusBarWidget {
    div: HTMLDivElement;
    text_div: HTMLElement;

    constructor() {
        this.div = document.createElement("div");
        this.text_div = this.make_text_div();
        this.div.append(this.text_div);
    }

    make_text_div() {
        const text_div = document.createElement("div");
        text_div.style.fontSize = "13px";
        text_div.style.marginBottom = "2px";
        return text_div;
    }

    scold(text: string) {
        this.text_div.style.color = colors.danger;
        this.text_div.innerText = text;
    }

    celebrate(text: string) {
        this.text_div.style.color = colors.success;
        this.text_div.innerText = text;
    }

    inform(text: string) {
        this.text_div.style.color = colors.status_info;
        this.text_div.innerText = text;
    }

    clear(): void {
        this.text_div.innerText = "";
    }
}

export function create_global_status_bar(): void {
    StatusBar = new StatusBarWidget();
}
