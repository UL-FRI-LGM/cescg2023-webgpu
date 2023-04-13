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
            case "obj": return parseObj(text);
            case "ply": return parsePly(text);
            default: return null;
        }
    }
}

function parseObj(objStr) {
    const lines = objStr.split('\n');

    const verticesRegex = /v\s+(\S+)\s+(\S+)\s+(\S+)\s*/;
    const vertices = lines
        .filter(line => verticesRegex.test(line))
        .flatMap(line => [...line.match(verticesRegex)].slice(1))
        .map(entry => Number(entry));

    const normalsRegex = /vn\s+(\S+)\s+(\S+)\s+(\S+)\s*/;
    const normals = lines
        .filter(line => normalsRegex.test(line))
        .flatMap(line => [...line.match(normalsRegex)].slice(1))
        .map(entry => Number(entry));

    const texcoordsRegex = /vt\s+(\S+)\s+(\S+)\s*/;
    const texcoords = lines
        .filter(line => texcoordsRegex.test(line))
        .flatMap(line => [...line.match(texcoordsRegex)].slice(1))
        .map(entry => Number(entry));

    const indicesRegex = /f\s+(\S+)\s+(\S+)\s+(\S+)\s*/;
    const indices = lines
        .filter(line => indicesRegex.test(line))
        .flatMap(line => [...line.match(indicesRegex)].slice(1))
        .map(entry => Number(entry))
        .map(entry => entry - 1);

    return { vertices, normals, texcoords, indices };
}

function parsePly(plyStr) {
    const lines = plyStr.split('\n');

    const vertexCountRegex = /element vertex (\d+)/;
    const vertexCount = lines
        .filter(line => vertexCountRegex.test(line))
        .flatMap(line => [...line.match(vertexCountRegex)].slice(1))
        .map(entry => Number(entry))[0];

    const faceCountRegex = /element face (\d+)/;
    const faceCount = lines
        .filter(line => faceCountRegex.test(line))
        .flatMap(line => [...line.match(faceCountRegex)].slice(1))
        .map(entry => Number(entry))[0];

    const endHeaderIndex = lines.indexOf('end_header');
    const vertexStartIndex = endHeaderIndex + 1;
    const vertexData = lines.slice(vertexStartIndex, vertexStartIndex + vertexCount);
    const faceStartIndex = vertexStartIndex + vertexCount;
    const faceData = lines.slice(faceStartIndex, faceStartIndex + faceCount);

    // assume vertices are of format (x, y, z, nx, ny, nz, s, t)
    const parsedVertices = vertexData.map(line => line.split(' ').map(entry => Number(entry)));
    const vertices = parsedVertices.map(line => line.slice(0, 3)).flat();
    const normals = parsedVertices.map(line => line.slice(3, 6)).flat();
    const texcoords = parsedVertices.map(line => line.slice(6, 8)).flat();

    // assume faces are of format (n, i0, i1, i2)
    const parsedFaces = faceData.map(line => line.split(' ').map(entry => Number(entry)));
    const indices = parsedFaces.map(line => line.slice(1, 4)).flat();

    return { vertices, normals, texcoords, indices};
}