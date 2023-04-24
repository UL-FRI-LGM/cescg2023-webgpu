struct VertexInput {
    @location(0) position : vec2f,
    @location(1) texcoord : vec2f,
}

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) texcoord : vec2f,
}

struct FragmentInput {
    @location(0) texcoord : vec2f,
}

struct FragmentOutput {
    @location(0) color : vec4f,
}

struct Uniforms {
    translation : vec2f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    return VertexOutput(
        vec4f(input.position + uniforms.translation, 0, 1),
        input.texcoord,
    );
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    return FragmentOutput(
        textureSample(uTexture, uSampler, input.texcoord),
    );
}
