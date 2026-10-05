# 64k Studio (웹 기반 파라미터/코드 생성 도구)

[Kwarf/64k-starter](https://github.com/Kwarf/64k-starter) 위에 얹은 브라우저 UI입니다.
브라우저에서 셰이더 코드와 파라미터를 만지면 WebGL로 즉시 미리보고, 버튼 하나로
`src/shader.frag` / `src/main.rs`를 생성하고 `cargo build --release` + UPX까지 돌립니다.

## 실행

```
studio.cmd            (또는)  node studio\server.js
```
→ http://localhost:8064  (Node.js만 있으면 동작. 빌드 기능만 Rust/MSVC 필요)

## 화면 구성

| 영역 | 기능 |
|---|---|
| 왼쪽 | 해상도·길이 설정, 파라미터 목록(float/int/bool/color/vec2/vec3, 슬라이더·컬러피커) |
| 가운데 | WebGL 실시간 프리뷰, 재생/정지/스크럽, 프리뷰 해상도 25/50/100 %, 전체화면 |
| 오른쪽 | GLSL 편집기(실시간 컴파일, 오류 줄번호), 프리셋 4종, 크기 통계 |
| 상단 | 💾 코드 생성/저장(Ctrl+S) · 📐 Minify · 🔨 Build · ▶ Run · ⬇ .frag |
| 하단 | cargo / upx / minifier 로그 |

## 파라미터가 코드로 바뀌는 방식

파라미터는 **셰이더 상단에 `const` 상수로 구워집니다** (실행 파일에 런타임 파라미터 코드가 전혀 들어가지 않음).

```glsl
uniform float iTime;
const vec2 iResolution = vec2(1920.,1080.);
const float SPEED = 1.;
const vec3 COLOR_A = vec3(.9,.2,.4);
const int ITER = 64;

void main() { ... SPEED ... COLOR_A ... }
```

Shader_Minifier가 한 번만 쓰인 상수는 인라인하고 나머지는 이름을 줄여 주므로 크기 손해가 거의 없습니다.
`iResolution`도 상수라서 셰이더에 1920/1080을 하드코딩할 필요가 없고, 프리뷰에서는 캔버스 크기로 바뀝니다.

생성 파일:
- `src/shader.frag` – 위 헤더 + 편집기 본문
- `src/main.rs` – `dmPelsWidth/Height` 두 줄만 패치
- `studio/project.json` – 스튜디오 상태(파라미터, 코드). 이 파일만 백업하면 됩니다.

## GLSL 작성 규칙

네이티브(OpenGL 호환 프로파일, `#version` 없음 = GLSL 1.10)와 WebGL1(GLSL ES 1.00) 양쪽에서 도는
공통 부분집합을 쓰세요: `gl_FragCoord`, `gl_FragColor`, `mod/fract/mix/smoothstep`, `for(int i=0;i<ITER;i++)`(ITER는 const).
`texture()`, `out vec4`, `#version 330` 등은 프리뷰에서 실패합니다.

## 빌드 환경 (2026-10-05 설치 완료: rustup nightly MSVC, VS 2022 Build Tools C++ 최소구성, UPX 5.2.1)

1. **Visual Studio 2022 Build Tools** – "C++ 데스크톱 개발" 워크로드(MSVC + Windows SDK)
   https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. **Rust** – https://rustup.rs 에서 `rustup-init.exe` 실행 후
   ```
   rustup toolchain install nightly
   ```
   (`rust-toolchain.toml`이 nightly를 요구. 첫 `cargo build` 시 자동 설치되기도 함)
3. **UPX** (선택) – https://github.com/upx/upx/releases 에서 받아 PATH에 추가
4. Shader_Minifier는 첫 빌드/Minify 때 `target/`에 자동 다운로드됩니다.

이후 스튜디오의 🔨 Build 버튼이 `target/release/starter.exe`(+ `starter.upx.exe`)를 만들고 크기를 65 536 B 기준 막대로 보여줍니다.

## GitHub Actions (CI 빌드)

`.github/workflows/build.yml`이 push/PR마다 `windows-latest` 러너에서 `cargo build --release`를 실행하고
`target/release/starter.exe`를 `64k-starter` 아티팩트로 올립니다. 사용 액션:

- `actions/checkout@v7`
- `actions/upload-artifact@v7`

(둘 다 Node 24 기반이라 Node 20 사용 중단 경고가 없습니다.)

아티팩트 받기:
```
gh run download -R bigsam73/64k-studio -n 64k-starter -D ci-build
```
러너의 MSVC/SDK 버전이 로컬과 달라 크기가 수백 바이트 차이 날 수 있습니다(CI 28 672 B, 로컬 29 184 B).

## 음악

`src/song.bin`(WaveSabre)은 그대로입니다. 데모 길이는 곡 길이로 결정되므로, 스튜디오의 "길이" 값은 프리뷰 루프에만 쓰입니다.

## main.rs 변경점 (원본 대비)

- `PeekMessageA` 메시지 펌프 추가: 원본은 메시지 루프가 없어 5초 뒤 Windows가 "응답 없음"으로 판정하고 회색 고스트 창을 띄웁니다.
- 창에 `WS_EX_TOPMOST` 적용: 스튜디오의 ▶ Run처럼 백그라운드 프로세스에서 띄워도 다른 창 뒤에 숨지 않습니다.
- 크기 영향 없음(29,184 B 동일).
