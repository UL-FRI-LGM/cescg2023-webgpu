# PART 4: Color Attachments & Compute Shaders

In the final part of our workshop, we'll get to know the shiny new first-class citizen for GPU programming in the browser: compute shaders!
We'll use a compute pipeline to animate the light sources in our scene.

Then, as a bonus, we'll take a look at offscreen rendering, rendering into
multiple attachments, and finally also deferred shading.

## Introduction to Compute Shaders

Like vertex and fragment shader stages, a compute shader stage needs an entry point annotated with `@compute` attribute.
While vertex and fragment shaders are invoked via draw calls, compute shaders are invoked via dispatching workgroups.
Each workgroup in a dispatch starts [a number of threads](https://www.w3.org/TR/webgpu/#dom-supported-limits-maxcomputeinvocationsperworkgroup) that is defined in the shader.
Each thread has a local id that uniquely identifies it within the workgroup, as well as a global id that uniquely identifies it within all workgroups.
The strategy used to assign thread ids is defined in the shader, using the [required `@workgroup_size(x[,y[,z]])` entry point attribute](https://www.w3.org/TR/WGSL/#entry-point-attributes).
For example, you can imagine that the local invocation id for each thread in a workgroup is computed like this:
```wgsl
for (var x = 0; x < workGroupSize.x; ++x) {
    for (var y = 0; y < workGroupSize.y; ++y) {
        for (var z = 0; z < workGroupSize.z; ++z) {
            const local_invocation_id = vec3u(x, y, z);
        }
    }
}
```

On the JavaScript side, workgroups can be dispatched using the [dispathWorkgroups](https://www.w3.org/TR/webgpu/#dom-gpucomputepassencoder-dispatchworkgroups)
or [dispatchWorkgroupsIndirect](https://www.w3.org/TR/webgpu/#dom-gpucomputepassencoder-dispatchworkgroupsindirect) methods
of a [GPUComputePassEncoder](https://www.w3.org/TR/webgpu/#gpucomputepassencoder) created from a [GPUCommandEncoder](https://www.w3.org/TR/webgpu/#gpucommandencoder).
We'll only use `dispathWorkgroups` in this workshop. Its arguments are the number of workgroups to dispatch in each dimension (x, y, and z).
For example, when dispatching 6 workgroups in the x dimension (`encoder.dispatchWorkgroups(6)`), using a compute shader
with a workgroup size of 64 in x (`@workgroup_size(64)`), a total of `6 * 64 = 384` threads will be executed on the GPU.

When compute shaders are used to process an array of data, each thread typically only processes a single (or a small number of) element(s) in the array.
In such cases, a thread's global invocation id is often used as an index into the array to process.
It can be accessed via the [built-in `global_invocation_id`](https://www.w3.org/TR/WGSL/#builtin-values)., e.g.:
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
However, since instead of telling the `GPUComputePassEncoder` the exact number of threads we want to use, we dispatch workgroups consisting of multiple threads depending on the shaders workgroup size.
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
going to use a compute shader to change positions of our light sources.

* As a first step, create a new shader file in the project's root directory and name it `animate-lights.wgsl`.
* Define the entry point to our compute shader with a workgroup size of 64 in the x dimension, and none (i.e., implicitly 1) in y and z dimensions. 
  In our compute shader, we'll spawn a thread for each light source in the storage buffer and use the thread's global id to determine which light source it should process.
  A thread's global id can be accessed in the shader via the [built-in `global_invocation_id`](https://www.w3.org/TR/WGSL/#builtin-values).
  Since our storage buffer contains a 1D array, we'll only specify a 1D workgroup size, and use the x component of the `global_invocation_id`:
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
* Add the storage buffer containing our light sources as a binding for our compute shader.
  Unlike earlier, we want our compute shader to make changes to the buffer's contents, so we need to specify it as `read_write`:
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
    if global_id.x  >= arrayLength(&uLights) {
        return;
    }
    // move light sources ...
}
```
* Add the logic to move light sources up or down between a minimum and maximum y position of 0 and 1 respectively.
  We'll use the `direction` member of a `PointLight` to determine if it is going up (`direction == 1`) or down (`direction == 0`).
  Additionally, we'll add a constant movement speed.
  If a light source reached either the minimum or maximum y position, we'll change the direction of the light source:
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
const animateLightsShaderCode = await new Loader().loadText('animate-lights.wgsl');
const animateLightsShaderModule = this.device.createShaderModule({code: animateLightsShaderCode});
const animateLightsPipeline = this.device.createComputePipeline({
    layout: 'auto',
    compute: {
        module: animateLightsShaderModule,
        entryPoint: 'compute',
    }
});
```
* Then add a bind group for our new pipeline:
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
  To determine the number of workgroups we need to dispatch by dividing the number of light source by the workgroup size of our compute shader:
```js
const animateLightsPass = commandEncoder.beginComputePass();
animateLightsPass.setPipeline(this.animateLightsPipelineData.pipeline);
animateLightsPass.setBindGroup(0, this.animateLightsPipelineData.bindGroup);
animateLightsPass.dispatchWorkgroups(
    Math.ceil(this.numLightSources / 64) // divide by our shader's workgroup size
);
animateLightsPass.end();
```

And that's it! You've made your first steps in the world of WebGPU compute shaders.

## 4.2 Control the Workgroup Size from the JavaScript Side
Having to maintain the workgroup size of a compute shader not only in the shader file but also on the JavaScript side can easily lead to errors.
It would be nice to have this only in one place, preferably on the JavaScript side, where we can control it.
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
* Then add the workgroup size to our `animateLightsPipelineData` helper object, so we be sure to use the same workgroup size in `render` later:
```js
this.animateLightsPipelineData = {
    pipeline: animateLightsPipeline,
    bindGroup: animateLightsBindGroup,
    workGroupSize: animateLightsWorkGroupSize,
}
```
* Finally, use the workgroup size we defined for our pipeline in `render`:
```js
const animateLightsPass = commandEncoder.beginComputePass();
// ...
animateLightsPass.dispatchWorkgroups(
    Math.ceil(this.numLightSources / this.animateLightsPipelineData.workGroupSize.x)
);
animateLightsPass.end();
```

## Task 4.3: Render Light Sources
