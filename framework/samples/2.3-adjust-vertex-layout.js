'use strict';

import { Sample } from '../common/engine/sample.js';
import { Loader } from '../common/engine/util/loader.js';

// Task 2.2: import the OrbitCamera class
import { OrbitCamera } from '../common/engine/util/orbit-camera.js';

// Task 2.3: import mat4 for our model matrix
import { mat4 } from '../../lib/gl-matrix-module.js';

const SHADER_NAME = 'Adjust Vertex Layout';

const shaders = {};
const images = {};

export class AdjustedVertexLayout extends Sample {
    async load() {
        // Load resources
        const res = await Promise.all([
            Loader.loadShaderCode('adjust-vertex-layout.wgsl'),
            Loader.loadImage('brick.png')
        ]);

        // Set shaders
        shaders[SHADER_NAME] = res[0];

        // Set images
        images.brick = res[1];
    }

    init() {
        // TASK 2.2: add a user-controlled camera
        this.camera = new OrbitCamera(this.canvas);

        // Set brick texture
        const image = images.brick;
        const texture = this.device.createTexture({
            size: [image.width, image.height],
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            format: 'rgba8unorm',
        });
        this.device.queue.copyExternalImageToTexture(
            {source: image},
            {texture: texture},
            [image.width, image.height]
        );

        // Create sampler
        const sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });

        // Prepare vertex buffer
        // Task 2.3: each vertex now has a position (vec3f), a normal (vec3f), and texture coordinates (vec2f)
        const vertices = new Float32Array([
            // top vertex
            0.0, 0.5, 0.0,      // position
            0.0, 0.0, 0.0,      // normal (we leave this as zeros for now)
            0.5, 1.0,           // texture coordinates
            // left vertex
            -0.5, -0.5, 0.0,    // position
            0.0, 0.0, 0.0,      // normal (we leave this as zeros for now)
            0.0, 0.0,           // texture coordinates
            // right vertex
            0.5, -0.5, 0.0,     // position
            0.0, 0.0, 0.0,      // normal (we leave this as zeros for now)
            1.0, 0.0,           // texture coordinates
        ]);
        this.vertexBuffer = this.device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
        this.vertexBuffer.unmap();

        // Prepare index buffer
        const indices = new Uint16Array([
            0, 1, 2,
        ]);
        this.indexBuffer = this.device.createBuffer({
            size: Math.ceil(indices.byteLength / 4) * 4,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
        this.indexBuffer.unmap();

        // Prepare uniform buffer
        this.uniformBuffer = this.device.createBuffer({
            // Task 2.3: adjust the uniform buffer's size to hold three 4x4 matrices instead of two matrices and a vec2
            size: 192,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Prepare bind group
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: {buffer: this.uniformBuffer}},
                {binding: 1, resource: texture.createView()},
                {binding: 2, resource: sampler}
            ]
        });

        this.colorAttachment = {
            view: null, // Will be set in draw()
            clearValue: {r: 0, g: 0, b: 0, a: 1},
            loadOp: 'clear',
            loadValue: {r: 0, g: 0, b: 0, a: 1},
            storeOp: 'store'
        };

        this.animate();
    }

    render() {
        // TASK 2.2: update the camera and upload its view and projection matrices to our uniform buffer
        this.camera.update();
        // TASK 2.3: replace the triangle's offsets with a transformation matrix (we just use the identity matrix here)
        const modelMatrix = mat4.create(1.0);
        const uniformArray = new Float32Array([...this.camera.view, ...this.camera.projection, ...modelMatrix]);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

        const commandEncoder = this.device.createCommandEncoder();
        this.colorAttachment.view = this.context.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({colorAttachments: [this.colorAttachment]});
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.setIndexBuffer(this.indexBuffer, 'uint16');
        renderPass.drawIndexed(3);
        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    shaders() {
        return shaders;
    }

    reloadShader(shaderName, shaderCode) {
        const shaderModule = this.device.createShaderModule({code: shaders[SHADER_NAME]});
        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vertex',
                buffers: [
                    // Task 2.3: adjust the vertex layout
                    {
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
                        arrayStride: 32,
                    },
                ],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragment',
                targets: [
                    {
                        format: this.gpu.getPreferredCanvasFormat()
                    }
                ],
            },
        });
    }

    stop() {
        super.stop();
        this.camera.dispose();
    }
}
