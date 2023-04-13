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

const SAMPLE_NAME = 'Deferred Shading';

export class DeferredShading extends Sample {
    async init() {
        // TASK 2.2: add a user-controlled camera
        this.camera = new OrbitCamera(this.canvas);

        // todo: maybe use the loader instead?
        // Task 2.4: add a 3D model
        this.model = new Model(bunny);

        // Task 2.5: add a state tracking variable to switch between render modes
        this.showNormals = false;

        await this.#initResources();
        await this.#initPipelines();
    }

    get name() {
        return SAMPLE_NAME;
    }

    key(type, keys) {
        // Task 4.2: add keyboard inputs to switch between G-Buffer views
        if (type === 'up') {
            if (keys.includes('a') || keys.includes('A')) {
                this.presentToScreenPipelineData.bindGroup = this.device.createBindGroup({
                    layout: this.presentToScreenPipelineData.pipeline.getBindGroupLayout(0),
                    entries: [
                        // Task 4.2: render the G-Buffer's albedo texture
                        {binding: 0, resource: this.gBuffer.albedo.createView()},
                        {binding: 1, resource: this.sampler},
                    ]
                });
            } else if (keys.includes('p') || keys.includes('P')) {
                this.presentToScreenPipelineData.bindGroup = this.device.createBindGroup({
                    layout: this.presentToScreenPipelineData.pipeline.getBindGroupLayout(0),
                    entries: [
                        // Task 4.2: render the G-Buffer's positions texture
                        {binding: 0, resource: this.gBuffer.positions.createView()},
                        {binding: 1, resource: this.sampler},
                    ]
                });
            } else if (keys.includes('n') || keys.includes('N')) {
                this.presentToScreenPipelineData.bindGroup = this.device.createBindGroup({
                    layout: this.presentToScreenPipelineData.pipeline.getBindGroupLayout(0),
                    entries: [
                        // Task 4.2: render the G-Buffer's normals texture
                        {binding: 0, resource: this.gBuffer.normals.createView()},
                        {binding: 1, resource: this.sampler},
                    ]
                });
            } else if (keys.includes('r') || keys.includes('R')) {
                this.presentToScreenPipelineData.bindGroup = this.device.createBindGroup({
                    layout: this.presentToScreenPipelineData.pipeline.getBindGroupLayout(0),
                    entries: [
                        // Task 4.2: render the G-Buffer's render texture
                        {binding: 0, resource: this.renderTexture.createView()},
                        {binding: 1, resource: this.sampler},
                    ]
                });
            }
        }
    }

    render() {
        // TASK 2.2: update the camera...
        this.camera.update();

        // TASK 2.4: replace the default matrix with the model's transformation matrix
        const modelMatrix = this.model.modelMatrix;
        const uniformArray = new Float32Array([
            // Task 3.5: add the camera's position (including one float for padding) to our uniform buffer
            ...this.camera.position, 0.0,
            ...this.camera.view,
            ...this.camera.projection,
            ...modelMatrix
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformArray);

        // Task 2.5: add a render mode to our uniforms
        this.device.queue.writeBuffer(this.uniformBuffer,
            uniformArray.length * Float32Array.BYTES_PER_ELEMENT,
            new Uint32Array([this.showNormals])
        );

        const commandEncoder = this.device.createCommandEncoder();

        // Task 4.1: no longer set the color attachment's view from the current frame's view
        const renderToTexturePass = commandEncoder.beginRenderPass(
            this.createGBufferPipelineData.attachments
        );
        renderToTexturePass.setPipeline(this.createGBufferPipelineData.pipeline);
        renderToTexturePass.setBindGroup(0, this.createGBufferPipelineData.bindGroup);
        renderToTexturePass.setVertexBuffer(0, this.vertexBuffer);
        renderToTexturePass.setIndexBuffer(this.indexBuffer, 'uint16');
        // Task 2.4: draw all of the model's indices
        renderToTexturePass.drawIndexed(this.model.numIndices);
        renderToTexturePass.end();

        // Task 4.3: encode the deferred shading pass
        const deferredShadingPass = commandEncoder.beginComputePass();
        deferredShadingPass.setPipeline(this.deferredShadingPipelineData.pipeline);
        deferredShadingPass.setBindGroup(0, this.deferredShadingPipelineData.bindGroup);
        deferredShadingPass.dispatchWorkgroups(
            Math.ceil(this.canvas.width / this.deferredShadingPipelineData.workGroupSize.x),
            Math.ceil(this.canvas.height / this.deferredShadingPipelineData.workGroupSize.y),
        );
        deferredShadingPass.end();

        // Task 4.1: encode the pipeline rendering to the screen
        this.presentToScreenPipelineData.attachments.colorAttachments[0].view = this.context.getCurrentTexture().createView();
        const presentToScreenPass = commandEncoder.beginRenderPass(
            this.presentToScreenPipelineData.attachments,
        );
        presentToScreenPass.setPipeline(this.presentToScreenPipelineData.pipeline);
        presentToScreenPass.setBindGroup(0, this.presentToScreenPipelineData.bindGroup);
        // the 6 vertices we are drawing are stored within a constant array in the shader
        presentToScreenPass.draw(6);
        presentToScreenPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    async #initResources() {
        // Prepare vertex buffer
        // Task 2.4: replace the triangle's vertices with our model's vertices
        //  - the Vertex class provides helper functions for figuring out the vertex layout
        //  - the Model class provides helper functions for writing its vertices to a mapped buffer range
        this.vertexBuffer = this.device.createBuffer({
            size: Vertex.vertexStride() * this.model.numVertices,
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

        // Set up brick texture
        const image = await Loader.loadImage('brick.png');
        this.texture = this.device.createTexture({
            size: [image.width, image.height],
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            format: 'rgba8unorm',
        });
        this.device.queue.copyExternalImageToTexture(
            {source: image},
            {texture: this.texture},
            [image.width, image.height]
        );

        // Create sampler
        this.sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });

        // Prepare uniform buffer
        this.uniformBuffer = this.device.createBuffer({
            // Task 3.5: adjust the uniform buffer's size to hold 16 more bytes (12 for our camera's position and 4 for padding)
            size: 224,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Task 2.6: create a depth texture
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

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

        // Task 4.1: create an output texture for the rendered image
        this.renderTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],  // we'll keep the canvases dimensions for simplicity
            // Task 4.3: use a texture format that supports the storage binding usage (e.g., rgba8unorm)
            format: 'rgba8unorm',
            // Task 4.3: replace RENDER_ATTACHMENT with STORAGE_BINDING
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
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
    }

    async #initPipelines() {
        // Task 4.2: create a pipeline to create a G-Buffer
        const createGBufferShaderCode = await Loader.loadShaderCode('create-gbuffer.wgsl');
        const createGBufferShaderModule = this.device.createShaderModule({code: createGBufferShaderCode});
        const createGBufferPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: createGBufferShaderModule,
                entryPoint: 'vertex',
                buffers: [
                    // Task 2.4 (optional): use the vertex layout provided by the Vertex class
                    Vertex.vertexLayout(),
                ],
            },
            fragment: {
                module: createGBufferShaderModule,
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

        // Task 4.2: adapt bind group for G-Buffer pass
        const createGBufferBindGroup = this.device.createBindGroup({
            layout: createGBufferPipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: {buffer: this.uniformBuffer}},
                {binding: 1, resource: this.texture.createView()},
                {binding: 2, resource: this.sampler},
            ]
        });

        // Task 4.2: create color attachments for the render pass creating the G-Buffer
        const createGBufferColorAttachments = [
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

        // Task 2.6: create a depth-stencil attachment
        const renderToTextureDepthStencilAttachment = {
            view: this.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'discard',
        };

        this.createGBufferPipelineData = {
            pipeline: createGBufferPipeline,
            bindGroup: createGBufferBindGroup,
            attachments: {
                colorAttachments: createGBufferColorAttachments,
                depthStencilAttachment: renderToTextureDepthStencilAttachment,
            }
        };

        // Task 4.3: create a compute pipeline to compute the illumination in our scene in a deferred way
        const deferredShadingShaderCode = await Loader.loadShaderCode('deferred-shading.wgsl');
        const deferredShadingShaderModule = this.device.createShaderModule({code: deferredShadingShaderCode});
        const deferredShadingPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: deferredShadingShaderModule,
                entryPoint: 'compute',
            },
        });

        // Task 4.3: create the bind group for our deferred shading pass
        const deferredShadingBindGroup = this.device.createBindGroup({
            layout: deferredShadingPipeline.getBindGroupLayout(0),
            entries: [
                // G-Buffer
                {binding: 0, resource: this.gBuffer.albedo.createView()},
                {binding: 1, resource: this.gBuffer.positions.createView()},
                {binding: 2, resource: this.gBuffer.normals.createView()},
                // uniforms & light sources
                {binding: 3, resource: {buffer: this.uniformBuffer}},
                {binding: 4, resource: {buffer: this.pointlightsBuffer}},
                // rendered image
                {binding: 5, resource: this.renderTexture.createView()},
            ]
        });

        this.deferredShadingPipelineData = {
            pipeline: deferredShadingPipeline,
            bindGroup: deferredShadingBindGroup,
            workGroupSize: {
                x: 16,
                y: 16,
            }
        }

        // Task 4.1: create a pipeline to present our rendered image to the screen
        const presentToScreenShaderCode = await Loader.loadShaderCode('present-to-screen.wgsl');
        const presentToScreenShaderModule = this.device.createShaderModule({code: presentToScreenShaderCode});
        const presentToScreenPipeline = this.device.createRenderPipeline({
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

        // Task 4.1: create a color attachment for the final pass presenting our rendered image to the canvas
        const presentToScreenColorAttachment = {
            view: null, // Will be set in render()
            clearValue: {r: 0, g: 0, b: 0, a: 1},
            loadOp: 'clear',
            loadValue: {r: 0, g: 0, b: 0, a: 1},
            storeOp: 'store'
        };

        // Task 4.1: create a bind group for the final pass.
        //   this uses the texture we rendered to in the first pass and a sampler
        const presentToScreenBindgroup = this.device.createBindGroup({
            layout: presentToScreenPipeline.getBindGroupLayout(0),
            entries: [
                // Task 4.3: show the rendered image by default
                {binding: 0, resource: this.renderTexture.createView()},
                {binding: 1, resource: this.sampler},
            ]
        });

        this.presentToScreenPipelineData = {
            pipeline: presentToScreenPipeline,
            bindGroup: presentToScreenBindgroup,
            attachments: {
                colorAttachments: [presentToScreenColorAttachment],
            }
        }
    }

    stop() {
        super.stop();
        this.camera.dispose();
    }
}
