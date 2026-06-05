# Roadmap

## ✅ Phase 1 — Core Pipeline (Current)

- [x] Content Analyzer (raw note → structured JSON)
- [x] Article Editor (JSON → polished markdown article)
- [x] SEO Generator (article → SEO metadata)
- [x] Image Prompt Generator (article → AI image prompts)
- [x] CLI runner (process inbox files)

## 🔜 Phase 2 — Approval & Publishing

- [ ] Approval Gate (interactive CLI review)
  - Display article summary
  - Prompt: approve / reject / edit
  - Write status file
- [ ] Medium Publisher (auto-post via Medium API)
  - Post article with tags
  - Return published URL
  - Move to notes/published/

## 🔮 Phase 3 — Enhancements

- [ ] Per-step model overrides (via config/models.json)
- [ ] Batch processing with progress tracking
- [ ] Web dashboard (view inbox, processing, published)
- [ ] Scheduled runs (cron / GitHub Actions)
- [ ] Slack/Discord notifications on publish
- [ ] Multiple publication targets (Dev.to, Hashnode, Substack)
