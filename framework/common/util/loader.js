'use strict';

export class Loader {
    static async loadText(path) {
        return (await fetch(path, {
            method: "GET",
            headers: {
                "Content-Type": "text/plain"
            }
        })).text();
    }

    static async loadShaderCode(path) {
        return Loader.loadText("res/shaders/" + path);
    }

    static async loadImage(path) {
        const img = document.createElement("img");
        img.src = "res/images/" + path;
        await img.decode();
        return await createImageBitmap(img);
    }

    static async loadModel(path) {
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
    }

    static async pingServer() {
        try {
            return await Loader.loadText("ping") === "pong";
        } catch (error) {
            return false;
        }
    }
}
