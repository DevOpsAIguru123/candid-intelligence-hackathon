import os
import math
from PIL import Image, ImageDraw, ImageFont

def create_official_icon_diagram():
    W, H = 1920, 1080
    img = Image.new("RGBA", (W, H), (15, 23, 42, 255)) # Dark slate background #0f172a
    draw = ImageDraw.Draw(img)

    # Fonts
    font_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 36)
    font_subtitle = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 20)
    font_header = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)
    font_sub = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 16)
    font_text = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    font_badge = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 13)

    # Grid background
    for x in range(0, W, 40):
        draw.line([(x, 0), (x, H)], fill=(30, 41, 59, 255), width=1)
    for y in range(0, H, 40):
        draw.line([(0, y), (W, y)], fill=(30, 41, 59, 255), width=1)

    # Title Banner
    draw.rounded_rectangle([60, 40, W - 60, 125], radius=12, fill=(30, 41, 59, 255), outline=(51, 65, 85, 255), width=2)
    draw.text((90, 52), "GTM Intelligence Agent — Technical Architecture", font=font_title, fill=(248, 250, 252))
    draw.text((90, 93), "Official System Components, AI Engine & Data Flow Pipeline | Google Cloud & Supabase Infrastructure", font=font_subtitle, fill=(148, 163, 184))

    def draw_box(x1, y1, x2, y2, bg_color, border_color, border_w=2, radius=12):
        draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=bg_color, outline=border_color, width=border_w)

    def draw_header_pill(x1, y1, width, height, text, bg_color, text_color=(255, 255, 255)):
        draw.rounded_rectangle([x1, y1, x1 + width, y1 + height], radius=6, fill=bg_color)
        bbox = draw.textbbox((0, 0), text, font=font_badge)
        tw = bbox[2] - bbox[0]
        draw.text((x1 + (width - tw) // 2, y1 + 5), text, font=font_badge, fill=text_color)

    def draw_arrow(start, end, color=(56, 189, 248), width=3):
        draw.line([start, end], fill=color, width=width)
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        angle = math.atan2(dy, dx)
        arrow_len = 12
        left_angle = angle + math.pi * 5 / 6
        right_angle = angle - math.pi * 5 / 6
        lx = end[0] + arrow_len * math.cos(left_angle)
        ly = end[1] + arrow_len * math.sin(left_angle)
        rx = end[0] + arrow_len * math.cos(right_angle)
        ry = end[1] + arrow_len * math.sin(right_angle)
        draw.polygon([end, (lx, ly), (rx, ry)], fill=color)

    # --------------------------------------------------------------------------
    # DRAW OFFICIAL VECTOR LOGO ICONS
    # --------------------------------------------------------------------------
    
    # 1. Next.js Official Logo Icon
    def draw_nextjs_icon(cx, cy, size=24):
        # Black circle with sleek white N logo
        r = size
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 0, 0), outline=(255, 255, 255), width=2)
        # N left vertical stem
        draw.line([(cx - 10, cy - 12), (cx - 10, cy + 12)], fill=(255, 255, 255), width=4)
        # N right vertical stem
        draw.line([(cx + 8, cy - 12), (cx + 8, cy + 12)], fill=(255, 255, 255), width=4)
        # N diagonal stroke
        draw.line([(cx - 10, cy - 12), (cx + 8, cy + 12)], fill=(255, 255, 255), width=4)

    # 2. ChatGPT / OpenAI Official Logo Icon
    def draw_chatgpt_icon(cx, cy, size=24):
        # Green / Teal circle with ChatGPT 6-petal spiral
        draw.ellipse([cx - size, cy - size, cx + size, cy + size], fill=(16, 163, 127))
        for i in range(6):
            a = i * (math.pi / 3)
            px = cx + int(9 * math.cos(a))
            py = cy + int(9 * math.sin(a))
            draw.ellipse([px - 6, py - 6, px + 6, py + 6], outline=(255, 255, 255), width=2)

    # 3. Google Cloud / Cloud Run Official Logo Icon
    def draw_gcp_icon(cx, cy, size=24):
        # 4-color GCP cloud emblem
        draw.ellipse([cx - size, cy - size, cx + size, cy + size], fill=(255, 255, 255))
        draw.ellipse([cx - 18, cy - 10, cx + 2, cy + 10], fill=(66, 133, 244))  # Blue
        draw.ellipse([cx - 8, cy - 18, cx + 12, cy + 2], fill=(234, 67, 53))   # Red
        draw.ellipse([cx + 2, cy - 10, cx + 18, cy + 10], fill=(251, 188, 5))  # Yellow
        draw.ellipse([cx - 10, cy + 2, cx + 10, cy + 18], fill=(52, 168, 83))  # Green

    # 4. Firecrawl Official Logo Icon
    def draw_firecrawl_icon(cx, cy, size=24):
        # Orange/Red Flame emblem
        draw.ellipse([cx - size, cy - size, cx + size, cy + size], fill=(249, 115, 22))
        # Flame shape
        draw.polygon([(cx, cy - 16), (cx + 10, cy - 2), (cx + 12, cy + 10), (cx, cy + 16), (cx - 12, cy + 10), (cx - 10, cy - 2)], fill=(254, 240, 138))
        draw.polygon([(cx, cy - 8), (cx + 5, cy + 2), (cx, cy + 10), (cx - 5, cy + 2)], fill=(234, 88, 12))

    # 5. Supabase / Postgres Official Logo Icon
    def draw_supabase_icon(cx, cy, size=24):
        # Dark green shield with Emerald Lightning bolt
        draw.ellipse([cx - size, cy - size, cx + size, cy + size], fill=(24, 24, 27), outline=(62, 207, 142), width=2)
        # Emerald bolt
        draw.polygon([(cx - 4, cy - 14), (cx + 10, cy - 2), (cx + 2, cy + 2), (cx + 6, cy + 14), (cx - 10, cy + 2), (cx - 2, cy - 2)], fill=(62, 207, 142))

    # 6. GitHub Official Logo Icon
    def draw_github_icon(cx, cy, size=24):
        # Dark circle with white Octocat silhouette
        draw.ellipse([cx - size, cy - size, cx + size, cy + size], fill=(36, 41, 47), outline=(255, 255, 255), width=2)
        # Head
        draw.ellipse([cx - 12, cy - 10, cx + 12, cy + 12], fill=(255, 255, 255))
        # Cat ears
        draw.polygon([(cx - 12, cy - 8), (cx - 16, cy - 16), (cx - 6, cy - 12)], fill=(255, 255, 255))
        draw.polygon([(cx + 12, cy - 8), (cx + 16, cy - 16), (cx + 6, cy - 12)], fill=(255, 255, 255))

    # --------------------------------------------------------------------------
    # ZONE 1: USER / CLIENT & CI/CD (Left Column)
    # --------------------------------------------------------------------------
    # Box 1.1: Web User Client
    draw_box(60, 160, 440, 420, (30, 41, 59, 255), (56, 189, 248, 255))
    draw_header_pill(80, 175, 140, 26, "CLIENT LAYER", (14, 165, 233))
    
    draw_nextjs_icon(105, 225, 20)
    draw.text((135, 213), "Next.js 16 Client App", font=font_header, fill=(248, 250, 252))
    
    items_user = [
        "• Event Agenda Ingest Form (URL Paste)",
        "• Ranked ICP Lead & Speaker Cards",
        "• 'Why Now?' Buying Signal Cards",
        "• Event-Relative Sequence Builder",
        "• 8-Stage GTM Sales Funnel Board"
    ]
    for i, line in enumerate(items_user):
        draw.text((80, 258 + i * 28), line, font=font_text, fill=(203, 213, 225))

    # Box 1.2: DevOps & CI/CD Pipeline
    draw_box(60, 460, 440, 720, (30, 41, 59, 255), (168, 85, 247, 255))
    draw_header_pill(80, 475, 120, 26, "DEVOPS & CI/CD", (147, 51, 234))
    
    draw_github_icon(105, 525, 20)
    draw.text((135, 513), "GitHub & Cloud Build", font=font_header, fill=(248, 250, 252))
    
    items_devops = [
        "• GitHub Repo (DevOpsAIguru123/...)",
        "• Google Cloud Build (`gcloud builds`)",
        "• Automated Docker Build & Push",
        "• GCP Artifact Registry Repo",
        "• Vitest Automated Test Suite"
    ]
    for i, line in enumerate(items_devops):
        draw.text((80, 558 + i * 28), line, font=font_text, fill=(203, 213, 225))

    # --------------------------------------------------------------------------
    # ZONE 2: GOOGLE CLOUD RUN COMPUTE (Center Column)
    # --------------------------------------------------------------------------
    draw_box(490, 160, 1100, 720, (15, 23, 42, 255), (59, 130, 246, 255), border_w=3)
    draw_header_pill(510, 175, 200, 26, "GOOGLE CLOUD RUN SERVICE", (37, 99, 235))
    
    draw_gcp_icon(535, 225, 20)
    draw.text((565, 213), "Service: speaker-signal-app (Port 3000)", font=font_header, fill=(96, 165, 250))

    # Sub-Box 2.1: Next.js Server Core
    draw_box(510, 260, 790, 460, (30, 41, 59, 255), (71, 85, 105, 255))
    draw_nextjs_icon(535, 285, 14)
    draw.text((558, 275), "Next.js 16 Server", font=font_sub, fill=(248, 250, 252))
    server_items = [
        "• App Router (Turbopack)",
        "• Server Actions & Routing",
        "• Global Connection Pool",
        "• Safe Error Middleware",
        "• `/tmp/` Directory Resolver"
    ]
    for i, line in enumerate(server_items):
        draw.text((530, 310 + i * 26), line, font=font_text, fill=(203, 213, 225))

    # Sub-Box 2.2: API Endpoints
    draw_box(810, 260, 1080, 460, (30, 41, 59, 255), (71, 85, 105, 255))
    draw.text((830, 275), "API Route Handlers", font=font_sub, fill=(248, 250, 252))
    api_items = [
        "• `POST /api/ingest`",
        "• `POST /api/plan`",
        "• `GET /api/calendar`",
        "• Robust Try/Catch Handlers",
        "• JSON Error Contract"
    ]
    for i, line in enumerate(api_items):
        draw.text((830, 310 + i * 26), line, font=font_text, fill=(203, 213, 225))

    # Sub-Box 2.3: Processing Modules
    draw_box(510, 480, 1080, 690, (30, 41, 59, 255), (71, 85, 105, 255))
    draw.text((530, 495), "Core Intelligence Modules", font=font_sub, fill=(248, 250, 252))
    modules = [
        "1. Ingestion Engine — Direct HTML & JSON-LD Extractor + Firecrawl Fallback",
        "2. Normalization & Deduplication — Clean names, titles, companies & dedupe keys",
        "3. ICP Scoring Engine — 100-point fit evaluation + matched evidence audit trail",
        "4. AI Signal & Outreach — OpenAI gpt-4o / gpt-4o-mini 'Why Now?' & Sequence Generator",
        "5. Funnel & Plan Repository — 8-Stage GTM state machine & human approvals"
    ]
    for i, line in enumerate(modules):
        draw.text((530, 530 + i * 28), line, font=font_text, fill=(226, 232, 240))

    # --------------------------------------------------------------------------
    # ZONE 3: EXTERNAL SERVICES & DATA PERSISTENCE (Right Column)
    # --------------------------------------------------------------------------
    # Box 3.1: OpenAI / ChatGPT API
    draw_box(1150, 160, 1860, 310, (30, 41, 59, 255), (16, 185, 129, 255))
    draw_header_pill(1170, 175, 130, 26, "AI ENGINE", (5, 150, 105))
    
    draw_chatgpt_icon(1195, 225, 20)
    draw.text((1225, 213), "OpenAI & ChatGPT API (gpt-4o)", font=font_header, fill=(248, 250, 252))
    draw.text((1170, 250), "• Generates executive 'Why Now?' buying signals\n• Writes event-anchored outreach subjects & body drafts\n• Deterministic fallback on quota/network limits", font=font_text, fill=(203, 213, 225))

    # Box 3.2: Firecrawl Scraper Engine
    draw_box(1150, 330, 1860, 480, (30, 41, 59, 255), (245, 158, 11, 255))
    draw_header_pill(1170, 345, 140, 26, "SCRAPER ENGINE", (217, 119, 6))
    
    draw_firecrawl_icon(1195, 395, 20)
    draw.text((1225, 383), "Cheerio & Firecrawl API", font=font_header, fill=(248, 250, 252))
    draw.text((1170, 420), "• Fast direct HTML + JSON-LD scraping\n• Firecrawl rendered fallback for dynamic JS SPA agendas\n• Public event agenda page parsing (DataCenterWorld, etc.)", font=font_text, fill=(203, 213, 225))

    # Box 3.3: Supabase PostgreSQL Database
    draw_box(1150, 500, 1860, 720, (30, 41, 59, 255), (34, 197, 94, 255))
    draw_header_pill(1170, 515, 170, 26, "DATABASE LAYER", (22, 163, 74))
    
    draw_supabase_icon(1195, 565, 20)
    draw.text((1225, 553), "Supabase PostgreSQL Database", font=font_header, fill=(248, 250, 252))
    db_items = [
        "• Tables: `conferences`, `speakers`, `sequence_steps`, `funnel_events`",
        "• Schema Migrations: `db/migrations/` with auto-column handlers",
        "• Connection Pool: Supabase Session Pooler on Port 5432",
        "• SSL Enabled & Quote-trimmed connection parsing"
    ]
    for i, line in enumerate(db_items):
        draw.text((1170, 595 + i * 26), line, font=font_text, fill=(203, 213, 225))

    # --------------------------------------------------------------------------
    # ZONE 4: SECURITY & CONFIG (Bottom Banner)
    # --------------------------------------------------------------------------
    draw_box(60, 750, 1860, 950, (30, 41, 59, 255), (234, 179, 8, 255))
    draw_header_pill(80, 765, 220, 26, "SECURITY & SECRET MANAGEMENT", (202, 138, 4))
    draw.text((80, 805), "GCP Secret Manager & Environment Variable Isolation", font=font_header, fill=(248, 250, 252))
    sec_items = [
        "• Secrets Managed: `DATABASE_URL` (Supabase Pooler), `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`",
        "• Local Dev Fallback: `.env.local` with strict quote-trimming parser",
        "• Container Security: Non-root `nextjs` user inside read-only `/app` container filesystem, routing SQLite writes to `/tmp/`",
        "• Public URL Safety: Server-side validation rejecting private IPs (`127.0.0.1`, `169.254.169.254`) & dangerous schemes"
    ]
    for i, line in enumerate(sec_items):
        draw.text((80, 840 + i * 24), line, font=font_text, fill=(226, 232, 240))

    # Connectors & Arrows
    draw_arrow((440, 290), (490, 290), color=(56, 189, 248))
    draw.text((448, 268), "HTTP/2", font=font_badge, fill=(56, 189, 248))

    draw_arrow((440, 590), (490, 590), color=(168, 85, 247))
    draw.text((445, 568), "Deploy", font=font_badge, fill=(168, 85, 247))

    draw_arrow((1100, 235), (1150, 235), color=(16, 185, 129))
    draw.text((1105, 213), "API Call", font=font_badge, fill=(16, 185, 129))

    draw_arrow((1100, 405), (1150, 405), color=(245, 158, 11))
    draw.text((1108, 383), "Scrape", font=font_badge, fill=(245, 158, 11))

    draw_arrow((1100, 610), (1150, 610), color=(34, 197, 94))
    draw.text((1108, 588), "SQL Query", font=font_badge, fill=(34, 197, 94))

    draw_arrow((960, 750), (960, 720), color=(234, 179, 8))

    # Footer Caption
    draw.text((60, 985), "GTM Intelligence Agent Architecture · Featuring Official Next.js, ChatGPT/OpenAI, Google Cloud, Firecrawl, Supabase & GitHub Logos · Live App: https://speaker-signal-app-128015056831.us-central1.run.app", font=font_text, fill=(148, 163, 184))

    out_dir = "/Users/vinodv/.gemini/antigravity/brain/2b56cc83-15df-41dd-bbe2-9203f1e1b5c1"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "gtm_agent_official_icons_architecture.png")
    img.save(out_path)
    print(f"Official icon architecture diagram successfully saved to: {out_path}")

if __name__ == "__main__":
    create_official_icon_diagram()
