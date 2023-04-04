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
    offset : vec2f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

// The texture and sampler are added into the same bind group at different
// binding locations. They cannot be part of the Uniforms struct, because
// they cannot be written to a uniform buffer.
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    return VertexOutput(
        vec4f(input.position + uniforms.offset, 0, 1),
        input.texcoord,
    );
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    return FragmentOutput(
        // To sample a color from a texture, we specifiy the texture,
        // sampler and texture coordinates.
        textureSample(uTexture, uSampler, input.texcoord),
    );
}
