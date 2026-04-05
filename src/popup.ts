import { Button } from "./button";

class DialogShell {
    popup_element: HTMLDialogElement;

    constructor() {
        this.popup_element = this.create_popup_element();
    }

    create_popup_element() {
        // See https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
        const dialog = document.createElement("dialog");
        const s = dialog.style;
        s.maxWidth = "150vw";
        s.borderRadius = "1rem";
        s.outline = "none";
        s.border = "1px #000080 solid";
        s.display = "flex";
        s.flexDirection = "column";
        s.gap = "0.5rem";
        s.alignItems = "center";
        return dialog;
    }

    invoke_with_custom_div(div: HTMLElement) {
        document.body.append(this.popup_element);

        // Ensures it is closed by nothing apart from what we define
        this.popup_element.setAttribute("closedby", "none");
        this.popup_element.append(div);
        this.popup_element.showModal();
    }

    finish(): void {
        this.popup_element.close();
        this.popup_element.innerHTML = "";
        this.popup_element.remove();
        this.popup_element.setAttribute("closedby", "any");
    }
}

type PopupOptions = {
    div: HTMLDivElement;
    confirm_button_text: string;
    // called when user finishes
    callback: () => void;
};

export function pop(info: PopupOptions): Popup {
    const popup = new Popup();
    popup.show(info);
    return popup;
}

class Popup {
    dialog_shell: DialogShell;
    confirm_button!: Button;

    constructor() {
        this.dialog_shell = new DialogShell();
    }

    focus_confirm_button(): void {
        this.confirm_button.focus();
    }

    show(info: PopupOptions) {
        const self = this;

        const button = new Button(info.confirm_button_text, 80, () => {
            self.finish(info.callback);
        });
        this.confirm_button = button;

        const button_div = document.createElement("div");
        button_div.append(button.div);
        button_div.style.display = "flex";
        button_div.style.justifyContent = "end";

        // PUT THEM ALL TOGETHER
        const flex_div = document.createElement("div");
        flex_div.append(info.div);
        flex_div.append(button_div);

        this.dialog_shell.invoke_with_custom_div(flex_div);
    }

    finish(callback?: () => void) {
        this.dialog_shell.finish();
        if (callback) {
            callback();
        }
    }
}
