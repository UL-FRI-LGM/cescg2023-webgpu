'use strict';

import { Sample } from '../common/engine/sample.js';
import { Loader } from '../common/engine/util/loader.js';

// Task 2.2: import the OrbitCamera class
import { OrbitCamera } from '../common/engine/util/orbit-camera.js';

// todo: maybe use the loader instead?
// Task 2.4: import the "bunny" model
import bunny from '../common/models/bunny.json' assert { type: 'json' };

// Task 2.4: import the Model class
import { Model } from '../common/engine/util/model.js';

// Task 2.4: import the Vertex class
import { Vertex } from '../common/engine/core/mesh.js';

// Task 3.2: import vec3
import { vec3 } from '../../lib/gl-matrix-module.js';

const G_BUFFER_SHADER_NAME = 'Create G-Buffer';

// Task 4.1: add our present to screen shader
const PRESENT_TO_SCREEN_SHADER_NAME = 'Present To Screen';

const shaders = {};
const images = {};
const meshes = {};

export class CreateGBuffer extends Sample {
    async load() {
        // Load resources
        const res = await Promise.all([
            // Task 4.2: load our create-gbuffer shader
            Loader.loadShaderCode('create-gbuffer.wgsl'),
            // Task 4.1: load our present to screen shader
            Loader.loadShaderCode('present-to-screen.wgsl'),
            Loader.loadImage('brick.png')
        ]);

        // Set shaders
        shaders[G_BUFFER_SHADER_NAME] = res[0];
        // Task 4.1: add our present to screen shader
        shaders[PRESENT_TO_SCREEN_SHADER_NAME] = res[1];

        // Set images
        images.brick = res[2];

        // Set models
        // TODO: maybe load from server instead?
        meshes.bunny = bunny;
    }

    init() {
        // Task 2.5: add a state tracking variable to switch between render modes
        this.showNormals = false;

        // TASK 2.2: add a user-controlled camera
        this.camera = new OrbitCamera(this.canvas);

        // Task 2.4: add a 3D model
        this.model = new Model(meshes.bunny);

        // Task 3.2: create a storage buffer to hold a point light source and upload light source data
        // Task 3.4: create multiple light sources
        const pointLightStrideInElements = 8; // 3 (position) + 1 (radius) + 3 (color) + 1 (padding)
        const numLightSources = 20;
        this.pointlightsBuffer = this.device.createBuffer({
            size: Float32Array.BYTES_PER_ELEMENT * pointLightStrideInElements * numLightSources,
            usage: GPUBufferUsage.STORAGE,
            mappedAtCreation: true,
        });
        const pointLightsBufferRange = new Float32Array(this.pointlightsBuffer.getMappedRange());
        for (let i = 0; i < numLightSources; ++i) {
            const position = vec3.fromValues(
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
            );
            const intensity = Math.random() * 2;
            const color = vec3.fromValues(
                Math.random(),
                Math.random(),
                Math.random(),
            );
            const offset = i * pointLightStrideInElements;
            pointLightsBufferRange.set(position, offset);
            pointLightsBufferRange.set([intensity], offset + 3);
            pointLightsBufferRange.set(color, offset + 4);
        }
        this.pointlightsBuffer.unmap();

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

        // Task 4.2: store our sampler in the Sample instance
        this.sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });

        // Prepare vertex buffer
        // Task 2.4: replace the triangle's vertices with our model's vertices
        //  - the Vertex class provides helper functions for figuring out the vertex layout
        //  - the Model class provides helper functions for writing its vertices to a mapped buffer range
        this.vertexBuffer = this.device.createBuffer({
            size: Vertex.vertexStride() * Float32Array.BYTES_PER_ELEMENT * this.model.numVertices,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        this.model.writeVerticesToMappedRange(new Float32Array(this.vertexBuffer.getMappedRange()));
        this.vertexBuffer.unmap();

        // Prepare index buffer
        // Task 2.4: replace the triangle's indices with our model's vertices
        //  - the Vertex class provides helper functions for figuring out the vertex layout
        //  - the Model class provides helper functions for writing its indices to a mapped buffer range
        this.indexBuffer = this.device.createBuffer({
            size: Uint16Array.BYTES_PER_ELEMENT * this.model.numIndices,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        this.model.writeIndicesToMappedRange(new Uint16Array(this.indexBuffer.getMappedRange()));
        this.indexBuffer.unmap();

        // Prepare uniform buffer
        this.uniformBuffer = this.device.createBuffer({
            // Task 3.5: adjust the uniform buffer's size to hold 16 more bytes (12 for our camera's position and 4 for padding)
            size: 224,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Task 4.2: create bind group for G-Buffer pass
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: {buffer: this.uniformBuffer}},
                {binding: 1, resource: texture.createView()},
                {binding: 2, resource: this.sampler},
            ]
        });

        // Task 4.2: set up a G-Buffer consisting of three textures:
        //  - albedo
        //  - positions
        //  - normals
        this.gBuffer = {
            albedo: this.device.createTexture({
                size: [this.canvas.width, this.canvas.height],  // we'll keep the canvases dimensions for simplicity
                format: this.gpu.getPreferredCanvasFormat(),    // we'll keep the preferred canvas format for simplicity
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            }),
            positions: this.device.createTexture({
                size: [this.canvas.width, this.canvas.height],  // we'll keep the canvases dimensions for simplicity
                format: this.gpu.getPreferredCanvasFormat(),    // we'll keep the preferred canvas format for simplicity
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            }),
            normals: this.device.createTexture({
                size: [this.canvas.width, this.canvas.height],  // we'll keep the canvases dimensions for simplicity
                format: this.gpu.getPreferredCanvasFormat(),    // we'll keep the preferred canvas format for simplicity
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            }),
        };

        // Task 4.2: create color attachments for the render pass creating the G-Buffer
        this.gBufferColorAttachments = [
            {
                view: this.gBuffer.albedo.createView(),
                clearValue: {r: 0, g: 0, b: 0, a: 1},
                loadOp: 'clear',
                loadValue: {r: 0, g: 0, b: 0, a: 1},
                storeOp: 'store'
            },
            {
                view: this.gBuffer.positions.createView(),
                clearValue: {r: 0, g: 0, b: 0, a: 1},
                loadOp: 'clear',
                loadValue: {r: 0, g: 0, b: 0, a: 1},
                storeOp: 'store'
            },
            {
                view: this.gBuffer.normals.createView(),
                clearValue: {r: 0, g: 0, b: 0, a: 1},
                loadOp: 'clear',
                loadValue: {r: 0, g: 0, b: 0, a: 1},
                storeOp: 'store'
            },
        ];

        // Task 2.6: create a depth texture
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Task 2.6: create a depth-stencil attachment
        this.depthStencilAttachment = {
            view: this.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'discard',
        };

        // Task 4.1: create an output texture for the first render pass
        this.renderTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],  // we'll keep the canvases dimensions for simplicity
            format: this.gpu.getPreferredCanvasFormat(),    // we'll keep the preferred canvas format for simplicity
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        // Task 4.2: we no longer need the render attachment

        // Task 4.1: create a color attachment for the final pass presenting our rendered image to the canvas
        this.screenAttachment = {
            view: null, // Will be set in draw()
            clearValue: {r: 0, g: 0, b: 0, a: 1},
            loadOp: 'clear',
            loadValue: {r: 0, g: 0, b: 0, a: 1},
            storeOp: 'store'
        };

        // Task 4.1: create a bind group for the final pass.
        //   this uses the texture we rendered to in the first pass and a sampler
        this.presentToScreenBindgroup = this.device.createBindGroup({
            layout: this.presentToScreenPipeline.getBindGroupLayout(0),
            entries: [
                // Task 4.2: render the G-Buffer's albedo texture
                {binding: 0, resource: this.gBuffer.albedo.createView()},
                {binding: 1, resource: this.sampler},
            ]
        });

        this.animate();
    }

    key(type, keys) {
        // Task 4.2: add keyboard inputs to switch between G-Buffer views
        if (type === 'up') {
            if (keys.includes('a') || keys.includes('A')) {
                this.presentToScreenBindgroup = this.device.createBindGroup({
                    layout: this.presentToScreenPipeline.getBindGroupLayout(0),
                    entries: [
                        // Task 4.2: render the G-Buffer's albedo texture
                        {binding: 0, resource: this.gBuffer.albedo.createView()},
                        {binding: 1, resource: this.sampler},
                    ]
                });
            } else if (keys.includes('p') || keys.includes('P')) {
                this.presentToScreenBindgroup = this.device.createBindGroup({
                    layout: this.presentToScreenPipeline.getBindGroupLayout(0),
                    entries: [
                        // Task 4.2: render the G-Buffer's positions texture
                        {binding: 0, resource: this.gBuffer.positions.createView()},
                        {binding: 1, resource: this.sampler},
                    ]
                });
            } else if (keys.includes('n') || keys.includes('N')) {
                this.presentToScreenBindgroup = this.device.createBindGroup({
                    layout: this.presentToScreenPipeline.getBindGroupLayout(0),
                    entries: [
                        // Task 4.2: render the G-Buffer's normals texture
                        {binding: 0, resource: this.gBuffer.normals.createView()},
                        {binding: 1, resource: this.sampler},
                    ]
                });
            }
        }
    }

    render() {
        // TASK 2.2: update the camera and upload its view and projection matrices to our uniform buffer
        this.camera.update();
        // TASK 2.4: replace the default matrix with the model's transformation matrix
        const modelMatrix = this.model.modelMatrix;
        const uniformArray = new Float32Array([
            // Task 3.5: add the camera's position (including one float for padding) to our uniform buffer
            ...this.camera.position, 0.0,
            ...this.camera.view,
            ...this.camera.projection,
            ...modelMatrix,
        ]);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

        // Task 2.5: add a render mode to our uniforms
        this.device.queue.writeBuffer(this.uniformBuffer,
            uniformArray.length * Float32Array.BYTES_PER_ELEMENT,
            new Uint32Array([this.showNormals])
        );

        const commandEncoder = this.device.createCommandEncoder();
        // Task 4.1: no longer set the color attachment's view from the current frame's view
        const renderPass = commandEncoder.beginRenderPass({
            // Task 4.2: render to the G-Buffer attachments
            colorAttachments: [...this.gBufferColorAttachments],
            // Task 2.6: use the depth-stencil attachment
            depthStencilAttachment: this.depthStencilAttachment,
        });
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.setIndexBuffer(this.indexBuffer, 'uint16');
        // Task 2.4: draw all of the model's indices
        renderPass.drawIndexed(this.model.numIndices);
        renderPass.end();

        // Task 4.1: encode the pipeline rendering to the screen
        this.screenAttachment.view = this.context.getCurrentTexture().createView();
        const presentToScreenPass = commandEncoder.beginRenderPass({
            colorAttachments: [this.screenAttachment],
        });
        presentToScreenPass.setPipeline(this.presentToScreenPipeline);
        presentToScreenPass.setBindGroup(0, this.presentToScreenBindgroup);
        // the 6 vertices we are drawing are stored within a constant array in the shader
        presentToScreenPass.draw(6);
        presentToScreenPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    shaders() {
        return shaders;
    }

    reloadShader(shaderName, shaderCode) {
        const shaderModule = this.device.createShaderModule({code: shaders[G_BUFFER_SHADER_NAME]});
        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vertex',
                buffers: [
                    // Task 2.4 (optional): use the vertex layout provided by the Vertex class
                    Vertex.vertexLayout(),
                ],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragment',
                targets: [
                    // Task 4.2: write to all G-Buffer attachments
                    {format: this.gpu.getPreferredCanvasFormat(),},
                    {format: this.gpu.getPreferredCanvasFormat(),},
                    {format: this.gpu.getPreferredCanvasFormat(),},
                ],
            },
            // Task 2.6: enable depth testing
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            }
        });

        // Task 4.1: create a pipeline to present our rendered image to the screen
        const presentToScreenShaderModule = this.device.createShaderModule({code: shaders[PRESENT_TO_SCREEN_SHADER_NAME]});
        this.presentToScreenPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: presentToScreenShaderModule,
                entryPoint: 'vertex',
                // the vertices and texture coordinates are stored directly in the shader and accessed via their index
                // so, we don't have to pass any vertex buffers here
            },
            fragment: {
                module: presentToScreenShaderModule,
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
