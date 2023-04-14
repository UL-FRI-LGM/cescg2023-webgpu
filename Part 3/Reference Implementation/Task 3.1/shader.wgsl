struct VertexInput {
    @location(0) position: vec3f,   // <- positions are 3D now
    @location(1) normal: vec3f,     // <- each vertex now has a 3D normal
    @location(2) texcoord: vec2f,   // <- texcoords are now in location 2
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,         // <- normals are at location 0
    @location(1) texcoord: vec2f,       // <- texcoords are at location 1
}

struct FragmentInput {
    @location(0) normal: vec3f,     // <- normals are at location 0
    @location(1) texcoord: vec2f,   // <- texcoords are at location 1
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

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    let position = uniforms.model * vec4f(input.position, 1);
    let normal = (uniforms.model * vec4f(input.normal, 0)).xyz;

    return VertexOutput(
        uniforms.camera.projection * uniforms.camera.view * position,
        normalize(normal),
        input.texcoord,
    );
}

// Task 3.1: compute diffuse lighting (Lambertian reflection)
fn compute_diffuse_lighting(normal: vec3f, light_direction: vec3f) -> f32 {
    return max(0.0, dot(normal, light_direction));
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    // Task 3.1: compute diffuse lighting (Lambertian reflection)
    let albedo = textureSample(uTexture, uSampler, input.texcoord).rgb;
    let light_direction = normalize(vec3<f32>(0.0, 1.0, 1.0));
    let color = vec4f(compute_diffuse_lighting(input.normal, light_direction) * albedo, 1.0);
    return FragmentOutput(
        color,
    );
}
