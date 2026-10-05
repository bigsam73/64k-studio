uniform float iTime;
const vec2 iResolution = vec2(1920.,1080.);
const int ITER = 64;
const float CAM_DIST = 4.;
const float ORBIT_SPEED = .4;
const float RADIUS = 1.;
const vec3 SPHERE_COL = vec3(1.,.45,.2);
const vec3 FLOOR_COL = vec3(.2,.25,.35);
const float FOG = .08;

float map(vec3 p)
{
    float sphere = length(p - vec3(0.0, RADIUS * (0.6 + 0.4 * sin(iTime * 2.0)), 0.0)) - RADIUS;
    float floorD = p.y + 1.0;
    return min(sphere, floorD);
}

vec3 normal(vec3 p)
{
    vec2 e = vec2(0.002, 0.0);
    return normalize(vec3(map(p + e.xyy) - map(p - e.xyy),
                          map(p + e.yxy) - map(p - e.yxy),
                          map(p + e.yyx) - map(p - e.yyx)));
}

void main()
{
    vec2 uv = (gl_FragCoord.xy * 2.0 - iResolution) / iResolution.y;
    float a = iTime * ORBIT_SPEED;
    vec3 ro = vec3(sin(a) * CAM_DIST, 1.5, cos(a) * CAM_DIST);
    vec3 ta = vec3(0.0, 0.0, 0.0);
    vec3 f = normalize(ta - ro);
    vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
    vec3 u = cross(f, r);
    vec3 rd = normalize(uv.x * r + uv.y * u + 1.6 * f);

    float t = 0.0;
    float d = 0.0;
    for (int i = 0; i < ITER; i++)
    {
        d = map(ro + rd * t);
        if (d < 0.001 || t > 40.0) break;
        t += d;
    }

    vec3 col = vec3(0.02, 0.03, 0.05);
    if (d < 0.001)
    {
        vec3 p = ro + rd * t;
        vec3 n = normal(p);
        vec3 l = normalize(vec3(0.6, 0.8, -0.4));
        float dif = max(dot(n, l), 0.0);
        vec3 base = p.y < -0.99 ? FLOOR_COL * (0.5 + 0.5 * mod(floor(p.x) + floor(p.z), 2.0)) : SPHERE_COL;
        col = base * (0.15 + dif);
        col = mix(col, vec3(0.02, 0.03, 0.05), 1.0 - exp(-FOG * t));
    }
    gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}
