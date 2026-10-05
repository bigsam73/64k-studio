// Built-in example shaders. Each preset is a full project (params + GLSL body).
// GLSL must stay inside the GLSL 1.10 / ES 1.00 common subset so it runs both natively and in the WebGL preview.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Presets = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const base = { width: 1920, height: 1080, duration: 60 };

  const presets = [
    {
      name: "Shadertoy 기본 (원본 예제)",
      ...base,
      params: [
        { name: "SPEED", type: "float", value: 1.0, min: 0, max: 5, step: 0.01 },
        { name: "PHASE", type: "vec3", value: [0, 2, 4], min: 0, max: 6.28, step: 0.01 },
        { name: "BRIGHT", type: "float", value: 0.5, min: 0, max: 1, step: 0.01 },
      ],
      shader: `void main()
{
    vec2 uv = gl_FragCoord.xy / iResolution;
    vec3 col = BRIGHT + BRIGHT * cos(iTime * SPEED + uv.xyx + PHASE);
    gl_FragColor = vec4(col, 1.0);
}`,
    },
    {
      name: "Plasma",
      ...base,
      params: [
        { name: "SPEED", type: "float", value: 0.8, min: 0, max: 4, step: 0.01 },
        { name: "SCALE", type: "float", value: 6.0, min: 1, max: 30, step: 0.1 },
        { name: "COLOR_A", type: "color", value: [0.9, 0.2, 0.4] },
        { name: "COLOR_B", type: "color", value: [0.1, 0.5, 1.0] },
      ],
      shader: `void main()
{
    vec2 uv = (gl_FragCoord.xy * 2.0 - iResolution) / iResolution.y;
    float t = iTime * SPEED;
    float v = sin(uv.x * SCALE + t);
    v += sin((uv.y * SCALE + t) * 0.5);
    v += sin((uv.x * SCALE + uv.y * SCALE + t) * 0.5);
    vec2 c = uv + 0.5 * vec2(sin(t * 0.3), cos(t * 0.5));
    v += sin(sqrt(dot(c, c) * 100.0 + 1.0) + t);
    v *= 0.5;
    vec3 col = mix(COLOR_A, COLOR_B, 0.5 + 0.5 * sin(v * 3.14159));
    col += 0.15 * vec3(sin(v * 2.0), sin(v * 3.0), cos(v * 5.0));
    gl_FragColor = vec4(col, 1.0);
}`,
    },
    {
      name: "Raymarch 구체+바닥",
      ...base,
      params: [
        { name: "ITER", type: "int", value: 64, min: 8, max: 200, step: 1 },
        { name: "CAM_DIST", type: "float", value: 4.0, min: 1, max: 12, step: 0.05 },
        { name: "ORBIT_SPEED", type: "float", value: 0.4, min: 0, max: 3, step: 0.01 },
        { name: "RADIUS", type: "float", value: 1.0, min: 0.1, max: 3, step: 0.01 },
        { name: "SPHERE_COL", type: "color", value: [1.0, 0.45, 0.2] },
        { name: "FLOOR_COL", type: "color", value: [0.2, 0.25, 0.35] },
        { name: "FOG", type: "float", value: 0.08, min: 0, max: 0.5, step: 0.005 },
      ],
      shader: `float map(vec3 p)
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
}`,
    },
    {
      name: "Tunnel",
      ...base,
      params: [
        { name: "SPEED", type: "float", value: 1.5, min: 0, max: 6, step: 0.01 },
        { name: "TWIST", type: "float", value: 0.5, min: 0, max: 3, step: 0.01 },
        { name: "RINGS", type: "float", value: 8.0, min: 1, max: 40, step: 0.5 },
        { name: "TINT", type: "color", value: [0.3, 0.8, 1.0] },
      ],
      shader: `void main()
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
}`,
    },
  ];

  return presets;
});
