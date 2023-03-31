const Loader = {
    loadText: async (path) => {
        return fetch(path, {
            method: "GET",
            headers: {
                "Content-Type": "text/plain"
            }
        }).then((response) => response.text()).then((text) => text);
    },
    loadShaderCode: async (path) => {
        return this.loadText(path);
    },
    loadImage: async (path) => {
        return new Promise((resolve) => {
            //const img = document.createElementNS("http://www.w3.org/1999/xhtml", "img"); // TODO: Maybe use this?
            const img = document.createElement("img");
            img.addEventListener("load", async () => {
                const imageBitmap = await createImageBitmap(img);
                resolve(imageBitmap);
            });
            img.src = path;
        });
    },
    loadModel: async (path) => {
        const extension = path.split(".").pop();

        const acceptedFormats = ["obj", "ply"];
        if (!acceptedFormats.includes(extension)) {
            console.error("Unexpected model extension '" + extension + "'");
            return null;
        }

        const text = await this.loadText(path);

        switch (extension) {
            case "obj":
                // Do a thing
                break;
            case "ply":
                // Do a thing;
                break;
            default:
                return null;
        }
    }
};