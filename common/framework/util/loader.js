'use strict';

function joinPaths(parts, seperator = '/') {
    return parts.join(seperator).replace(new RegExp(seperator+'{1,}', 'g'), seperator);
}

/**
 * A loader to load resources (text, images, shader code, and some formats of 3D models) from the server
 */
export class Loader {
    constructor({basePath = './'} = {}) {
        this.basePath = basePath;
    }

    async loadText(path) {
        return (await fetch(joinPaths([this.basePath, path]), {
            method: "GET",
            headers: {
                "Content-Type": "text/plain"
            }
        })).text();
    }

    async loadImage(path) {
        const blob = await fetch(joinPaths([this.basePath, path]))
            .then(response => response.blob());
        return await createImageBitmap(blob);
    }

    async loadModel(path) {
        const extension = path.split('.').pop().toLowerCase();

        const acceptedExtensions = ['obj', 'ply', 'json'];
        if (!acceptedExtensions.includes(extension)) {
            throw new Error(`Unexpected model extension '${extension}'`);
        }
        const text = await this.loadText(path);

        switch (extension) {
            case 'obj': return parseObj(text);
            case 'ply': return parsePly(text);
            case 'json': return JSON.parse(text);
            default: throw new Error(`Unexpected model extension '${extension}'`);
        }
    }
}

function parseObj(objStr) {
    const lines = objStr.split('\n');

    const vRegex = /v\s+(\S+)\s+(\S+)\s+(\S+)\s*/;
    const vData = lines
        .filter(line => vRegex.test(line))
        .map(line => [...line.match(vRegex)].slice(1))
        .map(entry => entry.map(entry => Number(entry)));

    const vnRegex = /vn\s+(\S+)\s+(\S+)\s+(\S+)\s*/;
    const vnData = lines
        .filter(line => vnRegex.test(line))
        .map(line => [...line.match(vnRegex)].slice(1))
        .map(entry => entry.map(entry => Number(entry)));

    const vtRegex = /vt\s+(\S+)\s+(\S+)\s*/;
    const vtData = lines
        .filter(line => vtRegex.test(line))
        .map(line => [...line.match(vtRegex)].slice(1))
        .map(entry => entry.map(entry => Number(entry)));

    function triangulate(list) {
        const triangles = [];
        for (let i = 2; i < list.length; i++) {
            triangles.push(list[0], list[i - 1], list[i]);
        }
        return triangles;
    }

    const fRegex = /f\s+(.*)/;
    const fData = lines
        .filter(line => fRegex.test(line))
        .map(line => line.match(fRegex)[1])
        .map(line => line.trim().split(/\s+/))
        .flatMap(face => triangulate(face));

    const positions = [];
    const normals = [];
    const texcoords = [];
    const indices = [];
    const cache = {};
    let cacheLength = 0;
    const indicesRegex = /(\d+)(\/(\d+))?(\/(\d+))?/;
    for (const id of fData) {
        if (id in cache) {
            indices.push(cache[id]);
        } else {
            cache[id] = cacheLength;
            indices.push(cacheLength);
            const [,vIndex,,vtIndex,,vnIndex] = [...id.match(indicesRegex)]
                .map(entry => Number(entry) - 1);
            positions.push(...vData[vIndex]);
            normals.push(...vnData[vnIndex]);
            texcoords.push(...vtData[vtIndex]);
            cacheLength++;
        }
    }

    return { positions, normals, texcoords, indices };
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
    const positions = parsedVertices.map(line => line.slice(0, 3)).flat();
    const normals = parsedVertices.map(line => line.slice(3, 6)).flat();
    const texcoords = parsedVertices.map(line => line.slice(6, 8)).flat();

    // assume faces are of format (n, i0, i1, i2)
    const parsedFaces = faceData.map(line => line.split(' ').map(entry => Number(entry)));
    const indices = parsedFaces.map(line => line.slice(1, 4)).flat();

    return { positions, normals, texcoords, indices};
}
