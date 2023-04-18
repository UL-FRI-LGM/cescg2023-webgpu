# PART 3: Lighting

In the third part of our workshop, we'll add some light sources to our scene.
We'll learn about storage buffers and run-time sized arrays in WGSL.

## Task 3.1: Add a simple illumination model
To start our illumination adventures, we'll use a static light source that we hard code into our shader and the Lambertian reflectance model which models diffuse surfaces.

We'll make the following changes to our shader:
* Add a function to compute the diffuse illumination:
```wgsl
fn compute_diffuse_lighting(normal: vec3f, light_direction: vec3f) -> f32 {
    return max(0.0, dot(normal, light_direction));
}
```
* Now define a directional light source and call this function from the fragment stage like this:
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

## Task 3.2: Add a static Point Light Source
We now go a step further and add a point light source to our shader.
We'll start with defining a point light source that has a position, a radius and a color.
We'll use its position to determine the direction the light is coming from, and its radius to determine if a fragment is lit by the light source.
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

In order to determine the light's direction, we also need to know the fragment's position.
This means we need to pass it to the fragment stage via our `VertexOutput` / `FragmentInput` struct:
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

Then, we'll add a new function to compute the illumination for our fragments that checks if the fragment is within the light's radius to determine if it is lit or not:
```wgsl
fn compute_lighting(position: vec3f, normal: vec3f, albedo: vec3f) -> vec3f {
    if distance(position, LIGHT_SOURCE.position) > LIGHT_SOURCE.radius {
        return vec3f();
    }

    let light_direction = normalize(LIGHT_SOURCE.position - position);

    let diffuse = compute_diffuse_lighting(normal, light_direction) * LIGHT_SOURCE.color;

    return albedo * diffuse;
}
```

In the fragment stage of our shader, call this function instead of `compute_diffuse_lighting`:
```wgsl
    // ...
    let color = vec4f(compute_lighting(input.position, input.normal, albedo), 1.0);
    // ...
```

With some fragments being completely outside the light's radius, our scene is getting rather dark.
Optionally, add an ambient light source to our shader:
```wgsl
const AMBIENT_LIGHT: vec3f = vec3f(0.1);
let color = vec4f(AMBIENT_LIGHT + compute_lighting(input.position, input.normal, albedo), 1.0);
```

## Task 3.3: Upload a Light Source via a Storage Buffer
Having a light source hard-coded in our shader is not very flexible.
To fix that, we'll store it in a buffer instead.
We already know how to use uniform buffers, but now we want to try something new: storage buffers.
Unlike uniform buffers, data within storage buffers can hold run-time sized arrays and can be altered in compute shaders (see Part 4).

As usual, we first adapt our shader:
* Add a new binding to our bind group to hold an array of point light sources:
```wgsl
@group(0) @binding(3) var<storage, read> uLights : array<PointLight>;
```
* Then, make `compute_lighting` take a light index as an additional argument, and replace usages of `LIGHT_SOURCE`:
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
* Finally, call `compute_lighting` in a loop within the fragment stage of our shader:
```wgsl
    var color = vec4f(AMBIENT_LIGHT, 1.0);
    for (var i = 0u; i < arrayLength(&uLights); i += 1u) {
        color += vec4f(compute_lighting(input.position, input.normal, albedo, i), 0.0);
    }
```

Now, we'll also have to make some changes to our JavaScript file:
* Import `vec3` from `./lib/gl-matrix-module.js`.
* In `#initResources`, create a storage buffer to hold a point light source and upload a light source:
```js
    const pointLightStrideInElements = 8; // 3 (position) + 1 (radius) + 3 (color) + 1 (padding)
    this.pointlightsBuffer = this.device.createBuffer({
        size: Float32Array.BYTES_PER_ELEMENT * pointLightStrideInElements,
        usage: GPUBufferUsage.STORAGE,
        mappedAtCreation: true,
    });
    const pointLightsBufferRange = new Float32Array(this.pointlightsBuffer.getMappedRange());
    pointLightsBufferRange.set(vec3.fromValues(0.0, 1.0, 1.0));     // position
    pointLightsBufferRange.set([2], 3);                             // radius
    pointLightsBufferRange.set(vec3.fromValues(1.0, 1.0, 1.0), 4);  // color
    this.pointlightsBuffer.unmap();
```
* Finally, add our storage buffer to the bind group in `#initPipelines`:
```js
    this.bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
            // ...
            {binding: 3, resource: {buffer: this.pointlightsBuffer}},
        ]
    });
```

## Task 3.4 (bonus): Attenuate Light intensity
Having a hard cut-off for our light sources does not look very nice.
To fix that, we'll attenuate the light's intensity based on its distance to the fragment.
We'll just get rid of the radius and have a light intensity instead.

We only need to make a few changes to our shader:
* Rename the `radius` member of our `PointLight` struct to `intensity`.
* In `compute_lighting`, we compute the distance to the light source to attenuate the intensity:
```wgsl
fn compute_lighting(position: vec3f, normal: vec3f, albedo: vec3f, light_index: u32) -> vec3f {
    let d = distance(position, uLights[light_index].position);
    let attenuation = 1.0 / (1.0 + d + pow(d, 2.0));
    let attenuated_light_color = attenuation * uLights[light_index].color * uLights[light_index].intensity;
    let light_direction = normalize(uLights[light_index].position - position);
    let diffuse = compute_diffuse_lighting(normal, light_direction) * attenuated_light_color;
    return albedo * diffuse;
}
```

## Task 3.5 (bonus): Add multiple Light Sources
We've created a storage buffer and a shader that is flexible enough to handle an arbitrary number of point light sources (with an increased performance cost of course), but we do not use this new power at all!
Instead, we just upload a single light source. Let's fix that!

In the JavaScript file make the following changes:
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
Diffuse lighting is nice, but there has to be something nicer out there.
Indeed, there is: the Phong illumination model is a very simple way of adding specular highlights to our rendered object.
Specular highlights are view dependent, so our shader needs to know where the camera is located.

To use it in our shaders, make the following changes:
* Add a `position` member to our `Camera` struct.
* Add a `Material` struct and create a constant instance of it:
```wgsl
struct Material {
    diffuse: f32,
    specular: f32,
    shininess: f32,
}

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

TODO: changes to JS file!
