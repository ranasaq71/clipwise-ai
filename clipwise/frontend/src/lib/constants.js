// Event type metadata (mirrors backend ai/profiles.py EVENT_PROFILES)
export const EVENT_TYPES = [
  {
    id: "wedding",
    label: "Wedding",
    tagline: "Capture every tear, vow & first dance.",
    image: "https://images.unsplash.com/photo-1519741497674-611481863552?w=800",
    accent: "#FFB000",
  },
  {
    id: "football",
    label: "Football",
    tagline: "Every goal. Every save. Every roar.",
    image: "https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800",
    accent: "#00F298",
  },
  {
    id: "basketball",
    label: "Basketball",
    tagline: "Slams, threes, and clutch moments.",
    image: "https://images.unsplash.com/photo-1741477168705-6232d4841c8b?w=800",
    accent: "#FFB000",
  },
  {
    id: "corporate",
    label: "Corporate",
    tagline: "Speeches, awards, networking.",
    image: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800",
    accent: "#4B32C3",
  },
  {
    id: "concert",
    label: "Concert",
    tagline: "Every solo, every encore.",
    image: "https://images.unsplash.com/photo-1736299294007-f8f585495de0?w=800",
    accent: "#EF4444",
  },
  {
    id: "marathon",
    label: "Marathon",
    tagline: "Every mile, every PR.",
    image: "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=800",
    accent: "#00F298",
  },
];

export const PLANS = [
  {
    id: "starter",
    label: "Starter",
    price: 79,
    blurb: "For solo videographers shipping their first AI-edited reels.",
    features: ["5 events / month", "10 named people per event", "AI highlights + social clips", "Standard support"],
    cta: "Start with Starter",
  },
  {
    id: "pro",
    label: "Pro",
    price: 199,
    featured: true,
    blurb: "For studios delivering branded portals & shoppable video.",
    features: ["20 events / month", "50 named people per event", "Shoppable video", "Client delivery portal", "Priority support"],
    cta: "Upgrade to Pro",
  },
  {
    id: "agency",
    label: "Agency",
    price: 499,
    blurb: "Unlimited firepower for agencies + white-label studios.",
    features: ["Unlimited events", "Unlimited named people", "White-label portal", "Brand ROI reports", "Dedicated success manager"],
    cta: "Go Agency",
  },
];

// One-time pay-per-event purchase
export const PER_EVENT_PRICE = 49;

export const HIGHLIGHT_PREFERENCES = [
  { id: "emotional", label: "Emotional moments", hint: "Tears, laughter, embraces" },
  { id: "speeches", label: "Speeches & toasts", hint: "Spoken word, applause" },
  { id: "action", label: "Peak action", hint: "Fast motion, scoring, crowd surges" },
  { id: "crowd", label: "Crowd reactions", hint: "Cheering, standing ovations" },
  { id: "music", label: "Music & dancing", hint: "First dance, performances" },
  { id: "detail", label: "Detail shots", hint: "Rings, decor, close-ups" },
  { id: "brands", label: "Brand & product moments", hint: "Logos, sponsor boards, wearables" },
  { id: "candid", label: "Candid in-between", hint: "Unposed, natural moments" },
];

export function fmtTime(seconds) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function confidenceColor(c) {
  if (c >= 90) return "#00F298";
  if (c >= 75) return "#FFB000";
  return "#EF4444";
}

export function fmtBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}
