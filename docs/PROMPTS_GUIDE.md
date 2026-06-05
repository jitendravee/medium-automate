# Prompts Guide

All prompts live in the `prompts/` directory. Each is a plain `.txt` file loaded at runtime.

## content_analyzer.txt

**Purpose:** Extract structure from raw, messy notes.

**Input:** Raw markdown text

**Output:** JSON object with keys:
`main_topic`, `core_thesis`, `audience`, `tone`, `article_angle`,
`key_arguments`, `supporting_examples`, `missing_opportunities`,
`article_structure`, `headline_ideas`, `key_takeaways`

**Tips for editing:**
- Add domain-specific patterns to the "Research-Based Writing Principles" section
- Extend the audience list for niche topics
- Add more headline type categories

---

## article_editor.txt

**Purpose:** Transform JSON blueprint into a full Medium article.

**Input:** JSON from content_analyzer

**Output:** Markdown article

**Tips for editing:**
- Add brand voice guidelines to "Writing Style"
- Specify article length in word count
- Add topic-specific tone notes

---

## seo_generator.txt

**Purpose:** Generate SEO metadata from the finished article.

**Input:** Markdown article

**Output:** JSON with SEO fields

**Tips for editing:**
- Add your publication's preferred Medium tags
- Adjust meta description character limits
- Include canonical domain if cross-posting

---

## image_prompt_generator.txt

**Purpose:** Create AI image generation prompts.

**Input:** Markdown article

**Output:** JSON with image prompts and style guide

**Tips for editing:**
- Specify a preferred illustration style (e.g., "always use flat design")
- Add brand color palette as default
- Specify preferred image generation tool (Midjourney vs DALL-E)

---

## medium_publisher.txt (Bypassed)

**Purpose:** Package article for final publishing.

**Input:** Article markdown + SEO JSON

**Output:** Final publishing brief JSON

Currently bypassed. Will be activated with the Medium API integration.
