/**
 * Fills task-sample.v4.8.json image/audio entries with data URLs:
 * - Images: 256×256 PNG from prompt text (sharp + SVG).
 * - Audios: Windows SAPI TTS when available; else short synthetic WAV placeholder.
 *
 * Usage (from demo/): node scripts/fill-task-sample-assets.mjs
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = path.join(__dirname, "..");
const JSON_PATH = path.join(DEMO_ROOT, "dev", "task-sample.v4.8.json");
const PS1 = path.join(__dirname, "tts-windows.ps1");

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildImageSvg(prompt) {
  const lines = wrapText(prompt, 36).slice(0, 14);
  const tspans = lines
    .map((line, i) => `<tspan x="128" y="${22 + i * 13}">${escapeXml(line)}</tspan>`)
    .join("");
  const body =
    tspans ||
    `<tspan x="128" y="128" font-size="11" fill="#64748b">(empty prompt)</tspan>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e0e7ff"/>
      <stop offset="100%" stop-color="#f1f5f9"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg)"/>
  <rect x="10" y="10" width="236" height="236" fill="#ffffff" fill-opacity="0.92" rx="8" stroke="#64748b" stroke-width="1.5"/>
  <text xml:space="preserve" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="10" fill="#0f172a" text-anchor="middle">${body}</text>
</svg>`;
}

async function imagePromptToDataUrl(prompt) {
  const svg = buildImageSvg(prompt);
  const buf = await sharp(Buffer.from(svg)).png().resize(256, 256).toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** Extract spoken line from TTS-style prompts. */
function textToSpeakFromPrompt(prompt) {
  const m = prompt.match(/Speak:\s*['"]([^'"]*)['"]/i);
  if (m) return m[1].trim();
  const stripped = prompt.replace(/^TTS voice:[^'"]*\.?\s*Speak:\s*/i, "").trim();
  if (stripped.startsWith("'") && stripped.endsWith("'")) return stripped.slice(1, -1);
  return prompt.slice(0, 500);
}

function writeWav16Mono(samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const v = s < 0 ? s * 0x8000 : s * 0x7fff;
    buf.writeInt16LE(v | 0, 44 + i * 2);
  }
  return buf;
}

function hashSeed(str) {
  const h = crypto.createHash("sha256").update(str).digest();
  return h.readUInt32LE(0);
}

function placeholderWavBuffer(text) {
  const sampleRate = 22050;
  const dur = Math.min(2.8, 0.06 * text.length + 0.35);
  const n = Math.floor(sampleRate * dur);
  const samples = new Float32Array(n);
  let seed = hashSeed(text) || 1;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 0xffffffff;
  };
  const f1 = 200 + rnd() * 200;
  const f2 = 350 + rnd() * 250;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    samples[i] = 0.18 * Math.sin(2 * Math.PI * f1 * t) + 0.12 * Math.sin(2 * Math.PI * f2 * t);
  }
  const fade = Math.floor(sampleRate * 0.06);
  for (let i = 0; i < fade && i < n; i++) {
    const g = i / fade;
    samples[i] *= g;
    if (n - 1 - i >= 0) samples[n - 1 - i] *= g;
  }
  return writeWav16Mono(samples, sampleRate);
}

function windowsTtsToWav(text, outWav) {
  const tmpDir = fs.mkdtempSync(path.join(DEMO_ROOT, "node_modules", ".tts-"));
  const txtPath = path.join(tmpDir, "speech.txt");
  fs.writeFileSync(txtPath, text, "utf8");
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        PS1,
        "-OutPath",
        outWav,
        "-TextPath",
        txtPath,
      ],
      { stdio: "pipe", encoding: "utf8" }
    );
    return fs.existsSync(outWav) && fs.statSync(outWav).size > 0;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function audioPromptToDataUrl(prompt, id) {
  const speak = textToSpeakFromPrompt(prompt);
  const tmpDir = fs.mkdtempSync(path.join(DEMO_ROOT, "node_modules", ".tts-a-"));
  const tmpWav = path.join(tmpDir, "out.wav");
  try {
    if (process.platform === "win32" && windowsTtsToWav(speak, tmpWav)) {
      const buf = fs.readFileSync(tmpWav);
      return `data:audio/wav;base64,${buf.toString("base64")}`;
    }
  } catch (e) {
    console.warn(`[assets] TTS failed for ${id}, using placeholder:`, e.message);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  const buf = placeholderWavBuffer(speak);
  return `data:audio/wav;base64,${buf.toString("base64")}`;
}

async function main() {
  const raw = fs.readFileSync(JSON_PATH, "utf8");
  const data = JSON.parse(raw);
  const images = data.taskModel?.assets?.images;
  const audios = data.taskModel?.assets?.audios;
  if (!images || !audios) {
    console.error("Missing taskModel.assets.images / audios");
    process.exit(1);
  }

  console.log("Generating images (256×256 PNG)…");
  for (const [id, asset] of Object.entries(images)) {
    const prompt = asset.prompt || "";
    const dataUrl = await imagePromptToDataUrl(prompt);
    images[id] = { prompt, url: dataUrl };
    console.log(`  image ${id}`);
  }

  console.log("Generating audio…");
  for (const [id, asset] of Object.entries(audios)) {
    const prompt = asset.prompt || "";
    const dataUrl = audioPromptToDataUrl(prompt, id);
    audios[id] = { prompt, url: dataUrl };
    console.log(`  audio ${id}`);
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), "utf8");
  console.log("Wrote", JSON_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
