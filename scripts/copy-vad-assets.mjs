// Copies the Silero VAD model, its audio worklet and the onnxruntime-web wasm into public/vad/, so Talk mode
// serves them from the panel itself (no CDN). Runs after `npm install`/`npm ci` and before `npm run build`.
// public/vad/ is git-ignored: the files come from node_modules at their pinned versions.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const out = join("public", "vad");
const files = [
  ["node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx", "silero_vad_v5.onnx"],
  ["node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js", "vad.worklet.bundle.min.js"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.wasm"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.mjs"],
];

mkdirSync(out, { recursive: true });
let missing = 0;
for (const [from, name] of files) {
  if (!existsSync(from)) {
    console.warn(`[copy-vad-assets] missing ${from}: Talk mode will fall back to the energy detector`);
    missing++;
    continue;
  }
  copyFileSync(from, join(out, name));
}
console.log(`[copy-vad-assets] ${files.length - missing}/${files.length} files in ${out}`);
