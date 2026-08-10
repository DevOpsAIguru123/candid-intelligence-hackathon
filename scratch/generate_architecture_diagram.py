import os
from PIL import Image, ImageDraw, ImageFont

def create_architecture_diagram():
    # Canvas setup (1920x1080 for presentation & LinkedIn high-res display)
    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), (15, 23, 42)) # Sleek dark slate theme (#0f172a)
    draw = ImageDraw.Draw(img)

    # Load system font
    font_path_bold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    font_path_reg = "/System/Library/Fonts/Supplemental/Arial.ttf"
    
    font_title = ImageFont.truetype(font_path_bold, 36)
    font_subtitle = ImageFont.truetype(font_path_reg, 20)
    font_header = ImageFont.truetype(font_path_bold, 22)
    font_sub = ImageFont.truetype(font_path_bold, 16)
    font_text = ImageFont.truetype(font_path_reg, 14)
    font_badge = ImageFont.truetype(font_path_bold, 13)

    # Grid background pattern
    for x in range(0, W, 40):
        draw.line([(x, 0), (x, H)], fill=(30, 41, 59), width=1)
    for y in range(0, H, 40):
        draw.line([(0, y), (W, y)], fill=(30, 41, 59), width=1)

    # Title Banner
    draw.rectangle([60, 40, W - 60, 120], fill=(30, 41, 59), outline=(51, 65, 85), width=2)
    draw.text((90, 52), "GTM Intelligence Agent — System Architecture", font=font_title, fill=(248, 250, 252))
    draw.text((90, 93), "Autonomous Event Agenda Ingestion, ICP Scoring & Outreach Signal Engine | GCP Cloud Run & Supabase", font=font_subtitle, fill=(148, 163, 184))

    # Helper function for drawing rounded rectangles
    def draw_box(x1, y1, x2, y2, bg_color, border_color, border_w=2, radius=12):
        draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=bg_color, outline=border_color, width=border_w)

    def draw_header_pill(x1, y1, width, height, text, bg_color, text_color):
        draw.rounded_rectangle([x1, y1, x1 + width, y1 + height], radius=6, fill=bg_color)
        bbox = draw.textbbox((0, 0), text, font=font_badge)
        tw = bbox[2] - bbox[0]
        draw.text((x1 + (width - tw) // 2, y1 + 5), text, font=font_badge, fill=text_color)

    def draw_arrow(start, end, color=(56, 189, 248), width=3):
        draw.line([start, end], fill=color, width=width)
        # Calculate arrow tip
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        import math
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
    # ZONE 1: USER / CLIENT & CI/CD (Left Column)
    # --------------------------------------------------------------------------
    # Box 1.1: Web User Client
    draw_box(60, 160, 440, 420, (30, 41, 59), (56, 189, 248))
    draw_header_pill(80, 175, 140, 26, "CLIENT LAYER", (14, 165, 233), (255, 255, 255))
    draw.text((80, 215), "Next.js 16 Web App UI", font=font_header, fill=(248, 250, 252))
    items_user = [
        "• Event Agenda Ingest Form (URL Paste)",
        "• Ranked ICP Lead & Speaker Cards",
        "• 'Why Now?' Buying Signal Cards",
        "• Event-Relative Sequence Builder",
        "• 8-Stage GTM Sales Funnel Board"
    ]
    for i, line in enumerate(items_user):
        draw.text((80, 255 + i * 28), line, font=font_text, fill=(203, 213, 225))

    # Box 1.2: DevOps & CI/CD Pipeline
    draw_box(60, 460, 440, 720, (30, 41, 59), (168, 85, 247))
    draw_header_pill(80, 475, 120, 26, "DEVOPS & CI/CD", (147, 51, 234), (255, 255, 255))
    draw.text((80, 515), "GitHub & Cloud Build", font=font_header, fill=(248, 250, 252))
    items_devops = [
        "• GitHub Repo (DevOpsAIguru123/...) ",
        "• Google Cloud Build (`gcloud builds`)",
        "• Automated Docker Build & Push",
        "• GCP Artifact Registry Repo",
        "• Vitest Automated Unit & Integration Suite"
    ]
    for i, line in enumerate(items_devops):
        draw.text((80, 555 + i * 28), line, font=font_text, fill=(203, 213, 225))

    # --------------------------------------------------------------------------
    # ZONE 2: GOOGLE CLOUD RUN COMPUTE (Center Column)
    # --------------------------------------------------------------------------
    draw_box(490, 160, 1100, 720, (15, 23, 42), (59, 130, 246), border_w=3)
    draw_header_pill(510, 175, 180, 26, "GCP CLOUD RUN SERVICE", (37, 99, 235), (255, 255, 255))
    draw.text((510, 215), "Container: speaker-signal-app (Port 3000)", font=font_header, fill=(96, 165, 250))

    # Sub-Box 2.1: Next.js Server Core
    draw_box(510, 260, 790, 460, (30, 41, 59), (71, 85, 105))
    draw.text((530, 275), "Next.js 16 Standalone", font=font_sub, fill=(248, 250, 252))
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
    draw_box(810, 260, 1080, 460, (30, 41, 59), (71, 85, 105))
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
    draw_box(510, 480, 1080, 690, (30, 41, 59), (71, 85, 105))
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
    # Box 3.1: OpenAI API
    draw_box(1150, 160, 1860, 310, (30, 41, 59), (16, 185, 129))
    draw_header_pill(1170, 175, 120, 26, "AI SERVICE", (5, 150, 105), (255, 255, 255))
    draw.text((1170, 215), "OpenAI gpt-4o / gpt-4o-mini", font=font_header, fill=(248, 250, 252))
    draw.text((1170, 250), "• Generates executive 'Why Now?' buying signals\n• Writes event-anchored outreach subjects & body drafts\n• Deterministic fallback on quota/network limits", font=font_text, fill=(203, 213, 225))

    # Box 3.2: Scraper / Ingestion Services
    draw_box(1150, 330, 1860, 480, (30, 41, 59), (245, 158, 11))
    draw_header_pill(1170, 345, 140, 26, "SCRAPER ENGINE", (217, 119, 6), (255, 255, 255))
    draw.text((1170, 385), "Cheerio & Firecrawl API", font=font_header, fill=(248, 250, 252))
    draw.text((1170, 420), "• Fast direct HTML + JSON-LD scraping\n• Firecrawl rendered fallback for dynamic JS SPA agendas\n• Public event agenda page parsing (DataCenterWorld, etc.)", font=font_text, fill=(203, 213, 225))

    # Box 3.3: Supabase PostgreSQL Database
    draw_box(1150, 500, 1860, 720, (30, 41, 59), (34, 197, 94))
    draw_header_pill(1170, 515, 170, 26, "POSTGRES DATABASE", (22, 163, 74), (255, 255, 255))
    draw.text((1170, 555), "Supabase PostgreSQL (`speaker_signal`)", font=font_header, fill=(248, 250, 252))
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
    draw_box(60, 750, 1860, 950, (30, 41, 59), (234, 179, 8))
    draw_header_pill(80, 765, 210, 26, "SECURITY & SECRET MANAGEMENT", (202, 138, 4), (255, 255, 255))
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
    # Client -> Cloud Run
    draw_arrow((440, 290), (490, 290), color=(56, 189, 248))
    draw.text((448, 268), "HTTP/2", font=font_badge, fill=(56, 189, 248))

    # Cloud Build -> Cloud Run
    draw_arrow((440, 590), (490, 590), color=(168, 85, 247))
    draw.text((445, 568), "Deploy", font=font_badge, fill=(168, 85, 247))

    # Cloud Run -> OpenAI
    draw_arrow((1100, 235), (1150, 235), color=(16, 185, 129))
    draw.text((1105, 213), "API Call", font=font_badge, fill=(16, 185, 129))

    # Cloud Run -> Firecrawl
    draw_arrow((1100, 405), (1150, 405), color=(245, 158, 11))
    draw.text((1108, 383), "Scrape", font=font_badge, fill=(245, 158, 11))

    # Cloud Run -> Supabase
    draw_arrow((1100, 610), (1150, 610), color=(34, 197, 94))
    draw.text((1108, 588), "SQL Query", font=font_badge, fill=(34, 197, 94))

    # Secret Manager -> Cloud Run
    draw_arrow((960, 750), (960, 720), color=(234, 179, 8))

    # Footer Caption
    draw.text((60, 985), "GTM Intelligence Agent Architecture · Deployed on Google Cloud Run & Supabase PostgreSQL · Live App: https://speaker-signal-app-128015056831.us-central1.run.app", font=font_text, fill=(148, 163, 184))

    # Ensure output dir exists
    out_dir = "/Users/vinodv/.gemini/antigravity/brain/2b56cc83-15df-41dd-bbe2-9203f1e1b5c1"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "gtm_agent_architecture.png")
    img.save(out_path)
    print(f"Architecture diagram successfully saved to: {out_path}")

if __name__ == "__main__":
    create_architecture_diagram()
