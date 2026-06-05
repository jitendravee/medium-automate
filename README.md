# AI Medium Platform

Transform raw notes into polished, SEO-optimized Medium articles — with AI-generated images uploaded to Cloudinary.

## Full Pipeline

```
notes/inbox/<slug>.md
  ↓
Content Analyzer          → gemini-2.5-flash → Structured JSON
  ↓
Article Editor            → gemini-2.5-pro   → notes/processing/<slug>-article.md
  ↓
SEO Generator             → gemini-2.5-flash → notes/processing/<slug>-seo.json
  ↓
Image Prompt Generator    → gemini-2.5-flash → notes/processing/<slug>-image.txt
  ↓
Image Generator           → Pollinations.ai  → generates images (free, no key)
  ↓
Cloudinary Upload         → Cloudinary       → notes/processing/<slug>-images.json
  ↓
HTML Preview              →                  → notes/processing/<slug>-preview.html
  ↓
[BYPASSED] Approval Gate
  ↓
[BYPASSED] Medium Publisher → notes/published/
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

**Required for article pipeline:**
- `GOOGLE_API_KEY` — free at [aistudio.google.com](https://aistudio.google.com)

**Required for image generation + upload:**
- `CLOUDINARY_CLOUD_NAME` — free at [cloudinary.com](https://cloudinary.com)
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `IMAGE_PROVIDER=pollinations` (default — free, no key needed)

### 3. Run the article pipeline

```bash
node pipeline.js
```

### 4. Generate + upload images

```bash
node scripts/image_generator.js
```

Or for a specific slug:

```bash
node scripts/image_generator.js ai-wont-take-your-job
```

### 5. View the preview

```bash
open notes/processing/ai-wont-take-your-job-preview.html
```

## Image Generation Providers

| Provider | Cost | Setup |
|----------|------|-------|
| `pollinations` | **Free, no key** | Just set `IMAGE_PROVIDER=pollinations` |
| `stability` | Free tier (25 credits/month) | Set `STABILITY_API_KEY` |

Switch provider in `.env`:
```
IMAGE_PROVIDER=pollinations
POLLINATIONS_MODEL=flux    # or: turbo, gptimage
```

## Switching AI Models

Edit `config/models.json` to change any step independently:

```json
"article_editor": {
  "provider": "anthropic",
  "model": "claude-opus-4-5"
}
```

Supported providers: `google`, `anthropic`, `openai`

Print current config:
```bash
node pipeline.js --models
```

## Output Files

For slug `my-topic`:

| File | Description |
|------|-------------|
| `notes/processing/my-topic-article.md` | Polished Medium article |
| `notes/processing/my-topic-seo.json` | SEO metadata + tags |
| `notes/processing/my-topic-image.txt` | AI image prompts |
| `notes/processing/my-topic-images.json` | Cloudinary URLs |
| `notes/processing/my-topic-preview.html` | Visual HTML preview |

## npm Scripts

```bash
npm start              # run full article pipeline (all inbox files)
npm run models         # print current model config
npm run images         # generate images + upload + build HTML
npm run images:view    # rebuild HTML from saved results (no re-generation)
```
