struct VertexInput {
    @builtin(vertex_index) vertexIndex : u32,
}

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f,
}

struct FragmentInput {
    @builtin(position) position : vec4f,
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
    return VertexOutput(
        vec4f(positions[input.vertexIndex], 0, 1),
        colors[input.vertexIndex],
    );
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    return FragmentOutput(
        pow(input.color, vec4f(1 / 2.2)),
    );
}
