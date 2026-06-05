# Workflows

## Standard Content Pipeline

The primary workflow: raw note → published article.

### When to use
- You have a rough idea, brain dump, or set of notes
- You want a polished Medium-ready article
- You need SEO metadata and image prompts

### How to run

1. Drop your `.md` note into `notes/inbox/`
2. Run: `node pipeline.js`
3. Review outputs in `notes/processing/`

---

## Individual Steps

You can also run targeted commands using npm scripts:

```bash
npm run analyze    # Content Analyzer only
npm run edit       # Article Editor only
npm run seo        # SEO Generator only
npm run image      # Image Prompt Generator only
```

*(Note: individual steps require implementing a target flag — see pipeline.js CLI args section)*

---

## Bypassed Steps (Future)

### Approval Gate
- Reads the generated article
- Presents it for human review
- Writes `approved` or `rejected` status to a metadata file
- Approved articles move to the Medium Publisher

### Medium Publisher
- Reads the approved article + SEO JSON
- Posts to Medium via API
- Moves source file to `notes/published/`
- Returns the published URL

To enable these steps, set `"enabled": true` in `config/workflow_settings.json`
and add `MEDIUM_INTEGRATION_TOKEN` to your `.env`.
