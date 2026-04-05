type DivButton = {
    div: HTMLElement;
    button: HTMLElement;
};

function render_div_button(label: string): DivButton {
    const div = document.createElement("div");
    div.style.marginTop = "2px";

    const button = document.createElement("button");
    button.innerText = label;
    button.style.color = "white";
    button.style.backgroundColor = "#000080";

    button.addEventListener("focus", () => {
        button.style.backgroundColor = "#00BB00";
    });

    button.addEventListener("blur", () => {
        button.style.backgroundColor = "#000080";
    });

    div.append(button);
    return { div, button };
}

export class Button {
    div: HTMLElement;
    button: HTMLElement;
    width: string;

    constructor(label: string, width: number, callback: () => void) {
        const { div, button } = render_div_button(label);

        this.div = div;
        this.button = button;

        button.style.fontSize = "16px";
        button.style.borderRadius = "5px";
        button.style.minWidth = `${width}px`;
        button.style.marginRight = "3px";
        button.style.padding = "3px";

        this.width = div.style.width;

        button.addEventListener("click", (e: Event) => {
            callback();
            e.preventDefault();
            e.stopPropagation();
        });

        this.show();
    }

    show(): void {
        this.div.style.display = "inline-block";
        this.div.style.width = this.width;
    }

    hide(): void {
        this.div.style.display = "none";
        this.div.style.width = "0px";
    }

    focus(): void {
        this.button.focus();
    }

    set_normal_color(): void {
        this.button.style.backgroundColor = "#000080";
    }

    disable(): void {
        this.button.setAttribute("disabled", "");
        this.button.style.opacity = "0.4";
    }

    enable(): void {
        this.button.removeAttribute("disabled");
        this.button.style.opacity = "1";
    }
}
