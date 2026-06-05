"""
generate_pdf_preview.py
=======================
Generates a beautifully formatted PDF preview of a Medium article.

Reads:
  notes/processing/<slug>-article.md   — article content
  notes/processing/<slug>-seo.json     — SEO metadata
  notes/processing/<slug>-images.json  — Cloudinary image URLs

Outputs:
  notes/processing/<slug>-preview.pdf

Usage:
  python scripts/generate_pdf_preview.py
  python scripts/generate_pdf_preview.py ai-wont-take-your-job
"""

import sys
import os
import json
import re
import io
import urllib.request
import glob

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image as RLImage,
    HRFlowable, Table, TableStyle, KeepTogether, PageBreak
)
from reportlab.platypus.flowables import Flowable

# ── Paths ──────────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT       = os.path.dirname(SCRIPT_DIR)
PROCESSING = os.path.join(ROOT, "notes", "processing")

# ── Colors ─────────────────────────────────────────────────────────────────────

C_BG         = HexColor("#0f1117")
C_SURFACE    = HexColor("#1a1d27")
C_ACCENT     = HexColor("#3B82F6")
C_PURPLE     = HexColor("#8B5CF6")
C_TEXT       = HexColor("#E2E8F0")
C_MUTED      = HexColor("#94A3B8")
C_BORDER     = HexColor("#2a2d3a")
C_HERO_DARK  = HexColor("#0f1117")
C_TAG_BG     = HexColor("#1E3A5F")
C_GOLD       = HexColor("#F59E0B")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

# ── Styles ─────────────────────────────────────────────────────────────────────

def make_styles():
    return {
        "cover_title": ParagraphStyle(
            "cover_title",
            fontName="Helvetica-Bold",
            fontSize=28,
            leading=34,
            textColor=white,
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        "cover_subtitle": ParagraphStyle(
            "cover_subtitle",
            fontName="Helvetica",
            fontSize=13,
            leading=18,
            textColor=HexColor("#CBD5E1"),
            alignment=TA_LEFT,
            spaceAfter=6,
        ),
        "cover_tag": ParagraphStyle(
            "cover_tag",
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=HexColor("#93C5FD"),
            alignment=TA_LEFT,
            spaceAfter=14,
        ),
        "meta_label": ParagraphStyle(
            "meta_label",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=C_MUTED,
            spaceAfter=2,
        ),
        "meta_value": ParagraphStyle(
            "meta_value",
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=C_TEXT,
            spaceAfter=8,
        ),
        "section_label": ParagraphStyle(
            "section_label",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=C_ACCENT,
            spaceBefore=20,
            spaceAfter=8,
        ),
        "h1": ParagraphStyle(
            "h1",
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=28,
            textColor=white,
            spaceBefore=14,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2",
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=21,
            textColor=white,
            spaceBefore=20,
            spaceAfter=6,
            borderPad=0,
        ),
        "h3": ParagraphStyle(
            "h3",
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=17,
            textColor=HexColor("#93C5FD"),
            spaceBefore=14,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body",
            fontName="Helvetica",
            fontSize=10.5,
            leading=16,
            textColor=HexColor("#CBD5E1"),
            alignment=TA_JUSTIFY,
            spaceAfter=8,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            fontName="Helvetica",
            fontSize=10.5,
            leading=16,
            textColor=HexColor("#CBD5E1"),
            leftIndent=14,
            spaceAfter=4,
        ),
        "blockquote": ParagraphStyle(
            "blockquote",
            fontName="Helvetica-Oblique",
            fontSize=11,
            leading=17,
            textColor=HexColor("#93C5FD"),
            leftIndent=18,
            rightIndent=18,
            spaceAfter=10,
            spaceBefore=10,
        ),
        "caption": ParagraphStyle(
            "caption",
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=12,
            textColor=C_MUTED,
            alignment=TA_CENTER,
            spaceAfter=12,
        ),
        "image_label": ParagraphStyle(
            "image_label",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=C_ACCENT,
            alignment=TA_LEFT,
            spaceAfter=4,
        ),
        "tag_pill": ParagraphStyle(
            "tag_pill",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=HexColor("#93C5FD"),
            spaceAfter=0,
        ),
        "footer": ParagraphStyle(
            "footer",
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=C_MUTED,
            alignment=TA_CENTER,
        ),
        "code": ParagraphStyle(
            "code",
            fontName="Courier",
            fontSize=9,
            leading=13,
            textColor=HexColor("#A5F3FC"),
            backColor=HexColor("#0F172A"),
            leftIndent=10,
            rightIndent=10,
            spaceAfter=8,
            spaceBefore=4,
        ),
    }

# ── Dark background canvas ──────────────────────────────────────────────────────

def dark_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(C_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Bottom accent line
    canvas.setFillColor(C_ACCENT)
    canvas.rect(0, 0, PAGE_W, 2, fill=1, stroke=0)

    # Page number
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(C_MUTED)
    canvas.drawCentredString(PAGE_W / 2, 8 * mm, f"— {doc.page} —")

    canvas.restoreState()

# ── Colored box flowable ────────────────────────────────────────────────────────

class ColorBox(Flowable):
    def __init__(self, width, height, color, radius=4):
        super().__init__()
        self.box_width  = width
        self.box_height = height
        self.color      = color
        self.radius     = radius

    def wrap(self, *args):
        return self.box_width, self.box_height

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.roundRect(0, 0, self.box_width, self.box_height,
                            self.radius, fill=1, stroke=0)

# ── Divider ─────────────────────────────────────────────────────────────────────

def divider(color=C_BORDER, thickness=0.5, top=8, bottom=8):
    return HRFlowable(
        width="100%", thickness=thickness,
        color=color, spaceAfter=bottom, spaceBefore=top
    )

# ── Download image from URL ────────────────────────────────────────────────────

def fetch_image(url, max_width, max_height):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
        img = RLImage(io.BytesIO(data))
        # Scale to fit
        w, h = img.imageWidth, img.imageHeight
        ratio = min(max_width / w, max_height / h, 1.0)
        img.drawWidth  = w * ratio
        img.drawHeight = h * ratio
        return img
    except Exception as e:
        print(f"  ⚠️  Could not fetch image: {url} — {e}")
        return None

# ── Markdown → ReportLab flowables ────────────────────────────────────────────

def md_to_flowables(md_text, styles, images_map):
    """
    Convert markdown text into a list of ReportLab flowables.
    Handles: # headings, **bold**, *italic*, bullet lists, blockquotes,
             inline code, and [IMAGE:id] placeholders.
    """
    flowables = []
    lines = md_text.split("\n")
    i = 0
    img_counter = [0]  # mutable for closure

    def inline(text):
        """Convert inline markdown to ReportLab XML."""
        # Escape XML special chars first (except our tags)
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        # Bold+italic
        text = re.sub(r'\*\*\*(.+?)\*\*\*', r'<b><i>\1</i></b>', text)
        # Bold
        text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
        # Italic
        text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
        # Inline code
        text = re.sub(r'`(.+?)`', r'<font name="Courier" color="#A5F3FC">\1</font>', text)
        # Links — keep text only
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'<u>\1</u>', text)
        return text

    def add_image_by_id(img_id, label=""):
        if img_id in images_map:
            url = images_map[img_id]
            img_counter[0] += 1
            usable_w = PAGE_W - 2 * MARGIN
            flowables.append(Spacer(1, 6))
            lbl = label or img_id.replace("_", " ").title()
            flowables.append(Paragraph(f"◆ {lbl.upper()}", styles["image_label"]))
            img = fetch_image(url, usable_w, 200)
            if img:
                img.hAlign = "LEFT"
                flowables.append(img)
            flowables.append(Paragraph(f"Image {img_counter[0]}: {lbl}", styles["caption"]))
            flowables.append(Spacer(1, 4))

    while i < len(lines):
        line = lines[i]

        # ── [IMAGE:id] placeholder
        img_match = re.match(r'\[IMAGE:(\w+)\]', line.strip())
        if img_match:
            add_image_by_id(img_match.group(1))
            i += 1
            continue

        # ── H1
        if line.startswith("# "):
            text = inline(line[2:].strip())
            flowables.append(Paragraph(text, styles["h1"]))
            flowables.append(divider(C_ACCENT, 1.5, top=4, bottom=10))
            i += 1
            continue

        # ── H2
        if line.startswith("## "):
            text = inline(line[3:].strip())
            flowables.append(Paragraph(text, styles["h2"]))
            flowables.append(divider(C_BORDER, 0.5, top=2, bottom=8))
            i += 1
            continue

        # ── H3
        if line.startswith("### "):
            text = inline(line[4:].strip())
            flowables.append(Paragraph(text, styles["h3"]))
            i += 1
            continue

        # ── Blockquote
        if line.startswith("> "):
            text = inline(line[2:].strip())
            flowables.append(Paragraph(f'<i>"{text}"</i>', styles["blockquote"]))
            i += 1
            continue

        # ── Bullet list
        if re.match(r'^[-*+] ', line):
            text = inline(line[2:].strip())
            flowables.append(Paragraph(f"• {text}", styles["bullet"]))
            i += 1
            continue

        # ── Numbered list
        if re.match(r'^\d+\. ', line):
            num, rest = line.split(". ", 1)
            text = inline(rest.strip())
            flowables.append(Paragraph(f"<b>{num}.</b> {text}", styles["bullet"]))
            i += 1
            continue

        # ── Code block
        if line.startswith("```"):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            code_text = "<br/>".join(
                l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                for l in code_lines
            )
            flowables.append(Paragraph(code_text, styles["code"]))
            i += 1
            continue

        # ── Horizontal rule
        if re.match(r'^[-*_]{3,}$', line.strip()):
            flowables.append(divider(C_BORDER, 1, top=10, bottom=10))
            i += 1
            continue

        # ── Empty line
        if not line.strip():
            flowables.append(Spacer(1, 6))
            i += 1
            continue

        # ── Normal paragraph
        text = inline(line.strip())
        if text:
            flowables.append(Paragraph(text, styles["body"]))
        i += 1

    # After article text: inject any unused images
    used_ids = set(re.findall(r'\[IMAGE:(\w+)\]', md_text))
    for img_id, url in images_map.items():
        if img_id not in used_ids:
            add_image_by_id(img_id)

    return flowables

# ── Cover page ─────────────────────────────────────────────────────────────────

def build_cover(styles, title, seo, hero_url):
    cover = []

    # Hero image spanning full width
    if hero_url:
        usable_w = PAGE_W - 2 * MARGIN
        img = fetch_image(hero_url, usable_w, 140)
        if img:
            img.hAlign = "LEFT"
            cover.append(img)
            cover.append(Spacer(1, 14))

    # Tags row
    tags = seo.get("medium_tags", [])[:4]
    if tags:
        tag_text = "  ·  ".join(t.upper() for t in tags)
        cover.append(Paragraph(tag_text, styles["cover_tag"]))

    # Title
    safe_title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    cover.append(Paragraph(safe_title, styles["cover_title"]))

    # Summary
    summary = seo.get("article_summary", "")
    if summary:
        safe_summary = summary.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        cover.append(Paragraph(safe_summary, styles["cover_subtitle"]))

    cover.append(divider(C_ACCENT, 1.5, top=10, bottom=14))

    # Metadata grid
    meta_items = [
        ("Primary Keyword", seo.get("primary_keyword", "—")),
        ("Reading Time",    f"{seo.get('reading_time_minutes', '?')} min"),
        ("Slug",            seo.get("slug", "—")),
        ("SEO Title",       seo.get("seo_title", "—")),
    ]
    meta_data = []
    for label, value in meta_items:
        meta_data.append([
            Paragraph(label.upper(), styles["meta_label"]),
            Paragraph(
                str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"),
                styles["meta_value"]
            ),
        ])

    tbl = Table(meta_data, colWidths=[(PAGE_W - 2 * MARGIN) * 0.32,
                                       (PAGE_W - 2 * MARGIN) * 0.68])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_SURFACE),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [C_SURFACE, HexColor("#1e2133")]),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("GRID",          (0, 0), (-1, -1), 0.3, C_BORDER),
        ("ROUNDEDCORNERS", [4]),
    ]))
    cover.append(tbl)
    cover.append(PageBreak())
    return cover

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    # ── Resolve slug
    slug = sys.argv[1] if len(sys.argv) > 1 else None
    if not slug:
        pattern = os.path.join(PROCESSING, "*-article.md")
        matches = glob.glob(pattern)
        if not matches:
            print("❌  No *-article.md files found in notes/processing/")
            sys.exit(1)
        slug = os.path.basename(matches[0]).replace("-article.md", "")
        print(f"🔍  Auto-detected slug: {slug}")

    article_path = os.path.join(PROCESSING, f"{slug}-article.md")
    seo_path     = os.path.join(PROCESSING, f"{slug}-seo.json")
    images_path  = os.path.join(PROCESSING, f"{slug}-images.json")
    pdf_out      = os.path.join(PROCESSING, f"{slug}-preview.pdf")

    if not os.path.exists(article_path):
        print(f"❌  Article not found: {article_path}")
        sys.exit(1)

    print(f"\n{'='*62}")
    print(f"  AI Medium Platform — PDF Preview Generator")
    print(f"{'='*62}")
    print(f"  Slug   : {slug}")

    # ── Load files
    with open(article_path, "r") as f:
        md_text = f.read()

    seo = {}
    if os.path.exists(seo_path):
        with open(seo_path, "r") as f:
            seo = json.load(f)
        print(f"  SEO    : loaded")

    images_map = {}   # id → cloudinary URL
    hero_url   = None
    if os.path.exists(images_path):
        with open(images_path, "r") as f:
            images_data = json.load(f)
        for item in images_data:
            images_map[item["id"]] = item["cloudinary"]["url"]
        hero_url = images_map.get("hero")
        print(f"  Images : {len(images_map)} loaded")
    else:
        print(f"  Images : none found (run image_generator.js first)")

    # ── Extract title from markdown
    title_match = re.search(r'^#\s+(.+)', md_text, re.MULTILINE)
    title = title_match.group(1) if title_match else slug
    # Remove H1 from body (we render it on cover)
    md_body = re.sub(r'^#\s+.+\n?', '', md_text, count=1)

    print(f"  Title  : {title[:60]}")

    # ── Build PDF
    styles = make_styles()

    doc = SimpleDocTemplate(
        pdf_out,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=20 * mm,
    )

    story = []

    # Cover page
    story += build_cover(styles, title, seo, hero_url)

    # Article heading
    story.append(Paragraph("ARTICLE", styles["section_label"]))
    story.append(divider(C_ACCENT, 1, top=0, bottom=12))

    # Article body
    story += md_to_flowables(md_body, styles, images_map)

    # ── Build
    print(f"\n  Generating PDF...")
    doc.build(story, onFirstPage=dark_page, onLaterPages=dark_page)

    size_kb = os.path.getsize(pdf_out) // 1024
    print(f"  ✅  Saved: notes/processing/{slug}-preview.pdf  ({size_kb} KB)")
    print(f"\n  Open with:")
    print(f"     open notes/processing/{slug}-preview.pdf\n")

if __name__ == "__main__":
    main()