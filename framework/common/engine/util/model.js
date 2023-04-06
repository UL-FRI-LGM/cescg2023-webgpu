'use strict';

import { Node } from '../core/node.js';
import { Transform } from '../core/transform.js';
import { Mesh } from '../core/mesh.js';

export class Model {
    #model;

    constructor(mesh, transform = {}) {
        const model = new Node();
        model.addComponent(new Transform(transform));
        model.addComponent(new Mesh(mesh));
        this.#model = model;
    }

    get modelMatrix() {
        return this.#model.getComponentOfType(Transform).matrix;
    }

    get numVertices() {
        return this.#model.getComponentOfType(Mesh).numVertices;
    }

    get numIndices() {
        return this.#model.getComponentOfType(Mesh).numIndices;
    }

    writeVerticesToMappedRange(mappedRange) {
        this.#model.getComponentOfType(Mesh).writeVerticesToMappedRange(mappedRange);
    }

    writeIndicesToMappedRange(mappedRange) {
        this.#model.getComponentOfType(Mesh).writeIndicesToMappedRange(mappedRange);
    }
}
