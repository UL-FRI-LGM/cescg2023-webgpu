'use strict';

import { quat, vec3 } from '../../../lib/gl-matrix-module.js';
import { Transform } from '../core/transform.js';

export class OrbitController {
  #node;
  #domElement;
  
  #pitch = 0;
  #yaw = 0;
  #distance = 2;
  
  #moveSensitivity;
  #zoomSensitivity;
  
  constructor(node, domElement, { moveSensitivity = 0.004, zoomSensitivity = 0.002 } = {}) {
    this.#node = node;
    this.#domElement = domElement;

    this.#pitch = 0;
    this.#yaw = 0;
    this.#distance = 2;

    this.#moveSensitivity = 0.004;
    this.#zoomSensitivity = 0.002;

    this.#initHandlers();
  }

  update() {
    const transform = this.#node.getComponentOfType(Transform);
    if (!transform) {
      return;
    }

    const rotation = quat.create();
    quat.rotateY(rotation, rotation, this.#yaw);
    quat.rotateX(rotation, rotation, this.#pitch);
    transform.rotation = rotation;

    const translation = [0, 0, this.#distance];
    vec3.rotateX(translation, translation, [0, 0, 0], this.#pitch);
    vec3.rotateY(translation, translation, [0, 0, 0], this.#yaw);
    transform.translation = translation;
  }

  #initHandlers() {
    this.#domElement.addEventListener('pointerdown', this.#pointerdownHandler);
    this.#domElement.addEventListener('wheel', this.#wheelHandler);
  }

  #pointerdownHandler(e) {
    this.#domElement.setPointerCapture(e.pointerId);
    this.#domElement.requestPointerLock();
    this.#domElement.removeEventListener('pointerdown', this.#pointerdownHandler);
    this.#domElement.addEventListener('pointerup', this.#pointerupHandler);
    this.#domElement.addEventListener('pointermove', this.#pointermoveHandler);
  }

  #pointerupHandler(e) {
    this.#domElement.releasePointerCapture(e.pointerId);
    this.#domElement.ownerDocument.exitPointerLock();
    this.#domElement.addEventListener('pointerdown', this.#pointerdownHandler);
    this.#domElement.removeEventListener('pointerup', this.#pointerupHandler);
    this.#domElement.removeEventListener('pointermove', this.#pointermoveHandler);
  }

  #pointermoveHandler(e) {
    const dx = e.movementX;
    const dy = e.movementY;

    this.#pitch -= dy * this.#moveSensitivity;
    this.#yaw   -= dx * this.#moveSensitivity;

    const twopi = Math.PI * 2;
    const halfpi = Math.PI / 2;

    this.#pitch = Math.min(Math.max(this.#pitch, -halfpi), halfpi);
    this.#yaw = ((this.#yaw % twopi) + twopi) % twopi;
  }

  #wheelHandler(e) {
    this.#distance *= Math.exp(this.#zoomSensitivity * e.deltaY);
  }
}