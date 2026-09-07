"""Shift / event reports as JSON, CSV, and PDF."""
from __future__ import annotations

import csv
import io
import re
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import Response, StreamingResponse

from ..db import get_db
from ..security import current_user
from .deps import get_event

router = APIRouter(prefix="/events", tags=["reports"])


def _safe(name: str) -> str:
    return re.sub(r"[^\w\-]+", "_", name or "event").strip("_") or "event"


def _fmt(seconds: float) -> str:
    seconds = int(seconds or 0)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:d}:{m:02d}:{s:02d}" if h else f"{m:d}:{s:02d}"


async def _gather(event_id: str):
    db = get_db()
    highlights = [h async for h in db.highlights.find({"event_id": event_id}).sort("timestamp", 1)]
    people = [p async for p in db.people.find({"event_id": event_id})]
    appearances = [a async for a in db.appearances.find({"event_id": event_id})]
    return highlights, people, appearances


@router.get("/{event_id}/report")
async def report_json(event_id: str, user=Depends(current_user)):
    event = await get_event(event_id, user)
    highlights, people, appearances = await _gather(event_id)
    counts = {}
    for a in appearances:
        counts[a["person_id"]] = counts.get(a["person_id"], 0) + 1
    scores = [h.get("score", 0) for h in highlights]
    top = sorted(highlights, key=lambda h: h.get("score", 0), reverse=True)[:5]
    return {
        "event": {
            "id": event_id,
            "title": event.get("title"),
            "event_type": event.get("event_type"),
            "event_date": event.get("event_date"),
            "duration_min": event.get("duration_min", 0),
            "status": event.get("status"),
        },
        "highlight_count": len(highlights),
        "people_count": len(people),
        "appearance_count": len(appearances),
        "avg_score": round(sum(scores) / len(scores)) if scores else 0,
        "top_moments": [
            {"id": h["_id"], "timestamp": h.get("timestamp", 0), "moment_type": h.get("moment_type"),
             "score": h.get("score", 0)}
            for h in top
        ],
        "people": [
            {"id": p["_id"], "name": p.get("name"), "role": p.get("role"),
             "confidence": p.get("confidence", 0), "appearances": counts.get(p["_id"], 0)}
            for p in people
        ],
    }


@router.get("/{event_id}/report.csv")
async def report_csv(event_id: str, user=Depends(current_user)):
    event = await get_event(event_id, user)
    highlights, people, appearances = await _gather(event_id)
    counts = {}
    for a in appearances:
        counts[a["person_id"]] = counts.get(a["person_id"], 0) + 1
    people_by_id = {p["_id"]: p for p in people}

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["ClipWise event report"])
    w.writerow(["Event", event.get("title")])
    w.writerow(["Type", event.get("event_type")])
    w.writerow(["Date", event.get("event_date") or ""])
    w.writerow(["Duration (min)", event.get("duration_min", 0)])
    w.writerow(["Generated", datetime.utcnow().isoformat(timespec="seconds") + "Z"])
    w.writerow([])
    w.writerow(["HIGHLIGHTS"])
    w.writerow(["Timecode", "Seconds", "Duration", "Moment", "Score", "People", "Description"])
    for h in highlights:
        names = ", ".join(
            people_by_id[pid]["name"] for pid in h.get("people_ids", []) if pid in people_by_id
        ) or ", ".join(h.get("people_names", []))
        w.writerow([
            _fmt(h.get("timestamp", 0)), h.get("timestamp", 0), h.get("duration", 0),
            h.get("moment_type"), h.get("score", 0), names, h.get("description", ""),
        ])
    w.writerow([])
    w.writerow(["PEOPLE IDENTIFIED"])
    w.writerow(["Name", "Role", "Match confidence", "Appearances"])
    for p in people:
        w.writerow([p.get("name"), p.get("role") or "", p.get("confidence", 0), counts.get(p["_id"], 0)])

    return Response(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{_safe(event.get("title"))}_report.csv"'},
    )


@router.get("/{event_id}/report.pdf")
async def report_pdf(event_id: str, user=Depends(current_user)):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    event = await get_event(event_id, user)
    highlights, people, appearances = await _gather(event_id)
    counts = {}
    for a in appearances:
        counts[a["person_id"]] = counts.get(a["person_id"], 0) + 1
    people_by_id = {p["_id"]: p for p in people}
    scores = [h.get("score", 0) for h in highlights]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, topMargin=0.7 * inch, bottomMargin=0.7 * inch)
    styles = getSampleStyleSheet()
    gold = colors.HexColor("#B27800")
    title_style = ParagraphStyle("t", parent=styles["Title"], textColor=colors.HexColor("#111111"), alignment=0)
    label = ParagraphStyle("l", parent=styles["Normal"], fontSize=8, textColor=gold, spaceAfter=2)
    body = ParagraphStyle("b", parent=styles["Normal"], fontSize=9, leading=12)

    story = [
        Paragraph("CLIPWISE · EVENT REPORT", label),
        Paragraph(event.get("title") or "Event", title_style),
        Paragraph(
            f"{(event.get('event_type') or '').title()} · {event.get('event_date') or '—'} · "
            f"{event.get('duration_min', 0)} minutes · {event.get('studio_name') or ''}",
            body,
        ),
        Spacer(1, 16),
    ]

    summary = [
        ["Highlights", "People identified", "Appearances", "Average score"],
        [str(len(highlights)), str(len(people)), str(len(appearances)),
         str(round(sum(scores) / len(scores)) if scores else 0)],
    ]
    t = Table(summary, colWidths=[1.6 * inch] * 4)
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#666666")),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, 1), 16),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 1), (-1, 1), 0.5, colors.HexColor("#DDDDDD")),
    ]))
    story += [t, Spacer(1, 18), Paragraph("HIGHLIGHTS", label), Spacer(1, 4)]

    rows = [["Time", "Moment", "Score", "People", "Description"]]
    for h in highlights:
        names = ", ".join(
            people_by_id[pid]["name"] for pid in h.get("people_ids", []) if pid in people_by_id
        ) or ", ".join(h.get("people_names", []))
        rows.append([
            _fmt(h.get("timestamp", 0)),
            Paragraph(h.get("moment_type") or "", body),
            str(h.get("score", 0)),
            Paragraph(names, body),
            Paragraph((h.get("description") or "")[:220], body),
        ])
    if len(rows) == 1:
        rows.append(["—", Paragraph("No highlights yet", body), "", "", ""])
    ht = Table(rows, colWidths=[0.7 * inch, 1.3 * inch, 0.5 * inch, 1.3 * inch, 2.6 * inch], repeatRows=1)
    ht.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F3F3")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#555555")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E4E4E4")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    story += [ht, Spacer(1, 18), Paragraph("PEOPLE IDENTIFIED", label), Spacer(1, 4)]

    prows = [["Name", "Role", "Match confidence", "Appearances"]]
    for p in people:
        prows.append([p.get("name") or "", p.get("role") or "—",
                      f"{p.get('confidence', 0)}%", str(counts.get(p["_id"], 0))])
    if len(prows) == 1:
        prows.append(["—", "—", "—", "—"])
    pt = Table(prows, colWidths=[2.0 * inch, 1.8 * inch, 1.4 * inch, 1.2 * inch], repeatRows=1)
    pt.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F3F3")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#555555")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E4E4E4")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    story += [
        pt, Spacer(1, 20),
        Paragraph(
            f"Generated by ClipWise AI on {datetime.utcnow().strftime('%d %b %Y %H:%M')} UTC",
            ParagraphStyle("f", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#999999")),
        ),
    ]

    doc.build(story)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_safe(event.get("title"))}_report.pdf"'},
    )
