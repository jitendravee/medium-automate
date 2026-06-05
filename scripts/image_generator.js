/**
 * Image Generator + Cloudinary Uploader
 *
 * Reads:  notes/processing/<slug>-image.txt
 * Does:
 *   1. Parses prompts (hero + section images)
 *   2. Generates images via Pollinations.ai (free, no API key needed)
 *   3. Uploads each image to Cloudinary
 *   4. Saves Cloudinary URLs to notes/processing/<slug>-images.json
 *   5. Generates an HTML preview page at notes/processing/<slug>-preview.html
 *
 * Image Generation:
 *   Default: Pollinations.ai — completely free, no key required
 *   Optional: Set IMAGE_PROVIDER=stability in .env to use Stability AI
 *             (requires STABILITY_API_KEY)
 *
 * Usage:
 *   node scripts/image_generator.js                        # auto-detect slug from processing/
 *   node scripts/image_generator.js ai-wont-take-your-job # specific slug
 *   node scripts/image_generator.js --html-only <slug>    # skip generation, rebuild HTML only
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const PATHS = {
  processing: path.join(ROOT, "notes", "processing"),
  published:  path.join(ROOT, "notes", "published"),
};

// ─── Image Generation Config ──────────────────────────────────────────────────

const IMAGE_PROVIDER = process.env.IMAGE_PROVIDER || "pollinations";

// Pollinations model — options: flux, turbo, gptimage
const POLLINATIONS_MODEL = process.env.POLLINATIONS_MODEL || "flux";

// Image dimensions
const IMAGE_WIDTH  = parseInt(process.env.IMAGE_WIDTH  || "1400");
const IMAGE_HEIGHT = parseInt(process.env.IMAGE_HEIGHT || "700");

// ─── Cloudinary Config ────────────────────────────────────────────────────────

function getCloudinaryConfig() {
  const name   = process.env.CLOUDINARY_CLOUD_NAME;
  const key    = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;

  if (!name || name === "your_cloud_name") {
    throw new Error(
      "CLOUDINARY_CLOUD_NAME is not set in .env\n" +
      "Get your free credentials at cloudinary.com (no credit card needed)"
    );
  }
  if (!key || !secret) {
    throw new Error("CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set in .env");
  }

  return { name, key, secret };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Prompt Parser ────────────────────────────────────────────────────────────

/**
 * Parses the image.txt file format:
 *   # IMAGE PROMPTS
 *   ## Hero Image
 *   <prompt text>
 *   ## Section Images
 *   ### 1
 *   <prompt>
 *   ### 2
 *   <prompt>
 *   ...
 *   ## Style Guidelines
 *   ...
 *   ## Color Palette
 *   ...
 */
function parseImagePrompts(content) {
  const images = [];

  // Extract hero prompt
  const heroMatch = content.match(/## Hero Image\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (heroMatch) {
    const prompt = heroMatch[1].trim();
    if (prompt) {
      images.push({ id: "hero", label: "Hero Image", prompt });
    }
  }

  // Extract section prompts
  const sectionBlock = content.match(/## Section Images\s*\n([\s\S]*?)(?=\n## Style|$)/i);
  if (sectionBlock) {
    const sections = sectionBlock[1].split(/###\s*\d+/g).filter((s) => s.trim());
    sections.forEach((s, i) => {
      const prompt = s.trim();
      if (prompt) {
        images.push({ id: `section_${i + 1}`, label: `Section ${i + 1}`, prompt });
      }
    });
  }

  // Extract style and palette for context
  const styleMatch   = content.match(/## Style Guidelines\s*\n([\s\S]*?)(?=\n##|$)/i);
  const paletteMatch = content.match(/## Color Palette\s*\n([\s\S]*?)(?=\n##|$)/i);

  const style   = styleMatch   ? styleMatch[1].trim()   : "";
  const palette = paletteMatch ? paletteMatch[1].trim() : "";

  return { images, style, palette };
}

// ─── Image Generation ─────────────────────────────────────────────────────────

/**
 * Generate image via Pollinations.ai
 * Free, no API key, no account needed.
 * Returns a Buffer of the image bytes.
 */
async function generateViaPollinationsAI(prompt) {
  const { default: fetch } = await import("node-fetch");

  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=${IMAGE_WIDTH}&height=${IMAGE_HEIGHT}&model=${POLLINATIONS_MODEL}&nologo=true&enhance=true`;

  log("🌐", `Requesting image from Pollinations.ai (${POLLINATIONS_MODEL})...`);
  log("🔗", `URL: ${url.substring(0, 80)}...`);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    timeout: 120000,
  });

  if (!response.ok) {
    throw new Error(`Pollinations.ai error: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("image")) {
    const text = await response.text();
    throw new Error(`Expected image, got: ${contentType}\n${text.substring(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  log("✅", `Image received (${Math.round(buffer.length / 1024)}KB)`);
  return buffer;
}

/**
 * Generate image via Stability AI (requires STABILITY_API_KEY)
 * Free tier: 25 credits/month
 */
async function generateViaStabilityAI(prompt) {
  const { default: fetch } = await import("node-fetch");
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) throw new Error("STABILITY_API_KEY not set in .env");

  log("🌐", "Requesting image from Stability AI...");

  const response = await fetch(
    "https://api.stability.ai/v2beta/stable-image/generate/core",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "image/*",
      },
      body: (() => {
        const form = new FormData();
        form.append("prompt", prompt);
        form.append("aspect_ratio", "16:9");
        form.append("output_format", "jpeg");
        return form;
      })(),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Stability AI error: ${response.status} — ${err}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  log("✅", `Image received (${Math.round(buffer.length / 1024)}KB)`);
  return buffer;
}

async function generateImage(prompt) {
  switch (IMAGE_PROVIDER.toLowerCase()) {
    case "pollinations":
      return generateViaPollinationsAI(prompt);
    case "stability":
      return generateViaStabilityAI(prompt);
    default:
      throw new Error(`Unknown IMAGE_PROVIDER "${IMAGE_PROVIDER}". Use: pollinations, stability`);
  }
}

// ─── Cloudinary Upload ────────────────────────────────────────────────────────

/**
 * Upload image Buffer to Cloudinary.
 * Uses the unsigned upload with API key + secret for signed upload.
 * Returns the secure_url and public_id.
 */
async function uploadToCloudinary(imageBuffer, publicId, folder) {
  const { default: fetch } = await import("node-fetch");
  const FormData = (await import("form-data")).default;
  const crypto   = await import("crypto");

  const { name, key, secret } = getCloudinaryConfig();

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folderPath = folder || "ai-medium-platform";
  const fullPublicId = `${folderPath}/${publicId}`;

  // Generate SHA1 signature for signed upload
  const paramsToSign = [
    `folder=${folderPath}`,
    `public_id=${publicId}`,
    `timestamp=${timestamp}`,
  ]
    .sort()
    .join("&");

  const signature = crypto
    .createHash("sha1")
    .update(paramsToSign + secret)
    .digest("hex");

  const form = new FormData();
  form.append("file", imageBuffer, {
    filename:    `${publicId}.jpg`,
    contentType: "image/jpeg",
  });
  form.append("api_key",   key);
  form.append("timestamp", timestamp);
  form.append("signature", signature);
  form.append("public_id", publicId);
  form.append("folder",    folderPath);
  form.append("overwrite", "true");

  const uploadUrl = `https://api.cloudinary.com/v1_1/${name}/image/upload`;

  log("☁️ ", `Uploading to Cloudinary (${name}/${fullPublicId})...`);

  const response = await fetch(uploadUrl, {
    method:  "POST",
    body:    form,
    headers: form.getHeaders(),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    throw new Error(`Cloudinary upload failed: ${result.error?.message || response.statusText}`);
  }

  log("✅", `Uploaded: ${result.secure_url}`);

  return {
    url:       result.secure_url,
    public_id: result.public_id,
    width:     result.width,
    height:    result.height,
    format:    result.format,
    bytes:     result.bytes,
  };
}

// ─── HTML Preview Generator ───────────────────────────────────────────────────

function generateHTMLPreview(slug, imageResults, articleTitle, seoData, palette) {
  const colors = palette
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.startsWith("#"));

  const primary   = colors[0] || "#2C3E50";
  const accent    = colors[1] || "#3498DB";
  const purple    = colors[2] || "#8E44AD";
  const gold      = colors[3] || "#F39C12";
  const light     = colors[4] || "#ECF0F1";

  const title    = articleTitle  || slug;
  const tags     = seoData?.medium_tags || [];
  const summary  = seoData?.article_summary || "";
  const readTime = seoData?.reading_time_minutes || 5;
  const keyword  = seoData?.primary_keyword || "";

  const hero     = imageResults.find((r) => r.id === "hero");
  const sections = imageResults.filter((r) => r.id !== "hero");

  const sectionCards = sections
    .map(
      (s) => `
      <div class="section-card">
        <div class="img-wrap">
          <img src="${s.cloudinary.url}" alt="${s.label}" loading="lazy" />
          <div class="img-overlay">
            <span class="img-label">${s.label}</span>
          </div>
        </div>
        <div class="card-body">
          <p class="prompt-text">${s.prompt.substring(0, 180)}${s.prompt.length > 180 ? "…" : ""}</p>
          <div class="url-row">
            <code>${s.cloudinary.url}</code>
            <button onclick="copy('${s.cloudinary.url}', this)">Copy URL</button>
          </div>
        </div>
      </div>`
    )
    .join("\n");

  const paletteSwatches = colors
    .map(
      (c) => `<div class="swatch" style="background:${c}" title="${c}">
                <span>${c}</span>
               </div>`
    )
    .join("\n");

  const metaRows = [
    ["Primary Keyword", keyword],
    ["Reading Time",    `${readTime} min`],
    ["Tags",           tags.join(" · ")],
    ["Slug",           seoData?.slug || "—"],
  ]
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `<tr><td class="meta-key">${k}</td><td>${v}</td></tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Image Preview</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --primary:  ${primary};
      --accent:   ${accent};
      --purple:   ${purple};
      --gold:     ${gold};
      --light:    ${light};
      --bg:       #0f1117;
      --surface:  #1a1d27;
      --border:   #2a2d3a;
      --text:     #e2e8f0;
      --muted:    #8892a4;
      --radius:   12px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }

    /* ── Top bar ── */
    .topbar {
      background: linear-gradient(135deg, var(--primary) 0%, var(--purple) 100%);
      padding: 8px 32px;
      font-size: 12px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.85);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .topbar .badge {
      background: rgba(255,255,255,0.2);
      padding: 3px 10px;
      border-radius: 20px;
      font-weight: 600;
    }

    /* ── Hero section ── */
    .hero {
      position: relative;
      width: 100%;
      max-height: 520px;
      overflow: hidden;
    }
    .hero img {
      width: 100%;
      height: 520px;
      object-fit: cover;
      display: block;
    }
    .hero-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to bottom,
        transparent 30%,
        rgba(15,17,23,0.95) 100%
      );
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 40px 48px;
    }
    .hero-tag {
      display: inline-block;
      background: var(--accent);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 4px;
      margin-bottom: 16px;
    }
    .hero-title {
      font-size: clamp(24px, 4vw, 42px);
      font-weight: 800;
      line-height: 1.15;
      max-width: 720px;
      margin-bottom: 12px;
    }
    .hero-summary {
      color: rgba(255,255,255,0.75);
      max-width: 600px;
      font-size: 15px;
    }
    .hero-url-row {
      margin-top: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .hero-url-row code {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      color: var(--light);
      word-break: break-all;
    }

    /* ── Main layout ── */
    .main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 48px 24px;
    }

    /* ── Section heading ── */
    .section-heading {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 24px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }

    /* ── Section image cards ── */
    .section-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
      margin-bottom: 56px;
    }
    .section-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .section-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 40px rgba(0,0,0,0.4);
    }
    .img-wrap {
      position: relative;
      height: 200px;
      overflow: hidden;
    }
    .img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s;
    }
    .section-card:hover .img-wrap img {
      transform: scale(1.04);
    }
    .img-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(15,17,23,0.8) 0%, transparent 60%);
      display: flex;
      align-items: flex-end;
      padding: 12px 16px;
    }
    .img-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.9);
    }
    .card-body {
      padding: 16px;
    }
    .prompt-text {
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 12px;
      line-height: 1.5;
    }
    .url-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .url-row code {
      flex: 1;
      font-size: 11px;
      color: var(--accent);
      word-break: break-all;
      min-width: 0;
    }

    /* ── Buttons ── */
    button {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s, transform 0.1s;
    }
    button:hover  { background: var(--purple); }
    button:active { transform: scale(0.96); }
    button.copied { background: #27ae60; }

    /* ── Metadata table ── */
    .meta-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      margin-bottom: 56px;
    }
    .meta-card table {
      width: 100%;
      border-collapse: collapse;
    }
    .meta-card td {
      padding: 12px 20px;
      font-size: 14px;
      border-bottom: 1px solid var(--border);
    }
    .meta-card tr:last-child td { border-bottom: none; }
    .meta-key {
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      width: 160px;
    }

    /* ── Color palette ── */
    .palette-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 56px;
    }
    .swatch {
      width: 80px;
      height: 80px;
      border-radius: 10px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding-bottom: 6px;
      cursor: pointer;
      border: 1px solid rgba(255,255,255,0.1);
      transition: transform 0.15s;
    }
    .swatch:hover { transform: scale(1.06); }
    .swatch span {
      font-size: 10px;
      font-weight: 700;
      color: rgba(255,255,255,0.85);
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
      letter-spacing: 0.5px;
    }

    /* ── All URLs export ── */
    .urls-block {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 56px;
    }
    .urls-block pre {
      font-size: 12px;
      color: var(--accent);
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.8;
    }
    .urls-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    /* ── Footer ── */
    footer {
      text-align: center;
      padding: 32px;
      font-size: 12px;
      color: var(--muted);
      border-top: 1px solid var(--border);
    }

    /* ── Toast ── */
    #toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #27ae60;
      color: #fff;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.2s;
      pointer-events: none;
      z-index: 9999;
    }
    #toast.show { opacity: 1; transform: translateY(0); }
  </style>
</head>
<body>

<div class="topbar">
  <span>AI Medium Platform — Image Preview</span>
  <span class="badge">Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
</div>

${
  hero
    ? `<div class="hero">
  <img src="${hero.cloudinary.url}" alt="Hero Image" />
  <div class="hero-overlay">
    <span class="hero-tag">Hero Image</span>
    <h1 class="hero-title">${title}</h1>
    ${summary ? `<p class="hero-summary">${summary}</p>` : ""}
    <div class="hero-url-row">
      <code>${hero.cloudinary.url}</code>
      <button onclick="copy('${hero.cloudinary.url}', this)">Copy URL</button>
    </div>
  </div>
</div>`
    : ""
}

<div class="main">

  ${
    sections.length > 0
      ? `<p class="section-heading">Section Images</p>
  <div class="section-grid">
    ${sectionCards}
  </div>`
      : ""
  }

  ${
    metaRows
      ? `<p class="section-heading">SEO Metadata</p>
  <div class="meta-card">
    <table>
      ${metaRows}
    </table>
  </div>`
      : ""
  }

  <p class="section-heading">Color Palette</p>
  <div class="palette-row">
    ${paletteSwatches}
  </div>

  <p class="section-heading">All Cloudinary URLs</p>
  <div class="urls-block">
    <div class="urls-header">
      <span style="font-size:12px;color:var(--muted)">Copy and use in your article</span>
      <button onclick="copyAll()">Copy All as JSON</button>
    </div>
    <pre id="urls-pre">${JSON.stringify(
      imageResults.reduce((acc, r) => {
        acc[r.id] = r.cloudinary.url;
        return acc;
      }, {}),
      null,
      2
    )}</pre>
  </div>

</div>

<footer>
  Generated by AI Medium Platform · Hosted on Cloudinary · ${imageResults.length} image${imageResults.length !== 1 ? "s" : ""}
</footer>

<div id="toast">Copied!</div>

<script>
  function copy(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = orig;
          btn.classList.remove("copied");
        }, 2000);
      }
      showToast();
    });
  }

  function copyAll() {
    const text = document.getElementById("urls-pre").textContent;
    navigator.clipboard.writeText(text).then(showToast);
  }

  function showToast() {
    const t = document.getElementById("toast");
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2000);
  }

  // Swatch click copies hex
  document.querySelectorAll(".swatch").forEach((el) => {
    el.addEventListener("click", () => copy(el.title));
  });
</script>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const htmlOnly = args.includes("--html-only");
  const slugArg  = args.find((a) => !a.startsWith("--"));

  // Auto-detect slug from processing dir
  let slug = slugArg;
  if (!slug) {
    const files = fs
      .readdirSync(PATHS.processing)
      .filter((f) => f.endsWith("-image.txt"));
    if (files.length === 0) {
      log("❌", "No *-image.txt files found in notes/processing/");
      process.exit(1);
    }
    slug = files[0].replace("-image.txt", "");
    log("🔍", `Auto-detected slug: ${slug}`);
  }

  const imageFile   = path.join(PATHS.processing, `${slug}-image.txt`);
  const seoFile     = path.join(PATHS.processing, `${slug}-seo.json`);
  const articleFile = path.join(PATHS.processing, `${slug}-article.md`);
  const jsonOut     = path.join(PATHS.processing, `${slug}-images.json`);
  const htmlOut     = path.join(PATHS.processing, `${slug}-preview.html`);

  if (!fs.existsSync(imageFile)) {
    log("❌", `Image prompts file not found: ${imageFile}`);
    process.exit(1);
  }

  // Load supporting files
  const promptContent = fs.readFileSync(imageFile, "utf-8");
  const seoData       = seoFile     && fs.existsSync(seoFile)     ? JSON.parse(fs.readFileSync(seoFile, "utf-8"))   : null;
  const articleRaw    = articleFile && fs.existsSync(articleFile) ? fs.readFileSync(articleFile, "utf-8")           : "";

  const articleTitle = articleRaw.match(/^#\s+(.+)/m)?.[1] || slug;
  const { images, palette } = parseImagePrompts(promptContent);

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║        AI Medium Platform — Image Generator                ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\n🏷️   Slug:     ${slug}`);
  console.log(`🖼️   Images:   ${images.length} prompts found`);
  console.log(`⚙️   Provider: ${IMAGE_PROVIDER}`);
  if (!htmlOnly) {
    log("☁️ ", `Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME || "(not set)"}`);
  }
  console.log();

  let imageResults;

  if (htmlOnly) {
    // Load previously saved results
    if (!fs.existsSync(jsonOut)) {
      log("❌", `No saved results found at ${jsonOut}. Run without --html-only first.`);
      process.exit(1);
    }
    imageResults = JSON.parse(fs.readFileSync(jsonOut, "utf-8"));
    log("📂", `Loaded ${imageResults.length} saved results from ${slug}-images.json`);
  } else {
    imageResults = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      console.log(`\n─── Image ${i + 1}/${images.length}: ${img.label} ${"─".repeat(30)}`);
      log("📝", `Prompt: ${img.prompt.substring(0, 100)}...`);

      try {
        // 1. Generate
        const imageBuffer = await generateImage(img.prompt);

        // 2. Upload to Cloudinary
        const publicId    = `${slug}-${img.id}`;
        const cloudResult = await uploadToCloudinary(imageBuffer, publicId, "ai-medium-platform");

        imageResults.push({
          id:        img.id,
          label:     img.label,
          prompt:    img.prompt,
          cloudinary: cloudResult,
        });

        // Rate limit: small pause between requests
        if (i < images.length - 1) {
          log("⏳", "Waiting 2s before next request...");
          await sleep(2000);
        }
      } catch (err) {
        log("❌", `Failed for ${img.label}: ${err.message}`);
        log("⚠️ ", "Skipping this image and continuing...");
      }
    }

    // Save JSON results
    fs.writeFileSync(jsonOut, JSON.stringify(imageResults, null, 2), "utf-8");
    log("💾", `Saved image URLs: notes/processing/${slug}-images.json`);
  }

  // Generate HTML preview
  const html = generateHTMLPreview(slug, imageResults, articleTitle, seoData, palette);
  fs.writeFileSync(htmlOut, html, "utf-8");
  log("💾", `Saved preview: notes/processing/${slug}-preview.html`);

  // Summary
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                     Done ✅                                ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
  console.log("📁  Output files:");
  console.log(`   → notes/processing/${slug}-images.json   (Cloudinary URLs)`);
  console.log(`   → notes/processing/${slug}-preview.html  (Visual preview)\n`);

  if (imageResults.length > 0) {
    console.log("🖼️   Cloudinary URLs:");
    imageResults.forEach((r) => {
      console.log(`   [${r.label}] ${r.cloudinary.url}`);
    });
  }

  console.log("\n📋  Open the preview:");
  console.log(`   open notes/processing/${slug}-preview.html\n`);
}

main().catch((err) => {
  console.error("\n❌ Image generator failed:", err.message);
  process.exit(1);
});
