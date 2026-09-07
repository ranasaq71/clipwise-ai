import io
import os


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ok"


def test_demo_seeded_and_public_demo(client):
    r = client.get("/api/public/demo")
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["people"]) == 4
    assert data["total_highlights"] == 13

    r = client.get("/api/public/demo/find_me", params={"name": "Sarah"})
    assert r.status_code == 200
    body = r.json()
    assert body["matches"][0]["name"] == "Sarah Chen"
    assert body["total_highlights"] > 0


def test_demo_login(client):
    r = client.post("/api/auth/login", json={"email": "demo@clipwise.ai", "password": "ClipWise2026!"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["plan"] == "agency"


def register(client, email="studio@example.com"):
    r = client.post("/api/auth/register", json={"name": "Test Studio", "email": email, "password": "hunter2!"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_auth_and_event_lifecycle(client, tmp_path):
    token = register(client)
    h = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/auth/me", headers=h)
    assert me.status_code == 200 and me.json()["email"] == "studio@example.com"

    r = client.post("/api/events", json={"title": "Test Wedding", "event_type": "wedding"}, headers=h)
    assert r.status_code == 201, r.text
    event = r.json()
    assert event["status"] == "draft" and event["has_video"] is False

    # --- chunked upload of a tiny synthetic file ---
    payload = os.urandom(300_000)
    init = client.post(f"/api/events/{event['id']}/upload/init",
                       json={"filename": "clip.mp4", "size": len(payload), "content_type": "video/mp4"},
                       headers=h)
    assert init.status_code == 200, init.text
    upload_id = init.json()["upload_id"]

    half = len(payload) // 2
    for i, part in enumerate([payload[:half], payload[half:]]):
        r = client.post(
            f"/api/events/{event['id']}/upload/chunk",
            params={"upload_id": upload_id, "chunk_index": i, "total_chunks": 2},
            files={"chunk": (f"chunk-{i}", io.BytesIO(part), "application/octet-stream")},
            headers=h,
        )
        assert r.status_code == 200, r.text

    r = client.post(
        f"/api/events/{event['id']}/upload/complete",
        params={"upload_id": upload_id, "filename": "clip.mp4", "total_chunks": 2, "content_type": "video/mp4"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["size"] == len(payload)

    # --- processing must refuse, loudly, without a TwelveLabs key ---
    r = client.post(f"/api/events/{event['id']}/process", headers=h)
    assert r.status_code == 503
    assert "TwelveLabs" in r.json()["detail"]

    # --- patch details ---
    r = client.patch(f"/api/events/{event['id']}",
                     json={"title": "Renamed", "event_type": "concert", "highlight_preferences": ["music"]},
                     headers=h)
    assert r.status_code == 200 and r.json()["title"] == "Renamed"


def test_people_and_appearances(client):
    token = register(client, "faces@example.com")
    h = {"Authorization": f"Bearer {token}"}
    ev = client.post("/api/events", json={"title": "Faces", "event_type": "corporate"}, headers=h).json()

    d = [0.01 * i for i in range(128)]
    r = client.post(f"/api/events/{ev['id']}/people",
                    json={"name": "Ada Lovelace", "role": "Speaker", "photos": ["data:,x"], "descriptors": [d]},
                    headers=h)
    assert r.status_code == 201, r.text
    person = r.json()
    assert person["confidence"] == 78  # one reference photo

    r = client.post(f"/api/events/{ev['id']}/people/{person['id']}/descriptors",
                    json={"descriptor": d, "photo": "data:,y"}, headers=h)
    assert r.status_code == 200 and r.json()["confidence"] == 88

    r = client.post(f"/api/events/{ev['id']}/appearances",
                    json={"items": [{"person_id": person["id"], "timestamp": 12.5, "confidence": 91}]},
                    headers=h)
    assert r.status_code == 200
    assert r.json()[0]["timestamp"] == 12.5

    # name-based search resolves through the face index without TwelveLabs
    r = client.get(f"/api/events/{ev['id']}/search", params={"q": "Ada"}, headers=h)
    assert r.status_code == 200 and r.json()[0]["match_score"] == 91

    r = client.get(f"/api/events/{ev['id']}/people", headers=h)
    assert r.json()[0]["appearance_count"] == 1

    r = client.delete(f"/api/events/{ev['id']}/people/{person['id']}", headers=h)
    assert r.status_code == 204


def test_reports_and_portal_for_demo_event(client):
    login = client.post("/api/auth/login", json={"email": "demo@clipwise.ai", "password": "ClipWise2026!"})
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    events = client.get("/api/events", headers=h).json()
    demo = events[0]

    r = client.get(f"/api/events/{demo['id']}/report", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["highlight_count"] == 13 and body["people_count"] == 4
    assert len(body["top_moments"]) == 5

    r = client.get(f"/api/events/{demo['id']}/report.csv", headers=h)
    assert r.status_code == 200 and "HIGHLIGHTS" in r.text

    r = client.get(f"/api/events/{demo['id']}/report.pdf", headers=h)
    assert r.status_code == 200 and r.content[:4] == b"%PDF"

    r = client.get(f"/api/portal/{demo['id']}")
    assert r.status_code == 200, r.text
    portal = r.json()
    assert portal["event"]["studio_name"] == "Golden Hour Co."
    assert len(portal["highlights"]) == 13
    assert all(p["descriptors"] == [] for p in portal["people"])  # biometrics never leave the studio

    r = client.get(f"/api/portal/{demo['id']}/find_me", params={"name": "marcus"})
    assert r.status_code == 200 and r.json()["total_highlights"] > 0


def test_integrations_report_missing_keys(client):
    token = register(client, "int@example.com")
    h = {"Authorization": f"Bearer {token}"}
    r = client.get("/api/settings/integrations", headers=h)
    assert r.status_code == 200
    by_key = {i["key"]: i for i in r.json()}
    assert by_key["twelvelabs"]["configured"] is False
    assert by_key["stripe"]["configured"] is False


def test_billing_requires_stripe_key(client):
    token = register(client, "bill@example.com")
    h = {"Authorization": f"Bearer {token}"}
    r = client.post("/api/billing/checkout", json={"plan_id": "pro", "origin_url": "http://x"}, headers=h)
    assert r.status_code == 503 and "Stripe" in r.json()["detail"]


def test_admin_overview(client):
    login = client.post("/api/auth/login", json={"email": "demo@clipwise.ai", "password": "ClipWise2026!"})
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    r = client.get("/api/admin/overview", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["stats"]["highlights_total"] == 13
