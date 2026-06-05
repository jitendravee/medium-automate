# Architecture

## Overview

The platform is a Node.js CLI pipeline. Each step calls the Anthropic API with a specific system prompt, processes the output, and writes it to disk.

## Pipeline Steps

```
[Input: notes/inbox/*.md]
        │
        ▼
┌─────────────────────┐
│   Content Analyzer  │  Extracts structure, tone, thesis, headlines
└─────────┬───────────┘
          │ Structured JSON
          ▼
┌─────────────────────┐
│   Article Editor    │  Writes the full polished article in markdown
└─────────┬───────────┘
          │ notes/processing/<slug>-article.md
          ▼
┌─────────────────────┐
│   SEO Generator     │  Produces SEO title, tags, slug, meta description
└─────────┬───────────┘
          │ notes/processing/<slug>-seo.json
          ▼
┌──────────────────────────┐
│  Image Prompt Generator  │  Creates prompts for hero + section images
└─────────┬────────────────┘
          │ notes/processing/<slug>-image.txt
          ▼
┌─────────────────────┐
│  [BYPASSED]         │
│  Approval Gate      │  Future: human approve/reject
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  [BYPASSED]         │
│  Medium Publisher   │  Future: auto-post via Medium API
└─────────────────────┘
          │
          ▼
[Output: notes/published/]
```

## File Naming Convention

Input: `notes/inbox/my-topic.md`

| Output | Path |
|--------|------|
| Article | `notes/processing/my-topic-article.md` |
| SEO | `notes/processing/my-topic-seo.json` |
| Image prompts | `notes/processing/my-topic-image.txt` |
| Final (future) | `notes/published/my-topic-final.json` |

## Prompt Files

All system prompts live in `prompts/`:

| File | Used By |
|------|---------|
| `content_analyzer.txt` | Step 1 |
| `article_editor.txt` | Step 2 |
| `seo_generator.txt` | Step 3 |
| `image_prompt_generator.txt` | Step 4 |
| `medium_publisher.txt` | Step 5 (bypassed) |

## Configuration

- `config/models.json` — model selection per step
- `config/workflow_settings.json` — enable/disable individual steps
- `.env` — API keys and secrets (never commit this)
