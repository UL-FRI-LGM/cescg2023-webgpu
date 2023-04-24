import { vec2, vec3 } from '../../../lib/gl-matrix-module.js';

/**
 * One vertex containing a position, normal, and texture coordinates
 */
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

/**
 * Axis-Aligned Bounding Box
 */
export class AABB {
    #min;
    #max;
    constructor({min, max}) {
        this.#min = vec3.min(vec3.create(), min, max);
        this.#max = vec3.max(vec3.create(), min, max);
    }

    get min() {
        return vec3.clone(this.#min);
    }

    get max() {
        return vec3.clone(this.#max);
    }

    get diagonal() {
        return vec3.subtract(vec3.create(), this.#max, this.#min);
    }

    get center() {
        return vec3.add(
            vec3.create(),
            this.#min,
            vec3.divide(vec3.create(), this.diagonal, vec3.fromValues(2.0, 2.0, 2.0))
        );
    }
}

/**
 * A mesh containing a list of vertices and indices
 * A bounding box is automatically calculated
 */
export class Mesh {
    #vertices;
    #indices;
    #bounds;

    constructor({positions = [], normals = [], texcoords = [], indices = []}) {
        const hasNormals = normals.length === positions.length;
        const hasTexCoords = (texcoords.length / 2) * 3 === positions.length;

        let min = vec3.fromValues(positions[0], positions[1], positions[2]);
        let max = vec3.fromValues(positions[0], positions[1], positions[2]);

        this.#vertices = [];
        for (let i = 0; i < positions.length / 3; ++i) {
            const position = vec3.fromValues(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            const normal = hasNormals ? vec3.fromValues(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) : vec3.create();
            const textureCoordinates = hasTexCoords ? vec2.fromValues(texcoords[i * 2], texcoords[i * 2 + 1]) : vec2.create();

            this.#vertices.push(new Vertex({position, normal, textureCoordinates}));

            min = vec3.min(min, min, position);
            max = vec3.max(max, max, position);
        }
        this.#indices = new Uint32Array(indices);
        this.#bounds = new AABB({min, max});
    }

    get vertices() {
        return this.#vertices;
    }

    get indices() {
        return this.#indices;
    }

    get bounds() {
        return this.#bounds
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

    static indexType() {
        return 'uint32';
    }

    static indexStride() {
        return Uint32Array.BYTES_PER_ELEMENT;
    }
}
