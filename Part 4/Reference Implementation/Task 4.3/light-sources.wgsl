struct VertexInput {
    @builtin(instance_index) instance : u32,
    @location(0) position : vec3f,
}

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f,
}

struct Camera {
    @size(16) position: vec3f,
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
}

struct Uniforms {
    camera: Camera,
    model: mat4x4<f32>,
    // Task 4.3: add a light transform matrix to our uniform buffer
    light: mat4x4<f32>,
}

struct PointLight {
    position: vec3f,
    intensity: f32,
    color: vec3f,
    // Task 4.1: until now, the PointLight struct used 4 bytes for padding. we can use this to store a movement state in each light
    direction: u32,
}

// Although we use only use the uniforms and light sources, we'll still use the same bind group object.
// We need to make sure the binding numbers match the binding number in our other shader (shader.wgsl)
@group(0) @binding(0) var<uniform> uniforms : Uniforms;
// @binding(1) not used
// @binding(2) not used
@group(0) @binding(3) var<storage, read> uLights : array<PointLight>;

@vertex
fn vertex(input: VertexInput) -> VertexOutput {
    let position = (uniforms.light * vec4f(input.position, 1)).xyz + uLights[input.instance].position;

    return VertexOutput(
        uniforms.camera.projection * uniforms.camera.view * vec4f(position, 1),
        vec4f(uLights[input.instance].color, 1),
    );
}

@fragment
fn fragment(@location(0) color: vec4f) -> @location(0) vec4f {
    return color;
}
