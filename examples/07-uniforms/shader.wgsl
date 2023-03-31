struct VertexInput {
    @location(0) position : vec2f,
    @location(1) color : vec4f,
}

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f,
}

struct FragmentInput {
    @location(0) color : vec4f,
}

struct FragmentOutput {
    @location(0) color : vec4f,
}

struct Uniforms {
    offset : vec2f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    return VertexOutput(
        vec4f(input.position + uniforms.offset, 0, 1),
        input.color,
    );
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    return FragmentOutput(
        pow(input.color, vec4f(1 / 2.2)),
    );
}
