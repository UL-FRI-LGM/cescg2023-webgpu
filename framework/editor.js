class Editor extends GUI.Panel {

    /**
     * @param node The node of this editor. In the context of RTVis WebGPU Playground, this should be document.getElementById("editor")
     * @param device The WebGPU device
     * @param onCompiled Callback for when a shader is compiled successfully: (shaderName: string, shaderCode: string) => void
     */
    constructor(node, device, onCompiled) {
        super(node);
        this.node.classList.add("Editor");
        this.device = device;

        const resize = new GUI.Element(document.createElement("div"));
            let h = 15 * parseFloat(getComputedStyle(document.documentElement).fontSize); // Convert 15rem -> px
            let y = null;
            resize.addEventListener("mousedown", (event) => {
                y = event.pageY;
                document.body.style.cursor = "row-resize";
                this.node.style.pointerEvents = "none";
                this.node.style.userSelect = "none";
            });
            document.body.addEventListener("mouseup", () => {
                if (y === null) return;
                y = null;
                document.body.style.cursor = "";
                this.node.style.pointerEvents = "";
                this.node.style.userSelect = "";
            });
            document.body.addEventListener("mousemove", (event) => {
                if (y === null) return;
                const y2 = event.pageY;
                h += (y - y2);
                content.node.style.height = h + "px";
                y = y2;
            });
            document.body.addEventListener("keydown", (event) => {
                if (this.node.style.display === "none") return;
                if (event.key !== "s" || !event.ctrlKey) return;
                this.compile().then((success) => {
                    if (!success) return;
                    const name = this.shaderName;
                    const code = this.shaderCode;
                    this._shaders[name] = code;
                    onCompiled(name, code);
                });
                event.preventDefault();
            })

        const content = new GUI.Panel();
            this.list = new GUI.List();
            this.editor = new GUI.TextArea();
            const feedback = new GUI.Panel();
                this.message = new GUI.List();
                feedback.add(new GUI.Text("Press Ctrl+S to recompile\nClick on error to locate"));
                feedback.add(this.message);
            content.add(this.list);
            content.add(this.editor);
            content.add(feedback);
        content.node.style.height = h + "px";

        this.add(resize);
        this.add(content);
    }
    style() {
        return `
            .Editor {
                display: flex;
                flex-direction: column;
                gap: 0;
            }
            
            /* Resize bar */
            .Editor > :first-child { 
                position: relative;
                height: 1rem;            
                /*background: #e4eef4dd;*/
            }
            .Editor > :first-child:hover {
                cursor: row-resize; 
            }
            .Editor > :first-child::before, .Editor > :first-child::after {
                content: "";
                
                display: block;
                position: absolute;
                left: 50%;
                transform: translate(-50%, -50%);
                
                width: 2rem;
                height: 1px;
                background: white;/*rgba(0,0,0,0.5);*/
            }
            .Editor > :first-child::before {
                top: 30%;
            }
            .Editor > :first-child::after {
                bottom: 30%;
            }
            
            /* Content */
            .Editor > :nth-child(2) {
                display: flex;
                flex-direction: row;
                min-height: 5rem;
                gap: 0;
            }
                .Editor > :nth-child(2) > :nth-child(1) { /* List of shaders */
                    flex-grow: 0;
                    width: 20%;
                    padding: 0 0.5em 0.5em 0.5em;
                }
                    .Editor > :nth-child(2) > :nth-child(1) > li.selected:hover::after { /* A hovered item */
                        content: "⟳";
                        font-size: 0.8em;
                        margin-left: 0.5em;
                    }
                    .Editor > :nth-child(2) > :nth-child(1) > li.selected { /* The selected item */
                        font-weight: bold;
                        background: rgba(255, 255, 255, 0.25);/*⟳*/
                    }
                .Editor > :nth-child(2) > :nth-child(2) { /* Text area */
                    flex-grow: 1;
                }
                .Editor > :nth-child(2) > :nth-child(3) { /* Feedback */
                    flex-grow: 0;
                    font-size: 0.8em;
                    width: 20%;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5em;
                    padding: 0 0.5em 0.5em 0.5em;
                }
                    .Editor > :nth-child(2) > :nth-child(3) > :nth-child(1) { /* Feedback hint */
                        width: 100%;
                        text-align: center;
                        flex-grow: 0;
                        border-bottom: 1px solid #e4eef4;
                    }
                    .Editor > :nth-child(2) > :nth-child(3) > :nth-child(2) { /* Feedback message */
                        overflow: auto;
                        flex-grow: 1;
                    }
        `;
    }

    /**
     * @param shaders An object mapping the shader name (string) to the shader code (string): { [name: string]: string }
     */
    set shaders(shaders) {
        this._shaders = shaders;
        this.list.clear();
        this.editor.clear();
        this.message.clear();
        const selectItem = (selectedItem) => {
            for (const item of this.list.items) {
                item.classList.remove("selected");
            }
            selectedItem.classList.add("selected");
            this.editor.text = this._shaders[selectedItem.textContent];
            this.compile();
        };
        for (const shaderName of Object.keys(this._shaders)) {
            this.list.add(shaderName, (event) => selectItem(event.target));
        }
        if (this.list.items.length > 0) selectItem(this.list.items[0]);
    }

    get shaderName() {
        return this.list.items.find(item => item.classList.contains("selected")).textContent;
    }

    get shaderCode() {
        return this.editor.text;
    }

    download() {
        const node = document.createElement("a");
        node.href = "data:text/plain;charset=utf-8," + encodeURIComponent(this.shaderCode);
        node.download = this.shaderName + ".wgsl";
        node.style.display = "none";
        document.body.appendChild(node);
        node.click();
        node.remove();
    }

    async compile() {
        const info = await this.device.createShaderModule({ code: this.editor.text }).compilationInfo();
        this.message.clear();
        const noErrors = info.messages.filter((m) => m.type === "error").length === 0;
        if (noErrors) {
            this.message.add("SUCCESS! Click to download", () => this.download());
        }
        for (const m of info.messages) {
            const highlight = () => {
                // TODO
                // this.editor.setRange(m.lineNum, m.linePos, m.length);
                this.editor.select(m.lineNum, m.linePos, m.length);
                //console.log("Highlight " + m.lineNum + ", " + m.linePos + ", " + m.length);
            }
            this.message.add("(" + m.type + "@" + m.lineNum + ":" + m.linePos + ") " + m.message, highlight);
        }
        return noErrors;
    }
}