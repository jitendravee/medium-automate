/**
 * AI Medium Platform — Content Pipeline
 *
 * Multi-provider AI router. Each step uses the model defined in config/models.json.
 * Switch any step to any provider/model without touching pipeline code.
 *
 * Supported providers: google, anthropic, openai
 *
 * Flow:
 *   notes/inbox/<slug>.md
 *     → Content Analyzer  → Structured JSON
 *     → Article Editor    → notes/processing/<slug>-article.md
 *     → SEO Generator     → notes/processing/<slug>-seo.json
 *     → Image Prompts     → notes/processing/<slug>-image.txt
 *     → [BYPASSED] Approval Gate
 *     → [BYPASSED] Medium Publisher → notes/published/
 *
 * Usage:
 *   node pipeline.js                    # process all inbox files
 *   node pipeline.js my-note.md         # process specific file
 *   node pipeline.js --models           # print current model config
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Paths ────────────────────────────────────────────────────────────────────

const PATHS = {
  inbox:      path.join(__dirname, "notes", "inbox"),
  processing: path.join(__dirname, "notes", "processing"),
  published:  path.join(__dirname, "notes", "published"),
  archive:    path.join(__dirname, "notes", "archive"),
  prompts:    path.join(__dirname, "prompts"),
  config:     path.join(__dirname, "config"),
};

// ─── Config ───────────────────────────────────────────────────────────────────

function loadModelsConfig() {
  const file = path.join(PATHS.config, "models.json");
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function getStepConfig(stepId) {
  const config = loadModelsConfig();
  const step = config.steps[stepId];
  if (!step) throw new Error(`No model config found for step: "${stepId}"`);
  return step;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureDirs() {
  Object.values(PATHS).forEach((p) => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });
}

function log(emoji, message) {
  console.log(`${emoji}  ${message}`);
}

function logStep(n, total, label, provider, model) {
  console.log(`\n${"─".repeat(62)}`);
  console.log(`  Step ${n}/${total}: ${label}`);
  console.log(`  Provider: ${provider} | Model: ${model}`);
  console.log(`${"─".repeat(62)}`);
}

function loadPrompt(name) {
  const file = path.join(PATHS.prompts, `${name}.txt`);
  if (!fs.existsSync(file)) throw new Error(`Prompt not found: ${file}`);
  return fs.readFileSync(file, "utf-8");
}

function slugFromFilename(filename) {
  return path.basename(filename, ".md");
}

function saveFile(filepath, content) {
  fs.writeFileSync(filepath, content, "utf-8");
  log("💾", `Saved: ${path.relative(__dirname, filepath)}`);
}

function cleanJSON(text) {
  return text
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();
}

function printModels() {
  const config = loadModelsConfig();
  console.log("\n📋  Current model configuration (config/models.json):\n");
  for (const [step, cfg] of Object.entries(config.steps)) {
    const bypass = cfg.bypassed ? " [BYPASSED]" : "";
    console.log(`  ${step}${bypass}`);
    console.log(`    provider : ${cfg.provider}`);
    console.log(`    model    : ${cfg.model}`);
    console.log(`    purpose  : ${cfg.purpose}\n`);
  }
  console.log('To switch a step, edit config/models.json and change "provider" and "model".\n');
}

// ─── Multi-Provider AI Router ─────────────────────────────────────────────────

/**
 * callAI(stepId, systemPrompt, userMessage) → string
 *
 * Reads provider + model from config/models.json for the given stepId,
 * loads the correct SDK, and returns the model's text response.
 *
 * To add a new provider: add a case to the switch below.
 */
async function callAI(stepId, systemPrompt, userMessage) {
  const { provider, model } = getStepConfig(stepId);

  switch (provider.toLowerCase()) {

    // ── Google Gemini ───────────────────────────────────────────────────────
    case "google": {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey || apiKey === "your_google_api_key_here") {
        throw new Error("GOOGLE_API_KEY is not set in .env");
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model,
        contents: userMessage,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 8192,
        },
      });

      return response.text;
    }

    // ── Anthropic Claude ────────────────────────────────────────────────────
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey || apiKey === "your_anthropic_api_key_here") {
        throw new Error("ANTHROPIC_API_KEY is not set in .env");
      }

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      return response.content[0].text;
    }

    // ── OpenAI ──────────────────────────────────────────────────────────────
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey || apiKey === "your_openai_api_key_here") {
        throw new Error("OPENAI_API_KEY is not set in .env");
      }

      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey });

      const response = await client.chat.completions.create({
        model,
        max_tokens: 8192,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });

      return response.choices[0].message.content;
    }

    default:
      throw new Error(
        `Unknown provider "${provider}" for step "${stepId}". ` +
        `Supported: google, anthropic, openai`
      );
  }
}

// ─── Pipeline Steps ───────────────────────────────────────────────────────────

async function runContentAnalyzer(rawNote) {
  const { provider, model } = getStepConfig("content_analyzer");
  logStep(1, 4, "Content Analyzer", provider, model);
  log("🔍", "Analyzing raw note...");

  const systemPrompt = loadPrompt("content_analyzer");
  const raw = await callAI(
    "content_analyzer",
    systemPrompt,
    `Analyze this raw note and return the structured JSON blueprint:\n\n${rawNote}`
  );

  let parsed;
  try {
    parsed = JSON.parse(cleanJSON(raw));
  } catch {
    throw new Error(`Content Analyzer returned invalid JSON:\n${raw}`);
  }

  log("✅", `Topic: "${parsed.main_topic}"`);
  log("✅", `Thesis: "${parsed.core_thesis}"`);
  log("✅", `Headlines generated: ${parsed.headline_ideas?.length || 0}`);

  return parsed;
}

async function runArticleEditor(blueprint) {
  const { provider, model } = getStepConfig("article_editor");
  logStep(2, 4, "Article Editor", provider, model);
  log("✍️ ", "Writing polished article...");

  const systemPrompt = loadPrompt("article_editor");
  const article = await callAI(
    "article_editor",
    systemPrompt,
    `Transform this content blueprint into a publication-ready Medium article:\n\n${JSON.stringify(blueprint, null, 2)}`
  );

  const titleMatch = article.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1] : "Article";
  const wordCount = article.trim().split(/\s+/).length;

  log("✅", `Title: "${title}"`);
  log("✅", `Word count: ~${wordCount}`);

  return article.trim();
}

async function runSEOGenerator(article) {
  const { provider, model } = getStepConfig("seo_generator");
  logStep(3, 4, "SEO Generator", provider, model);
  log("📈", "Generating SEO metadata...");

  const systemPrompt = loadPrompt("seo_generator");
  const raw = await callAI(
    "seo_generator",
    systemPrompt,
    `Generate SEO metadata for this article:\n\n${article}`
  );

  let parsed;
  try {
    parsed = JSON.parse(cleanJSON(raw));
  } catch {
    throw new Error(`SEO Generator returned invalid JSON:\n${raw}`);
  }

  log("✅", `Primary keyword: "${parsed.primary_keyword}"`);
  log("✅", `Tags: ${parsed.medium_tags?.join(", ")}`);
  log("✅", `Slug: ${parsed.slug}`);

  return parsed;
}

async function runImagePromptGenerator(article) {
  const { provider, model } = getStepConfig("image_prompt_generator");
  logStep(4, 4, "Image Prompt Generator", provider, model);
  log("🎨", "Generating image prompts...");

  const systemPrompt = loadPrompt("image_prompt_generator");
  const raw = await callAI(
    "image_prompt_generator",
    systemPrompt,
    `Generate image prompts for this article:\n\n${article}`
  );

  let parsed;
  try {
    parsed = JSON.parse(cleanJSON(raw));
  } catch {
    throw new Error(`Image Prompt Generator returned invalid JSON:\n${raw}`);
  }

  const output = [
    "# IMAGE PROMPTS",
    "",
    "## Hero Image",
    parsed.hero_image_prompt || "",
    "",
    "## Section Images",
    ...(parsed.section_image_prompts || []).map((p, i) => `### ${i + 1}\n${p}`),
    "",
    "## Style Guidelines",
    parsed.style_guidelines || "",
    "",
    "## Color Palette",
    (parsed.color_palette || []).join(", "),
  ].join("\n");

  log("✅", `Hero prompt generated`);
  log("✅", `Section prompts: ${parsed.section_image_prompts?.length || 0}`);

  return output;
}

// ─── Full Pipeline ────────────────────────────────────────────────────────────

async function runPipeline(inputFile) {
  ensureDirs();

  const slug = slugFromFilename(inputFile);
  const inboxPath = path.isAbsolute(inputFile)
    ? inputFile
    : path.join(PATHS.inbox, path.basename(inputFile));

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║           AI Medium Platform — Content Pipeline            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\n📄  Input : ${path.relative(__dirname, inboxPath)}`);
  console.log(`🏷️   Slug  : ${slug}\n`);

  if (!fs.existsSync(inboxPath)) {
    throw new Error(`Input file not found: ${inboxPath}`);
  }

  const rawNote = fs.readFileSync(inboxPath, "utf-8");
  log("📖", `Loaded note (${rawNote.length} chars)`);

  // Step 1 — Content Analysis
  const blueprint = await runContentAnalyzer(rawNote);

  // Step 2 — Article Editing
  const article = await runArticleEditor(blueprint);
  const articlePath = path.join(PATHS.processing, `${slug}-article.md`);
  saveFile(articlePath, article);

  // Step 3 — SEO Generation
  const seo = await runSEOGenerator(article);
  const seoPath = path.join(PATHS.processing, `${slug}-seo.json`);
  saveFile(seoPath, JSON.stringify(seo, null, 2));

  // Step 4 — Image Prompts
  const imagePrompts = await runImagePromptGenerator(article);
  const imagePath = path.join(PATHS.processing, `${slug}-image.txt`);
  saveFile(imagePath, imagePrompts);

  // [BYPASSED] Approval Gate
  log("⏭️ ", "[BYPASSED] Approval Gate — enable in config/workflow_settings.json");

  // [BYPASSED] Medium Publisher
  log("⏭️ ", "[BYPASSED] Medium Publisher — enable when MEDIUM_INTEGRATION_TOKEN is set");

  // Summary
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                    Pipeline Complete ✅                    ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
  console.log("📁  Output files:");
  console.log(`   → ${path.relative(__dirname, articlePath)}`);
  console.log(`   → ${path.relative(__dirname, seoPath)}`);
  console.log(`   → ${path.relative(__dirname, imagePath)}`);
  console.log("\n📋  Next steps:");
  console.log(`   1. Review:   notes/processing/${slug}-article.md`);
  console.log(`   2. SEO:      notes/processing/${slug}-seo.json`);
  console.log(`   3. Images:   notes/processing/${slug}-image.txt`);
  console.log("   4. Publish manually on Medium (or enable publisher step)\n");
}

// ─── CLI Entry ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--models")) {
  printModels();
  process.exit(0);
}

const target = args.find((a) => !a.startsWith("--"));

if (!target) {
  // Process all inbox files
  ensureDirs();
  const files = fs
    .readdirSync(PATHS.inbox)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(PATHS.inbox, f));

  if (files.length === 0) {
    log("📭", "No .md files found in notes/inbox/");
    process.exit(0);
  }

  log("📬", `Found ${files.length} file(s) in inbox`);
  for (const file of files) {
    await runPipeline(file);
  }
} else {
  await runPipeline(target);
}
