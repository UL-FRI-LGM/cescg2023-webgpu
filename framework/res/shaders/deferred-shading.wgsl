struct Camera {
    // Task 3.5: add the camera's position to our Camera struct
    //   this will require 16 more bytes: 12 for the vec3f and 4 for padding
    //   we can make this explicit by adding the @size annotation
    @size(16) position: vec3f,
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
}

struct Uniforms {
    camera: Camera,
    model: mat4x4<f32>, // <- instead of a 2D offset, we now use a transformation matrix for our model
    mode: u32,          // <- we add a new variable to switch between render modes
}

// Task 3.1: add a PointLight struct
struct PointLight {
    position: vec3f,
    // Task 3.3: we use a fragment's distance to the light source instead of making a hard cut at a certain distance
    //           so instead of storing a radius in the light source, we store its intensity to control its overall brightness
    intensity: f32,
    color: vec3f,
}

// Task 3.1: add a constant ambient light
const AMBIENT_LIGHT: vec3f = vec3f(0.1);

// Task 3.5: add a Material struct
struct Material {
    diffuse: f32,
    specular: f32,
    shininess: f32,
}

// Task 3.5: replace constant DIFFUSE_REFLECTIVITY with a constant instance of our Material struct
const MATERIAL: Material = Material(
    1,  // diffuse
    1,  // specular
    50, // shininess
);

// G-Buffer
@group(0) @binding(0) var gAlbedo : texture_2d<f32>;
@group(0) @binding(1) var gPositions : texture_2d<f32>;
@group(0) @binding(2) var gNormals : texture_2d<f32>;

// uniforms & light sources
@group(0) @binding(3) var<uniform> uniforms : Uniforms;
// Task 3.2: add a storage buffer binding to hold our point light sources
@group(0) @binding(4) var<storage, read> uLights : array<PointLight>;

// output texture
@group(0) @binding(5) var output : texture_storage_2d<rgba8unorm, write>;

// Task 3.1: compute diffuse lighting (Lambertian reflection)
fn compute_diffuse_lighting(normal: vec3f, light_direction: vec3f) -> f32 {
    // Task 3.5: replace constant DIFFUSE_REFLECTIVITY with Material.diffuse
    return max(0.0, dot(normal, light_direction)) * MATERIAL.diffuse;
}

// Task 3.5: compute specular lighting
fn compute_specular_lighting(position: vec3f, normal: vec3f, light_direction: vec3f) -> f32 {
    let view_direction = normalize(uniforms.camera.position - position);
    let reflection_vector = reflect(-light_direction, normal);
    return pow(max(0.0, dot(light_direction, reflection_vector)), MATERIAL.shininess) * MATERIAL.specular;
}

// Task 3.2: compute diffuse lighting for light source with index `light_index`
fn compute_lighting(position: vec3f, normal: vec3f, albedo: vec3f, light_index: u32) -> vec3f {
    // Task 3.3: attenuate light color based on the light source's distance to the fragment
    let d = distance(position, uLights[light_index].position);
    let attenuation = 1.0 / (1.0 + d + pow(d, 2.0));
    let attenuated_light_color = attenuation * uLights[light_index].color * uLights[light_index].intensity;

    let light_direction = normalize(uLights[light_index].position - position);

    let diffuse = compute_diffuse_lighting(normal, light_direction) * attenuated_light_color;

    // Task 3.5: compute specular lighting
    let specular = compute_specular_lighting(position, normal, light_direction) * attenuated_light_color;

    return albedo * diffuse + specular;
}

@compute
@workgroup_size(16, 16)
fn compute(@builtin(global_invocation_id) global_id: vec3u) {
    let output_size = vec2u(textureDimensions(output));

    // terminate the thread if its global id is outside the output texture's bounds
    if output_size.x < global_id.x || output_size.y < global_id.y {
        return;
    }

    let albedo = textureLoad(gAlbedo, global_id.xy, 0).rgb;
    let position = textureLoad(gPositions, global_id.xy, 0).xyz;
    let normal = textureLoad(gNormals, global_id.xy, 0).xyz;

    if all(albedo == vec3f()) {
        textureStore(output, global_id.xy, vec4f(vec3f(), 1.0));
        return;
    }

    var color = AMBIENT_LIGHT;
    for (var i = 0u; i < arrayLength(&uLights); i += 1u) {
        color += compute_lighting(position, normal, albedo, i);
    }

    textureStore(output, global_id.xy, vec4f(color, 1.0));
}