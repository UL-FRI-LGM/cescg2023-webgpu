# PART 4: Color Attachments & Compute Shaders

## Task 4.1: Render to a Texture
Instead of rendering to the canvas directly, we'll first render our scene into a texture and then add a second render pipeline to present our rendered texture to the canvas.

For this purpose, we'll add a new shader that renders a textured full screen quad.
In this shader, we'll store the vertices directly in the shader, as we've learned in Part 1:
```wgsl
struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) texcoord : vec2<f32>,
};

// the vertices and texture coordinates are stored directly in the shader and accessed via their index
const VERTICES: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
    vec2<f32>( 1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(-1.0,  1.0)
);

const TEXCOORDS: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 0.0)
);

@group(0) @binding(0) var uTexture : texture_2d<f32>;
@group(0) @binding(1) var uSampler : sampler;

@vertex
fn vertex(@builtin(vertex_index) vertex_index : u32) -> VertexOutput {
    return VertexOutput(
        vec4<f32>(VERTICES[vertex_index], 0.0, 1.0),
        TEXCOORDS[vertex_index],
    );
}

@fragment
fn fragment(@location(0) texcoord : vec2<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(textureSample(uTexture, uSampler, texcoord));
}
```

Other than that, we only need to make some changes to our JavaScript file:
* In `#initResources`, create a new texture that can be used as both a texture binding and a render attachment:
```js
    this.renderTexture = this.device.createTexture({
        size: [this.canvas.width, this.canvas.height],  // we'll keep the canvases dimensions for simplicity
        format: this.gpu.getPreferredCanvasFormat(),    // we'll keep the preferred canvas format for simplicity
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
```
* In `#initPipelines`, set the original render pipeline's color attachment's view to a `GPUTextureView` created from our render texture.
* For convenience, store all things we require for encoding our original render pipeline in a helper object:
```js
    this.renderToTexturePipelineData = {
        pipeline: renderToTexturePipeline,
        bindGroup: renderToTextureBindGroup,
        attachments: {
            colorAttachments: [renderToTextureColorAttachment],
            depthStencilAttachment: renderToTextureDepthStencilAttachment,
        }
    };
```
* Also in `#initPipelines`, create a new shader module, render pipeline, color attachment, and bind group for our new shader.
* To keep things separated, store this in a helper object as well:
```js
    this.presentToScreenPipelineData = {
        pipeline: presentToScreenPipeline,
        bindGroup: presentToScreenBindgroup,
        attachments: {
            colorAttachments: [presentToScreenColorAttachment],
        }
    }
```
* Finally, encode both render pipelines in our `render` function:
```js
    const renderToTexturePass = commandEncoder.beginRenderPass(
        this.renderToTexturePipelineData.attachments
    );
    renderToTexturePass.setPipeline(this.renderToTexturePipelineData.pipeline);
    renderToTexturePass.setBindGroup(0, this.renderToTexturePipelineData.bindGroup);
    renderToTexturePass.setVertexBuffer(0, this.vertexBuffer);
    renderToTexturePass.setIndexBuffer(this.indexBuffer, 'uint16');
    renderToTexturePass.drawIndexed(this.model.numIndices);
    renderToTexturePass.end();

    this.presentToScreenPipelineData.attachments.colorAttachments[0].view = this.context.getCurrentTexture().createView();
    const presentToScreenPass = commandEncoder.beginRenderPass(
        this.presentToScreenPipelineData.attachments,
    );
    presentToScreenPass.setPipeline(this.presentToScreenPipelineData.pipeline);
    presentToScreenPass.setBindGroup(0, this.presentToScreenPipelineData.bindGroup);
    // the 6 vertices we are drawing are stored within a constant array in the shader
    presentToScreenPass.draw(6);
    presentToScreenPass.end();
```

## Task 4.2: Create a G-Buffer
Render pipelines can not only render to a single texture, but also to multiple textures.
In this task, we're going to experiment with multiple color attachments by creating a geometry buffer (G-Buffer).
Our G-Buffer consists of three textures that hold the positions, normals, and albedo for each pixel on screen.

We'll add a new shader to create our G-Buffer. It will almost be the same as our previous shader but instead of doing any lighting computations, the fragment stage only outputs our G-Buffer's attributes,
The key differences are highlighted here:
```wgsl
// ...

struct FragmentOutput {
    @location(0) albedo: vec4f,
    @location(1) position: vec4f,
    @location(2) normal: vec4f,
}

// ...

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
// we don't need the light sources in this shader

// ...

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    return FragmentOutput(
        textureSample(uTexture, uSampler, input.texcoord),
        vec4f(input.position, 1.0),
        vec4f(input.normal, 1.0),
    );
}
```

After adding this new shader, make the necessary changes to our JavaScript code:
* In `#initResources`, create a G-Buffer with three textures that can be used as render attachments and texture bindings:
```js
    this.gBuffer = {
        albedo: this.device.createTexture({...}),
        positions: this.device.createTexture({...}),
        normals: this.device.createTexture({...}),
    };
```
* In `#initPipelines`, create a new pipeline that uses our new shader and store its data in a helper object as we did for the other pipelines. Make sure to add multiple targets to the fragment stage and add create multiple color attachments:
```js
    const createGBufferPipeline = this.device.createRenderPipeline({
        // ...
        fragment: {
            module: createGBufferShaderModule,
            entryPoint: 'fragment',
            targets: [
                {format: this.gpu.getPreferredCanvasFormat(),},
                {format: this.gpu.getPreferredCanvasFormat(),},
                {format: this.gpu.getPreferredCanvasFormat(),},
            ],
        },
        // ...
    });

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
```
* To see if our G-Buffer pipeline works correctly, create a bind group for each of the G-Buffer's textures for the final pipeline rendering to the canvas and store them in the pipeline's helper object:
```js
    const presentToScreenAlbedoBindgroup = this.device.createBindGroup({
        layout: presentToScreenPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: this.gBuffer.albedo.createView()},
            {binding: 1, resource: this.sampler},
        ]
    });
    const presentToScreenPositionsBindgroup = this.device.createBindGroup({...});
    const presentToScreenNormalsBindgroup = this.device.createBindGroup({...});
```
* Choose one of the bind groups as the default bind group (we'll use the G-Buffer's albedo texture in our reference implementation).
* In `render`, encode the G-Buffer pipeline and the pipeline presenting to the canvas.
* Finally, add some user inputs to switch between the different attachments. Override the `key` method of our `Workshop` class, to react to keyboard events, e.g., like so:
```js
key(type, keys) {
    if (type === 'up') {
        if (keys.includes('a') || keys.includes('A')) {
            this.presentToScreenPipelineData.bindGroup = this.presentToScreenPipelineData.albedoBindGroup;
        } else if (keys.includes('p') || keys.includes('P')) {
            this.presentToScreenPipelineData.bindGroup = this.presentToScreenPipelineData.positionsBindGroup;
        } else if (keys.includes('n') || keys.includes('N')) {
            this.presentToScreenPipelineData.bindGroup = this.presentToScreenPipelineData.normalsBindGroup;
        }
    }
}
```

TODO: just add attachments to the render to texture pipeline instead of replacing it

## Task 4.3: Compute Illumination in a Compute Shader
Our uniform buffer, G-Buffer, and storage buffer contain all information we need to compute the illumination for a pixel.
This means that we don't need to rasterize triangles anymore. Instead, we can use a compute shader to do this.

First, create a new shader for this task. Simply copy all struct definitions (expect for vertex and fragment stage inputs and outputs) and our functions for computing the illumination.
Then add its bindings and the main entry point to our compute shader:
```wgsl
// G-Buffer
@group(0) @binding(0) var gAlbedo : texture_2d<f32>;
@group(0) @binding(1) var gPositions : texture_2d<f32>;
@group(0) @binding(2) var gNormals : texture_2d<f32>;

// uniforms & light sources
@group(0) @binding(3) var<uniform> uniforms : Uniforms;
@group(0) @binding(4) var<storage, read> uLights : array<PointLight>;

// output texture
@group(0) @binding(5) var output : texture_storage_2d<rgba8unorm, write>;

@compute
@workgroup_size(16, 16)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    let output_size = vec2u(textureDimensions(output));

    // terminate the thread if its global id is outside the output texture's bounds
    if output_size.x < global_id.x || output_size.y < global_id.y {
        return;
    }

    let albedo = textureLoad(gAlbedo, global_id.xy, 0).rgb;
    let position = textureLoad(gPositions, global_id.xy, 0).xyz;
    let normal = textureLoad(gNormals, global_id.xy, 0).xyz;

    if all(albedo == vec3f()) {
        textureStore(output, global_id.xy, vec4f(vec3f(), 1.0));
    } else {
        var color = AMBIENT_LIGHT;
        for (var i = 0u; i < arrayLength(&uLights); i += 1u) {
            color += compute_lighting(position, normal, albedo, i);
        }
        textureStore(output, global_id.xy, vec4f(color, 1.0));
    }
}
```

In our JavaScript file, make the following changes:
* In order for our compute shader to store its results in our render texture, we need to adjust two things: it needs the `STORAGE_BINDING` usage bit set, and it needs to use a format that supports storage textures:
```js
    this.renderTexture = this.device.createTexture({
        size: [this.canvas.width, this.canvas.height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
```
* In `#initPipelines`, create a compute pipeline using our new shader:
```js
    const deferredShadingShaderCode = await Loader.loadShaderCode('deferred-shading.wgsl');
    const deferredShadingShaderModule = this.device.createShaderModule({code: deferredShadingShaderCode});
    const deferredShadingPipeline = this.device.createComputePipeline({
        layout: 'auto',
        compute: {
            module: deferredShadingShaderModule,
            entryPoint: 'compute',
        },
    });
```
* Then create the corresponding bind group ...
* ... and store everything in a helper object (make sure the `workGroupSize` matches the `@workgroup_size` in the shader):
```js
    this.deferredShadingPipelineData = {
        pipeline: deferredShadingPipeline,
        bindGroup: deferredShadingBindGroup,
        workGroupSize: {
            x: 16,
            y: 16,
        }
    }
```
* Set the default bind group of the pipeline presenting to the canvas to a bind group using a view into our render texture.
* In `render`, encode the compute pipeline after the render pipeline creating the G-Buffer and before the pipeline rendering to the canvas:
```js
    const gBufferPass = commandEncoder.beginRenderPass(this.createGBufferPipelineData.attachments);
    // ...
    gBufferPass.end();

    const deferredShadingPass = commandEncoder.beginComputePass();
    deferredShadingPass.setPipeline(this.deferredShadingPipelineData.pipeline);
    deferredShadingPass.setBindGroup(0, this.deferredShadingPipelineData.bindGroup);
    deferredShadingPass.dispatchWorkgroups(
        Math.ceil(this.canvas.width / this.deferredShadingPipelineData.workGroupSize.x),
        Math.ceil(this.canvas.height / this.deferredShadingPipelineData.workGroupSize.y),
    );
    deferredShadingPass.end();
    
    this.presentToScreenPipelineData.attachments.colorAttachments[0].view = this.context.getCurrentTexture().createView();
    // ...
    presentToScreenPass.end();
```
* Finally, add a new keyboard input, to switch between textures.

## Task 4.4: Animate Light Sources in a Compute Shader
In our final task, we'll add yet another compute shader to animate our light sources.

First, add a new compute shader that reads from and writes to our storage buffer:
```wgsl
struct PointLight {
    position: vec3f,
    intensity: f32,
    color: vec3f,
    // until now, the PointLight struct used 4 bytes for padding. we can use this to store a movement state in each light
    direction: u32,
}

const DOWN: u32 = 0u;
const UP: u32 = 1u;

const MOVEMENT_SPEED = 0.005;

@group(0) @binding(0) var<storage, read_write> uLights : array<PointLight>;

@compute
@workgroup_size(64)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    let num_lights = arrayLength(&uLights);

    // terminate the thread if its global id is outside the light buffer's bounds
    if num_lights < global_id.x {
        return;
    }

    if uLights[global_id.x].direction == DOWN {
        uLights[global_id.x].position.y = uLights[global_id.x].position.y - MOVEMENT_SPEED;
        if uLights[global_id.x].position.y < -0.5 {
            uLights[global_id.x].direction = UP;
        }
    } else {
        uLights[global_id.x].position.y = uLights[global_id.x].position.y + MOVEMENT_SPEED;
        if uLights[global_id.x].position.y > 0.5 {
            uLights[global_id.x].direction = DOWN;
        }
    }
}
```
Feel free to experiment with different movement patterns.

In our JavaScript file, we'll make the following changes:
* If you haven't done so already, store the number of light sources in the `Workgroup` instance.
* In `#initRenderPipelines`, create a new compute pipeline and a corresponding bind group and store them both in a helper object:
```js
    this.animateLightsPipelineData = {
        pipeline: animateLightsPipeline,
        bindGroup: animateLightsBindGroup,
        workGroupSize: {
            x: 64,
        }
    }
```
* Finally, in `render` encode our new compute pipeline:
```js
    const animateLightsPass = commandEncoder.beginComputePass();
    animateLightsPass.setPipeline(this.animateLightsPipelineData.pipeline);
    animateLightsPass.setBindGroup(0, this.animateLightsPipelineData.bindGroup);
    animateLightsPass.dispatchWorkgroups(
        Math.ceil(this.numLightSources / this.animateLightsPipelineData.workGroupSize.x)
    );
    animateLightsPass.end();
```
