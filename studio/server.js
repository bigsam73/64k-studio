// 64k Studio server: serves the web UI, writes generated sources into the Rust project,
// runs Shader_Minifier / cargo / UPX on request. No npm dependencies.
"use strict";
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const Gen = require("./gen.js");
const Presets = require("./presets.js");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const STUDIO = __dirname;
const PROJECT_FILE = path.join(STUDIO, "project.json");
const MINIFIER_VERSION = "1.5.0";
const MINIFIER = path.join(ROOT, "target", `shader_minifier_v${MINIFIER_VERSION}.exe`);
const EXE = path.join(ROOT, "target", "release", "starter.exe");
const EXE_UPX = path.join(ROOT, "target", "release", "starter.upx.exe");
const PORT = parseInt(process.env.PORT || "8064", 10);
const SIZE_LIMIT = 65536;

// ---------- helpers ----------
function findExe(name) {
  const candidates = [];
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  const dirs = (process.env.PATH || "").split(path.delimiter);
  dirs.push(path.join(os.homedir(), ".cargo", "bin"));
  if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links"));
  for (const d of dirs) for (const e of exts) candidates.push(path.join(d, name + e));
  return candidates.find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } }) || null;
}

function versionOf(exe, args) {
  if (!exe) return null;
  try {
    const r = spawnSync(exe, args, { encoding: "utf8", timeout: 10000 });
    return ((r.stdout || "") + (r.stderr || "")).trim().split("\n")[0] || null;
  } catch { return null; }
}

function statOrNull(p) {
  try { const s = fs.statSync(p); return { path: p, size: s.size, mtime: s.mtime.toISOString() }; } catch { return null; }
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const txt = Buffer.concat(chunks).toString("utf8");
      if (!txt) return resolve({});
      try { resolve(JSON.parse(txt)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error("too many redirects"));
    https.get(url, { headers: { "User-Agent": "64k-studio" } }, (r) => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode)) {
        r.resume();
        return download(new URL(r.headers.location, url).toString(), dest, redirects + 1).then(resolve, reject);
      }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error("HTTP " + r.statusCode + " for " + url)); }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = dest + ".part";
      const f = fs.createWriteStream(tmp);
      r.pipe(f);
      f.on("finish", () => { f.close(); fs.renameSync(tmp, dest); resolve(dest); });
      f.on("error", reject);
    }).on("error", reject);
  });
}

async function ensureMinifier() {
  if (fs.existsSync(MINIFIER)) return MINIFIER;
  const url = `https://github.com/laurentlb/Shader_Minifier/releases/download/${MINIFIER_VERSION}/shader_minifier.exe`;
  await download(url, MINIFIER);
  return MINIFIER;
}

// ---------- project ----------
function defaultProject() {
  // Start from whatever shader.frag currently is, so an existing project isn't lost.
  const p = JSON.parse(JSON.stringify(Presets[0]));
  p.name = "my-intro";
  return p;
}

function loadProject() {
  try { return JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8")); } catch { return defaultProject(); }
}

function sanitizeProject(p) {
  const out = {
    name: String(p.name || "my-intro").replace(/[^\w\-]/g, "_"),
    width: Math.max(16, Math.min(7680, p.width | 0 || 1920)),
    height: Math.max(16, Math.min(4320, p.height | 0 || 1080)),
    duration: Math.max(1, Number(p.duration) || 60),
    params: [],
    shader: String(p.shader || ""),
  };
  const seen = new Set();
  for (const q of p.params || []) {
    if (!q || !Gen.validName(String(q.name || ""))) continue;
    if (seen.has(q.name)) continue;
    seen.add(q.name);
    out.params.push({
      name: q.name,
      type: ["float", "int", "bool", "color", "vec3", "vec2"].includes(q.type) ? q.type : "float",
      value: q.value,
      min: q.min, max: q.max, step: q.step,
    });
  }
  return out;
}

function writeProject(p) {
  fs.writeFileSync(PROJECT_FILE, JSON.stringify(p, null, 2));
  const frag = Gen.nativeShader(p);
  fs.writeFileSync(path.join(SRC, "shader.frag"), frag);
  const mainPath = path.join(SRC, "main.rs");
  const main = fs.readFileSync(mainPath, "utf8");
  const patched = Gen.patchMainRs(main, p);
  if (patched !== main) fs.writeFileSync(mainPath, patched);
  return { fragBytes: Buffer.byteLength(frag), files: ["src/shader.frag", "src/main.rs", "studio/project.json"] };
}

// ---------- tool runners ----------
async function minify(source) {
  const exe = await ensureMinifier();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "64kmin-"));
  const inFile = path.join(tmpDir, "shader.frag");
  const outFile = path.join(tmpDir, "out.txt");
  fs.writeFileSync(inFile, source);
  const r = spawnSync(exe, ["-o", outFile, "--format", "text", inFile], { encoding: "utf8", timeout: 60000 });
  let out = null;
  try { out = fs.readFileSync(outFile, "utf8"); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  if (out == null) throw new Error("Shader_Minifier failed:\n" + (r.stdout || "") + (r.stderr || ""));
  return { minified: out, bytes: Buffer.byteLength(out), rawBytes: Buffer.byteLength(source), log: (r.stdout || "") + (r.stderr || "") };
}

let building = null;
function streamProcess(res, exe, args, cwd, onExit) {
  const child = spawn(exe, args, { cwd, env: process.env, windowsHide: true });
  const send = (s) => res.write(s);
  child.stdout.on("data", (d) => send(d.toString()));
  child.stderr.on("data", (d) => send(d.toString()));
  child.on("error", (e) => { send("\n[error] " + e.message + "\n"); });
  child.on("close", (code) => onExit(code));
  return child;
}

// ---------- HTTP ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".ico": "image/x-icon" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/api/status") {
      const cargo = findExe("cargo"), rustup = findExe("rustup"), upx = findExe("upx");
      // link.exe only matters if cargo exists; rustup finds VS by itself, we just report hints.
      const vsDirs = ["C:\\Program Files\\Microsoft Visual Studio\\2022", "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022"];
      let msvc = false;
      for (const d of vsDirs) { try { for (const ed of fs.readdirSync(d)) if (fs.existsSync(path.join(d, ed, "VC", "Tools", "MSVC"))) msvc = true; } catch {} }
      return json(res, 200, {
        root: ROOT,
        cargo: cargo ? { path: cargo, version: versionOf(cargo, ["--version"]) } : null,
        rustup: rustup ? { path: rustup, version: versionOf(rustup, ["--version"]) } : null,
        upx: upx ? { path: upx, version: versionOf(upx, ["--version"]) } : null,
        msvc,
        minifier: statOrNull(MINIFIER),
        exe: statOrNull(EXE),
        exeUpx: statOrNull(EXE_UPX),
        building: !!building,
        sizeLimit: SIZE_LIMIT,
      });
    }

    if (url.pathname === "/api/presets") return json(res, 200, Presets);

    if (url.pathname === "/api/project" && req.method === "GET") return json(res, 200, loadProject());

    if (url.pathname === "/api/project" && req.method === "POST") {
      const p = sanitizeProject(await readBody(req));
      return json(res, 200, { ok: true, ...writeProject(p), project: p });
    }

    if (url.pathname === "/api/minify" && req.method === "POST") {
      const body = await readBody(req);
      const source = body.source != null ? String(body.source) : Gen.nativeShader(sanitizeProject(body.project || loadProject()));
      try { return json(res, 200, { ok: true, ...(await minify(source)) }); }
      catch (e) { return json(res, 500, { ok: false, error: e.message }); }
    }

    if (url.pathname === "/api/build" && req.method === "POST") {
      if (building) return json(res, 409, { ok: false, error: "already building" });
      const cargo = findExe("cargo");
      if (!cargo) return json(res, 400, { ok: false, error: "cargo not found. Install Rust (rustup, nightly, MSVC) first." });
      const body = await readBody(req);
      if (body.project) writeProject(sanitizeProject(body.project));
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.write(`$ cargo build --release   (cwd: ${ROOT})\n`);
      const finish = (code) => {
        building = null;
        const exe = statOrNull(EXE);
        const doUpx = body.upx && exe && findExe("upx");
        const end = (extra) => {
          res.write("\n@@RESULT " + JSON.stringify({ code, exe: statOrNull(EXE), exeUpx: statOrNull(EXE_UPX), ...extra }) + "\n");
          res.end();
        };
        if (code === 0 && doUpx) {
          try { fs.copyFileSync(EXE, EXE_UPX); } catch {}
          res.write(`\n$ upx --best --lzma ${EXE_UPX}\n`);
          streamProcess(res, findExe("upx"), ["--best", "--lzma", "-f", EXE_UPX], ROOT, (ucode) => end({ upxCode: ucode }));
        } else end({});
      };
      building = streamProcess(res, cargo, ["build", "--release"], ROOT, finish);
      req.on("close", () => {});
      return;
    }

    if (url.pathname === "/api/run" && req.method === "POST") {
      const body = await readBody(req);
      const exe = body.upx ? EXE_UPX : EXE;
      if (!fs.existsSync(exe)) return json(res, 404, { ok: false, error: "exe not built yet" });
      const child = spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: "ignore" });
      child.unref();
      return json(res, 200, { ok: true, pid: child.pid, exe });
    }

    if (url.pathname === "/api/download-frag") {
      const p = sanitizeProject(loadProject());
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${p.name}.frag"` });
      return res.end(Gen.nativeShader(p));
    }

    // static files
    let file = url.pathname === "/" ? "/index.html" : url.pathname;
    file = path.normalize(path.join(STUDIO, file));
    if (!file.startsWith(STUDIO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    json(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`64k Studio  ->  http://localhost:${PORT}`);
  console.log(`project root: ${ROOT}`);
  if (!fs.existsSync(PROJECT_FILE)) console.log("no studio/project.json yet; the UI starts from the first preset.");
});
