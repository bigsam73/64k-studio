uniform float iTime;
const vec2 iResolution = vec2(1920.,1080.);
const float SPEED = 1.5;
const float TWIST = .5;
const float RINGS = 8.;
const vec3 TINT = vec3(.3,.8,1.);

void main()
{
    vec2 uv = (gl_FragCoord.xy * 2.0 - iResolution) / iResolution.y;
    float r = length(uv);
    float a = atan(uv.y, uv.x) + iTime * TWIST;
    float depth = 1.0 / (r + 0.1);
    float z = depth + iTime * SPEED;
    float ring = 0.5 + 0.5 * sin(z * RINGS);
    float stripe = 0.5 + 0.5 * sin(a * 8.0);
    vec3 col = TINT * ring * (0.4 + 0.6 * stripe);
    col *= smoothstep(0.0, 0.5, r);
    col *= 1.0 / (1.0 + depth * 0.15);
    gl_FragColor = vec4(col, 1.0);
}
