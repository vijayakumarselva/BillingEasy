"""PDF invoice generator — GST-compliant tax invoice with configurable theme.

Supports:
  - Custom primary colour (header, grand-total row)
  - Company logo (base64 data URI stored in org doc)
  - Show / hide: ship-to, bank details, terms & conditions, signature box
  - CGST+SGST (same-state) or IGST (inter-state) layout
"""
import base64
from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image,
)
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
from num2words import num2words

# ── Font registration ─────────────────────────────────────────────────────────
_FONT_BASE = "BillEasySans"
_FONT_BOLD = "BillEasySans-Bold"
_FONT_REGISTERED = False

def _ensure_fonts():
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    for reg, bold in [
        ("/usr/share/fonts/truetype/freefont/FreeSans.ttf",
         "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]:
        try:
            pdfmetrics.registerFont(TTFont(_FONT_BASE, reg))
            pdfmetrics.registerFont(TTFont(_FONT_BOLD, bold))
            pdfmetrics.registerFontFamily(_FONT_BASE, normal=_FONT_BASE, bold=_FONT_BOLD,
                                          italic=_FONT_BASE, boldItalic=_FONT_BOLD)
            _FONT_REGISTERED = True
            return
        except Exception:
            continue

# ── Formatting helpers ────────────────────────────────────────────────────────
def _inr_amount(n: float) -> str:
    v = float(n or 0)
    neg = v < 0
    v = abs(v)
    int_part = f"{int(v)}"
    if len(int_part) > 3:
        last3 = int_part[-3:]
        rest = int_part[:-3]
        groups = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:]); rest = rest[:-2]
        if rest:
            groups.insert(0, rest)
        int_part = ",".join(groups) + "," + last3
    dec = f"{v - int(v):.2f}".split(".")[1]
    return ("-" if neg else "") + int_part + "." + dec

def _inr(n: float) -> str:
    return "₹" + _inr_amount(n)

def _amount_in_words(amount: float) -> str:
    rupees = int(amount)
    paise = round((amount - rupees) * 100)
    words = num2words(rupees, lang="en_IN").title()
    out = f"Rupees {words}"
    if paise:
        out += f" and {num2words(paise, lang='en_IN').title()} Paise"
    return out + " Only"

def _fmt_date(s: str) -> str:
    if not s: return "—"
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    except Exception:
        return str(s)

def _hex_to_color(h: str):
    """Convert #RRGGBB to ReportLab color. Falls back to blue on bad input."""
    try:
        h = h.strip().lstrip("#")
        return colors.HexColor(f"#{h}")
    except Exception:
        return colors.HexColor("#1D4ED8")

def _logo_image(data_uri: str, max_w_mm: float = 40, max_h_mm: float = 20):
    """Decode a base64 data URI and return a ReportLab Image object, or None."""
    try:
        if not data_uri or not data_uri.startswith("data:"):
            return None
        header, b64data = data_uri.split(",", 1)
        raw = base64.b64decode(b64data)
        buf = BytesIO(raw)
        img = Image(buf)
        # Scale to fit within max bounds keeping aspect ratio
        w, h = img.imageWidth, img.imageHeight
        scale = min((max_w_mm * mm) / w, (max_h_mm * mm) / h, 1.0)
        img.drawWidth = w * scale
        img.drawHeight = h * scale
        return img
    except Exception:
        return None

# ── Main generator ────────────────────────────────────────────────────────────
def generate_invoice_pdf(inv: dict, biz: dict, kind: str = "sale") -> bytes:
    _ensure_fonts()
    F  = _FONT_BASE if _FONT_REGISTERED else "Helvetica"
    FB = _FONT_BOLD if _FONT_REGISTERED else "Helvetica-Bold"

    # ── Theme ────────────────────────────────────────────────────────────────
    theme = biz.get("invoice_theme") or {}
    PRIMARY   = _hex_to_color(theme.get("primary_color") or "#1D4ED8")
    ACCENT    = _hex_to_color(theme.get("accent_color")  or "#1D4ED8")
    LIGHT_BG  = colors.HexColor("#EFF6FF")  # very light blue tint for alt rows
    SHOW_LOGO      = theme.get("show_logo",      True)
    SHOW_SHIP_TO   = theme.get("show_ship_to",   True)
    SHOW_BANK      = theme.get("show_bank",      True)
    SHOW_TERMS     = theme.get("show_terms",     True)
    SHOW_SIG       = theme.get("show_signature", True)
    WATERMARK      = theme.get("watermark",      "")  # e.g. "ORIGINAL", "DUPLICATE"

    # ── Labels ───────────────────────────────────────────────────────────────
    if kind == "purchase":
        type_label = {"purchase": "PURCHASE BILL", "debit_note": "DEBIT NOTE",
                      "purchase_return": "PURCHASE RETURN"}.get(inv.get("type", "purchase"), "PURCHASE BILL")
        ref_label = "Bill #"
    else:
        type_label = {"sale": "TAX INVOICE", "quotation": "QUOTATION",
                      "credit_note": "CREDIT NOTE", "sales_return": "SALES RETURN"}.get(inv.get("type", "sale"), "TAX INVOICE")
        ref_label = "Invoice #"

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm, topMargin=12*mm, bottomMargin=12*mm,
        title=f"{type_label} {inv.get('invoice_no','')}",
        author=biz.get("name", "BillingsEasy"),
    )

    # ── Paragraph styles ─────────────────────────────────────────────────────
    styles = getSampleStyleSheet()
    def PS(name, **kw):
        return ParagraphStyle(name, parent=styles["Normal"], fontName=F, **kw)

    s_company = PS("company", fontName=FB, fontSize=14, leading=18, textColor=PRIMARY, spaceAfter=2)
    s_title   = PS("title",   fontName=FB, fontSize=13, leading=17, textColor=PRIMARY,
                   alignment=TA_RIGHT)
    s_small   = PS("small",   fontSize=8, leading=11, spaceAfter=1)
    s_bold    = PS("bold",    fontName=FB, fontSize=9, leading=12, spaceAfter=2)
    s_label   = PS("label",   fontSize=7.5, leading=10, spaceAfter=3, textColor=colors.grey)
    s_right   = PS("right",   fontSize=9, leading=12, alignment=TA_RIGHT)
    s_center  = PS("center",  fontSize=8, leading=11, alignment=TA_CENTER)
    s_foot    = PS("foot",    fontSize=7.5, leading=10, textColor=colors.grey, alignment=TA_CENTER)
    s_sig     = PS("sig",     fontSize=8, leading=11, alignment=TA_RIGHT)
    s_words   = PS("words",   fontSize=8.5, leading=12)

    story = []

    # ── HEADER: logo + company info left | type + ref right ──────────────────
    logo_img = _logo_image(biz.get("logo_b64", "")) if SHOW_LOGO else None

    if logo_img:
        company_block = [logo_img,
                         Paragraph(biz.get("name", ""), s_company)]
    else:
        company_block = [Paragraph(biz.get("name", ""), s_company)]

    company_block += [
        Paragraph(biz.get("address", ""), s_small),
        Paragraph(f"GSTIN: <b>{biz.get('gstin','')}</b>  PAN: {biz.get('pan','')}", s_small),
        Paragraph(f"Phone: {biz.get('phone','')}  Email: {biz.get('email','')}", s_small),
    ]

    doc_right = [
        Paragraph(f"<b>{type_label}</b>", s_title),
        Spacer(1, 2*mm),
        Paragraph(f"<b>{ref_label}:</b> {inv.get('invoice_no','')}", PS("ir", fontSize=10, leading=13, alignment=TA_RIGHT)),
        Paragraph(f"<b>Date:</b> {_fmt_date(inv.get('invoice_date',''))}", PS("dr", fontSize=9, leading=12, alignment=TA_RIGHT)),
    ]
    if kind != "purchase" and inv.get("due_date"):
        doc_right.append(Paragraph(f"<b>Due:</b> {_fmt_date(inv.get('due_date',''))}", PS("dur", fontSize=9, leading=12, alignment=TA_RIGHT)))

    head = Table([[company_block, doc_right]], colWidths=[110*mm, 70*mm])
    head.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP")]))
    story.append(head)

    # Coloured divider line
    divider = Table([[""]], colWidths=[180*mm], rowHeights=[2])
    divider.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), PRIMARY)]))
    story.append(divider)
    story.append(Spacer(1, 3*mm))

    # ── BILL TO / SHIP TO ────────────────────────────────────────────────────
    party = inv.get("party_snapshot", {})

    def _party_block(heading, name, address, gstin, state, phone, contact_label=None):
        rows = [Paragraph(heading, s_label),
                Paragraph(f"<b>{name}</b>", s_bold)]
        if address:
            rows.append(Paragraph(address, s_small))
        rows.append(Paragraph(f"GSTIN: {gstin or '—'}  State: {state}", s_small))
        if phone:
            rows.append(Paragraph(f"Phone: {phone}", s_small))
        return rows

    if kind == "purchase":
        left_block = _party_block("BILL FROM (SUPPLIER)",
            party.get("name",""), party.get("billing_address",""),
            party.get("gstin",""), party.get("state",""), party.get("phone",""))
        right_block = _party_block("BILL TO (OUR COMPANY)",
            biz.get("name",""), biz.get("address",""),
            biz.get("gstin",""), biz.get("state",""), biz.get("phone",""))
        col_w = [90*mm, 90*mm]
    elif SHOW_SHIP_TO:
        left_block = _party_block("BILL TO",
            party.get("name",""), party.get("billing_address",""),
            party.get("gstin",""), party.get("state",""), party.get("phone",""))
        right_block = _party_block("SHIP TO",
            party.get("name",""),
            party.get("shipping_address") or party.get("billing_address",""),
            party.get("gstin",""), party.get("state",""), "")
        col_w = [90*mm, 90*mm]
    else:
        left_block = _party_block("BILL TO",
            party.get("name",""), party.get("billing_address",""),
            party.get("gstin",""), party.get("state",""), party.get("phone",""))
        right_block = []
        col_w = [180*mm]

    if right_block:
        bt = Table([[left_block, right_block]], colWidths=col_w)
    else:
        bt = Table([[left_block]], colWidths=col_w)

    bt.setStyle(TableStyle([
        ("BOX",        (0,0), (-1,-1), 0.5, colors.HexColor("#E5E7EB")),
        ("INNERGRID",  (0,0), (-1,-1), 0.5, colors.HexColor("#E5E7EB")),
        ("VALIGN",     (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",(0,0), (-1,-1), 6),
        ("RIGHTPADDING",(0,0),(-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
    ]))
    story.append(bt)
    story.append(Spacer(1, 4*mm))

    # ── LINE ITEMS TABLE ─────────────────────────────────────────────────────
    same_state = inv.get("same_state", True)
    if same_state:
        head_row = ["#", "Description", "HSN", "Qty", "Unit", "Rate", "Disc", "Taxable", "GST%", "CGST", "SGST", "Total"]
        col_w_items = [8, 42, 14, 12, 12, 16, 11, 18, 11, 14, 14, 18]
    else:
        head_row = ["#", "Description", "HSN", "Qty", "Unit", "Rate", "Disc", "Taxable", "GST%", "IGST", "", "Total"]
        col_w_items = [8, 42, 14, 12, 12, 16, 11, 18, 11, 18, 10, 18]

    rows = [head_row]
    for idx, it in enumerate(inv["items"], 1):
        rows.append([
            str(idx), it["name"], it.get("hsn","—"),
            f"{it['qty']:g}", it.get("unit","NOS"),
            _inr_amount(it["rate"]),
            f"{it.get('discount_pct',0):g}%",
            _inr_amount(it["taxable"]),
            f"{it.get('gst_rate',0):g}%",
            _inr_amount(it["cgst"]) if same_state else _inr_amount(it["igst"]),
            _inr_amount(it["sgst"]) if same_state else "",
            _inr_amount(it["total"]),
        ])

    item_table = Table(rows, colWidths=[w*mm for w in col_w_items], repeatRows=1)

    # Alternating row tint
    ts = [
        ("BACKGROUND",   (0,0), (-1,0), PRIMARY),
        ("TEXTCOLOR",    (0,0), (-1,0), colors.white),
        ("FONTNAME",     (0,0), (-1,0), FB),
        ("FONTNAME",     (0,1), (-1,-1), F),
        ("FONTSIZE",     (0,0), (-1,-1), 7.5),
        ("ALIGN",        (3,0), (-1,-1), "RIGHT"),
        ("ALIGN",        (0,0), (0,-1),  "CENTER"),
        ("ALIGN",        (1,1), (2,-1),  "LEFT"),
        ("INNERGRID",    (0,0), (-1,-1), 0.25, colors.HexColor("#E5E7EB")),
        ("BOX",          (0,0), (-1,-1), 0.5,  colors.HexColor("#E5E7EB")),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",   (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
    ]
    for i in range(2, len(rows), 2):          # even data rows (1-indexed header → 0)
        ts.append(("BACKGROUND", (0,i), (-1,i), LIGHT_BG))
    item_table.setStyle(TableStyle(ts))
    story.append(item_table)
    story.append(Spacer(1, 3*mm))

    # ── TOTALS ───────────────────────────────────────────────────────────────
    tot = inv["totals"]
    tot_rows = [["Subtotal", _inr(tot["subtotal"])]]
    if tot.get("discount", 0) > 0.005:
        tot_rows.append(["Discount", "-" + _inr_amount(tot["discount"])])
    tot_rows.append(["Taxable Amount", _inr(tot["taxable_amount"])])
    if same_state:
        tot_rows.append(["CGST", _inr(tot["cgst"])])
        tot_rows.append(["SGST", _inr(tot["sgst"])])
    else:
        tot_rows.append(["IGST", _inr(tot["igst"])])
    if abs(tot.get("round_off", 0)) > 0.005:
        ro = tot["round_off"]
        tot_rows.append(["Round Off", ("-" if ro < 0 else "") + _inr_amount(abs(ro))])
    tot_rows.append(["GRAND TOTAL", _inr(tot["grand_total"])])

    tt = Table(tot_rows, colWidths=[50*mm, 40*mm], hAlign="RIGHT")
    tt.setStyle(TableStyle([
        ("FONTNAME",     (0,0), (-1,-2), F),
        ("FONTNAME",     (0,-1),(-1,-1), FB),
        ("FONTSIZE",     (0,0), (-1,-2), 9),
        ("FONTSIZE",     (0,-1),(-1,-1), 11),
        ("ALIGN",        (1,0), (1,-1), "RIGHT"),
        ("BACKGROUND",   (0,-1),(-1,-1), PRIMARY),
        ("TEXTCOLOR",    (0,-1),(-1,-1), colors.white),
        ("LINEABOVE",    (0,-1),(-1,-1), 0.5, PRIMARY),
        ("TOPPADDING",   (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ]))
    story.append(tt)
    story.append(Spacer(1, 4*mm))

    story.append(Paragraph(f"<b>Amount in Words:</b> {_amount_in_words(tot['grand_total'])}", s_words))
    story.append(Spacer(1, 4*mm))

    # ── BANK DETAILS + TERMS ─────────────────────────────────────────────────
    if kind == "purchase":
        notes_block = [
            Paragraph("<b>Notes</b>", s_bold),
            Paragraph((inv.get("notes", "") or "—").replace("\n", "<br/>"), s_small),
        ]
        bb = Table([[notes_block]], colWidths=[180*mm])
    else:
        left_col = []
        right_col = []

        if SHOW_BANK:
            left_col = [
                Paragraph("<b>Bank Details</b>", s_bold),
                Paragraph(f"Bank: {biz.get('bank_name','—')}", s_small),
                Paragraph(f"A/c: {biz.get('bank_account','—')}", s_small),
                Paragraph(f"IFSC: {biz.get('bank_ifsc','—')}", s_small),
                Paragraph(f"Branch: {biz.get('bank_branch','—')}", s_small),
            ]

        if SHOW_TERMS and biz.get("terms"):
            right_col = [
                Paragraph("<b>Terms &amp; Conditions</b>", s_bold),
                Paragraph((biz.get("terms", "") or "").replace("\n", "<br/>"), s_small),
            ]

        if left_col and right_col:
            bb = Table([[left_col, right_col]], colWidths=[80*mm, 100*mm])
        elif left_col:
            bb = Table([[left_col]], colWidths=[180*mm])
        elif right_col:
            bb = Table([[right_col]], colWidths=[180*mm])
        else:
            bb = None

    if bb:
        bb.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP")]))
        story.append(bb)

    story.append(Spacer(1, 8*mm))

    # ── SIGNATURE ────────────────────────────────────────────────────────────
    if SHOW_SIG:
        sig_right_content = [
            Paragraph(f"<b>For {biz.get('name','')}</b>", s_sig),
            Spacer(1, 12*mm),
            Paragraph("Authorized Signatory", s_sig),
        ]
        sig = Table([["", sig_right_content]], colWidths=[110*mm, 70*mm])
        story.append(sig)
        story.append(Spacer(1, 3*mm))

    # ── FOOTER ───────────────────────────────────────────────────────────────
    story.append(Paragraph(
        f"<i>This is a computer-generated {'purchase bill' if kind == 'purchase' else 'invoice'} and does not require a physical signature.</i>",
        s_foot,
    ))

    # ── WATERMARK (drawn on canvas after build) ───────────────────────────────
    if WATERMARK:
        def _draw_watermark(canvas, doc):
            canvas.saveState()
            canvas.setFont(FB if _FONT_REGISTERED else "Helvetica-Bold", 72)
            canvas.setFillColor(colors.Color(0.85, 0.85, 0.85, alpha=0.35))
            canvas.translate(A4[0]/2, A4[1]/2)
            canvas.rotate(45)
            canvas.drawCentredString(0, 0, WATERMARK.upper())
            canvas.restoreState()
        doc.build(story, onFirstPage=_draw_watermark, onLaterPages=_draw_watermark)
    else:
        doc.build(story)

    return buf.getvalue()
