// Both vertex attributes now come from buffers.
// We use locations 0 and 1 to refer to them from JavaScript.

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

@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    return VertexOutput(
        vec4f(input.position, 0, 1),
        input.color,
    );
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    return FragmentOutput(
        pow(input.color, vec4f(1 / 2.2)),
    );
}
