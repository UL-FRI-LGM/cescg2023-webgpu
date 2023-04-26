struct VertexInput {
    @location(0) position: vec3f,   // <- positions are 3D now
    @location(1) normal: vec3f,     // <- each vertex now has a 3D normal
    @location(2) texcoord: vec2f,   // <- texcoords are now in location 2
}

struct VertexOutput {
    @builtin(position) clip_position: vec4f,
    // Task 3.2: pass position in world space to fragment shader
    @location(0) position: vec3f,       // <- world positions are at location 0
    @location(1) normal: vec3f,         // <- normals are at location 1
    @location(2) texcoord: vec2f,       // <- texcoords are at location 2
}

struct FragmentInput {
    // Task 3.2: pass position in world space to fragment shader
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

struct Uniforms {
    camera: Camera,
    model: mat4x4<f32>, // <- instead of a 2D offset, we now use a transformation matrix for our model
}

// Task 3.2: add a PointLight struct
struct PointLight {
    position: vec3f,
    radius: f32,
    color: vec3f,
}

// Task 3.2: add a constant instance of our PointLight struct
const LIGHT_SOURCE: PointLight = PointLight(
    vec3(0, 1, 1),    // position
    2,                // radius
    vec3(1, 1, 1),    // color
);

// Task 3.2: add a constant ambient light
const AMBIENT_LIGHT: vec3f = vec3f(0.1);

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    let position = uniforms.model * vec4f(input.position, 1);
    let normal = (uniforms.model * vec4f(input.normal, 0)).xyz;

    // Task 3.2: pass the world space position to the fragment stage
    return VertexOutput(
        uniforms.camera.projection * uniforms.camera.view * position,
        position.xyz,
        normalize(normal),
        input.texcoord,
    );
}

// Task 3.1: compute diffuse lighting (Lambertian reflection)
fn computeDiffuseLighting(normal: vec3f, lightDirection: vec3f) -> f32 {
    return max(0, dot(normal, lightDirection));
}

// Task 3.2: compute diffuse lighting (Lambertian reflection)
fn computeLighting(position: vec3f, normal: vec3f, albedo: vec3f) -> vec3f {
    // Task 3.2: ignore the light source if it is too far away from the current fragment
    if distance(position, LIGHT_SOURCE.position) > LIGHT_SOURCE.radius {
        return vec3f();
    }

    let lightDirection = normalize(LIGHT_SOURCE.position - position);

    let diffuse = computeDiffuseLighting(normal, lightDirection) * LIGHT_SOURCE.color;

    return albedo * diffuse;
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    let albedo = textureSample(uTexture, uSampler, input.texcoord).rgb;
    // Task 3.2: call compute lighting here
    let color = vec4f(AMBIENT_LIGHT + computeLighting(input.position, input.normal, albedo), 1);
    return FragmentOutput(
        color,
    );
}
