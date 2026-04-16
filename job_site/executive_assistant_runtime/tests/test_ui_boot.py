"""
test_ui_boot.py — UI boot and route tests
EXEC-AI-RAPID-002 | S5.1 | Worker B

Covers:
- Flask app imports and instantiates without error
- / route returns 200 with expected HTML landmarks
- /health returns 200 {"ok": true}
- /api/status returns JSON with required fields
- /api/message accepts POST and returns valid response shape
- /api/log returns JSON with entries list
- Demo mode is active and reflected in responses
- No live voice services required
- Static files and templates are present on disk

Run: pytest tests/test_ui_boot.py
"""

import json
import os
import sys
import uuid
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------

_RUNTIME_ROOT = Path(__file__).resolve().parent.parent
_UI_ROOT = _RUNTIME_ROOT / "ui"

if str(_RUNTIME_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(_RUNTIME_ROOT.parent))

# Force demo mode; redirect log to temp path
os.environ["DEMO_MODE"] = "true"
os.environ["INTERACTION_LOG_PATH"] = str(
    Path(os.environ.get("TMPDIR", "/tmp")) / "ui_boot_test_log.jsonl"
)

# ---------------------------------------------------------------------------
# Import the Flask app under test
# ---------------------------------------------------------------------------

from executive_assistant_runtime.ui.app import app as flask_app, DEMO_MODE

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client():
    flask_app.config["TESTING"] = True
    flask_app.config["WTF_CSRF_ENABLED"] = False
    with flask_app.test_client() as c:
        yield c


@pytest.fixture()
def session_id() -> str:
    return f"ui-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# 1. App imports and config
# ---------------------------------------------------------------------------


class TestAppImport:
    def test_app_is_flask_instance(self):
        from flask import Flask
        assert isinstance(flask_app, Flask)

    def test_demo_mode_is_true(self):
        assert DEMO_MODE is True

    def test_app_has_required_routes(self):
        routes = {rule.rule for rule in flask_app.url_map.iter_rules()}
        assert "/" in routes,              "Missing route: /"
        assert "/health" in routes,        "Missing route: /health"
        assert "/api/status" in routes,    "Missing route: /api/status"
        assert "/api/message" in routes,   "Missing route: /api/message"
        assert "/api/log" in routes,       "Missing route: /api/log"

    def test_static_folder_exists(self):
        assert _UI_ROOT.joinpath("static").is_dir()

    def test_templates_folder_exists(self):
        assert _UI_ROOT.joinpath("templates").is_dir()


# ---------------------------------------------------------------------------
# 2. Static and template file presence
# ---------------------------------------------------------------------------


class TestStaticAndTemplates:
    def test_index_html_exists(self):
        assert (_UI_ROOT / "templates" / "index.html").is_file()

    def test_style_css_exists(self):
        assert (_UI_ROOT / "static" / "css" / "style.css").is_file()

    def test_app_js_exists(self):
        assert (_UI_ROOT / "static" / "js" / "app.js").is_file()

    def test_index_html_has_transcript_pane(self):
        src = (_UI_ROOT / "templates" / "index.html").read_text(encoding="utf-8")
        assert "transcript" in src.lower(), "index.html must contain transcript pane"

    def test_index_html_has_response_pane(self):
        src = (_UI_ROOT / "templates" / "index.html").read_text(encoding="utf-8")
        assert "response" in src.lower(), "index.html must contain response pane"

    def test_index_html_has_talk_control(self):
        src = (_UI_ROOT / "templates" / "index.html").read_text(encoding="utf-8")
        assert "talk" in src.lower() or "Talk" in src, "index.html must contain talk control"

    def test_index_html_has_status_bar(self):
        src = (_UI_ROOT / "templates" / "index.html").read_text(encoding="utf-8")
        assert "status" in src.lower(), "index.html must contain status panel"

    def test_style_css_defines_pane(self):
        src = (_UI_ROOT / "static" / "css" / "style.css").read_text(encoding="utf-8")
        assert ".pane" in src

    def test_app_js_defines_send_message(self):
        src = (_UI_ROOT / "static" / "js" / "app.js").read_text(encoding="utf-8")
        assert "sendMessage" in src

    def test_app_js_defines_toggle_talk(self):
        src = (_UI_ROOT / "static" / "js" / "app.js").read_text(encoding="utf-8")
        assert "toggleTalk" in src


# ---------------------------------------------------------------------------
# 3. Route: GET /
# ---------------------------------------------------------------------------


class TestIndexRoute:
    def test_index_returns_200(self, client):
        res = client.get("/")
        assert res.status_code == 200

    def test_index_content_type_is_html(self, client):
        res = client.get("/")
        assert "text/html" in res.content_type

    def test_index_contains_demo_mode_badge(self, client):
        res = client.get("/")
        body = res.data.decode("utf-8")
        assert "DEMO MODE" in body or "demo" in body.lower()

    def test_index_contains_transcript_pane(self, client):
        res = client.get("/")
        body = res.data.decode("utf-8")
        assert "transcript" in body.lower()

    def test_index_contains_response_pane(self, client):
        res = client.get("/")
        body = res.data.decode("utf-8")
        # "response" appears in many contexts; check for pane id or label
        assert "pane-response" in body or "Response" in body

    def test_index_contains_talk_button(self, client):
        res = client.get("/")
        body = res.data.decode("utf-8")
        assert "talk" in body.lower()

    def test_index_contains_status_bar(self, client):
        res = client.get("/")
        body = res.data.decode("utf-8")
        assert "status" in body.lower()

    def test_index_links_stylesheet(self, client):
        res = client.get("/")
        body = res.data.decode("utf-8")
        assert "style.css" in body

    def test_index_links_js(self, client):
        res = client.get("/")
        body = res.data.decode("utf-8")
        assert "app.js" in body


# ---------------------------------------------------------------------------
# 4. Route: GET /health
# ---------------------------------------------------------------------------


class TestHealthRoute:
    def test_health_returns_200(self, client):
        res = client.get("/health")
        assert res.status_code == 200

    def test_health_returns_json(self, client):
        res = client.get("/health")
        data = json.loads(res.data)
        assert data.get("ok") is True


# ---------------------------------------------------------------------------
# 5. Route: GET /api/status
# ---------------------------------------------------------------------------


class TestStatusRoute:
    def test_status_returns_200(self, client):
        res = client.get("/api/status")
        assert res.status_code == 200

    def test_status_content_type_is_json(self, client):
        res = client.get("/api/status")
        assert "application/json" in res.content_type

    def test_status_has_demo_mode_field(self, client):
        res = client.get("/api/status")
        data = json.loads(res.data)
        assert "demo_mode" in data

    def test_status_demo_mode_is_true(self, client):
        res = client.get("/api/status")
        data = json.loads(res.data)
        assert data["demo_mode"] is True

    def test_status_has_core_status(self, client):
        res = client.get("/api/status")
        data = json.loads(res.data)
        assert "core_status" in data
        assert data["core_status"]

    def test_status_has_voice_status(self, client):
        res = client.get("/api/status")
        data = json.loads(res.data)
        assert "voice_status" in data

    def test_status_has_boot_time(self, client):
        res = client.get("/api/status")
        data = json.loads(res.data)
        assert "boot_time" in data

    def test_status_has_server_time(self, client):
        res = client.get("/api/status")
        data = json.loads(res.data)
        assert "server_time" in data


# ---------------------------------------------------------------------------
# 6. Route: POST /api/message
# ---------------------------------------------------------------------------


class TestMessageRoute:
    def _post(self, client, text, session_id=None):
        return client.post(
            "/api/message",
            json={"text": text, "session_id": session_id or str(uuid.uuid4())},
        )

    def test_message_returns_200(self, client, session_id):
        res = self._post(client, "hello", session_id)
        assert res.status_code == 200

    def test_message_content_type_is_json(self, client, session_id):
        res = self._post(client, "hello", session_id)
        assert "application/json" in res.content_type

    def test_message_has_response_field(self, client, session_id):
        res = self._post(client, "hello", session_id)
        data = json.loads(res.data)
        assert "response" in data
        assert isinstance(data["response"], str)
        assert data["response"].strip()

    def test_message_has_action_taken_field(self, client, session_id):
        res = self._post(client, "hello", session_id)
        data = json.loads(res.data)
        assert "action_taken" in data

    def test_message_has_session_id_field(self, client, session_id):
        res = self._post(client, "hello", session_id)
        data = json.loads(res.data)
        assert "session_id" in data

    def test_message_has_error_field(self, client, session_id):
        res = self._post(client, "hello", session_id)
        data = json.loads(res.data)
        assert "error" in data

    def test_greeting_action_label(self, client, session_id):
        res = self._post(client, "hello", session_id)
        data = json.loads(res.data)
        assert data["action_taken"] == "greeting"

    def test_fallback_action_label(self, client, session_id):
        res = self._post(client, "xyzzy nonsense 99", session_id)
        data = json.loads(res.data)
        assert data["action_taken"] == "fallback"

    def test_empty_text_returns_gracefully(self, client, session_id):
        res = self._post(client, "", session_id)
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data["response"].strip()

    def test_response_is_never_empty(self, client, session_id):
        for text in ("hello", "calendar", "book a meeting", "xyzzy", ""):
            res = self._post(client, text, session_id)
            data = json.loads(res.data)
            assert data["response"].strip(), f"Empty response for text={text!r}"


# ---------------------------------------------------------------------------
# 7. Route: GET /api/log
# ---------------------------------------------------------------------------


class TestLogRoute:
    def test_log_returns_200(self, client):
        res = client.get("/api/log")
        assert res.status_code == 200

    def test_log_content_type_is_json(self, client):
        res = client.get("/api/log")
        assert "application/json" in res.content_type

    def test_log_has_entries_list(self, client):
        res = client.get("/api/log")
        data = json.loads(res.data)
        assert "entries" in data
        assert isinstance(data["entries"], list)

    def test_log_has_count_field(self, client):
        res = client.get("/api/log")
        data = json.loads(res.data)
        assert "count" in data

    def test_log_limit_param_accepted(self, client):
        res = client.get("/api/log?limit=5")
        assert res.status_code == 200
        data = json.loads(res.data)
        assert len(data["entries"]) <= 5


# ---------------------------------------------------------------------------
# 8. Demo mode guard
# ---------------------------------------------------------------------------


class TestDemoModeGuard:
    def test_env_demo_mode_true(self):
        assert os.environ.get("DEMO_MODE", "").lower() == "true"

    def test_no_live_voice_import_in_app(self):
        """app.py must not import live voice modules at module level."""
        src = (_UI_ROOT / "app.py").read_text(encoding="utf-8")
        assert "import pipecat" not in src
        assert "import pyaudio" not in src
        assert "import sounddevice" not in src

    def test_talk_button_disabled_in_demo_html(self, client):
        """Talk button must carry disabled attribute when DEMO_MODE=true."""
        res = client.get("/")
        body = res.data.decode("utf-8")
        # The Jinja template sets disabled on the talk button in demo mode
        assert "disabled" in body

    def test_status_voice_is_demo_passthrough(self, client):
        res = client.get("/api/status")
        data = json.loads(res.data)
        assert "demo" in data["voice_status"].lower()
