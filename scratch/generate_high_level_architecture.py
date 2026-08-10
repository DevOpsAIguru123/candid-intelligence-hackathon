import os
import math
from PIL import Image, ImageDraw, ImageFont

def create_high_level_diagram():
    W, H = 1920, 1080
    img = Image.new("RGBA", (W, H), (15, 23, 42, 255)) # Sleek dark slate background #0f172a
    draw = ImageDraw.Draw(img)

    # Fonts
    font_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 40)
    font_subtitle = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22)
    font_block_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 26)
    font_block_sub = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 18)
    font_text = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 16)
    font_badge = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 14)

    # Grid background
    for x in range(0, W, 50):
        draw.line([(x, 0), (x, H)], fill=(30, 41, 59, 255), width=1)
    for y in range(0, H, 50):
        draw.line([(0, y), (W, y)], fill=(30, 41, 59, 255), width=1)

    # Header Title Banner
    draw.rounded_rectangle([80, 50, W - 80, 140], radius=16, fill=(30, 41, 59, 255), outline=(51, 65, 85, 255), width=2)
    draw.text((120, 65), "GTM Intelligence Agent — High-Level Architecture", font=font_title, fill=(248, 250, 252))
    draw.text((120, 112), "Autonomous Event Agenda Ingestion, ICP Scoring & Executive Outreach Engine", font=font_subtitle, fill=(148, 163, 184))

    def draw_box(x1, y1, x2, y2, bg_color, border_color, border_w=3, radius=16):
        draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=bg_color, outline=border_color, width=border_w)

    def draw_header_pill(x1, y1, width, height, text, bg_color, text_color=(255, 255, 255)):
        draw.rounded_rectangle([x1, y1, x1 + width, y1 + height], radius=8, fill=bg_color)
        bbox = draw.textbbox((0, 0), text, font=font_badge)
        tw = bbox[2] - bbox[0]
        draw.text((x1 + (width - tw) // 2, y1 + 6), text, font=font_badge, fill=text_color)

    def draw_arrow(start, end, label="", color=(56, 189, 248), width=4):
        draw.line([start, end], fill=color, width=width)
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        angle = math.atan2(dy, dx)
        arrow_len = 16
        left_angle = angle + math.pi * 5 / 6
        right_angle = angle - math.pi * 5 / 6
        lx = end[0] + arrow_len * math.cos(left_angle)
        ly = end[1] + arrow_len * math.sin(left_angle)
        rx = end[0] + arrow_len * math.cos(right_angle)
        ry = end[1] + arrow_len * math.sin(right_angle)
        draw.polygon([end, (lx, ly), (rx, ry)], fill=color)
        
        if label:
            mx = (start[0] + end[0]) // 2
            my = (start[1] + end[1]) // 2 - 18
            bbox = draw.textbbox((0, 0), label, font=font_badge)
            tw = bbox[2] - bbox[0]
            draw.rounded_rectangle([mx - tw//2 - 8, my - 2, mx + tw//2 + 8, my + 20], radius=4, fill=(15, 23, 42, 230))
            draw.text((mx - tw//2, my), label, font=font_badge, fill=color)

    # --------------------------------------------------------------------------
    # OFFICIAL VECTOR ICONS
    # --------------------------------------------------------------------------
    def draw_nextjs_icon(cx, cy, size=28):
        draw.ellipse([cx - size, cy - size, cx + size, cy + size], fill=(0, 0, 0), outline=(255, 255, 255), width=2)
        draw.line([(cx - 12, cy - 14), (cx - 12, cy + 14)], fill=(255, 255, 255), width=4)
        draw.line([(cx + 10, cy - 14), (cx + 10, cy + 14)], fill=(255, 255, 255), width=4)
        draw.line([(cx - 12, cy - 14), (cx + 10, cy + 14)], fill=(255, 255, 255), width=4)

    def draw_chatgpt_icon(cx, cy, size=28):
        draw.ellipse([cx - size, cy - size, cx + size, cy + size], fill=(16, 163, 127))
        for i in range(6):
            a = i * (math.pi / 3)
            px = cx + int(11 * math.cos(a))
            py = cy + int(11 * math.sin(a))
            draw.ellipse([px - 7, py - 7, px + 7, py + 7], outline=(255, 255, 255), width=2)

    def draw_gcp_icon(cx, cy, size=28):
        draw.ellipse([cx - size, cy - size, cx + size, cy + size], fill=(255, 255, 255))
        draw.ellipse([cx - 20, cy - 12, cx + 2, cy + 12], fill=(66, 133, 244))
        draw.ellipse([cx - 10, cy - 20, cx + 14, cy + 2], fill=(234, 67, 53))
        draw.ellipse([cx + 2, cy - 12, cx + 20, cy + 12], fill=(251, 188, 5))
        draw.ellipse([cx - 12, cy + 2, cx + 12, cy + 20], fill=(52, 168, 83))

    def draw_firecrawl_icon(cx, cy, size=28):
        draw.ellipse([cx - size, cy - size, cx + size, cy + size], fill=(249, 115, 22))
        draw.polygon([(cx, cy - 18), (cx + 12, cy - 2), (cx + 14, cy + 12), (cx, cy + 18), (cx - 14, cy + 12), (cx - 12, cy - 2)], fill=(254, 240, 138))

    def draw_supabase_icon(cx, cy, size=28):
        draw.ellipse([cx - size, cy - size, cx + size, cy + size], fill=(24, 24, 27), outline=(62, 207, 142), width=2)
        draw.polygon([(cx - 5, cy - 16), (cx + 12, cy - 2), (cx + 3, cy + 2), (cx + 7, cy + 16), (cx - 12, cy + 2), (cx - 3, cy - 2)], fill=(62, 207, 142))

    def draw_user_icon(cx, cy, size=28):
        draw.ellipse([cx - size, cy - size, cx + size, cy + size], fill=(14, 165, 233))
        # User head & shoulders
        draw.ellipse([cx - 10, cy - 14, cx + 10, cy + 4], fill=(255, 255, 255))
        draw.ellipse([cx - 18, cy + 8, cx + 18, cy + 30], fill=(255, 255, 255))

    # --------------------------------------------------------------------------
    # HIGH-LEVEL ARCHITECTURE NODES (5 Core Pillars)
    # --------------------------------------------------------------------------
    
    # Pillar 1: User / Sales Team
    draw_box(80, 220, 420, 680, (30, 41, 59, 255), (56, 189, 248, 255))
    draw_header_pill(100, 240, 160, 32, "1. USER / FRONTEND", (14, 165, 233))
    draw_user_icon(130, 310, 28)
    draw.text((175, 295), "B2B Sales & GTM User", font=font_block_title, fill=(248, 250, 252))
    draw.text((100, 345), "Next.js 16 Web Dashboard", font=font_block_sub, fill=(56, 189, 248))
    
    user_points = [
        "• Submits public conference URL",
        "• Views ranked ICP lead cards",
        "• Reviews 'Why Now?' buying signals",
        "• Approves outreach sequences",
        "• Tracks 8-stage GTM funnel"
    ]
    for i, p in enumerate(user_points):
        draw.text((100, 395 + i * 36), p, font=font_text, fill=(203, 213, 225))

    # Pillar 2: GTM Intelligence Core (Google Cloud Run)
    draw_box(480, 220, 1020, 680, (30, 41, 59, 255), (59, 130, 246, 255), border_w=4)
    draw_header_pill(500, 240, 200, 32, "2. GTM INTELLIGENCE CORE", (37, 99, 235))
    draw_gcp_icon(535, 310, 28)
    draw.text((580, 295), "Google Cloud Run Engine", font=font_block_title, fill=(96, 165, 250))
    draw.text((500, 345), "Serverless Next.js Orchestrator", font=font_block_sub, fill=(147, 197, 253))
    
    core_points = [
        "• Agenda Ingestion & Parsing Engine",
        "• Speaker Contact Normalization",
        "• 100-Point Explainable ICP Scorer",
        "• Event-Anchored Outreach Generator",
        "• Human-in-the-Loop State Machine"
    ]
    for i, p in enumerate(core_points):
        draw.text((500, 395 + i * 36), p, font=font_text, fill=(241, 245, 249))

    # Pillar 3: AI Engine (ChatGPT / OpenAI)
    draw_box(1080, 220, 1460, 430, (30, 41, 59, 255), (16, 185, 129, 255))
    draw_header_pill(1100, 240, 140, 32, "3. AI ENGINE", (5, 150, 105))
    draw_chatgpt_icon(1135, 310, 26)
    draw.text((1175, 298), "ChatGPT / OpenAI", font=font_block_title, fill=(248, 250, 252))
    draw.text((1100, 345), "gpt-4o Signal Generator", font=font_text, fill=(203, 213, 225))
    draw.text((1100, 375), "• 'Why Now?' Executive Triggers\n• Personalized Email Sequences", font=font_text, fill=(148, 163, 184))

    # Pillar 4: Event Scraper (Firecrawl & Cheerio)
    draw_box(1080, 470, 1460, 680, (30, 41, 59, 255), (245, 158, 11, 255))
    draw_header_pill(1100, 490, 160, 32, "4. EVENT SCRAPER", (217, 119, 6))
    draw_firecrawl_icon(1135, 560, 26)
    draw.text((1175, 548), "Firecrawl & Cheerio", font=font_block_title, fill=(248, 250, 252))
    draw.text((1100, 595), "Web Agenda Extractor", font=font_text, fill=(203, 213, 225))
    draw.text((1100, 625), "• Direct HTML + JSON-LD Extractor\n• Headless Browser JS SPA Fallback", font=font_text, fill=(148, 163, 184))

    # Pillar 5: Persistence Database (Supabase PostgreSQL)
    draw_box(1520, 220, 1840, 680, (30, 41, 59, 255), (34, 197, 94, 255))
    draw_header_pill(1540, 240, 170, 32, "5. DATA STORAGE", (22, 163, 74))
    draw_supabase_icon(1575, 310, 26)
    draw.text((1615, 298), "Supabase Postgres", font=font_block_title, fill=(248, 250, 252))
    draw.text((1540, 345), "Relational Database", font=font_block_sub, fill=(74, 222, 128))
    
    db_points = [
        "• Conferences Table",
        "• Speakers & Contacts",
        "• Outreach Sequences",
        "• GTM Funnel Events",
        "• Auto-Migrations"
    ]
    for i, p in enumerate(db_points):
        draw.text((1540, 395 + i * 36), p, font=font_text, fill=(203, 213, 225))

    # --------------------------------------------------------------------------
    # CONNECTING ARROWS & DATA FLOW
    # --------------------------------------------------------------------------
    # User <-> GTM Core
    draw_arrow((420, 450), (480, 450), label="Conference URL", color=(56, 189, 248))
    
    # GTM Core -> AI Engine
    draw_arrow((1020, 325), (1080, 325), label="Prompt Context", color=(16, 185, 129))
    
    # GTM Core -> Event Scraper
    draw_arrow((1020, 575), (1080, 575), label="Scrape Request", color=(245, 158, 11))
    
    # GTM Core -> Supabase Database
    draw_arrow((1020, 450), (1520, 450), label="SQL Storage", color=(34, 197, 94))

    # --------------------------------------------------------------------------
    # FOOTER BANNER
    # --------------------------------------------------------------------------
    draw_box(80, 730, W - 80, 950, (30, 41, 59, 255), (148, 163, 184, 255))
    draw_header_pill(100, 750, 230, 32, "ENTERPRISE DEPLOYMENT & DEV", (71, 85, 105))
    
    draw_nextjs_icon(120, 810, 20)
    draw.text((150, 798), "Next.js 16 App Router", font=font_block_sub, fill=(248, 250, 252))
    draw.text((150, 825), "React 19, Turbopack, Standalone Build", font=font_text, fill=(148, 163, 184))

    draw_gcp_icon(620, 810, 20)
    draw.text((650, 798), "Google Cloud Run & Cloud Build", font=font_block_sub, fill=(96, 165, 250))
    draw.text((650, 825), "Automated Docker CI/CD & Secret Manager", font=font_text, fill=(148, 163, 184))

    draw_supabase_icon(1220, 810, 20)
    draw.text((1250, 798), "Supabase PostgreSQL", font=font_block_sub, fill=(74, 222, 128))
    draw.text((1250, 825), "Session Pooler (Port 5432) & Auto Schema Migrations", font=font_text, fill=(148, 163, 184))

    # Live Caption
    draw.text((80, 985), "GTM Intelligence Agent — High-Level Architecture · Deployed on Google Cloud Run & Supabase · Live App: https://speaker-signal-app-128015056831.us-central1.run.app", font=font_text, fill=(148, 163, 184))

    out_dir = "/Users/vinodv/.gemini/antigravity/brain/2b56cc83-15df-41dd-bbe2-9203f1e1b5c1"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "gtm_agent_high_level_architecture.png")
    img.save(out_path)
    print(f"High-level architecture diagram successfully saved to: {out_path}")

if __name__ == "__main__":
    create_high_level_diagram()
