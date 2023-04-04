class Camera {
    constructor() {
        this._pos = glMatrix.vec3.create();
        this._quat = glMatrix.quat.create();

        this._matrixDirty = false;

        this._viewMatrix = glMatrix.mat4.create();
        this._projectionMatrix = glMatrix.mat4.create();
    }

    makePerspective(fov, aspect, near, far) {
        glMatrix.perspective(this._projectionMatrix, fov, aspect, near, far);
        return this;
    }

    makeOrthogonal(left, right, bottom, top, near, far) {
        glMatrix.ortho(this._projectionMatrix, left, right, bottom, top, near, far);
        return this;
    }

    set position(pos) {
        this._pos = pos;
        this._matrixDirty = true;
    }

    set rotation(quat) {
        this._quat = quat;
        this._matrixDirty = true;
    }

    get viewMatrix() {
        if (this._matrixDirty) {
            this._matrixDirty = false;
            const matrix = glMatrix.mat4.create();
            glMatrix.mat4.fromRotationTranslation(matrix, this._quat, this._pos);
            glMatrix.mat4.invert(this._viewMatrix, matrix);
        }
        return glMatrix.mat4.clone(this._viewMatrix);
    }

    get projectionMatrix() {
        return glMatrix.mat4.clone(this._projectionMatrix);
    }
}