// The vertex positions are hardcoded as an array. We can use the vertex stage
// built-in variable vertex_index to access these positions.
const positions = array<vec2f, 3>(
    vec2f( 0.0,  0.5),
    vec2f(-0.5, -0.5),
    vec2f( 0.5, -0.5),
);

@vertex
fn vertex(
    @builtin(vertex_index) vertexIndex : u32,
) -> @builtin(position) vec4f {
    return vec4f(positions[vertexIndex], 0, 1);
}

@fragment
fn fragment(
) -> @location(0) vec4f {
    return vec4f(1, 0.6, 0.2, 1);
}
