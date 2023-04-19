# PART 3: Lighting

In the third part of our workshop, we'll add some light sources to our scene.
We'll learn about storage buffers and explore the WebGPU Shading Language ([WGSL](https://www.w3.org/TR/WGSL/)) a little bit further.
We'll see how to use constant declarations and runtime-sized arrays, and we'll scratch the surface of the topic of pointers in WGSL.

## Task 3.1: Add a simple illumination model
To start our illumination adventures, we'll use a static directional light source that we hard code into our shader.
For a directional light source, the light's direction is constant, so all we need to do is define a direction.
We'll use the [Lambertian reflectance](https://en.wikipedia.org/wiki/Lambertian_reflectance) model to compute how the bunny reflects light when it is made of a perfect diffuse material.

We'll make the following changes to our shader:
* Add a function to compute the diffuse illumination:
```wgsl
fn compute_diffuse_lighting(normal: vec3f, light_direction: vec3f) -> f32 {
    return max(0.0, dot(normal, light_direction));
}
```
* Now define a hard coded directional light source and call this function from the fragment stage like this:
```wgsl
fn fragment(input : FragmentInput) -> FragmentOutput {
    let albedo = textureSample(uTexture, uSampler, input.texcoord).rgb;
    let light_direction = normalize(vec3<f32>(0.0, 1.0, 1.0));
    let color = vec4f(compute_diffuse_lighting(input.normal, light_direction) * albedo, 1.0);
    return FragmentOutput(
        color,
    );
}
```

That's it! Our 3D model is now lit by a directional light source.

## Task 3.2: Add a static Point Light Source
We now go a step further and add a point light source to our shader.
We'll start with defining a point light source that has a position, a radius and a color:
We'll use its position to determine the direction the light is coming from, and its radius to determine if a fragment is close enough to the light source that it could be lit by it.
First, define the struct and create a constant instance of it in the shader:
```wgsl
struct PointLight {
    position: vec3f,
    radius: f32,
    color: vec3f,
}

const LIGHT_SOURCE: PointLight = PointLight(
    vec3(0.0, 1.0, 1.0),    // position
    2.0f,                   // radius
    vec3(1.0, 1.0, 1.0),    // color
);
```

Now that we've defined a light source, we can replace the directional light source from the previous step.
Make the following changes to the shader:
* For a point light, in order to determine the light's direction, we also need to know the fragment's position.
  Pass the position in world space to the fragment shader via the `VertexOutput` / `FragmentInput` structs:
```wgsl
struct VertexOutput {
    @builtin(position) clip_position: vec4f,
    @location(0) position: vec3f,       // <- world positions are at location 0
    @location(1) normal: vec3f,         // <- normals are at location 1
    @location(2) texcoord: vec2f,       // <- texcoords are at location 2
}

struct FragmentInput {
    @location(0) position: vec3f,   // <- world positions are at location 0
    @location(1) normal: vec3f,     // <- normals are at location 1
    @location(2) texcoord: vec2f,   // <- texcoords are at location 2
}

@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    let world_position = uniforms.model * vec4f(input.position, 1);
    return VertexOutput(
        uniforms.camera.projection * uniforms.camera.view * world_position,
        world_position.xyz,
        // ...
    );
}
```
* Create a new function to compute the illumination for a fragment and call it from the fragment stage:
```wgsl
fn compute_lighting(position: vec3f, normal: vec3f, albedo: vec3f) -> vec3f {
    let light_direction = normalize(vec3<f32>(0.0, 1.0, 1.0));
    return compute_diffuse_lighting(input.normal, light_direction) * albedo;
}
```
* Use the light source's radius, to determine if the fragment is affected by the light source or not. If the fragment is not within the light's radius, the color should be black. The built-in `distance` function returns the distance between two points:
```wgsl
distance(position, LIGHT_SOURCE.position)
```
* Compute the light direction based on the light source's position and the fragment's position, and replace the constant light direction:
```wgsl
let light_direction = normalize(LIGHT_SOURCE.position - position);
```
* Multiply the light source's color (`LIGHT_SOURCE.color`) with the result of `compute_diffuse_lighting`. Feel free to change the light's color to see the effects.
* With some fragments being completely outside the light's radius, our scene is getting rather dark. Optionally, add an ambient light source to our shader:
```wgsl
const AMBIENT_LIGHT: vec3f = vec3f(0.1);
let color = vec4f(AMBIENT_LIGHT + compute_lighting(input.position, input.normal, albedo), 1.0);
```

## Task 3.3: Upload a Light Source via a Storage Buffer
Having a light source hard-coded in our shader is not very flexible.
To fix that, we'll create the light source from the JavaScript side and upload it to the GPU via a buffer instead.
We already know how to use uniform buffers, but now we want to try something new: storage buffers.
Unlike uniform buffers, data within storage buffers can hold atomics and runtime-sized arrays, and they can be altered in compute shaders (see Part 4).
In shaders, storage buffer bindings are defined using `var<storage>`. Optionally, we can also define an access mode.
They come in two flavors: `read` (default), and `read_write`. Since we don't want to change our light sources (yet), we'll stick to the default for now.

In contrast to the fixed-sized arrays we used in Part 1 to define a triangle's vertices within a shader, the length of a runtime-sized array is not known to the shader at compile time.
Instead its length can be queried using the [built-in `arrayLength` function](https://www.w3.org/TR/WGSL/#arrayLength-builtin).
This function takes as its only argument a pointer to a runtime-sized array.
In WGSL, we can create a pointer to a variable using `&`, e.g., like so:
```wgsl
var i: i32 = 0;
let pointer = &i;
```
This is everything we need to know about pointers for this workshop.
If you want to know more about how to use them as function parameters etc., check out [the specification](https://www.w3.org/TR/WGSL/#ref-ptr-types).

With that out of the way, let's give our `Workshop` class a little more control over light sources!
We'll first adapt our shader:
* Add a new binding to our bind group to hold an array of point light sources:
```wgsl
@group(0) @binding(3) var<storage, read> uLights : array<PointLight>;
```
* Then, make `compute_lighting` take a light index (`u32`) as an additional argument, and replace all usages of `LIGHT_SOURCE` with buffer accesses (`uLights[light_index]`):
```wgsl
fn compute_lighting(position: vec3f, normal: vec3f, albedo: vec3f, light_index: u32) -> vec3f {
    if distance(position, uLights[light_index].position) > uLights[light_index].radius {
        return vec3f();
    }
    let light_direction = normalize(uLights[light_index].position - position);
    let diffuse = compute_diffuse_lighting(normal, light_direction) * uLights[light_index].color;
    return albedo * diffuse;
}
```
* Finally, loop over the light sources in our buffer and call `compute_lighting` on each of them within the fragment stage of our shader:
```wgsl
var color = vec4f(AMBIENT_LIGHT, 1.0);
for (var i = 0u; i < arrayLength(&uLights); i += 1u) {
    color += vec4f(compute_lighting(input.position, input.normal, albedo, i), 0.0);
}
```

Now, we'll also have to make some changes to our `Workshop` class:
* Import `vec3` from `./lib/gl-matrix-module.js`.
* In `#initResources`, create a buffer with the `STORAGE` buffer usage to hold a point light source. **Our light sources consists of a `vec3<f32>`, an `f32`, another `vec3<f32>`, and (because of the [alignment and structure member layout rules](https://www.w3.org/TR/WGSL/#alignment-and-size)) an additional `f32` for padding:**
```js
const pointLightStrideInElements = 8; // 3 (position) + 1 (radius) + 3 (color) + 1 (padding)
this.pointlightsBuffer = this.device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * pointLightStrideInElements,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
});
```
* Then, get the mapped range of the storage buffer and fill it with a point light source:
```js
const pointLightsBufferRange = new Float32Array(this.pointlightsBuffer.getMappedRange());
pointLightsBufferRange.set(vec3.fromValues(0.0, 1.0, 1.0));     // position, offset = 0
pointLightsBufferRange.set([2], 3);                             // radius,   offset = 3
pointLightsBufferRange.set(vec3.fromValues(1.0, 1.0, 1.0), 4);  // color,    offest = 4
this.pointlightsBuffer.unmap();
```
* In `#initPipelines`, add the new storage buffer binding layout to the bind group layout. Unlike a uniform buffer binding layout, we need to explicitly state the [buffer binding layout's type](https://www.w3.org/TR/webgpu/#enumdef-gpubufferbindingtype):
```js
// storage buffer
{
    binding: 3,
    visibility: GPUShaderStage.FRAGMENT,
    buffer: {
        type: 'read-only-storage', // allowed values are 'uniform' (default), 'storage', and 'read-only-storage'
    }
}
```
* Finally, add our storage buffer to the bind group in `#initPipelines`:
```js
this.bindGroup = this.device.createBindGroup({
    // ...
    entries: [
        // ...
        {binding: 3, resource: {buffer: this.pointlightsBuffer}},
    ]
});
```

## Task 3.4 (bonus): Attenuate Light intensity
Having a hard cut-off for our light sources does not look very nice.
To fix that, we'll attenuate the light's intensity based on its distance to the fragment and the [inverse-square law](https://en.wikipedia.org/wiki/Inverse-square_law).
We'll just get rid of the radius and have a light intensity instead.

We only need to make a few changes to our shader:
* Rename the `radius` member of our `PointLight` struct to `intensity`.
* In `compute_lighting`, we compute the distance to the light source to attenuate the intensity:
```wgsl
fn compute_lighting(position: vec3f, normal: vec3f, albedo: vec3f, light_index: u32) -> vec3f {
    let d = distance(position, uLights[light_index].position);
    let attenuation = 1.0 / (0.5 + pow(d, 2.0)); // we'll add a constant factor of 0.5 to avoid the singularity at d = 0
    let attenuated_light_color = attenuation * uLights[light_index].color * uLights[light_index].intensity;
    // ...
    let diffuse = compute_diffuse_lighting(normal, light_direction) * attenuated_light_color;
    // ...
}
```

## Task 3.5 (bonus): Add multiple Light Sources
We've created a storage buffer and a shader that is flexible enough to handle an arbitrary number of point light sources (with an increased performance cost of course), but we do not use this new power at all!
Instead, we just upload a single light source. Let's fix that!

In our `Workshop` class make the following changes:
* Make the storage buffer hold `n` light sources.
* Create `n` light sources and store them in the buffer, e.g., like so:
```js
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
```

## Task 3.6 (bonus): Use the Phong Illumination Model
Diffuse lighting is nice, but we want something more shiny!
The [Phong illumination model](https://en.wikipedia.org/wiki/Phong_reflection_model) is a very simple way of adding specular highlights to our rendered object.
The model uses material constants to control the diffuse and specular reflectance of a surface.
We'll represent these in a new `Material` struct in our shader:
```wgsl
struct Material {
    diffuse: f32,   // for diffuse reflections
    specular: f32,  // for specular reflections
    shininess: f32, // also for specular reflections
}
```

Now, let's implement the actual illumination model in our shader:
* Specular highlights are view dependent, so our shader needs to know where the camera is located.
  Add a `position` member to our `Camera` struct. **This will add another `vec4` worth of bytes to our uniform buffer's size!**
* Create a constant `Material` instance in the shader as we did for the constant point light source earlier:
```wgsl
const MATERIAL: Material = Material(
    1,  // diffuse
    1,  // specular
    50, // shininess
);
```
* In `compute_diffuse_lighting`, multiply the result with `MATERIAL.diffuse`.
* Add the function `compute_specular_lighting`:
```wgsl
fn compute_specular_lighting(position: vec3f, normal: vec3f, light_direction: vec3f) -> f32 {
    let view_direction = normalize(uniforms.camera.position - position);
    let reflection_vector = reflect(-light_direction, normal);
    return pow(max(0.0, dot(light_direction, reflection_vector)), MATERIAL.shininess) * MATERIAL.specular;
}
```
* In `compute_lighting`, call `compute_specular_lighting` and add it to the result:
```wgsl
fn compute_lighting(position: vec3f, normal: vec3f, albedo: vec3f, light_index: u32) -> vec3f {
    // ...
    let specular = compute_specular_lighting(position, normal, light_direction) * attenuated_light_color;
    return albedo * diffuse + specular;
}
```

Then, make the following changes to our `Workshop` class:
* In `#initResources`, increase the size of our uniform buffer to hold another `vec4<f32>`.
* Our shader now uses the uniform buffer in the vertex and the fragment stage. Make sure our bind group layout reflects this in `#initPipelines`.
* In `render`, upload the camera's position (`this.camera.position`) to our uniform buffer.

Congratulations! You've successfully implemented the Phong illumination model!
