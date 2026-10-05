// Shared code generator: used by both the browser (preview) and the Node server (file output).
// Project schema:
// {
//   name: "my-intro", width: 1920, height: 1080, duration: 60,
//   params: [{ name, type: "float"|"int"|"color"|"vec2"|"bool", value, min, max, step }],
//   shader: "...GLSL body (no uniform/const header)..."
// }
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Gen = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function fmtFloat(v) {
    if (!isFinite(v)) v = 0;
    let s = String(Math.round(v * 1e6) / 1e6);
    if (s.indexOf(".") < 0 && s.indexOf("e") < 0) s += ".";
    // ".5" is shorter than "0.5" and valid GLSL
    s = s.replace(/^(-?)0\.(\d)/, "$1.$2");
    return s;
  }

  function glslValue(p) {
    switch (p.type) {
      case "int":
        return String(Math.round(p.value));
      case "bool":
        return p.value ? "true" : "false";
      case "color":
      case "vec3":
        return "vec3(" + p.value.map(fmtFloat).join(",") + ")";
      case "vec2":
        return "vec2(" + p.value.map(fmtFloat).join(",") + ")";
      default:
        return fmtFloat(p.value);
    }
  }

  function glslType(p) {
    switch (p.type) {
      case "int": return "int";
      case "bool": return "bool";
      case "color": case "vec3": return "vec3";
      case "vec2": return "vec2";
      default: return "float";
    }
  }

  function validName(n) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) && !/^gl_/.test(n);
  }

  // Header shared by native build and preview. `res` overrides the baked resolution for preview.
  function header(project, res) {
    const w = res ? res[0] : project.width;
    const h = res ? res[1] : project.height;
    const lines = [];
    lines.push("uniform float iTime;");
    lines.push("const vec2 iResolution = vec2(" + fmtFloat(w) + "," + fmtFloat(h) + ");");
    for (const p of project.params || []) {
      if (!validName(p.name)) continue;
      lines.push("const " + glslType(p) + " " + p.name + " = " + glslValue(p) + ";");
    }
    return lines.join("\n") + "\n";
  }

  // Full shader.frag content written into src/.
  function nativeShader(project) {
    return header(project) + "\n" + (project.shader || "").replace(/\r\n/g, "\n") + "\n";
  }

  // Shader used by the WebGL1 preview (GLSL ES 1.00 needs a precision qualifier).
  function previewShader(project, w, h) {
    const hdr = "precision highp float;\n" + header(project, [w, h]);
    return { source: hdr + "\n" + (project.shader || ""), headerLines: hdr.split("\n").length };
  }

  // Patch the hard-coded fullscreen resolution in src/main.rs.
  function patchMainRs(src, project) {
    return src
      .replace(/mode\.dmPelsWidth\s*=\s*\d+;/, "mode.dmPelsWidth = " + (project.width | 0) + ";")
      .replace(/mode\.dmPelsHeight\s*=\s*\d+;/, "mode.dmPelsHeight = " + (project.height | 0) + ";");
  }

  // Cheap client-side size estimate (comments + whitespace removed). Real number comes from Shader_Minifier.
  function roughMinify(src) {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/^\s*#.*$/gm, (m) => m.trim() + "\n")
      .replace(/\s+/g, " ")
      .replace(/\s*([{}();,=+\-*\/<>!&|?:])\s*/g, "$1")
      .trim();
  }

  return { fmtFloat, glslValue, glslType, validName, header, nativeShader, previewShader, patchMainRs, roughMinify };
});
