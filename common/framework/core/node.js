'use strict';

/**
 * A node of the objects-tree of a scene
 */
export class Node {
    #children;
    #parent;
    #components;

    constructor() {
        this.#children = [];
        this.#parent = null;

        this.#components = [];
    }

    addChild(node) {
        if (node.parent) {
            node.parent.removeChild(node);
        }

        this.#children.push(node);
        node.parent = this;
    }

    removeChild(node) {
        const index = this.#children.indexOf(node);
        if (index >= 0) {
            this.#children.splice(index, 1);
            node.parent = null;
        }
    }

    traverse(before, after) {
        if (before) {
            before(this);
        }
        for (const child of this.#children) {
            child.traverse(before, after);
        }
        if (after) {
            after(this);
        }
    }

    linearize() {
        const array = [];
        this.traverse(node => array.push(node));
        return array;
    }

    filter(predicate) {
        return this.linearize().filter(predicate);
    }

    find(predicate) {
        return this.linearize().find(predicate);
    }

    map(transform) {
        return this.linearize().map(transform);
    }

    addComponent(component) {
        this.#components.push(component);
    }

    removeComponent(component) {
        this.#components = this.#components.filter(c => c !== component);
    }

    removeComponentOfType(type) {
        this.#components = this.#components.filter(component => !(component instanceof type));
    }

    getComponentOfType(type) {
        return this.#components.find(component => component instanceof type);
    }

    getComponentsOfType(type) {
        return this.#components.filter(component => component instanceof type);
    }
}