/**
 * Browser-side face recognition.
 *
 * Uses @vladmandic/face-api (a maintained fork of face-api.js) running entirely
 * in the browser: no face image or descriptor is ever sent to a third party.
 * Only the resulting 128-float descriptor is stored, per-event, on our own API.
 *
 * Model weights are fetched from REACT_APP_FACE_MODEL_URL (default: jsDelivr).
 * Self-host them by copying the @vladmandic/face-api `model` folder into
 * frontend/public/models and setting REACT_APP_FACE_MODEL_URL=/models.
 */

const MODEL_URL =
  process.env.REACT_APP_FACE_MODEL_URL ||
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

let faceapi = null;
let loading = null;

export async function loadFaceApi() {
  if (faceapi) return faceapi;
  if (loading) return loading;
  loading = (async () => {
    const mod = await import("@vladmandic/face-api");
    const api = mod.default || mod;
    await api.tf.setBackend("webgl").catch(() => api.tf.setBackend("cpu"));
    await api.tf.ready();
    await Promise.all([
      api.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    faceapi = api;
    return api;
  })();
  return loading;
}

/** Grab the current video frame into a canvas at a sane working size. */
export function grabFrame(video, maxWidth = 960) {
  const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((video.videoWidth || maxWidth) * scale);
  canvas.height = Math.round((video.videoHeight || maxWidth * 0.5625) * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Detect every face in a canvas and return boxes + descriptors + thumbnails. */
export async function detectFaces(canvas) {
  const api = await loadFaceApi();
  const results = await api
    .detectAllFaces(canvas, new api.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  return results.map((r, i) => {
    const { x, y, width, height } = r.detection.box;
    const pad = Math.round(Math.max(width, height) * 0.15);
    const cx = Math.max(0, Math.round(x - pad));
    const cy = Math.max(0, Math.round(y - pad));
    const cw = Math.min(canvas.width - cx, Math.round(width + pad * 2));
    const ch = Math.min(canvas.height - cy, Math.round(height + pad * 2));
    const crop = document.createElement("canvas");
    crop.width = cw; crop.height = ch;
    crop.getContext("2d").drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    return {
      index: i,
      box: { x, y, width, height },
      score: r.detection.score,
      descriptor: Array.from(r.descriptor),
      thumbnail: crop.toDataURL("image/jpeg", 0.8),
    };
  });
}

/** Euclidean distance between two descriptors. */
export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

/**
 * Match a descriptor against enrolled people.
 * Returns { person, confidence } or null. 0.6 is the face-api reference threshold.
 */
export function matchPerson(descriptor, people, threshold = 0.6) {
  let best = null;
  for (const p of people) {
    for (const d of p.descriptors || []) {
      const dist = distance(descriptor, d);
      if (!best || dist < best.dist) best = { person: p, dist };
    }
  }
  if (!best || best.dist > threshold) return null;
  // Map distance 0 → 100%, threshold → ~70%
  const confidence = Math.round(Math.max(0, Math.min(100, (1 - best.dist / 0.85) * 100)));
  return { person: best.person, confidence, distance: best.dist };
}

/** Seek a video element and wait until the frame is actually painted. */
export function seekTo(video, time) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("seek failed")); };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try { video.currentTime = time; } catch (e) { cleanup(); reject(e); }
  });
}
