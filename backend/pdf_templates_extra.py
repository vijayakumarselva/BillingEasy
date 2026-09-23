"""Extra invoice designs: Elegant, Professional and Minimal.

These sit alongside the classic / modern / compact layouts in pdf_invoice.py and
share its helpers (fonts, rupee formatting, amount-in-words, logo, watermark), so
every template honours the same theme settings.
"""
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

from pdf_invoice import (BLACK, BORDER, GREY, WHITE, _amount_words, _ensure_fonts, _fmt_date,
                         _hex_color, _inr, _inr_amount, _logo_image, _FONT_BASE, _FONT_BOLD)
import pdf_invoice as _pi


def _ctx(inv: dict, biz: dict, kind: str):
    """Shared bits every template needs."""
    _ensure_fonts()
    reg = _pi._FONT_REGISTERED
    F = _FONT_BASE if reg else "Helvetica"
    FB = _FONT_BOLD if reg else "Helvetica-Bold"
    theme = biz.get("invoice_theme") or {}
    if kind == "purchase":
        label = {"purchase": "PURCHASE BILL", "debit_note": "DEBIT NOTE",
                 "purchase_return": "PURCHASE RETURN"}.get(inv.get("type"), "PURCHASE BILL")
        no, date, due = inv.get("bill_no", ""), inv.get("purchase_date", ""), ""
    else:
        label = {"sale": "TAX INVOICE", "quotation": "QUOTATION", "credit_note": "CREDIT NOTE",
                 "sales_return": "SALES RETURN"}.get(inv.get("type"), "TAX INVOICE")
        no, date, due = inv.get("invoice_no", ""), inv.get("invoice_date", ""), inv.get("due_date", "")
    return {"F": F, "FB": FB, "theme": theme, "primary": _hex_color(theme.get("primary_color") or "#1D4ED8"),
            "label": label, "no": no, "date": date, "due": due,
            "party": inv.get("party_snapshot") or {}, "totals": inv.get("totals") or {},
            "items": inv.get("items") or [], "same_state": inv.get("same_state", True),
            "watermark": theme.get("watermark", "")}


def _build(doc, story, c, buf):
    wm = c["watermark"]
    if wm:
        def draw(canvas, _doc):
            canvas.saveState()
            canvas.setFont(c["FB"], 72)
            canvas.setFillColor(colors.Color(0.85, 0.85, 0.85, alpha=0.35))
            canvas.translate(A4[0] / 2, A4[1] / 2)
            canvas.rotate(45)
            canvas.drawCentredString(0, 0, wm.upper())
            canvas.restoreState()
        doc.build(story, onFirstPage=draw, onLaterPages=draw)
    else:
        doc.build(story)
    return buf.getvalue()


def _item_rows(c, money_cols=True):
    """Item lines shared by the new templates: #, description, HSN, qty, rate, tax, amount."""
    rows = [["#", "Item & description", "HSN/SAC", "Qty", "Rate", "GST", "Amount"]]
    for i, it in enumerate(c["items"], 1):
        gst_amt = (it.get("cgst", 0) or 0) + (it.get("sgst", 0) or 0) + (it.get("igst", 0) or 0)
        rows.append([
            str(i), it.get("name", ""), str(it.get("hsn", "") or "—"),
            f"{it.get('qty', 0):g} {it.get('unit', '')}".strip(),
            _inr_amount(it.get("rate", 0)),
            f"{it.get('gst_rate', 0):g}% · {_inr_amount(gst_amt)}" if money_cols else f"{it.get('gst_rate', 0):g}%",
            _inr_amount(it.get("total", it.get("taxable", 0))),
        ])
    return rows


def _totals_pairs(c):
    t = c["totals"]
    pairs = [("Subtotal", t.get("taxable_amount", 0))]
    if t.get("discount"):
        pairs.append(("Discount", -t.get("discount", 0)))
    if c["same_state"]:
        pairs += [("CGST", t.get("cgst", 0)), ("SGST", t.get("sgst", 0))]
    else:
        pairs.append(("IGST", t.get("igst", 0)))
    if t.get("round_off"):
        pairs.append(("Round off", t.get("round_off", 0)))
    return pairs


# ═══════════════════════════════════════════════════════════════════════════════
# ELEGANT — letterhead feel: centred title, hairline rules, lots of air
# ═══════════════════════════════════════════════════════════════════════════════
def generate_elegant_pdf(inv: dict, biz: dict, kind: str = "sale") -> bytes:
    c = _ctx(inv, biz, kind)
    F, FB, P = c["F"], c["FB"], c["primary"]
    buf = BytesIO()
    CW = 180 * mm
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=14 * mm, bottomMargin=14 * mm,
                            title=f"{c['label']} {c['no']}", author=biz.get("name", ""))

    def PS(n, **kw):
        d = dict(fontName=F, fontSize=9, leading=13, textColor=BLACK); d.update(kw)
        return ParagraphStyle(n, **d)

    story = []
    logo = _logo_image(biz.get("logo_b64", ""), max_w=40 * mm, max_h=16 * mm) if c["theme"].get("show_logo", True) else None
    if logo:
        logo.hAlign = "CENTER"
        story += [logo, Spacer(1, 3 * mm)]
    story.append(Paragraph(biz.get("name", ""), PS("n", fontName=FB, fontSize=17, leading=21, alignment=TA_CENTER, textColor=P)))
    story.append(Paragraph(biz.get("address", "").replace("\n", ", "), PS("a", fontSize=8, leading=11, alignment=TA_CENTER, textColor=GREY)))
    line = " · ".join(x for x in [f"GSTIN {biz.get('gstin','')}" if biz.get("gstin") else "",
                                  biz.get("phone", ""), biz.get("email", "")] if x)
    story.append(Paragraph(line, PS("c", fontSize=8, leading=11, alignment=TA_CENTER, textColor=GREY)))
    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width=CW, thickness=1.1, color=P))
    story.append(Spacer(1, 1.2 * mm))
    story.append(HRFlowable(width=CW, thickness=0.4, color=P))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(c["label"], PS("t", fontName=FB, fontSize=15, leading=19, alignment=TA_CENTER,
                                          textColor=BLACK)))
    story.append(Spacer(1, 5 * mm))

    party = c["party"]
    bill_to = [Paragraph("BILLED TO", PS("l1", fontName=FB, fontSize=7.5, textColor=GREY)),
               Paragraph(party.get("name", ""), PS("p1", fontName=FB, fontSize=10.5, leading=14)),
               Paragraph((party.get("billing_address") or "").replace("\n", "<br/>"), PS("p2", fontSize=8, leading=11, textColor=GREY))]
    if party.get("gstin"):
        bill_to.append(Paragraph(f"GSTIN {party['gstin']}", PS("p3", fontSize=8, leading=11, textColor=GREY)))
    meta = [["Invoice no.", c["no"]], ["Date", _fmt_date(c["date"])]]
    if c["due"]:
        meta.append(["Due date", _fmt_date(c["due"])])
    if inv.get("po_number"):
        meta.append(["Your PO", inv["po_number"]])
    meta_tbl = Table([[Paragraph(k, PS("mk", fontSize=8, textColor=GREY)),
                       Paragraph(str(v), PS("mv", fontSize=9, fontName=FB, alignment=TA_RIGHT))] for k, v in meta],
                     colWidths=[30 * mm, 42 * mm])
    meta_tbl.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -2), 0.25, BORDER),
                                  ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                                  ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    head = Table([[bill_to, meta_tbl]], colWidths=[106 * mm, 74 * mm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 6 * mm)]

    rows = _item_rows(c)
    tbl = Table(rows, colWidths=[7 * mm, 57 * mm, 20 * mm, 21 * mm, 24 * mm, 26 * mm, 25 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), FB), ("FONTNAME", (0, 1), (-1, -1), F),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("TEXTCOLOR", (0, 0), (-1, 0), P),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, P), ("LINEBELOW", (0, 1), (-1, -2), 0.25, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story += [tbl, Spacer(1, 4 * mm)]

    tot_rows = [[k, _inr(v)] for k, v in _totals_pairs(c)]
    tot_rows.append(["Grand total", _inr(c["totals"].get("grand_total", 0))])
    tot = Table(tot_rows, colWidths=[40 * mm, 34 * mm])
    tot.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -2), F), ("FONTNAME", (0, -1), (-1, -1), FB),
        ("FONTSIZE", (0, 0), (-1, -1), 9), ("FONTSIZE", (0, -1), (-1, -1), 11),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"), ("TEXTCOLOR", (0, -1), (-1, -1), P),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, P),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    words = Paragraph(f"<b>Amount in words</b><br/>{_amount_words(c['totals'].get('grand_total', 0))}",
                      PS("w", fontSize=8, leading=12, textColor=GREY))
    story.append(Table([[words, tot]], colWidths=[100 * mm, 80 * mm],
                       style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                                         ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)])))
    story.append(Spacer(1, 8 * mm))

    foot_left = [Spacer(1, 0.1)]
    if c["theme"].get("show_bank", True) and biz.get("bank_name"):
        foot_left.append(Paragraph(
            f"<b>Bank details</b><br/>{biz.get('bank_name','')} · A/c {biz.get('bank_account','')}<br/>"
            f"IFSC {biz.get('bank_ifsc','')} · {biz.get('bank_branch','')}", PS("b", fontSize=8, leading=12, textColor=GREY)))
    if c["theme"].get("show_terms", True) and biz.get("terms"):
        foot_left.append(Spacer(1, 3 * mm))
        foot_left.append(Paragraph(f"<b>Terms</b><br/>{biz.get('terms','').replace(chr(10), '<br/>')}",
                                   PS("tm", fontSize=7.5, leading=11, textColor=GREY)))
    sign = [Spacer(1, 0.1)]
    if c["theme"].get("show_signature", True):
        sign = [Spacer(1, 14 * mm), HRFlowable(width=52 * mm, thickness=0.4, color=BORDER, hAlign="RIGHT"),
                Paragraph(f"Authorised signatory<br/>{biz.get('name','')}",
                          PS("s", fontSize=8, leading=11, alignment=TA_RIGHT, textColor=GREY))]
    story.append(Table([[foot_left, sign]], colWidths=[112 * mm, 68 * mm],
                       style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                         ("RIGHTPADDING", (0, 0), (-1, -1), 0)])))
    return _build(doc, story, c, buf)


# ═══════════════════════════════════════════════════════════════════════════════
# PROFESSIONAL — coloured side band, meta card, zebra rows, filled total
# ═══════════════════════════════════════════════════════════════════════════════
def generate_professional_pdf(inv: dict, biz: dict, kind: str = "sale") -> bytes:
    c = _ctx(inv, biz, kind)
    F, FB, P = c["F"], c["FB"], c["primary"]
    TINT = colors.Color(P.red, P.green, P.blue, alpha=0.08)
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=14 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm,
                            title=f"{c['label']} {c['no']}", author=biz.get("name", ""))
    CW = 176 * mm

    def PS(n, **kw):
        d = dict(fontName=F, fontSize=9, leading=13, textColor=BLACK); d.update(kw)
        return ParagraphStyle(n, **d)

    story = []
    logo = _logo_image(biz.get("logo_b64", ""), max_w=34 * mm, max_h=15 * mm) if c["theme"].get("show_logo", True) else None
    left = [logo] if logo else []
    left.append(Paragraph(biz.get("name", ""), PS("n", fontName=FB, fontSize=13, leading=17)))
    if biz.get("address"):
        left.append(Paragraph(biz["address"].replace("\n", "<br/>"), PS("a", fontSize=7.5, leading=10.5, textColor=GREY)))
    if biz.get("gstin"):
        left.append(Paragraph(f"GSTIN {biz['gstin']}", PS("g", fontSize=7.5, leading=10.5, textColor=GREY)))
    meta_rows = [[c["label"], ""], ["Invoice no.", c["no"]], ["Date", _fmt_date(c["date"])]]
    if c["due"]:
        meta_rows.append(["Due date", _fmt_date(c["due"])])
    meta_rows.append(["Place of supply", c["party"].get("state", "") or "—"])
    meta = Table(meta_rows, colWidths=[30 * mm, 38 * mm])
    meta.setStyle(TableStyle([
        ("SPAN", (0, 0), (1, 0)), ("BACKGROUND", (0, 0), (-1, 0), P),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE), ("FONTNAME", (0, 0), (-1, 0), FB),
        ("FONTSIZE", (0, 0), (-1, 0), 11), ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("BACKGROUND", (0, 1), (-1, -1), TINT), ("FONTNAME", (0, 1), (0, -1), F),
        ("FONTNAME", (1, 1), (1, -1), FB), ("FONTSIZE", (0, 1), (-1, -1), 8.5),
        ("ALIGN", (1, 1), (1, -1), "RIGHT"), ("TEXTCOLOR", (0, 1), (0, -1), GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(Table([[left, meta]], colWidths=[108 * mm, 68 * mm],
                       style=TableStyle([("VALIGN", (0, 0), (0, 0), "TOP"), ("VALIGN", (1, 0), (1, 0), "TOP"),
                                         ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)])))
    story.append(Spacer(1, 6 * mm))

    party = c["party"]
    to = [Paragraph("BILL TO", PS("bt", fontName=FB, fontSize=7.5, textColor=P)),
          Paragraph(party.get("name", ""), PS("bn", fontName=FB, fontSize=10, leading=13)),
          Paragraph((party.get("billing_address") or "").replace("\n", "<br/>"), PS("ba", fontSize=8, leading=11, textColor=GREY))]
    if party.get("gstin"):
        to.append(Paragraph(f"GSTIN {party['gstin']}", PS("bg", fontSize=8, textColor=GREY)))
    ship = []
    if c["theme"].get("show_ship_to", True) and (inv.get("shipping_address") or party.get("shipping_address")):
        ship = [Paragraph("SHIP TO", PS("st", fontName=FB, fontSize=7.5, textColor=P)),
                Paragraph((inv.get("shipping_address") or party.get("shipping_address") or "").replace("\n", "<br/>"),
                          PS("sa", fontSize=8, leading=11, textColor=GREY))]
    cols = [[to, ship]]
    addr = Table(cols, colWidths=[88 * mm, 88 * mm])
    addr.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (0, 0), 0.4, BORDER),
                              ("BOX", (1, 0), (1, 0), 0.4, BORDER if ship else colors.white),
                              ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FBFBFD")),
                              ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                              ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7)]))
    # coloured label strips
    story += [addr, Spacer(1, 5 * mm)]

    rows = _item_rows(c)
    tbl = Table(rows, colWidths=[7 * mm, 55 * mm, 20 * mm, 21 * mm, 24 * mm, 25 * mm, 24 * mm], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), P), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), FB), ("FONTNAME", (0, 1), (-1, -1), F),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(rows)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F8FAFC")))
    tbl.setStyle(TableStyle(style))
    story += [tbl, Spacer(1, 5 * mm)]

    tot_rows = [[k, _inr(v)] for k, v in _totals_pairs(c)]
    tot_rows.append(["GRAND TOTAL", _inr(c["totals"].get("grand_total", 0))])
    tot = Table(tot_rows, colWidths=[42 * mm, 36 * mm])
    tot.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -2), F), ("FONTNAME", (0, -1), (-1, -1), FB),
        ("FONTSIZE", (0, 0), (-1, -1), 9), ("FONTSIZE", (0, -1), (-1, -1), 11),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BACKGROUND", (0, 0), (-1, -2), colors.HexColor("#F8FAFC")),
        ("BACKGROUND", (0, -1), (-1, -1), P), ("TEXTCOLOR", (0, -1), (-1, -1), WHITE),
        ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    words = Paragraph(f"<b>Amount in words:</b> {_amount_words(c['totals'].get('grand_total', 0))}",
                      PS("w", fontSize=8, leading=12))
    left_cell = [words]
    if c["theme"].get("show_bank", True) and biz.get("bank_name"):
        left_cell += [Spacer(1, 2 * mm),
                      Paragraph(f"<b>Bank:</b> {biz.get('bank_name','')} · A/c {biz.get('bank_account','')} · "
                                f"IFSC {biz.get('bank_ifsc','')}", PS("bk", fontSize=8, leading=12, textColor=GREY))]
    story.append(Table([[left_cell, tot]], colWidths=[98 * mm, 78 * mm],
                       style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                                         ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)])))
    if c["theme"].get("show_terms", True) and biz.get("terms"):
        story += [Spacer(1, 6 * mm), Paragraph(f"<b>Terms &amp; conditions</b><br/>{biz.get('terms','').replace(chr(10), '<br/>')}",
                                               PS("t", fontSize=7.5, leading=11, textColor=GREY))]
    if c["theme"].get("show_signature", True):
        story += [Spacer(1, 12 * mm),
                  Paragraph(f"For <b>{biz.get('name','')}</b>", PS("f", fontSize=8, alignment=TA_RIGHT)),
                  Spacer(1, 10 * mm),
                  Paragraph("Authorised signatory", PS("sg", fontSize=8, alignment=TA_RIGHT, textColor=GREY))]

    def side_band(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(P)
        canvas.rect(0, 0, 6 * mm, A4[1], stroke=0, fill=1)
        canvas.restoreState()
        if c["watermark"]:
            canvas.saveState(); canvas.setFont(FB, 72)
            canvas.setFillColor(colors.Color(0.85, 0.85, 0.85, alpha=0.35))
            canvas.translate(A4[0] / 2, A4[1] / 2); canvas.rotate(45)
            canvas.drawCentredString(0, 0, c["watermark"].upper()); canvas.restoreState()

    doc.build(story, onFirstPage=side_band, onLaterPages=side_band)
    return buf.getvalue()


# ═══════════════════════════════════════════════════════════════════════════════
# MINIMAL — monochrome, hairlines only, plenty of whitespace
# ═══════════════════════════════════════════════════════════════════════════════
def generate_minimal_pdf(inv: dict, biz: dict, kind: str = "sale") -> bytes:
    c = _ctx(inv, biz, kind)
    F, FB = c["F"], c["FB"]
    INK = colors.HexColor("#111111")
    SOFT = colors.HexColor("#8A8A8A")
    buf = BytesIO()
    CW = 180 * mm
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=18 * mm, bottomMargin=16 * mm,
                            title=f"{c['label']} {c['no']}", author=biz.get("name", ""))

    def PS(n, **kw):
        d = dict(fontName=F, fontSize=9, leading=13, textColor=INK); d.update(kw)
        return ParagraphStyle(n, **d)

    story = []
    head_left = [Paragraph(biz.get("name", ""), PS("n", fontName=FB, fontSize=12, leading=16)),
                 Paragraph(biz.get("address", "").replace("\n", ", "), PS("a", fontSize=7.5, leading=10.5, textColor=SOFT))]
    if biz.get("gstin"):
        head_left.append(Paragraph(f"GSTIN {biz['gstin']}", PS("g", fontSize=7.5, leading=10.5, textColor=SOFT)))
    head_right = [Paragraph(c["label"].title(), PS("t", fontName=FB, fontSize=12, leading=16, alignment=TA_RIGHT)),
                  Paragraph(f"{c['no']} · {_fmt_date(c['date'])}", PS("m", fontSize=8.5, leading=12, alignment=TA_RIGHT, textColor=SOFT))]
    story.append(Table([[head_left, head_right]], colWidths=[110 * mm, 70 * mm],
                       style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                         ("RIGHTPADDING", (0, 0), (-1, -1), 0)])))
    story += [Spacer(1, 6 * mm), HRFlowable(width=CW, thickness=0.5, color=INK), Spacer(1, 6 * mm)]

    party = c["party"]
    story.append(Paragraph("BILLED TO", PS("bl", fontSize=7, textColor=SOFT)))
    story.append(Paragraph(party.get("name", ""), PS("bn", fontName=FB, fontSize=10.5, leading=14)))
    if party.get("billing_address"):
        story.append(Paragraph(party["billing_address"].replace("\n", ", "), PS("bad", fontSize=8, leading=11, textColor=SOFT)))
    if party.get("gstin"):
        story.append(Paragraph(f"GSTIN {party['gstin']}", PS("bg", fontSize=8, leading=11, textColor=SOFT)))
    story.append(Spacer(1, 7 * mm))

    rows = _item_rows(c)
    tbl = Table(rows, colWidths=[7 * mm, 58 * mm, 20 * mm, 21 * mm, 24 * mm, 26 * mm, 24 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), FB), ("FONTNAME", (0, 1), (-1, -1), F),
        ("FONTSIZE", (0, 0), (-1, 0), 7.5), ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), SOFT), ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, INK), ("LINEBELOW", (0, 1), (-1, -2), 0.2, colors.HexColor("#E6E6E6")),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story += [tbl, Spacer(1, 5 * mm)]

    tot_rows = [[k, _inr(v)] for k, v in _totals_pairs(c)]
    tot_rows.append(["Total", _inr(c["totals"].get("grand_total", 0))])
    tot = Table(tot_rows, colWidths=[38 * mm, 34 * mm])
    tot.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -2), F), ("FONTNAME", (0, -1), (-1, -1), FB),
        ("FONTSIZE", (0, 0), (-1, -1), 9), ("FONTSIZE", (0, -1), (-1, -1), 12),
        ("TEXTCOLOR", (0, 0), (-1, -2), SOFT), ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.5, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    tot.hAlign = "RIGHT"
    story += [tot, Spacer(1, 8 * mm)]
    story.append(Paragraph(_amount_words(c["totals"].get("grand_total", 0)), PS("w", fontSize=8, leading=12, textColor=SOFT)))
    if c["theme"].get("show_bank", True) and biz.get("bank_name"):
        story += [Spacer(1, 6 * mm),
                  Paragraph(f"{biz.get('bank_name','')} · A/c {biz.get('bank_account','')} · IFSC {biz.get('bank_ifsc','')}",
                            PS("bk", fontSize=8, leading=11, textColor=SOFT))]
    if c["theme"].get("show_terms", True) and biz.get("terms"):
        story += [Spacer(1, 4 * mm), Paragraph(biz.get("terms", "").replace("\n", "<br/>"),
                                               PS("tm", fontSize=7.5, leading=11, textColor=SOFT))]
    if c["theme"].get("show_signature", True):
        story += [Spacer(1, 14 * mm), Paragraph(f"For {biz.get('name','')}", PS("sg", fontSize=8, alignment=TA_RIGHT, textColor=SOFT))]
    return _build(doc, story, c, buf)
