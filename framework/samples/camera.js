'use strict';

import { Sample } from '../common/sample.js';
import { OrbitCamera } from '../common/util/orbit-camera.js';
import { Loader } from '../common/util/loader.js';

const SHADER_NAME = 'Textured Triangle';

const shaders = {};
const images = {};

export class Camera extends Sample {
    async load() {
        // Load resources
        const res = await Promise.all([
            Loader.loadShaderCode('camera.wgsl'),
            Loader.loadImage('brick.png')
        ]);

        // Set shaders
        shaders[SHADER_NAME] = res[0];

        // Set images
        images.brick = res[1];

        this.camera = new OrbitCamera(this.canvas);
    }

    init() {
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
        const vertices = new Float32Array([
            0.0, 0.5, 0.5, 1.0,
            -0.5, -0.5, 0.0, 0.0,
            0.5, -0.5, 1.0, 0.0,
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
            size: 144,
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

        //const window = new GUI.Window('Settings');
        //window.add(new GUI.NamedElement('#vertices', this._vertices));
        //this.gui.add(window);

        this.animate();
    }

    render() {
        this.camera.update();
        const uniformArray = new Float32Array([...this.camera.view, ...this.camera.projection, 0, 0, 0, 0]);
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
                    {
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: 'float32x2',
                            },
                            {
                                shaderLocation: 1,
                                offset: 8,
                                format: 'float32x2',
                            }
                        ],
                        arrayStride: 16,
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
