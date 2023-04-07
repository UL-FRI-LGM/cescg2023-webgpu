struct VertexInput {
    @location(0) position: vec3f,   // <- positions are 3D now
    @location(1) normal: vec3f,     // <- each vertex now has a 3D normal
    @location(2) texcoord: vec2f,   // <- texcoords are now in location 2
}

struct VertexOutput {
    @builtin(position) clip_position: vec4f,
    // Task 3.1: pass position in world space to fragment shader
    @location(0) position: vec3f,       // <- world positions are at location 0
    @location(1) normal: vec3f,         // <- normals are at location 1
    @location(2) texcoord: vec2f,       // <- texcoords are at location 2
}

struct FragmentInput {
    // Task 3.1: pass position in world space to fragment shader
    @location(0) position: vec3f,   // <- world positions are at location 0
    @location(1) normal: vec3f,     // <- normals are at location 1
    @location(2) texcoord: vec2f,   // <- texcoords are at location 2
}

struct FragmentOutput {
    @location(0) color: vec4f,
}

struct Camera {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
}

// we add new render modes to switch between displaying a textured model or the model's normals
const MODE_TEXTURE: u32 = 0u;
const MODE_NORMALS: u32 = 1u;

struct Uniforms {
    camera: Camera,
    model: mat4x4<f32>, // <- instead of a 2D offset, we now use a transformation matrix for our model
    mode: u32,          // <- we add a new variable to switch between render modes
}

// Task 3.1: add a PointLight struct
struct PointLight {
    position: vec3f,
    radius: f32,
    color: vec3f,
}

// Task 3.1: add a constant ambient light
const AMBIENT_LIGHT: vec3f = vec3f(0.1);

// Task 3.1: add a constant diffuse reflection coefficient
const DIFFUSE_REFLECTIVITY: f32 = 1.0;

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
// Task 3.2: add a storage buffer binding to hold our point light sources
@group(0) @binding(3) var<storage, read> uLights : array<PointLight>;

@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    let position = uniforms.model * vec4f(input.position, 1);
    let normal = (uniforms.model * vec4f(input.normal, 0)).xyz;

    return VertexOutput(
        uniforms.camera.projection * uniforms.camera.view * position,
        position.xyz,
        normalize(normal),
        input.texcoord,
    );
}

// Task 3.1: compute diffuse lighting (Lambertian reflection)
fn compute_diffuse_lighting(normal: vec3f, light_direction: vec3f) -> f32 {
    return max(0.0, dot(normal, light_direction)) * DIFFUSE_REFLECTIVITY;
}

// Task 3.2: compute diffuse lighting for light source with index `light_index`
fn compute_lighting(position: vec3f, normal: vec3f, albedo: vec3f, light_index: u32) -> vec3f {
    // Task 3.1: ignore the light source if it is too far away from the current fragment
    if distance(position, uLights[light_index].position) > uLights[light_index].radius {
        return vec3f();
    }

    let light_direction = normalize(uLights[light_index].position - position);

    let diffuse = compute_diffuse_lighting(normal, light_direction) * uLights[light_index].color;

    return albedo * diffuse;
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    let albedo = textureSample(uTexture, uSampler, input.texcoord).rgb;

    // Task 3.2: compute lighting for each light source
    var color = vec4f(AMBIENT_LIGHT, 1.0);
    for (var i = 0u; i < arrayLength(&uLights); i += 1u) {
        color += vec4f(compute_lighting(input.position, input.normal, albedo, i), 0.0);
    }

    if uniforms.mode == MODE_NORMALS {
        color = vec4f(input.normal, 1.0);
    }

    return FragmentOutput(
        color,
    );
}
