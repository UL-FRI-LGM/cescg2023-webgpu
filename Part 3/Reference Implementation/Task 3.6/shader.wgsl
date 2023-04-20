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

struct FragmentOutput {
    @location(0) color: vec4f,
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

// Task 3.2: add a PointLight struct
struct PointLight {
    position: vec3f,
    // Task 3.4 (bonus): rename radius -> intensity
    intensity: f32,
    color: vec3f,
}

// Task 3.2: add a constant instance of our PointLight struct
const LIGHT_SOURCE: PointLight = PointLight(
    vec3(0.0, 1.0, 1.0),    // position
    2.0f,                   // intensity
    vec3(1.0, 1.0, 1.0),    // color
);

// Task 3.2: add a constant ambient light
const AMBIENT_LIGHT: vec3f = vec3f(0.1);

// Task 3.6: add a Material struct
struct Material {
    diffuse: f32,
    specular: f32,
    shininess: f32,
}

// Task 3.6: create a constant instance of our Material struct
const MATERIAL: Material = Material(
    1,  // diffuse
    1,  // specular
    50, // shininess
);

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
// Task 3.3: add a storage buffer binding to hold our point light sources
@group(0) @binding(3) var<storage, read> uLights : array<PointLight>;

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

// Task 3.1: compute diffuse lighting (Lambertian reflection)
fn compute_diffuse_lighting(normal: vec3f, light_direction: vec3f) -> f32 {
    // Task 3.5: take the material into account
    return max(0.0, dot(normal, light_direction)) * MATERIAL.diffuse;
}

// Task 3.6: compute specular lighting
fn compute_specular_lighting(position: vec3f, normal: vec3f, light_direction: vec3f) -> f32 {
    let view_direction = normalize(uniforms.camera.position - position);
    let reflection_vector = reflect(-light_direction, normal);
    return pow(max(0.0, dot(view_direction, reflection_vector)), MATERIAL.shininess) * MATERIAL.specular;
}

// Task 3.3: compute diffuse lighting for light source with index `light_index`
fn compute_lighting(position: vec3f, normal: vec3f, albedo: vec3f, light_index: u32) -> vec3f {
    // Task 3.4 (bonus): attenuate light color based on the light source's distance to the fragment
    let d = distance(position, uLights[light_index].position);
    let attenuation = 1.0 / (0.5 + pow(d, 2.0));
    let attenuated_light_color = attenuation * uLights[light_index].color * uLights[light_index].intensity;

    let light_direction = normalize(uLights[light_index].position - position);

    let diffuse = compute_diffuse_lighting(normal, light_direction) * attenuated_light_color;

    // Task 3.6: compute specular lighting
    let specular = compute_specular_lighting(position, normal, light_direction) * attenuated_light_color;

    return albedo * diffuse + specular;
}

@fragment
fn fragment(input : FragmentInput) -> FragmentOutput {
    let albedo = textureSample(uTexture, uSampler, input.texcoord).rgb;
    // Task 3.3: compute lighting for each light source in our buffer
    var color = vec4f(AMBIENT_LIGHT, 1.0);
    for (var i = 0u; i < arrayLength(&uLights); i += 1u) {
        color += vec4f(compute_lighting(input.position, input.normal, albedo, i), 0.0);
    }
    return FragmentOutput(
        color,
    );
}
