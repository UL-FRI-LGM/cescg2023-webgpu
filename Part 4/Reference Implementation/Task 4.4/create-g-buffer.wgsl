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

// Task 4.4: only render to G-Buffer render targets
struct FragmentOutput {
    @location(0) albedo: vec4f,
    @location(1) position: vec4f,
    @location(2) normal: vec4f,
}

struct Camera {
    // Task 3.6: add the camera's position to our Camera struct
    //   this will require 16 more bytes: 12 for the vec3f and 4 for padding
    //   we can make this explicit by adding the @size annotation
    @size(16) position: vec3f,
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
}

struct Uniforms {
    camera: Camera,
    model: mat4x4<f32>, // <- instead of a 2D offset, we now use a transformation matrix for our model
}

// Task 4.4: remove all lighting related structs

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
// Task 4.4: remove light source buffer bind point

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

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    // Task 4.4: only output G-Buffer
    return FragmentOutput(
        textureSample(uTexture, uSampler, input.texcoord),
        vec4f(input.position, 1.0),
        vec4f(input.normal, 1.0),
    );
}
