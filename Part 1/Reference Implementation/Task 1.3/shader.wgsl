struct VertexInput {
    @builtin(vertex_index) vertexIndex : u32,
}

struct VertexOutput {
    @builtin(position) position : vec4f,
    // We are outputting vertex colors to the interpolant location 0.
    @location(0) color : vec4f,
}

struct FragmentInput {
    @builtin(position) position : vec4f,
    // The colors from the shaders then get interpolated by the hardware
    // and passed to the fragment shader using the same interpolant location.
    @location(0) color : vec4f,
}

struct FragmentOutput {
    @location(0) color : vec4f,
}

const positions = array<vec2f, 3>(
    vec2f( 0.0,  0.5),
    vec2f(-0.5, -0.5),
    vec2f( 0.5, -0.5),
);

const colors = array<vec4f, 3>(
    vec4f(1, 0, 0, 1),
    vec4f(0, 1, 0, 1),
    vec4f(0, 0, 1, 1),
);

@vertex
fn vertex(input : VertexInput) -> VertexOutput {
    var output : VertexOutput;
    output.position = vec4f(positions[input.vertexIndex], 0, 1);
    output.color = colors[input.vertexIndex];
    return output;
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    var output : FragmentOutput;
    output.color = pow(input.color, vec4f(1 / 2.2));
    return output;
}
