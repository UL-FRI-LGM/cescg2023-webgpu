# PART 4: Color Attachments & Compute Shaders

In the final part of our workshop, we'll get to know the shiny new first-class citizen for GPU programming in the browser: compute shaders!
We'll use a compute pipeline to animate the light sources in our scene.
Then, we'll take a look at instanced drawing to make our light sources visible on screen.

## Introduction to Compute Shaders

Like vertex and fragment shader stages, a compute shader stage needs an entry point.
This entry point must be annotated with the `@compute` attribute.
While vertex and fragment shaders are invoked via draw calls, compute shaders are invoked via dispatching workgroups.
Each workgroup in a dispatch starts [a number of threads](https://www.w3.org/TR/webgpu/#dom-supported-limits-maxcomputeinvocationsperworkgroup) in a 3D grid layout.
The number of threads in a workgroup as well as its layout are defined in the shader itself, using the [required `@workgroup_size(x[,y[,z]])` entry point attribute](https://www.w3.org/TR/WGSL/#entry-point-attributes).
The 3D grid layout becomes apparent when looking at a thread's invocation id.
Each thread has a local invocation id that uniquely identifies it within the workgroup, as well as a global one that uniquely identifies it within all workgroups.
You can imagine that the local invocation id for each thread in a workgroup is computed like this:
```wgsl
for (var x = 0; x < workGroupSize.x; ++x) {
    for (var y = 0; y < workGroupSize.y; ++y) {
        for (var z = 0; z < workGroupSize.z; ++z) {
            const local_invocation_id = vec3u(x, y, z);
        }
    }
}
```

When compute shaders are used to process an array of data, each thread typically only processes a single (or a small number of) element(s) in the array.
In such cases, a thread's global invocation id is often used as an index into the array to process.
It can be accessed via the [built-in `global_invocation_id`](https://www.w3.org/TR/WGSL/#builtin-values), e.g.:
```wgsl
@group(0) @binding(0) var<storage> data: array<u32>;

@compute
@workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let thread_id = global_id.x;
    let threads_own_data = data[thread_id];
    // do something with the data ...
}
```
However, on the JavaScript side, only whole workgroups are be dispatched (e.g
, using the [dispatchWorkgroups](https://www.w3.org/TR/webgpu/#dom-gpucomputepassencoder-dispatchworkgroups) method
of a [GPUComputePassEncoder](https://www.w3.org/TR/webgpu/#gpucomputepassencoder)).
For example, when dispatching 6 workgroups in the x dimension (`encoder.dispatchWorkgroups(6)`), using a compute shader
with a workgroup size of 64 in x (`@workgroup_size(64)`), a total of `6 * 64 = 384` threads will be executed on the GPU.
In cases where the array length is not exactly divisible by the workgroup size, we thus spawn more threads than elements in the array.
To avoid out-of-bounds accesses, it is usually a good idea to test if the thread's id is within the array's bounds, and terminate the thread if it is not, e.g.:
```wgsl
if thread_id >= arrayLength(&data) {
    return;
}
```

With that covered, you should know everything you need to write your first compute shader. Let's dive in and get those light sources moving!

## Task 4.1: Animate Light Sources in a Compute Shader
In Part 3, we've created a storage buffer to pass our light sources to the GPU. This will come in handy now, as we're
going to use a compute shader to move those light sources around.

As a first step, create a new shader file in the `shaders` directory and name it `animate-lights.wgsl`:
* Define the entry point to the new compute shader with a workgroup size of 64 in the x dimension, and leave out the y and z dimensions (defaults to 1). 
  We'll spawn a thread for each light source in the storage buffer and use the thread's global id to determine which light source it should process.
  We'll use the x component of the [built-in `global_invocation_id`](https://www.w3.org/TR/WGSL/#builtin-values) as the thread's id and an index into our light source buffer:
```wgsl
@compute
@workgroup_size(64)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    let thread_id = global_id.x;
}
```
* Copy the `PointLight` struct definition from `shader.wgsl` to `animate-lights.wgsl`:
```wgsl
struct PointLight {
    position: vec3f,
    intensity: f32,
    color: vec3f,
    // + 4 bytes of implicit padding
}
```
* Add a new `direction` member (`u32`) to the `PointLight` struct.
 Because of the [alignment and structure member layout rules](https://www.w3.org/TR/WGSL/#alignment-and-size) we still have a 4 byte chunk of memory in each of our point lights left, so we won't need to change the buffer's size after adding this new member.
 You can verify that this does not change the `PointLight` struct's size using [the website already seen in Part 2](https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001008301000000000000003d88886237289d13c4320e1a9be64fe4a78fb96671dd0f842d26b1ead16b1a8f0ebcd02fbfcc7872dae07928ca1ce520ac48de585dc004fc9ffbe07351a7284fabec2af5ab1f18c5b482573bd5a8b24040d2c8800101a0c7336be03c4252552b2eaace47b1f4557937c3d756403d9a929ae3950bdc65f3eaa57f8f931240062d2a5825668198942b02608ad1b847d472e2d01177fd080d40221b6b16400f796120f011cc5108fc6367786aa26f2bc777b6c15c23a7a5919bb55dd1ca1ed642ae6208a16a32eebf273bc228d0efd1486494791445ffe538036e).
```wgsl
struct PointLight {
    position: vec3f,
    intensity: f32,
    color: vec3f,
    // until now, the PointLight struct used 4 bytes for padding. we can use this to store a movement state in each light
    direction: u32,
}
```
* Add the storage buffer containing our light sources as a binding for the compute shader.
  Unlike earlier, we want the compute shader to make changes to the buffer's contents, so we need to specify it as `read_write`:
```wgsl
@group(0) @binding(0) var<storage, read_write> uLights : array<PointLight>;
```
* Check if the thread's `global_invocation_id` is within the buffer's bounds.
  As discussed above, it might be that we spawn more threads than elements in our array. To avoid out-of-bounds accesses,
  we'll test the thread's id against the array's length:
```wgsl
@compute
@workgroup_size(64)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    // terminate the thread if its global id is outside the light buffer's bounds
    if global_id.x >= arrayLength(&uLights) {
        return;
    }
    // move light sources ...
}
```
* Add the logic to move light sources up or down between a minimum and maximum y position of 0 and 1 respectively.
  We'll use the `direction` member of a `PointLight` to determine if it is going up (`direction == 1`) or down (`direction == 0`).
  Additionally, we'll add a constant movement speed.
  If a light source reached either the minimum or maximum y position, we'll change the direction of the light source for subsequent frames
  by setting the `direction`in the buffer to the opposite direction:
```wgsl
const DOWN: u32 = 0u;
const UP: u32 = 1u;
const MOVEMENT_SPEED = 0.005;

// ...

@compute
@workgroup_size(64)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    // ...
    let light_id = global_id.x;
    if uLights[light_id].direction == DOWN {
        uLights[light_id].position.y = uLights[light_id].position.y - MOVEMENT_SPEED;
        if uLights[light_id].position.y < -0.5 {
            uLights[light_id].direction = UP;
        }
    } else {
        uLights[light_id].position.y = uLights[light_id].position.y + MOVEMENT_SPEED;
        if uLights[light_id].position.y > 0.5 {
            uLights[light_id].direction = DOWN;
        }
    }
}
```

That was it for our compute shader! In our `Workshop` class, we'll make the following changes:
* In `#initResources`, if you haven't done so already, store the number of light sources in the `Workgroup` instance:
```js
this.numLightSources = numLightSources;
```
* In `#initPipelines`, create a new compute pipeline.
  A [GPUComputePipelineDescriptor](https://www.w3.org/TR/webgpu/#dictdef-gpucomputepipelinedescriptor) only has a single 
  required member that describes the compute shader to be used with the pipeline: `compute`.
  It is similar to the `vertex` and `fragment` members of a [GPURenderPipelineDescriptor](https://www.w3.org/TR/webgpu/#dictdef-gpurenderpipelinedescriptor):
```js
const animateLightsShaderCode = await new Loader().loadText('shaders/animate-lights.wgsl');
const animateLightsShaderModule = this.device.createShaderModule({code: animateLightsShaderCode});
const animateLightsPipeline = this.device.createComputePipeline({
    layout: 'auto',
    compute: {
        module: animateLightsShaderModule,
        entryPoint: 'compute',
    }
});
```
* Then create a bind group for the new pipeline:
```js
const animateLightsBindGroup = this.device.createBindGroup({
    layout: animateLightsPipeline.getBindGroupLayout(0),
    entries: [
        {binding: 0, resource: {buffer: this.pointlightsBuffer}},
    ]
});
```
* Store pipeline-related data in a helper object for convenience.
```js
this.animateLightsPipelineData = {
    pipeline: animateLightsPipeline,
    bindGroup: animateLightsBindGroup,
}
```
* Finally, in `render` encode our new compute pipeline before submitting the command encoder to the queue.
  Determine the number of workgroups to dispatch by dividing the number of light sources by the workgroup size defined in the compute shader (`animate-lights.wgsl`):
```js
const animateLightsPass = commandEncoder.beginComputePass();
animateLightsPass.setPipeline(this.animateLightsPipelineData.pipeline);
animateLightsPass.setBindGroup(0, this.animateLightsPipelineData.bindGroup);
animateLightsPass.dispatchWorkgroups(
    Math.ceil(this.numLightSources / 64) // divide by our shader's workgroup size
);
animateLightsPass.end();
```

And that's it! You've made your first steps into the world of WebGPU compute shaders.

## 4.2 Control the Workgroup Size from the JavaScript Side
Having to maintain the workgroup size of a compute shader in two places - the shader and the JavaScript file - can easily lead to errors.
It would be nice to have this only in one place - preferably on the JavaScript side, where we can control it.
Luckily, there is the WGSL / WebGPU concept of [override declarations](https://www.w3.org/TR/WGSL/#override-decls) to define constant values in shaders that can be overridden by a pipeline at creation time.
In this task, we're going to use an `override` declaration to set the workgroup size from our `Workshop` class.

We'll start by making some minor changes to our `animate-lights.wgsl` shader:
* Define a global `WORKGROUP_SIZE` using a default value of 64:
```wgsl
override WORKGROUP_SIZE: u32 = 64;
```
* Use this new constant `WORKGROUP_SIZE` in the entry point's `@workgroup_size` attribute:
```wgsl
@compute
@workgroup_size(WORKGROUP_SIZE)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {    
  // ...
}
```

With the `override` constant in place, we can now make some minor adjustments to the `Workshop` class, to change the shader's workgroup size from there:
* In `#initPipelines`, override the constant value in the [GPUComputePipelineDescriptor](https://www.w3.org/TR/webgpu/#dictdef-gpucomputepipelinedescriptor).
  The constant is simply identified by its name (alternatively, an `override` constant can also have an `@id` attribute to identify it by a number):
```js
const animateLightsWorkGroupSize = { x: 128 };
const animateLightsPipeline = this.device.createComputePipeline({
    layout: 'auto',
    compute: {
        // ...
        constants: {
            WORKGROUP_SIZE: animateLightsWorkGroupSize.x,
        },
    }
});
```
* Then store the workgroup size in the `animateLightsPipelineData` helper object, so we can be sure to use the same workgroup size in `render` later:
```js
this.animateLightsPipelineData = {
    pipeline: animateLightsPipeline,
    bindGroup: animateLightsBindGroup,
    workGroupSize: animateLightsWorkGroupSize,
}
```
* Finally, use the new workgroup size in `render`:
```js
const animateLightsPass = commandEncoder.beginComputePass();
// ...
animateLightsPass.dispatchWorkgroups(
    Math.ceil(this.numLightSources / this.animateLightsPipelineData.workGroupSize.x)
);
animateLightsPass.end();
```

And voilà: the workgroup size used for the pipeline can now be controlled (at pipeline creation time) by touching only a single variable.

## Task 4.3: Render Light Sources
Our light sources are moving up and down now, but it's hard to tell where they are exactly.
In this task, let's make our light sources visible by rendering small objects to represent them.
We'll use the same object - a sphere in our reference implementation - for each of them. This gives us a perfect opportunity to introduce [instanced
drawing](https://en.wikipedia.org/wiki/Geometry_instancing)!

In instanced drawing, multiple copies of the same object are drawn with just a single draw call.
In the vertex stage of a render pipeline, the [built-in `instance_index`](https://www.w3.org/TR/WGSL/#built-in-values-instance_index)
can then be used to change the output of the vertex shader based on the current instance.
For example, there could be a buffer with an array of model matrices - one for each instance - and we could use the `instance_index`
to use the one belonging to the current instance using its index:
```wgsl
@group(0) @binding(0) var<storage> matrices: array<mat4x4<f32>>;

@vertex
fn main(@builtin(instance_index) instance: u32, @location(0) position: vec4f) -> @builtin(position) vec4f {
    return matrices[instance_index] * position;
}
```
In this task, all instance related data we need is already in the storage buffer containing our light sources.

On the JavaScript side, we can set the number of instances to draw via the second argument of [the `drawIndexed` function](https://www.w3.org/TR/webgpu/#dom-gpurendercommandsmixin-drawindexed):
```js
renderPass.drawIndexed(indexCount, instanceCount);
```

With that out of the way, let's get started and render our light sources!
We'll use the helper class `LightSourceModel` provided by our framework. It is very similar to our `Model` class but applies
a scaling operation to its model matrix in its constructor. We'll need to apply this scaling to each instance, so we'll add
the `LightSourceModel` 's model matrix to our uniform buffer. We'll then create a new shader and a corresponding pipeline for
rendering our light sources, and use the new pipeline in our render pass.

Start with the shader in `shader.wgsl`:
* Add a new `mat4x4<f32>` to the `Uniforms` struct:
```wgsl
struct Uniforms {
    camera: Camera,
    model: mat4x4<f32>,
    light: mat4x4<f32>,
}
```

Then we'll create a new shader in the `shaders` directory and call it `light-sources.wgsl`:
* Copy the `Camera`, `Uniforms`, and `PointLight` structs from `shader.wgsl` to the new shader.
* Copy all binding definitions from `shader.wgsl`.
  For simplicity, we'll use the same bind group layout, pipeline layout, and bind group for both render pipelines.
  The new shader won't use the texture and sampler bindings, however, so you can also comment them out as long as the binding
  numbers of the other two bindings remain the same:
```wgsl
// Although we use only use the uniforms and light sources, we'll still use the same bind group object.
// We need to make sure the binding numbers match the binding number in our other shader (shader.wgsl)
@group(0) @binding(0) var<uniform> uniforms : Uniforms;
// @binding(1) not used
// @binding(2) not used
@group(0) @binding(3) var<storage, read> uLights : array<PointLight>;
```
* Create the interface for the vertex stage of the new shader.
  We'll use the built-in `instance_index` and the position attribute at `@location(0)` of a vertex buffer as input.
  As output, we'll only need a position and a color:
```wgsl
struct VertexInput {
    @builtin(instance_index) instance : u32,
    @location(0) position : vec3f,
}

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f,
}
```
* Add an entry point for the vertex stage.
  We'll compute the position of each instance by first scaling down the vertex using the `light` matrix in our uniform
  buffer to scale it down, and then we'll translate it using the light source's position stored in the storage buffer:
```wgsl
@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    let position = (uniforms.light * vec4f(input.position, 1)).xyz + uLights[input.instance].position;

    return VertexOutput(
        uniforms.camera.projection * uniforms.camera.view * vec4f(position, 1),
        vec4f(uLights[input.instance].color, 1),
    );
}
```
* Finally, add a fragment stage for our new shader.
  We really only care about the color here, so it's a bit of an overkill to define extra structs.
  Instead, we can simply use the `@location` attribute for both the input and output in the function signature directly:
```wgsl
@fragment
fn fragment(@location(0) color: vec4f) -> @location(0) vec4f {
    return color;
}
```

Make the following changes to our `Workshop` class:
* Import the `LightSourceModel` helper class:
```js
import { LightSourceModel } from './common/framework/util/light-source-model.js';
```
* In `init`, create a `LightSourceModel` instance.
  We'll use a sphere in our reference implementation, but feel free to use a different model:
```js
this.lightSourceModel = new LightSourceModel(await this.assetLoader.loadModel('models/sphere.json'));
```
* In `#initResources`, create vertex and index buffers for the new light source model:
```js
this.lightSourceVertexBuffer = this.lightSourceModel.createVertexBuffer(this.device);
this.lightSourceIndexBuffer = this.lightSourceModel.createIndexBuffer(this.device);
```
* In `#initResources`, increase the size of the uniform buffer by another 64 bytes to hold the new light source model's model matrix.
* In `render`, add the light source model's model matrix to the uniform buffer:
```js
const uniformArray = new Float32Array([
    // ...
    ...this.lightSourceModel.modelMatrix,
]);
```
* In `#initPipelines`, change the bind group layout so that the storage buffer containing our light sources is visible in the vertex stage.
  Remember: we're using the same bind group layout for both render pipelines, and in the new shader we're accessing point light data in the vertex stage.
* Then create a new shader module and pipeline using our `light-sources.wgsl` shader.
  This pipeline is almost the same as our other render pipeline. The only difference is the shader module used:
```js
// Its descriptor is almost the same as for the other pipeline. It only uses another shader module.
// We'll use the same bind group and attachments for this pipeline, so we don't need to create anything else here.
const renderLightSourcesCode = await new Loader().loadText('shaders/light-sources.wgsl');
const renderLightSourcesShaderModule = this.device.createShaderModule({ code: renderLightSourcesCode });
this.renderLightSourcesPipeline = this.device.createRenderPipeline({
    vertex: {
        module: renderLightSourcesShaderModule,
        entryPoint: 'vertex',
        buffers: [Vertex.vertexLayout()],
    },
    fragment: {
        module: renderLightSourcesShaderModule,
        entryPoint: 'fragment',
        targets: [{ format: this.gpu.getPreferredCanvasFormat() }],
    },
    // ...
});
```
* In `render`, use the new pipeline in the `renderPass` after the previous `drawIndexed` call but before the `end` call.
  This switches the active pipeline on our `renderPass`. Note that previous settings remain the same: the vertex and index buffers,
  as well as the bind group are still the same. If we issued a draw call now, we would draw the other model now.
```js
// ...
renderPass.drawIndexed(this.model.numIndices);

renderPass.setPipeline(this.renderLightSourcesPipeline); // <- pipeline switch!
// here, we'll set some buffers and call drawIndexed again to render our light sources

renderPass.end();
```
* Set the light source model's vertex and index buffers on the `renderPass`.
* Call `drawIndexed` using `this.numLightSources` as the `instanceCount` argument:
```js
renderPass.drawIndexed(this.lightSourceModel.numIndices, this.numLightSources);
```

And that's it! Congratulations! You have successfully completed this workshop.
We hope you had fun and thank you very much for participating! :)
