"""PDF invoice generator using ReportLab — GST-compliant tax invoice format.

Uses FreeSans (with ₹ glyph) so the rupee symbol renders correctly everywhere.
"""
from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
)
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from num2words import num2words

# Register Unicode-capable fonts (FreeSans includes ₹ U+20B9).
_FONT_BASE = "BillEasySans"
_FONT_BOLD = "BillEasySans-Bold"
_FONT_REGISTERED = False


def _ensure_fonts():
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    candidates = [
        ("/usr/share/fonts/truetype/freefont/FreeSans.ttf",
         "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for reg, bold in candidates:
        try:
            pdfmetrics.registerFont(TTFont(_FONT_BASE, reg))
            pdfmetrics.registerFont(TTFont(_FONT_BOLD, bold))
            pdfmetrics.registerFontFamily(_FONT_BASE, normal=_FONT_BASE, bold=_FONT_BOLD,
                                          italic=_FONT_BASE, boldItalic=_FONT_BOLD)
            _FONT_REGISTERED = True
            return
        except Exception:
            continue


def _inr_amount(n: float) -> str:
    """Indian-grouped amount string WITHOUT the ₹ symbol (added by caller)."""
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
        if rest: groups.insert(0, rest)
        int_part = ",".join(groups) + "," + last3
    dec = f"{v - int(v):.2f}".split(".")[1]
    return ("-" if neg else "") + int_part + "." + dec


def _inr(n: float) -> str:
    return "\u20B9" + _inr_amount(n)


def _amount_in_words(amount: float) -> str:
    rupees = int(amount)
    paise = round((amount - rupees) * 100)
    words = num2words(rupees, lang="en_IN").title()
    out = f"Rupees {words}"
    if paise:
        out += f" and {num2words(paise, lang='en_IN').title()} Paise"
    return out + " Only"


def _fmt_date(s: str) -> str:
    """ISO YYYY-MM-DD → DD/MM/YYYY. Pass-through on parse error."""
    if not s: return "—"
    try:
        d = datetime.strptime(str(s)[:10], "%Y-%m-%d")
        return d.strftime("%d/%m/%Y")
    except Exception:
        return str(s)


def generate_invoice_pdf(inv: dict, biz: dict, kind: str = "sale") -> bytes:
    """Render a sales/purchase document as PDF.

    `kind` controls labels & layout:
      - "sale" (default): TAX INVOICE / QUOTATION / CREDIT NOTE / SALES RETURN
      - "purchase": PURCHASE BILL / DEBIT NOTE / PURCHASE RETURN
    """
    _ensure_fonts()
    F = _FONT_BASE if _FONT_REGISTERED else "Helvetica"
    FB = _FONT_BOLD if _FONT_REGISTERED else "Helvetica-Bold"

    buf = BytesIO()
    if kind == "purchase":
        type_label = {"purchase": "PURCHASE BILL", "debit_note": "DEBIT NOTE",
                      "purchase_return": "PURCHASE RETURN"}.get(inv.get("type", "purchase"), "PURCHASE BILL")
        ref_label = "Bill #"
    else:
        type_label = {"sale": "TAX INVOICE", "quotation": "QUOTATION",
                      "credit_note": "CREDIT NOTE", "sales_return": "SALES RETURN"}.get(inv.get("type", "sale"), "TAX INVOICE")
        ref_label = "Invoice #"

    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=12 * mm, bottomMargin=12 * mm,
        title=f"{type_label} {inv.get('invoice_no','')}",
        author=biz.get("name", "BillEasy"),
        subject=f"{type_label} {inv.get('invoice_no','')}",
    )

    styles = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=styles["Normal"], fontName=FB, fontSize=15, leading=20,
                       spaceAfter=4, textColor=colors.HexColor("#1D4ED8"))
    small = ParagraphStyle("s", parent=styles["Normal"], fontName=F, fontSize=8, leading=11, spaceAfter=2)
    bold = ParagraphStyle("b", parent=styles["Normal"], fontName=FB, fontSize=9, leading=12, spaceAfter=2)
    label_st = ParagraphStyle("l", parent=styles["Normal"], fontName=F, fontSize=8, leading=10,
                              spaceAfter=3, textColor=colors.grey)

    story = []

    # Header
    header_left = [
        Paragraph(biz.get("name", "Business Name"), h),
        Paragraph(biz.get("address", ""), small),
        Paragraph(f"GSTIN: <b>{biz.get('gstin','')}</b>  PAN: {biz.get('pan','')}", small),
        Paragraph(f"Phone: {biz.get('phone','')}  Email: {biz.get('email','')}", small),
    ]
    header_right = [
        Paragraph(f"<b>{type_label}</b>", ParagraphStyle("t", parent=h, fontSize=13, leading=17, alignment=TA_RIGHT)),
        Paragraph(f"<b>{ref_label}:</b> {inv['invoice_no']}",
                  ParagraphStyle("ir", parent=small, fontSize=10, leading=13, alignment=TA_RIGHT)),
        Paragraph(f"<b>Date:</b> {_fmt_date(inv['invoice_date'])}",
                  ParagraphStyle("dr", parent=small, leading=12, alignment=TA_RIGHT)),
    ]
    if kind != "purchase":
        header_right.append(Paragraph(f"<b>Due:</b> {_fmt_date(inv.get('due_date',''))}",
                                       ParagraphStyle("dur", parent=small, leading=12, alignment=TA_RIGHT)))
    head = Table([[header_left, header_right]], colWidths=[110 * mm, 70 * mm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(head)
    story.append(Spacer(1, 4 * mm))

    # Bill to / Ship to  (for purchases: supplier block only)
    party = inv.get("party_snapshot", {})
    if kind == "purchase":
        supplier_block = [
            Paragraph("BILL FROM (SUPPLIER)", label_st),
            Paragraph(f"<b>{party.get('name','')}</b>", bold),
            Paragraph(party.get("billing_address", ""), small),
            Paragraph(f"GSTIN: {party.get('gstin','—')}  State: {party.get('state','')}", small),
            Paragraph(f"Phone: {party.get('phone','')}", small),
        ]
        receiver_block = [
            Paragraph("BILL TO (US)", label_st),
            Paragraph(f"<b>{biz.get('name','')}</b>", bold),
            Paragraph(biz.get("address", ""), small),
            Paragraph(f"GSTIN: {biz.get('gstin','—')}  State: {biz.get('state','')}", small),
        ]
        bt = Table([[supplier_block, receiver_block]], colWidths=[90 * mm, 90 * mm])
    else:
        bill_to = [
            Paragraph("BILL TO", label_st),
            Paragraph(f"<b>{party.get('name','')}</b>", bold),
            Paragraph(party.get("billing_address", ""), small),
            Paragraph(f"GSTIN: {party.get('gstin','—')}  State: {party.get('state','')}", small),
            Paragraph(f"Phone: {party.get('phone','')}", small),
        ]
        ship_to = [
            Paragraph("SHIP TO", label_st),
            Paragraph(f"<b>{party.get('name','')}</b>", bold),
            Paragraph(party.get("shipping_address") or party.get("billing_address", ""), small),
        ]
        bt = Table([[bill_to, ship_to]], colWidths=[90 * mm, 90 * mm])
    bt.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(bt)
    story.append(Spacer(1, 4 * mm))

    # Items table
    same_state = inv.get("same_state", True)
    if same_state:
        head_row = ["#", "Description", "HSN", "Qty", "Unit", "Rate", "Disc", "Taxable", "GST%", "CGST", "SGST", "Total"]
    else:
        head_row = ["#", "Description", "HSN", "Qty", "Unit", "Rate", "Disc", "Taxable", "GST%", "IGST", "", "Total"]
    rows = [head_row]
    for idx, it in enumerate(inv["items"], 1):
        rows.append([
            str(idx), it["name"], it.get("hsn", "—"),
            f"{it['qty']:g}", it.get("unit", "NOS"),
            _inr_amount(it["rate"]),
            f"{it.get('discount_pct',0):g}%",
            _inr_amount(it["taxable"]),
            f"{it.get('gst_rate',0):g}%",
            _inr_amount(it["cgst"]) if same_state else _inr_amount(it["igst"]),
            _inr_amount(it["sgst"]) if same_state else "",
            _inr_amount(it["total"]),
        ])
    t = Table(rows, colWidths=[8 * mm, 42 * mm, 14 * mm, 12 * mm, 12 * mm, 16 * mm, 11 * mm, 18 * mm, 11 * mm, 14 * mm, 14 * mm, 18 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1D4ED8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), FB),
        ("FONTNAME", (0, 1), (-1, -1), F),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (1, 1), (2, -1), "LEFT"),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 3 * mm))

    # Totals — skip discount line when zero
    tot = inv["totals"]
    tot_rows = [
        ["Subtotal", _inr(tot["subtotal"])],
    ]
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

    tt = Table(tot_rows, colWidths=[50 * mm, 40 * mm], hAlign="RIGHT")
    tt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), F),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, -1), (-1, -1), FB),
        ("FONTSIZE", (0, -1), (-1, -1), 11),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#1D4ED8")),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
        ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.HexColor("#1D4ED8")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(tt)
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph(f"<b>Amount in Words:</b> {_amount_in_words(tot['grand_total'])}", small))
    story.append(Spacer(1, 4 * mm))

    # Bank + T&C  (bank details only on sales — buyer pays seller)
    if kind == "purchase":
        notes_block = [
            Paragraph("<b>Notes</b>", bold),
            Paragraph((inv.get("notes", "") or "—").replace("\n", "<br/>"), small),
        ]
        bb = Table([[notes_block]], colWidths=[180 * mm])
    else:
        bank_block = [
            Paragraph("<b>Bank Details</b>", bold),
            Paragraph(f"Bank: {biz.get('bank_name','—')}", small),
            Paragraph(f"A/c: {biz.get('bank_account','—')}", small),
            Paragraph(f"IFSC: {biz.get('bank_ifsc','—')}", small),
            Paragraph(f"Branch: {biz.get('bank_branch','—')}", small),
        ]
        terms_block = [
            Paragraph("<b>Terms &amp; Conditions</b>", bold),
            Paragraph((biz.get("terms", "") or "").replace("\n", "<br/>"), small),
        ]
        bb = Table([[bank_block, terms_block]], colWidths=[80 * mm, 100 * mm])
    bb.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(bb)
    story.append(Spacer(1, 8 * mm))

    sig = Table(
        [[Paragraph("", small),
          Paragraph(f"<b>For {biz.get('name','')}</b><br/><br/><br/>Authorized Signatory",
                    ParagraphStyle("sig", parent=small, alignment=TA_RIGHT))]],
        colWidths=[110 * mm, 70 * mm],
    )
    story.append(sig)
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        f"<i>This is a computer-generated {'purchase bill' if kind == 'purchase' else 'invoice'} and does not require a signature.</i>",
        ParagraphStyle("foot", parent=small, alignment=TA_CENTER, textColor=colors.grey),
    ))

    doc.build(story)
    return buf.getvalue()
