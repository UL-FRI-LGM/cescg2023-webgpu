const GUI = {}

GUI.Element = class {
    constructor(node) {
        this.node = node;
        this.node.className = "Element";
        const style = this.style();
        if (style) {
            const styleNode = document.createElement("style");
            styleNode.innerHTML = style;
            document.head.appendChild(styleNode);
        }
    }
    style() {
        // Override me! Return a stylesheet string
    }
    addEventListener(event, listener) {
        this.node.addEventListener(event, listener);
    }
    toggleClass(className) {
        if (this.node.classList.contains(className)) this.node.classList.remove(className);
        else this.node.classList.add(className);
    }
    clear() {
        this.node.value = "";
        this.node.textContent = "";
    }
    dispose() {
        this.node.remove();
    }
}

GUI.Button = class extends GUI.Element {
    constructor(text, onClick) {
        super(document.createElement("button"));
        this.node.classList.add("Button");
        this.node.textContent = text;
        this.node.addEventListener("click", () => onClick());
    }
}

GUI.Text = class extends GUI.Element {
    constructor(text) {
        super(document.createElement("span"));
        this.node.classList.add("Text");
        this.node.textContent = text;
    }
    set text(text) {
        this.node.textContent = text;
    }
}

GUI.Header = class extends GUI.Text {
    constructor(text) {
        super(text);
        this.node.classList.add("Header");
    }
}

GUI.TextArea = class extends GUI.Element {
    constructor(text) {
        super(document.createElement("textarea"));
        this.node.classList.add("TextArea");
        this.node.spellcheck = false;
        if (text) this.node.value = text;
        this.node.addEventListener("keydown", (event) => {
            switch (event.key) {
                case "Tab":
                    const start = this.node.selectionStart;
                    const end = this.node.selectionEnd;
                    const tab = "    ";
                    this.text = this.text.substring(0, start) + tab + this.text.substring(end);
                    this.node.selectionStart = start + tab.length;
                    this.node.selectionEnd = this.node.selectionStart;
                    break;
                default:
                    return;
            }
            event.preventDefault();
        })
    }
    set text(text) {
        this.node.value = text;
    }
    get text() {
        return this.node.value;
    }
    select(lineNum, startPos, length) {
        --lineNum;  // Line numbers start at 1 and our array starts at 0
        --startPos; // ...Same here
        //return this.text.split("\n")[lineNum].substring(startPos, startPos + length);

        let index = startPos;
        const lines = this.text.split("\n");
        for (let i = 0; i < lineNum; ++i) {
            const line = lines[i];
            index += (line.length + 1); // +1 to account for '\n'
        }

        this.node.selectionStart = index;
        this.node.selectionEnd = index + length;
        this.node.focus();
    }
}

GUI.NamedElement = class extends GUI.Element {
    constructor(text, element) {
        super(document.createElement("span"));
        this.node.classList.add("NamedElement");
        this._label = document.createElement("label");
        this._label.textContent = text;
        if (element.id) {
            console.warn("Cannot link label to element " + element.constructor.name + " because it already has an ID");
        } else {
            const id = "uniqueNamedElementId" + GUI.NamedElement.id++;
            this._label.for = id;
            element.node.id = id;
        }
        this.node.appendChild(this._label);
        this.node.appendChild(element.node);
    }
    static id = 0;
    set text(text) {
        this._label.textContent = text;
    }
}

GUI.NumberBox = class extends GUI.Element {
    constructor(min, max, step, value, onChange) {
        super(document.createElement("input"));
        this.node.classList.add("NumberBox");
        this.node.type = "number";
        if (min) this.min = min;
        if (max) this.max = max;
        if (step) this.step = step;
        if (value) this.value = value;
        this.node.addEventListener("input", () => onChange(this.value));
    }
    set min(min) { this.node.min = min; }
    set max(max) { this.node.max = max; }
    set step(step) { this.node.step = step; }
    set value(value) { this.node.value = value; }
    get value() { return parseFloat(this.node.value); }
};

GUI.List = class extends GUI.Element {
    constructor() {
        super(document.createElement("ul"));
        this.node.classList.add("List");
        this.items = [];
    }
    add(text, onClick) {
        const li = document.createElement("li");
        li.textContent = text;
        if (onClick) {
            li.addEventListener("click", onClick);
            li.className = "clickable";
        }
        this.items.push(li);
        this.node.appendChild(li);
    }
}

GUI.ComboBox = class extends GUI.Element {
    constructor(options, onChange, defaultOption) {
        super(document.createElement("select"));
        this.node.classList.add("ComboBox");

        // Set up options
        this._default = "-- choose an option --";
        const firstOptions = defaultOption ? [] : [this._default];
        for (const optionName of firstOptions.concat(options)) {
            const option = document.createElement("option");
            option.value = optionName;
            option.textContent = optionName;
            this.node.appendChild(option);
        }
        this.node.addEventListener("change", () => onChange(this.selected));
    }
    get selected() {
        return this.node.value === this._default ? null : this.node.value;
    }
}

GUI.Separator = class extends GUI.Element {
    constructor() {
        super(document.createElement("div"));
        this.node.classList.add("Separator");
    }
}

GUI.Panel = class extends GUI.Element {
    constructor(node) {
        super(node || document.createElement("div"));
        this.node.classList.add("Panel");
    }
    add(element) {
        this.node.appendChild(element.node);
    }
}

GUI.Section = class extends GUI.Panel {
    constructor(title) {
        super();
        this.node.classList.add("Section");
        this._header = new GUI.Text(title);
        this._header.addEventListener("click", (event) => {
            //if (event.button !== 2) return; // Only proceed for RIGHT mouse button
            if (event.button !== 0) return; // Only proceed for LEFT mouse button
            this.toggleClass("collapsed")
        });
        this.add(this._header);
    }
}

GUI.Window = class extends GUI.Panel {
    constructor(title) {
        super();
        this.node.classList.add("Window");

        const offset = {x: 0, y: 0};
        let pos0 = null; // The initial position of the dragging
        let pos = null; // The current position of the dragging
        this._header = new GUI.Text(title);
        this._header.addEventListener("mousedown", (event) => {
            pos0 = pos = {x: event.pageX, y: event.pageY};
            this._header.node.style.cursor = "grabbing";
            document.body.style.cursor = "grabbing";
            this.node.style.pointerEvents = "none";
            this.node.style.userSelect = "none";
        });
        document.body.addEventListener("mouseup", (event) => {
            if (!pos0 || !pos) return;
            if (pos.x === pos0.x && pos.y === pos0.y && event.button === 0) { // 0 is LEFT mouse button
                this.toggleClass("collapsed");
            }
            pos0 = pos = null;
            this._header.node.style.cursor = "";
            document.body.style.cursor = "";
            this.node.style.pointerEvents = "";
            this.node.style.userSelect = "";
        });
        document.body.addEventListener("mousemove", (event) => {
            if (!pos) return;
            const newPos = {x: event.pageX, y: event.pageY};
            offset.x += (newPos.x - pos.x);
            offset.y += (newPos.y - pos.y);
            this.node.style.marginLeft = offset.x + "px";
            this.node.style.marginTop = offset.y + "px";
            pos = newPos;
            //this.node.style.position = "absolute";
        });
        this.add(this._header);
    }
}

GUI.Alert = class extends GUI.Panel {
    constructor(text, title) {
        super();
        this.node.classList.add("Alert");

        const header = new GUI.Text(title || "Alert");
        this.add(header);

        const content = new GUI.Text(text + "\n\n" + "Click this window to close it");
        console.log(text);
        this.add(content);

        this.node.addEventListener("click", () => this.dispose());
    }
}

GUI.Workspace = class extends GUI.Element {
    constructor(node) {
        super(node || document.createElement("div"));
        this.node.classList.add("Workspace");
    }
    alert(text, title) {
        this.node.appendChild(new GUI.Alert(text, title).node);
    }
    add(window) {
        this.node.appendChild(window.node);
    }
}