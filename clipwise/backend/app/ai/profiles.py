"""Per-event-type AI profiles: what Pegasus should look for, and how to score it."""

HIGHLIGHT_PREFERENCE_LABELS = {
    "emotional": "emotional peaks — tears, laughter, embraces, visible joy",
    "speeches": "speeches, toasts, vows and anything with meaningful spoken word",
    "action": "peak action — fast motion, scoring plays, decisive movements",
    "crowd": "crowd reactions — cheering, applause, standing ovations",
    "music": "music and dancing — performances, first dance, big musical moments",
    "detail": "detail shots — close-ups of rings, decor, hands, textures",
    "brands": "brand and product moments — visible logos, sponsor boards, worn items",
    "candid": "candid in-between moments that feel unposed and natural",
}

EVENT_PROFILES = {
    "wedding": {
        "label": "Wedding",
        "focus": "ceremony, vows, first kiss, ring exchange, speeches, first dance, cake cutting, emotional guest reactions",
        "default_preferences": ["emotional", "speeches", "music", "detail"],
        "moment_types": ["Ceremony", "Vows", "First kiss", "Ring exchange", "Speech", "First dance", "Cake cutting", "Candid"],
    },
    "football": {
        "label": "Football",
        "focus": "goals, saves, near misses, fouls, celebrations, crowd surges, substitutions",
        "default_preferences": ["action", "crowd"],
        "moment_types": ["Goal", "Save", "Near miss", "Foul", "Celebration", "Crowd surge"],
    },
    "basketball": {
        "label": "Basketball",
        "focus": "dunks, three-pointers, blocks, fast breaks, clutch shots, bench reactions",
        "default_preferences": ["action", "crowd"],
        "moment_types": ["Dunk", "Three-pointer", "Block", "Fast break", "Clutch shot", "Bench reaction"],
    },
    "corporate": {
        "label": "Corporate",
        "focus": "keynote speeches, award presentations, panel highlights, applause, networking moments, product reveals",
        "default_preferences": ["speeches", "crowd", "brands"],
        "moment_types": ["Keynote", "Award", "Panel", "Applause", "Networking", "Product reveal"],
    },
    "concert": {
        "label": "Concert",
        "focus": "solos, choruses, encores, crowd singalongs, stage effects, artist interactions",
        "default_preferences": ["music", "crowd"],
        "moment_types": ["Solo", "Chorus", "Encore", "Crowd singalong", "Stage effect"],
    },
    "marathon": {
        "label": "Marathon",
        "focus": "start gun, mile markers, finish-line crossings, personal records, spectator support, exhaustion and elation",
        "default_preferences": ["action", "emotional", "crowd"],
        "moment_types": ["Start", "Mile marker", "Finish line", "Personal record", "Spectator support"],
    },
    "other": {
        "label": "Other",
        "focus": "the most emotionally and visually significant moments in the footage",
        "default_preferences": ["emotional", "action"],
        "moment_types": ["Key moment", "Reaction", "Highlight"],
    },
}


def get_profile(event_type: str) -> dict:
    return EVENT_PROFILES.get(event_type, EVENT_PROFILES["other"])


def build_highlight_prompt(event_type: str, preferences=None, duration_seconds: float = 0) -> str:
    profile = get_profile(event_type)
    prefs = preferences or profile["default_preferences"]
    pref_text = "\n".join(f"- {HIGHLIGHT_PREFERENCE_LABELS.get(p, p)}" for p in prefs)
    dur = f"The video is approximately {int(duration_seconds)} seconds long. " if duration_seconds else ""
    return (
        f"You are an expert {profile['label'].lower()} video editor reviewing raw footage.\n"
        f"{dur}Identify the strongest highlight moments in this video.\n\n"
        f"Prioritise: {profile['focus']}.\n\n"
        f"The videographer specifically asked for:\n{pref_text}\n\n"
        "For each highlight return:\n"
        "- start_seconds: when the moment begins (seconds from the start of the video)\n"
        "- duration_seconds: how long the moment lasts (between 3 and 20 seconds)\n"
        "- moment_type: a short label, two or three words\n"
        "- description: one sentence describing what happens\n"
        "- score: 0-100, how strong this moment is for a highlight reel\n"
        "- people: names or roles of anyone clearly visible, if identifiable\n\n"
        "Return between 6 and 20 highlights, ordered by start_seconds. "
        "Never invent moments that are not in the footage, and never return a start_seconds "
        "beyond the length of the video."
    )


HIGHLIGHT_SCHEMA = {
    "type": "object",
    "properties": {
        "highlights": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "start_seconds": {"type": "number"},
                    "duration_seconds": {"type": "number"},
                    "moment_type": {"type": "string"},
                    "description": {"type": "string"},
                    "score": {"type": "integer", "minimum": 0, "maximum": 100},
                    "people": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["start_seconds", "duration_seconds", "moment_type", "description", "score"],
            },
        }
    },
    "required": ["highlights"],
}
