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
        return Loader.loadText("res/shaders/" + path);
    },

    loadImage: async (path) => {
        const img = document.createElement("img");
        img.src = "res/images/" + path;
        await img.decode();
        return await createImageBitmap(img);
    },

    loadModel: async (path) => {
        const extension = path.split(".").pop();

        const acceptedExtensions = ["obj", "ply"];
        if (!acceptedExtensions.includes(extension)) {
            console.error("Unexpected model extension '" + extension + "'");
            return null;
        }

        const text = await Loader.loadText("res/models/" + path);

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
    },

    pingServer: async () => {
        try {
            return await Loader.loadText("ping") === "pong";
        } catch (error) {
            return false;
        }
    },
};