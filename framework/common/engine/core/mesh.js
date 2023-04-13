import { vec2, vec3 } from '../../../../lib/gl-matrix-module.js';

export class Vertex {
    #position;
    #normal;
    #textureCoordinates;

    constructor({position = vec3.create(), normal = vec3.create(), textureCoordinates = vec2.create()}) {
        this.#position = position;
        this.#normal = normal;
        this.#textureCoordinates = textureCoordinates;
    }

    get position() {
        return this.#position;
    }

    get normal() {
        return this.#normal;
    }

    get textureCoordinates() {
        return this.#textureCoordinates;
    }

    static indexType() {
        return 'uint16';
    }

    static indexStride() {
        return Uint16Array.BYTES_PER_ELEMENT;
    }

    static vertexStrideInFloats() {
        return 8;
    }

    static vertexStride() {
        return Vertex.vertexStrideInFloats() * Float32Array.BYTES_PER_ELEMENT;
    }

    static vertexLayout() {
        return {
            attributes: [
                {
                    shaderLocation: 0,
                    offset: 0,
                    format: 'float32x3',
                },
                {
                    shaderLocation: 1,
                    offset: 12,
                    format: 'float32x3',
                },
                {
                    shaderLocation: 2,
                    offset: 24,
                    format: 'float32x2',
                }
            ],
            arrayStride: Vertex.vertexStride(),
        };
    }
}

export class Mesh {
    #vertices;
    #indices;

    constructor({vertices = [], normals = [], texcoords = [], indices = []}) {
        const hasNormals = normals.length === vertices.length;
        const hasTexCoords = (texcoords.length / 2) * 3 === vertices.length;

        this.#vertices = [];
        for (let i = 0; i < vertices.length / 3; ++i) {
            const position = vec3.fromValues(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]);
            const normal = hasNormals ? vec3.fromValues(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) : vec3.create();
            const textureCoordinates = hasTexCoords ? vec2.fromValues(texcoords[i * 2], texcoords[i * 2 + 1]) : vec2.create();

            this.#vertices.push(new Vertex({position, normal, textureCoordinates}));
        }
        this.#indices = new Uint16Array(indices);
    }

    get vertices() {
        return this.#vertices;
    }

    get indices() {
        return this.#indices;
    }

    get numVertices() {
        return this.#vertices.length;
    }

    get numIndices() {
        return this.#indices.length;
    }

    writeVerticesToMappedRange(mappedRange) {
        for (const [i, vertex] of this.#vertices.entries()) {
            mappedRange.set(vertex.position, Vertex.vertexStrideInFloats() * i);
            mappedRange.set(vertex.normal, Vertex.vertexStrideInFloats() * i + 3);
            mappedRange.set(vertex.textureCoordinates, Vertex.vertexStrideInFloats() * i + 6);
        }
    }

    writeIndicesToMappedRange(mappedRange) {
        mappedRange.set(this.#indices);
    }
}
