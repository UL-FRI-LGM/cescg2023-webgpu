struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) texcoord : vec2<f32>,
};

// the vertices and texture coordinates are stored directly in the shader and accessed via their index
const VERTICES: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
    vec2<f32>( 1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(-1.0,  1.0)
);

const TEXCOORDS: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 0.0)
);

@group(0) @binding(0) var uTexture : texture_2d<f32>;
@group(0) @binding(1) var uSampler : sampler;

@vertex
fn vertex(@builtin(vertex_index) vertex_index : u32) -> VertexOutput {
    return VertexOutput(
        vec4<f32>(VERTICES[vertex_index], 0.0, 1.0),
        TEXCOORDS[vertex_index],
    );
}

@fragment
fn fragment(@location(0) texcoord : vec2<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(textureSample(uTexture, uSampler, texcoord));
}
