"""PDF invoice generator — Zoho-style GST-compliant tax invoice.

Layout mirrors the Zoho Spreadsheet template:
  - Company logo + info left | "TAX INVOICE" large right
  - Invoice meta table (Number, Date, Terms, Due Date | Place of Supply)
  - Bill To / Ship To two-column
  - Items table with merged CGST/SGST sub-headers
  - Footer: amount-in-words + bank details LEFT | totals table RIGHT
  - Authorized Signature bottom-right
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
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, HRFlowable,
)
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
from num2words import num2words

# ── Font registration ──────────────────────────────────────────────────────────
_FONT_BASE = "BillEasySans"
_FONT_BOLD = "BillEasySans-Bold"
_FONT_IT   = "BillEasySans-It"
_FONT_REGISTERED = False

def _ensure_fonts():
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    candidates = [
        ("/usr/share/fonts/truetype/freefont/FreeSans.ttf",
         "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
         "/usr/share/fonts/truetype/freefont/FreeSansOblique.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"),
    ]
    for reg, bold, it in candidates:
        try:
            pdfmetrics.registerFont(TTFont(_FONT_BASE, reg))
            pdfmetrics.registerFont(TTFont(_FONT_BOLD, bold))
            try:
                pdfmetrics.registerFont(TTFont(_FONT_IT, it))
            except Exception:
                pdfmetrics.registerFont(TTFont(_FONT_IT, reg))
            pdfmetrics.registerFontFamily(_FONT_BASE, normal=_FONT_BASE, bold=_FONT_BOLD,
                                          italic=_FONT_IT, boldItalic=_FONT_BOLD)
            _FONT_REGISTERED = True
            return
        except Exception:
            continue

# ── Helpers ────────────────────────────────────────────────────────────────────
GREY      = colors.HexColor("#555555")
LIGHT_GREY= colors.HexColor("#F3F4F6")
BORDER    = colors.HexColor("#D1D5DB")
BLACK     = colors.HexColor("#111111")
WHITE     = colors.white

def _inr_amount(n) -> str:
    v = abs(float(n or 0))
    neg = float(n or 0) < 0
    i = f"{int(v)}"
    if len(i) > 3:
        last3 = i[-3:]; rest = i[:-3]; groups = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:]); rest = rest[:-2]
        if rest: groups.insert(0, rest)
        i = ",".join(groups) + "," + last3
    dec = f"{v - int(v):.2f}".split(".")[1]
    return ("-" if neg else "") + i + "." + dec

def _inr(n) -> str:
    return "₹" + _inr_amount(n)

def _fmt_date(s: str) -> str:
    if not s: return "—"
    try: return datetime.strptime(str(s)[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    except Exception: return str(s)

def _hex_color(h: str):
    try: return colors.HexColor(f"#{h.strip().lstrip('#')}")
    except Exception: return colors.HexColor("#1D4ED8")

def _amount_words(amount: float) -> str:
    rupees = int(amount)
    paise  = round((amount - rupees) * 100)
    words  = num2words(rupees, lang="en_IN").title()
    out = f"Indian Rupee {words}"
    if paise:
        out += f" and {num2words(paise, lang='en_IN').title()} Paise"
    return out + " Only"

def _logo_image(data_uri: str, max_w=30*mm, max_h=18*mm):
    try:
        if not data_uri or not data_uri.startswith("data:"): return None
        _, b64 = data_uri.split(",", 1)
        img = Image(BytesIO(base64.b64decode(b64)))
        scale = min(max_w / img.imageWidth, max_h / img.imageHeight, 1.0)
        img.drawWidth  = img.imageWidth  * scale
        img.drawHeight = img.imageHeight * scale
        return img
    except Exception:
        return None

# ── Main generator ─────────────────────────────────────────────────────────────
def generate_invoice_pdf(inv: dict, biz: dict, kind: str = "sale", template: str = "classic") -> bytes:
    if template == "modern":
        return _generate_modern_pdf(inv, biz, kind)
    if template == "compact":
        return _generate_compact_pdf(inv, biz, kind)
    # default: classic (existing template)
    _ensure_fonts()
    F  = _FONT_BASE if _FONT_REGISTERED else "Helvetica"
    FB = _FONT_BOLD if _FONT_REGISTERED else "Helvetica-Bold"
    FI = _FONT_IT   if _FONT_REGISTERED else "Helvetica-Oblique"

    theme   = biz.get("invoice_theme") or {}
    PRIMARY = _hex_color(theme.get("primary_color") or "#1D4ED8")
    SHOW_LOGO    = theme.get("show_logo",      True)
    SHOW_SHIP_TO = theme.get("show_ship_to",   True)
    SHOW_BANK    = theme.get("show_bank",      True)
    SHOW_TERMS   = theme.get("show_terms",     True)
    SHOW_SIG     = theme.get("show_signature", True)
    WATERMARK    = theme.get("watermark",      "")

    # Doc type label
    if kind == "purchase":
        type_label = {"purchase": "PURCHASE BILL", "debit_note": "DEBIT NOTE",
                      "purchase_return": "PURCHASE RETURN"}.get(inv.get("type", "purchase"), "PURCHASE BILL")
    else:
        type_label = {"sale": "TAX INVOICE", "quotation": "QUOTATION",
                      "credit_note": "CREDIT NOTE", "sales_return": "SALES RETURN"}.get(inv.get("type", "sale"), "TAX INVOICE")

    buf = BytesIO()
    CW = 180*mm   # content width

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm, topMargin=12*mm, bottomMargin=12*mm,
        title=f"{type_label} {inv.get('invoice_no','')}",
        author=biz.get("name", "BillingsEasy"),
    )

    # ── Paragraph style factory ───────────────────────────────────────────────
    def PS(name, **kw):
        defaults = dict(fontName=F, fontSize=9, leading=13, textColor=BLACK)
        defaults.update(kw)
        return ParagraphStyle(name, **defaults)

    s_co_name  = PS("co_name",  fontName=FB, fontSize=13, leading=17, textColor=BLACK)
    s_co_info  = PS("co_info",  fontSize=8,  leading=12,  textColor=GREY)
    s_title    = PS("title",    fontName=FB, fontSize=28, leading=34,
                    textColor=colors.HexColor("#AAAAAA"), alignment=TA_RIGHT)
    s_meta_lbl = PS("meta_lbl", fontSize=8,  leading=11,  textColor=GREY)
    s_meta_val = PS("meta_val", fontName=FB, fontSize=8.5, leading=12)
    s_sec_hdr  = PS("sec_hdr",  fontName=FB, fontSize=8,  leading=11,  textColor=GREY)
    s_party_nm = PS("party_nm", fontName=FB, fontSize=9.5, leading=13)
    s_party    = PS("party",    fontSize=8,  leading=12,  textColor=GREY)
    s_tbl_hdr  = PS("tbl_hdr",  fontName=FB, fontSize=7.5, leading=10,
                    textColor=WHITE, alignment=TA_CENTER)
    s_tbl_cell = PS("tbl_cell", fontSize=7.5, leading=10)
    s_tbl_num  = PS("tbl_num",  fontSize=7.5, leading=10, alignment=TA_RIGHT)
    s_tbl_ctr  = PS("tbl_ctr",  fontSize=7.5, leading=10, alignment=TA_CENTER)
    s_words_lbl= PS("wl",       fontName=FB, fontSize=8,  leading=11)
    s_words_val= PS("wv",       fontName=FI, fontSize=8.5, leading=13, textColor=BLACK)
    s_bank_lbl = PS("bl",       fontSize=8,  leading=11,  textColor=GREY)
    s_bank_val = PS("bv",       fontSize=8,  leading=12)
    s_tot_lbl  = PS("tl",       fontSize=8.5, leading=13)
    s_tot_val  = PS("tv",       fontSize=8.5, leading=13, alignment=TA_RIGHT)
    s_tot_bold = PS("tb",       fontName=FB, fontSize=9.5, leading=14)
    s_tot_bold_r=PS("tbr",      fontName=FB, fontSize=9.5, leading=14, alignment=TA_RIGHT)
    s_sig      = PS("sig",      fontSize=8,  leading=11,  textColor=GREY, alignment=TA_CENTER)
    s_foot     = PS("foot",     fontSize=7,  leading=10,  textColor=GREY, alignment=TA_CENTER)

    story = []

    # ─────────────────────────────────────────────────────────────────────────
    # 1. HEADER: Logo + company left | "TAX INVOICE" right
    # ─────────────────────────────────────────────────────────────────────────
    logo = _logo_image(biz.get("logo_b64", "")) if SHOW_LOGO else None

    co_items = []
    if logo:
        co_items.append(logo)
        co_items.append(Spacer(1, 2*mm))
    co_items.append(Paragraph(biz.get("name", ""), s_co_name))
    addr = biz.get("address", "").replace("\n", "<br/>")
    if addr:
        co_items.append(Paragraph(addr, s_co_info))
    co_items.append(Paragraph(f"GSTIN {biz.get('gstin', '')}", s_co_info))
    if biz.get("phone"): co_items.append(Paragraph(f"+{biz.get('phone','').lstrip('+')}", s_co_info))
    if biz.get("email"): co_items.append(Paragraph(biz.get("email", ""), s_co_info))

    head = Table(
        [[co_items, Paragraph(type_label, s_title)]],
        colWidths=[105*mm, 75*mm],
    )
    head.setStyle(TableStyle([
        ("VALIGN",      (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 0),
        ("RIGHTPADDING",(0,0), (-1,-1), 0),
        ("TOPPADDING",  (0,0), (-1,-1), 0),
        ("BOTTOMPADDING",(0,0),(-1,-1), 0),
    ]))
    story.append(head)
    story.append(Spacer(1, 3*mm))
    story.append(HRFlowable(width=CW, thickness=0.5, color=BORDER))
    story.append(Spacer(1, 3*mm))

    # ─────────────────────────────────────────────────────────────────────────
    # 2. INVOICE META: Number | Date | Terms | Due Date || Place of Supply
    # ─────────────────────────────────────────────────────────────────────────
    party     = inv.get("party_snapshot", {})
    state_cd  = party.get("state_code", "33")
    state_nm  = party.get("state", "")
    pos_text  = f"{state_nm} ({state_cd})" if state_nm else state_cd

    due_date_str  = _fmt_date(inv.get("due_date", "")) or "Due on Receipt"
    terms_str     = inv.get("notes_terms", "Due on Receipt") if not inv.get("due_date") else "Due on Receipt"

    def _meta(label, value):
        return [Paragraph(label, s_meta_lbl), Paragraph(value, s_meta_val)]

    left_meta = [
        _meta("Invoice Number", f": {inv.get('invoice_no','')}"),
        _meta("Invoice Date",   f": {_fmt_date(inv.get('invoice_date',''))}"),
        _meta("Terms",          ": Due on Receipt"),
        _meta("Due Date",       f": {due_date_str}"),
    ]
    # po number if present
    if inv.get("po_number"):
        left_meta.append(_meta("PO Number", f": {inv.get('po_number','')}"))

    right_meta = [
        _meta("Place Of Supply", f": {pos_text}"),
    ]

    def _meta_table(rows):
        """Each row is [label_para, value_para]"""
        data = [[r[0], r[1]] for r in rows]
        t = Table(data, colWidths=[28*mm, 57*mm])
        t.setStyle(TableStyle([
            ("FONTNAME",     (0,0), (-1,-1), F),
            ("FONTSIZE",     (0,0), (-1,-1), 8),
            ("TOPPADDING",   (0,0), (-1,-1), 1),
            ("BOTTOMPADDING",(0,0), (-1,-1), 1),
            ("LEFTPADDING",  (0,0), (-1,-1), 0),
            ("RIGHTPADDING", (0,0), (-1,-1), 0),
            ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ]))
        return t

    meta_tbl = Table(
        [[_meta_table(left_meta), _meta_table(right_meta)]],
        colWidths=[90*mm, 90*mm],
    )
    meta_tbl.setStyle(TableStyle([
        ("BOX",         (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID",   (0,0), (-1,-1), 0.5, BORDER),
        ("VALIGN",      (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 5),
        ("RIGHTPADDING",(0,0), (-1,-1), 5),
        ("TOPPADDING",  (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 0))

    # ─────────────────────────────────────────────────────────────────────────
    # 3. BILL TO / SHIP TO
    # ─────────────────────────────────────────────────────────────────────────
    def _addr_block(heading, name, address, gstin, phone=""):
        rows = [Paragraph(heading, s_sec_hdr)]
        if name: rows.append(Paragraph(f"<b>{name}</b>", s_party_nm))
        if address:
            rows.append(Paragraph(address.replace("\n","<br/>"), s_party))
        if gstin: rows.append(Paragraph(f"GSTIN {gstin}", s_party))
        if phone: rows.append(Paragraph(phone, s_party))
        return rows

    bill_addr = party.get("billing_address", "") or party.get("address", "")
    ship_addr = inv.get("shipping_address", "") or party.get("shipping_address", "") or bill_addr

    if kind == "purchase":
        left_blk  = _addr_block("BILL FROM (SUPPLIER)",
            party.get("name",""), bill_addr, party.get("gstin",""), party.get("phone",""))
        right_blk = _addr_block("BILL TO (OUR COMPANY)",
            biz.get("name",""), biz.get("address",""), biz.get("gstin",""), "")
        show_two = True
    else:
        left_blk = _addr_block("Bill To",
            party.get("name",""), bill_addr, party.get("gstin",""), party.get("phone",""))
        if SHOW_SHIP_TO and ship_addr:
            right_blk = _addr_block("Ship To", "", ship_addr, "", "")
            show_two = True
        else:
            right_blk = []
            show_two = False

    if show_two:
        bt = Table([[left_blk, right_blk]], colWidths=[90*mm, 90*mm])
    else:
        bt = Table([[left_blk]], colWidths=[CW])

    bt.setStyle(TableStyle([
        ("BOX",         (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID",   (0,0), (-1,-1), 0.5, BORDER),
        ("VALIGN",      (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING",(0,0), (-1,-1), 6),
        ("TOPPADDING",  (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ("LINEABOVE",   (0,0), (-1,0), 0, BORDER),  # top already from BOX
    ]))
    story.append(bt)
    story.append(Spacer(1, 4*mm))

    # ─────────────────────────────────────────────────────────────────────────
    # 4. LINE ITEMS TABLE (Zoho style: merged CGST/SGST headers)
    # ─────────────────────────────────────────────────────────────────────────
    same_state = inv.get("same_state", True)
    items_data = inv.get("items", [])

    def P(txt, style): return Paragraph(str(txt), style)

    if same_state:
        # 10 data columns: # | Item | HSN | Qty | Rate | CGST% | CGST Amt | SGST% | SGST Amt | Amount
        # 2-row header: row0 uses SPAN for CGST/SGST; row1 has %, Amt sub-headers
        hdr0 = [
            P("#", s_tbl_hdr), P("Item &amp; Description", s_tbl_hdr),
            P("HSN\n/SAC", s_tbl_hdr), P("Qty", s_tbl_hdr), P("Rate", s_tbl_hdr),
            P("CGST", s_tbl_hdr), "",   # SPAN (5,0)-(6,0)
            P("SGST", s_tbl_hdr), "",   # SPAN (7,0)-(8,0)
            P("Amount", s_tbl_hdr),
        ]
        hdr1 = [
            "", "", "", "", "",
            P("%", s_tbl_hdr), P("Amt", s_tbl_hdr),
            P("%", s_tbl_hdr), P("Amt", s_tbl_hdr),
            "",
        ]
        rows = [hdr0, hdr1]
        for idx, it in enumerate(items_data, 1):
            gst = it.get("gst_rate", 0)
            half = gst / 2
            rows.append([
                P(str(idx), s_tbl_ctr),
                P(it.get("name",""), s_tbl_cell),
                P(it.get("hsn","—"), s_tbl_ctr),
                P(f"{it.get('qty',0):g}\n{it.get('unit','NOS')}", s_tbl_ctr),
                P(_inr_amount(it.get("rate",0)), s_tbl_num),
                P(f"{half:g}%", s_tbl_ctr),
                P(_inr_amount(it.get("cgst",0)), s_tbl_num),
                P(f"{half:g}%", s_tbl_ctr),
                P(_inr_amount(it.get("sgst",0)), s_tbl_num),
                P(_inr_amount(it.get("total",0)), s_tbl_num),
            ])
        col_w = [8, 48, 14, 14, 18, 10, 17, 10, 17, 24]   # total 180mm

        item_tbl = Table(rows, colWidths=[w*mm for w in col_w], repeatRows=2)
        ts = [
            # Header row 0
            ("BACKGROUND",   (0,0), (-1,1), PRIMARY),
            ("TEXTCOLOR",    (0,0), (-1,1), WHITE),
            # CGST span
            ("SPAN",         (5,0), (6,0)),
            ("ALIGN",        (5,0), (6,0), "CENTER"),
            # SGST span
            ("SPAN",         (7,0), (8,0)),
            ("ALIGN",        (7,0), (8,0), "CENTER"),
            # # and Amount span across both header rows
            ("SPAN",         (0,0), (0,1)),
            ("SPAN",         (1,0), (1,1)),
            ("SPAN",         (2,0), (2,1)),
            ("SPAN",         (3,0), (3,1)),
            ("SPAN",         (4,0), (4,1)),
            ("SPAN",         (9,0), (9,1)),
            # Grid
            ("BOX",          (0,0), (-1,-1), 0.5, BORDER),
            ("INNERGRID",    (0,0), (-1,-1), 0.25, BORDER),
            ("FONTNAME",     (0,2), (-1,-1), F),
            ("FONTSIZE",     (0,0), (-1,-1), 7.5),
            ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING",   (0,0), (-1,-1), 3),
            ("BOTTOMPADDING",(0,0), (-1,-1), 3),
        ]
    else:
        # Inter-state: # | Item | HSN | Qty | Rate | IGST% | IGST Amt | Amount
        hdr0 = [
            P("#", s_tbl_hdr), P("Item &amp; Description", s_tbl_hdr),
            P("HSN\n/SAC", s_tbl_hdr), P("Qty", s_tbl_hdr), P("Rate", s_tbl_hdr),
            P("IGST", s_tbl_hdr), "",
            P("Amount", s_tbl_hdr),
        ]
        hdr1 = ["", "", "", "", "", P("%", s_tbl_hdr), P("Amt", s_tbl_hdr), ""]
        rows = [hdr0, hdr1]
        for idx, it in enumerate(items_data, 1):
            rows.append([
                P(str(idx), s_tbl_ctr),
                P(it.get("name",""), s_tbl_cell),
                P(it.get("hsn","—"), s_tbl_ctr),
                P(f"{it.get('qty',0):g}\n{it.get('unit','NOS')}", s_tbl_ctr),
                P(_inr_amount(it.get("rate",0)), s_tbl_num),
                P(f"{it.get('gst_rate',0):g}%", s_tbl_ctr),
                P(_inr_amount(it.get("igst",0)), s_tbl_num),
                P(_inr_amount(it.get("total",0)), s_tbl_num),
            ])
        col_w = [8, 60, 16, 16, 22, 12, 22, 24]   # 180mm

        item_tbl = Table(rows, colWidths=[w*mm for w in col_w], repeatRows=2)
        ts = [
            ("BACKGROUND",   (0,0), (-1,1), PRIMARY),
            ("TEXTCOLOR",    (0,0), (-1,1), WHITE),
            ("SPAN",         (5,0), (6,0)),
            ("ALIGN",        (5,0), (6,0), "CENTER"),
            ("SPAN",         (0,0), (0,1)),("SPAN",(1,0),(1,1)),("SPAN",(2,0),(2,1)),
            ("SPAN",         (3,0),(3,1)),("SPAN",(4,0),(4,1)),("SPAN",(7,0),(7,1)),
            ("BOX",          (0,0), (-1,-1), 0.5, BORDER),
            ("INNERGRID",    (0,0), (-1,-1), 0.25, BORDER),
            ("FONTNAME",     (0,2), (-1,-1), F),
            ("FONTSIZE",     (0,0), (-1,-1), 7.5),
            ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING",   (0,0), (-1,-1), 3),
            ("BOTTOMPADDING",(0,0), (-1,-1), 3),
        ]

    # Alternate row shading (data rows start at index 2)
    for i in range(2, len(rows)):
        if (i % 2) == 0:
            ts.append(("BACKGROUND", (0,i), (-1,i), LIGHT_GREY))
    item_tbl.setStyle(TableStyle(ts))
    story.append(item_tbl)
    story.append(Spacer(1, 4*mm))

    # ─────────────────────────────────────────────────────────────────────────
    # 5. FOOTER: Amount-in-words + bank LEFT | Totals RIGHT
    # ─────────────────────────────────────────────────────────────────────────
    tot = inv.get("totals", {})
    grand = tot.get("grand_total", 0)

    # Left: total-in-words + bank details
    left_footer = [
        Paragraph("Total In Words", s_words_lbl),
        Paragraph(f"<i>{_amount_words(grand)}</i>", s_words_val),
        Spacer(1, 3*mm),
    ]
    if SHOW_BANK and kind != "purchase":
        # Try bank accounts from biz
        banks = biz.get("bank_accounts", [])
        if not banks:
            # Fallback to legacy flat fields
            bname = biz.get("bank_name","")
            bacc  = biz.get("bank_account","")
            bifsc = biz.get("bank_ifsc","")
            bbranch = biz.get("bank_branch","")
            if bname or bacc:
                left_footer.append(Paragraph("Bank account details:", s_bank_lbl))
                if biz.get("name"): left_footer.append(Paragraph(f"A/c Name: {biz.get('name')}", s_bank_val))
                if bacc:   left_footer.append(Paragraph(f"A/c Number: {bacc}", s_bank_val))
                if bifsc:  left_footer.append(Paragraph(f"IFSC: {bifsc}", s_bank_val))
                if bbranch:left_footer.append(Paragraph(f"Branch: {bbranch}", s_bank_val))
        else:
            for b in banks[:2]:
                left_footer.append(Paragraph("Bank account details:", s_bank_lbl))
                left_footer.append(Paragraph(f"A/c Name: {b.get('account_name') or biz.get('name','')}", s_bank_val))
                left_footer.append(Paragraph(f"A/c Number: {b.get('account_no','')}", s_bank_val))
                left_footer.append(Paragraph(f"IFSC: {b.get('ifsc','')}", s_bank_val))
                if b.get("bank_name"): left_footer.append(Paragraph(f"Bank: {b.get('bank_name')}", s_bank_val))
                left_footer.append(Spacer(1, 2*mm))

    if SHOW_TERMS and biz.get("terms"):
        left_footer.append(Spacer(1, 3*mm))
        left_footer.append(Paragraph("<b>Terms &amp; Conditions</b>", s_bank_lbl))
        left_footer.append(Paragraph(biz.get("terms","").replace("\n","<br/>"), s_bank_val))

    if inv.get("notes") and kind != "purchase":
        left_footer.append(Spacer(1, 3*mm))
        left_footer.append(Paragraph("<b>Notes</b>", s_bank_lbl))
        left_footer.append(Paragraph(inv.get("notes","").replace("\n","<br/>"), s_bank_val))

    # Right: totals table
    def _tot_row(label, value, bold=False):
        if bold:
            return [Paragraph(label, s_tot_bold), Paragraph(value, s_tot_bold_r)]
        return [Paragraph(label, s_tot_lbl), Paragraph(value, s_tot_val)]

    subtotal = tot.get("subtotal", 0)
    taxable  = tot.get("taxable_amount", 0)
    discount = tot.get("discount", 0)
    cgst     = tot.get("cgst", 0)
    sgst     = tot.get("sgst", 0)
    igst     = tot.get("igst", 0)
    ro       = tot.get("round_off", 0)
    paid     = inv.get("paid", 0)
    due      = inv.get("due", grand)

    tot_rows_data = []
    # Sub Total (Tax Inclusive) — matches Zoho style
    tot_rows_data.append(_tot_row("Sub Total\n(Tax Inclusive)", _inr_amount(subtotal)))
    if discount > 0.005:
        tot_rows_data.append(_tot_row("Discount", "-" + _inr_amount(discount)))
    if same_state:
        gst_rate = (items_data[0].get("gst_rate", 18) if items_data else 18)
        half     = gst_rate / 2
        tot_rows_data.append(_tot_row(f"CGST{half:g} ({half:g}%)", _inr_amount(cgst)))
        tot_rows_data.append(_tot_row(f"SGST{half:g} ({half:g}%)", _inr_amount(sgst)))
    else:
        gst_rate = (items_data[0].get("gst_rate", 18) if items_data else 18)
        tot_rows_data.append(_tot_row(f"IGST ({gst_rate:g}%)", _inr_amount(igst)))
    if abs(ro) > 0.005:
        tot_rows_data.append(_tot_row("Round Off", ("-" if ro < 0 else "") + _inr_amount(abs(ro))))
    tot_rows_data.append(_tot_row("Total", _inr(grand), bold=True))
    tot_rows_data.append(_tot_row("Balance Due", _inr(due if due >= 0 else 0), bold=True))

    tot_tbl = Table(tot_rows_data, colWidths=[45*mm, 35*mm])
    tot_ts = [
        ("FONTNAME",     (0,0), (-1,-1), F),
        ("FONTSIZE",     (0,0), (-1,-1), 8.5),
        ("ALIGN",        (1,0), (1,-1), "RIGHT"),
        ("TOPPADDING",   (0,0), (-1,-1), 3),
        ("BOTTOMPADDING",(0,0), (-1,-1), 3),
        ("LEFTPADDING",  (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("BOX",          (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID",    (0,0), (-1,-1), 0.25, BORDER),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
    ]
    # Bold the "Total" and "Balance Due" rows
    n = len(tot_rows_data)
    for ri in range(n-2, n):
        tot_ts.append(("FONTNAME", (0,ri), (-1,ri), FB))
        tot_ts.append(("FONTSIZE", (0,ri), (-1,ri), 9))
    tot_tbl.setStyle(TableStyle(tot_ts))

    right_footer = [tot_tbl]
    if SHOW_SIG:
        right_footer.append(Spacer(1, 10*mm))
        # Render signature image if available, else leave blank space for manual sign
        sig_img = _logo_image(biz.get("signature_b64", ""), max_w=55*mm, max_h=20*mm)
        if sig_img:
            right_footer.append(sig_img)
        else:
            right_footer.append(Spacer(1, 20*mm))
        right_footer.append(Paragraph("Authorized Signature", s_sig))

    foot = Table(
        [[left_footer, right_footer]],
        colWidths=[98*mm, 82*mm],
    )
    foot.setStyle(TableStyle([
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",  (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 0),
        ("TOPPADDING",   (0,0), (-1,-1), 0),
        ("BOTTOMPADDING",(0,0), (-1,-1), 0),
        ("ALIGN",        (1,0), (1,0), "RIGHT"),
    ]))
    story.append(foot)
    story.append(Spacer(1, 6*mm))

    # ─────────────────────────────────────────────────────────────────────────
    # 6. FOOTER NOTE
    # ─────────────────────────────────────────────────────────────────────────
    story.append(HRFlowable(width=CW, thickness=0.3, color=BORDER))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "<i>This is a computer-generated document and does not require a physical signature.</i>",
        s_foot,
    ))

    # ─────────────────────────────────────────────────────────────────────────
    # 7. WATERMARK
    # ─────────────────────────────────────────────────────────────────────────
    def _draw_wm(canvas, doc):
        canvas.saveState()
        canvas.setFont(FB if _FONT_REGISTERED else "Helvetica-Bold", 72)
        canvas.setFillColor(colors.Color(0.85, 0.85, 0.85, alpha=0.35))
        canvas.translate(A4[0]/2, A4[1]/2)
        canvas.rotate(45)
        canvas.drawCentredString(0, 0, WATERMARK.upper())
        canvas.restoreState()

    if WATERMARK:
        doc.build(story, onFirstPage=_draw_wm, onLaterPages=_draw_wm)
    else:
        doc.build(story)

    return buf.getvalue()

# ═══════════════════════════════════════════════════════════════════════════════
# MODERN TEMPLATE — Clean header bar, coloured accent, two-column footer
# ═══════════════════════════════════════════════════════════════════════════════
def _generate_modern_pdf(inv: dict, biz: dict, kind: str = "sale") -> bytes:
    _ensure_fonts()
    F  = _FONT_BASE if _FONT_REGISTERED else "Helvetica"
    FB = _FONT_BOLD if _FONT_REGISTERED else "Helvetica-Bold"

    theme   = biz.get("invoice_theme") or {}
    PRIMARY = _hex_color(theme.get("primary_color") or "#1D4ED8")
    ACCENT  = colors.HexColor("#F0F4FF")

    if kind == "purchase":
        type_label = {"purchase": "PURCHASE BILL", "debit_note": "DEBIT NOTE",
                      "purchase_return": "PURCHASE RETURN"}.get(inv.get("type"), "PURCHASE BILL")
        inv_no = inv.get("bill_no", "")
        inv_date = inv.get("purchase_date", "")
        due_date = ""
    else:
        type_label = {"sale": "TAX INVOICE", "quotation": "QUOTATION",
                      "credit_note": "CREDIT NOTE", "sales_return": "SALES RETURN"}.get(inv.get("type"), "TAX INVOICE")
        inv_no = inv.get("invoice_no", "")
        inv_date = inv.get("invoice_date", "")
        due_date = inv.get("due_date", "")

    party = inv.get("party_snapshot") or {}
    totals = inv.get("totals") or {}
    items  = inv.get("items") or []
    same_state = inv.get("same_state", True)

    buf = BytesIO()
    CW = 180*mm

    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm, topMargin=10*mm, bottomMargin=12*mm,
        title=f"{type_label} {inv_no}", author=biz.get("name",""))

    def PS(name, **kw):
        d = dict(fontName=F, fontSize=9, leading=13, textColor=BLACK)
        d.update(kw); return ParagraphStyle(name, **d)

    story = []

    # ── Header bar ────────────────────────────────────────────────────────────
    logo_cell = ""
    if theme.get("show_logo", True):
        logo_img = _logo_image(biz.get("logo_b64",""), max_w=35*mm, max_h=14*mm)
        if logo_img: logo_cell = logo_img

    biz_block = [
        Paragraph(biz.get("name",""), PS("h_name", fontName=FB, fontSize=14, leading=18, textColor=WHITE)),
        Paragraph(biz.get("address",""), PS("h_addr", fontSize=7.5, leading=11, textColor=colors.HexColor("#DDEEFF"))),
        Paragraph(f"GSTIN: {biz.get('gstin','')}  |  {biz.get('phone','')}", PS("h_g", fontSize=7.5, leading=11, textColor=colors.HexColor("#DDEEFF"))),
    ]
    title_block = [
        Paragraph(type_label, PS("h_title", fontName=FB, fontSize=18, leading=22, textColor=WHITE, alignment=TA_RIGHT)),
        Paragraph(inv_no, PS("h_no", fontName=FB, fontSize=11, leading=15, textColor=colors.HexColor("#CCDDFF"), alignment=TA_RIGHT)),
    ]

    hdr_tbl = Table([[logo_cell or "", biz_block, title_block]], colWidths=[38*mm, 90*mm, 52*mm])
    hdr_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), PRIMARY),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    story.append(hdr_tbl)
    story.append(Spacer(1, 6*mm))

    # ── Meta + Party ─────────────────────────────────────────────────────────
    meta_rows = [["Invoice No", inv_no], ["Date", inv_date]]
    if due_date: meta_rows.append(["Due Date", due_date])
    if inv.get("po_number"): meta_rows.append(["PO Number", inv["po_number"]])
    meta_rows.append(["Place of Supply", party.get("state","")])

    meta_tbl = Table([[Paragraph(k, PS("ml", fontSize=8, textColor=GREY)), Paragraph(v, PS("mv", fontName=FB, fontSize=8))] for k,v in meta_rows],
                     colWidths=[30*mm, 50*mm])
    meta_tbl.setStyle(TableStyle([("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2)]))

    bill_to = [
        Paragraph("BILL TO", PS("bt_lbl", fontName=FB, fontSize=7, textColor=PRIMARY)),
        Paragraph(party.get("name",""), PS("bt_nm", fontName=FB, fontSize=10, leading=14)),
        Paragraph(party.get("billing_address",""), PS("bt_a", fontSize=8, textColor=GREY, leading=12)),
        Paragraph(f"GSTIN: {party.get('gstin','—')}", PS("bt_g", fontSize=8, textColor=GREY)),
        Paragraph(party.get("phone",""), PS("bt_ph", fontSize=8, textColor=GREY)),
    ]

    info_tbl = Table([[bill_to, meta_tbl]], colWidths=[100*mm, 80*mm])
    info_tbl.setStyle(TableStyle([
        ("VALIGN",(0,0),(-1,-1),"TOP"),
        ("BACKGROUND",(0,0),(0,-1),ACCENT),
        ("BOX",(0,0),(0,-1),0.5,colors.HexColor("#D0D8F0")),
        ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),
        ("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 5*mm))

    # ── Items table ───────────────────────────────────────────────────────────
    if same_state:
        hdrs = ["#","Item / Description","HSN","Qty","Rate ₹","Disc%","Taxable","GST%","CGST","SGST","Total ₹"]
        cws  = [8,50,14,14,20,12,22,10,18,18,24]
    else:
        hdrs = ["#","Item / Description","HSN","Qty","Rate ₹","Disc%","Taxable","GST%","IGST","Total ₹"]
        cws  = [8,56,14,14,20,12,24,10,20,42]
    cws = [c*mm for c in cws]

    rows = [[Paragraph(h, PS(f"th{i}", fontName=FB, fontSize=7.5, textColor=WHITE, alignment=TA_CENTER)) for i,h in enumerate(hdrs)]]
    for idx, it in enumerate(items):
        row = [
            Paragraph(str(idx+1), PS("r", fontSize=8, alignment=TA_CENTER)),
            Paragraph(it.get("name",""), PS("rn", fontSize=8)),
            Paragraph(it.get("hsn",""), PS("rh", fontSize=8, alignment=TA_CENTER)),
            Paragraph(f"{it.get('qty',0)} {it.get('unit','')}", PS("rq", fontSize=8, alignment=TA_CENTER)),
            Paragraph(f"{it.get('rate',0):,.2f}", PS("rr", fontSize=8, alignment=TA_RIGHT)),
            Paragraph(f"{it.get('discount_pct',0):.1f}%", PS("rd", fontSize=8, alignment=TA_CENTER)),
            Paragraph(f"{it.get('taxable',0):,.2f}", PS("rt", fontSize=8, alignment=TA_RIGHT)),
            Paragraph(f"{it.get('gst_rate',0):.0f}%", PS("rg", fontSize=8, alignment=TA_CENTER)),
        ]
        if same_state:
            row += [Paragraph(f"{it.get('cgst',0):,.2f}", PS("rc", fontSize=8, alignment=TA_RIGHT)),
                    Paragraph(f"{it.get('sgst',0):,.2f}", PS("rs", fontSize=8, alignment=TA_RIGHT))]
        else:
            row += [Paragraph(f"{it.get('igst',0):,.2f}", PS("ri", fontSize=8, alignment=TA_RIGHT))]
        row.append(Paragraph(f"{it.get('total',0):,.2f}", PS("rtot", fontName=FB, fontSize=8, alignment=TA_RIGHT)))
        rows.append(row)

    itbl = Table(rows, colWidths=cws, repeatRows=1)
    itbl.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),PRIMARY), ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, ACCENT]),
        ("GRID",(0,0),(-1,-1),0.3,colors.HexColor("#D0D8F0")),
        ("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),
        ("LEFTPADDING",(0,0),(-1,-1),4),("RIGHTPADDING",(0,0),(-1,-1),4),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ]))
    story.append(itbl)
    story.append(Spacer(1, 4*mm))

    # ── Totals ────────────────────────────────────────────────────────────────
    tax_label = "CGST + SGST" if same_state else "IGST"
    tax_val = totals.get("cgst",0)+totals.get("sgst",0) if same_state else totals.get("igst",0)
    tot_rows = [
        ["Subtotal", f"₹ {totals.get('subtotal',0):,.2f}"],
        ["Discount", f"₹ {totals.get('discount',0):,.2f}"],
        ["Taxable Amount", f"₹ {totals.get('taxable_amount',0):,.2f}"],
        [tax_label, f"₹ {tax_val:,.2f}"],
        ["Round Off", f"₹ {totals.get('round_off',0):,.2f}"],
        ["Grand Total", f"₹ {totals.get('grand_total',0):,.2f}"],
    ]
    grand = totals.get("grand_total",0)
    try:
        words = num2words(int(grand), lang="en_IN").title() + " Rupees Only"
    except Exception:
        words = ""

    tot_tbl = Table([[Paragraph(k, PS(f"tk{i}", fontSize=8.5, textColor=GREY if i<5 else BLACK,
                                      fontName=FB if i==5 else F)),
                      Paragraph(v, PS(f"tv{i}", fontSize=8.5, alignment=TA_RIGHT,
                                      fontName=FB if i==5 else F,
                                      textColor=PRIMARY if i==5 else BLACK))]
                     for i,(k,v) in enumerate(tot_rows)],
                    colWidths=[45*mm, 35*mm])
    tot_tbl.setStyle(TableStyle([
        ("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2),
        ("LINEABOVE",(0,5),(-1,5),1,PRIMARY),
        ("BACKGROUND",(0,5),(-1,5),ACCENT),
    ]))

    notes_content = []
    if words:
        notes_content.append(Paragraph(f"Amount in words: {words}", PS("aw", fontSize=7.5, textColor=GREY, fontName=FB)))
    if inv.get("notes"):
        notes_content.append(Spacer(1,4))
        notes_content.append(Paragraph(f"Notes: {inv['notes']}", PS("nt", fontSize=8, textColor=GREY)))
    if biz.get("terms"):
        notes_content.append(Spacer(1,4))
        notes_content.append(Paragraph(f"Terms: {biz['terms']}", PS("tm", fontSize=7.5, textColor=GREY)))

    footer_tbl = Table([[notes_content or [Spacer(1,1)], tot_tbl]], colWidths=[100*mm, 80*mm])
    footer_tbl.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
                                    ("RIGHTPADDING",(1,0),(1,-1),0)]))
    story.append(footer_tbl)

    # ── Signature ─────────────────────────────────────────────────────────────
    if theme.get("show_signature", True):
        sig_img = _logo_image(biz.get("signature_b64",""), max_w=45*mm, max_h=18*mm)
        sig_row = [[Paragraph("", PS("_")),
                    sig_img or Spacer(1, 18*mm),
                    Paragraph("Authorized Signature", PS("sg", fontSize=8, textColor=GREY, alignment=TA_RIGHT))]]
        sig_tbl = Table(sig_row, colWidths=[110*mm, 50*mm, 20*mm])
        sig_tbl.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"BOTTOM"),
                                     ("TOPPADDING",(0,0),(-1,-1),8)]))
        story.append(Spacer(1,4*mm))
        story.append(sig_tbl)

    doc.build(story)
    return buf.getvalue()


# ═══════════════════════════════════════════════════════════════════════════════
# COMPACT TEMPLATE — Minimal, spreadsheet style, dense rows
# ═══════════════════════════════════════════════════════════════════════════════
def _generate_compact_pdf(inv: dict, biz: dict, kind: str = "sale") -> bytes:
    _ensure_fonts()
    F  = _FONT_BASE if _FONT_REGISTERED else "Helvetica"
    FB = _FONT_BOLD if _FONT_REGISTERED else "Helvetica-Bold"

    theme   = biz.get("invoice_theme") or {}
    PRIMARY = _hex_color(theme.get("primary_color") or "#1D4ED8")

    if kind == "purchase":
        type_label = "PURCHASE BILL"
        inv_no = inv.get("bill_no","")
        inv_date = inv.get("purchase_date","")
        due_date = ""
    else:
        type_label = {"sale":"TAX INVOICE","quotation":"QUOTATION","credit_note":"CREDIT NOTE"}.get(inv.get("type"),"TAX INVOICE")
        inv_no = inv.get("invoice_no","")
        inv_date = inv.get("invoice_date","")
        due_date = inv.get("due_date","")

    party  = inv.get("party_snapshot") or {}
    totals = inv.get("totals") or {}
    items  = inv.get("items") or []
    same_state = inv.get("same_state", True)

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=12*mm, rightMargin=12*mm, topMargin=10*mm, bottomMargin=10*mm,
        title=f"{type_label} {inv_no}", author=biz.get("name",""))

    def PS(name, **kw):
        d = dict(fontName=F, fontSize=8.5, leading=12, textColor=BLACK)
        d.update(kw); return ParagraphStyle(name, **d)

    story = []
    CW = 186*mm

    # ── Top: biz left, invoice right ─────────────────────────────────────────
    logo_img = None
    if theme.get("show_logo", True):
        logo_img = _logo_image(biz.get("logo_b64",""), max_w=30*mm, max_h=12*mm)

    biz_col = [logo_img or Spacer(1,1),
               Paragraph(biz.get("name",""), PS("bn", fontName=FB, fontSize=13, leading=17)),
               Paragraph(biz.get("gstin",""), PS("bg", fontSize=8, textColor=GREY)),
               Paragraph(biz.get("address",""), PS("ba", fontSize=8, textColor=GREY, leading=11)),
               Paragraph(biz.get("phone",""), PS("bp", fontSize=8, textColor=GREY))]

    inv_col = [Paragraph(type_label, PS("tl", fontName=FB, fontSize=16, textColor=PRIMARY, alignment=TA_RIGHT)),
               Paragraph(f"<b>No:</b> {inv_no}", PS("in", fontSize=9, alignment=TA_RIGHT)),
               Paragraph(f"<b>Date:</b> {inv_date}", PS("id", fontSize=9, alignment=TA_RIGHT)),
               Paragraph(f"<b>Due:</b> {due_date}", PS("dd", fontSize=9, alignment=TA_RIGHT)) if due_date else Spacer(1,1),
               Paragraph(f"<b>Place of Supply:</b> {party.get('state','')}", PS("ps", fontSize=9, alignment=TA_RIGHT))]

    top = Table([[biz_col, inv_col]], colWidths=[100*mm, 86*mm])
    top.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    story.append(top)
    story.append(HRFlowable(width=CW, thickness=1.5, color=PRIMARY, spaceAfter=4))

    # ── Party ────────────────────────────────────────────────────────────────
    story.append(Paragraph("BILL TO", PS("btl", fontName=FB, fontSize=7, textColor=PRIMARY)))
    story.append(Paragraph(party.get("name",""), PS("pn", fontName=FB, fontSize=10)))
    story.append(Paragraph(f"{party.get('billing_address','')}  |  GSTIN: {party.get('gstin','—')}  |  {party.get('phone','')}", PS("pa", fontSize=8, textColor=GREY)))
    story.append(HRFlowable(width=CW, thickness=0.5, color=colors.HexColor("#CCCCCC"), spaceBefore=4, spaceAfter=4))

    # ── Items ─────────────────────────────────────────────────────────────────
    if same_state:
        hdrs = ["#","Description","HSN","Qty","Rate","Taxable","GST%","CGST","SGST","Total"]
        cws  = [7,55,14,16,20,22,10,18,18,26]
    else:
        hdrs = ["#","Description","HSN","Qty","Rate","Taxable","GST%","IGST","Total"]
        cws  = [7,58,14,16,22,24,10,20,35]
    cws = [c*mm for c in cws]

    rows = [[Paragraph(h, PS(f"th{i}", fontName=FB, fontSize=7.5, textColor=WHITE, alignment=TA_CENTER)) for i,h in enumerate(hdrs)]]
    for idx, it in enumerate(items):
        bg = colors.white if idx%2==0 else colors.HexColor("#F7F9FF")
        row = [
            Paragraph(str(idx+1), PS("n", fontSize=8, alignment=TA_CENTER)),
            Paragraph(it.get("name",""), PS("d", fontSize=8)),
            Paragraph(it.get("hsn",""), PS("h", fontSize=8, alignment=TA_CENTER)),
            Paragraph(f"{it.get('qty',0)} {it.get('unit','')}", PS("q", fontSize=8, alignment=TA_CENTER)),
            Paragraph(f"{it.get('rate',0):,.2f}", PS("r", fontSize=8, alignment=TA_RIGHT)),
            Paragraph(f"{it.get('taxable',0):,.2f}", PS("t", fontSize=8, alignment=TA_RIGHT)),
            Paragraph(f"{it.get('gst_rate',0):.0f}%", PS("g", fontSize=8, alignment=TA_CENTER)),
        ]
        if same_state:
            row += [Paragraph(f"{it.get('cgst',0):,.2f}", PS("c", fontSize=8, alignment=TA_RIGHT)),
                    Paragraph(f"{it.get('sgst',0):,.2f}", PS("s", fontSize=8, alignment=TA_RIGHT))]
        else:
            row += [Paragraph(f"{it.get('igst',0):,.2f}", PS("i", fontSize=8, alignment=TA_RIGHT))]
        row.append(Paragraph(f"{it.get('total',0):,.2f}", PS("tot", fontName=FB, fontSize=8, alignment=TA_RIGHT)))
        rows.append(row)

    itbl = Table(rows, colWidths=cws, repeatRows=1)
    itbl.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),PRIMARY),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, colors.HexColor("#F7F9FF")]),
        ("GRID",(0,0),(-1,-1),0.25,colors.HexColor("#DDDDDD")),
        ("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2),
        ("LEFTPADDING",(0,0),(-1,-1),3),("RIGHTPADDING",(0,0),(-1,-1),3),
    ]))
    story.append(itbl)
    story.append(Spacer(1, 3*mm))

    # ── Totals right-aligned ─────────────────────────────────────────────────
    tax_val = totals.get("cgst",0)+totals.get("sgst",0) if same_state else totals.get("igst",0)
    tax_lbl = "CGST + SGST" if same_state else "IGST"
    try:
        words = num2words(int(totals.get("grand_total",0)), lang="en_IN").title() + " Rupees Only"
    except Exception:
        words = ""

    tot_rows_data = [
        ("Taxable Amount", totals.get("taxable_amount",0)),
        (tax_lbl, tax_val),
        ("Round Off", totals.get("round_off",0)),
    ]
    trows = [[Paragraph(k, PS(f"tk{i}", fontSize=8.5, textColor=GREY)),
              Paragraph(f"₹ {v:,.2f}", PS(f"tv{i}", fontSize=8.5, alignment=TA_RIGHT))]
             for i,(k,v) in enumerate(tot_rows_data)]
    trows.append([Paragraph("Grand Total", PS("gtl", fontName=FB, fontSize=10, textColor=PRIMARY)),
                  Paragraph(f"₹ {totals.get('grand_total',0):,.2f}", PS("gtv", fontName=FB, fontSize=10, alignment=TA_RIGHT, textColor=PRIMARY))])

    tot_tbl = Table(trows, colWidths=[45*mm, 35*mm])
    tot_tbl.setStyle(TableStyle([
        ("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2),
        ("LINEABOVE",(0,-1),(-1,-1),1,PRIMARY),
    ]))

    notes = []
    if words:
        notes.append(Paragraph(words, PS("w", fontSize=7.5, fontName=FB, textColor=GREY)))
    if inv.get("notes"):
        notes.append(Paragraph(f"Notes: {inv['notes']}", PS("nt", fontSize=8, textColor=GREY)))
    if biz.get("bank_account"):
        notes.append(Paragraph(f"Bank: {biz.get('bank_name','')} | A/C: {biz.get('bank_account','')} | IFSC: {biz.get('bank_ifsc','')}", PS("bk", fontSize=7.5, textColor=GREY)))

    ft = Table([[notes or [Spacer(1,1)], tot_tbl]], colWidths=[106*mm, 80*mm])
    ft.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    story.append(ft)

    doc.build(story)
    return buf.getvalue()
