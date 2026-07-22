import flexitracker.sender as sender


def test_ingest_body_omits_absent_machine(monkeypatch):
    captured = {}

    def fake_request(url, key, method, body):
        captured["url"] = url
        captured["key"] = key
        captured["method"] = method
        captured["body"] = body
        return {}

    monkeypatch.setattr(sender, "_request", fake_request)
    batch = {"batch_seq": 7, "events": [{"ts": 1, "kind": "active"}], "machine": None}
    sender.post_batch("https://x.example/", "KEY", batch)

    assert captured["url"] == "https://x.example/ingest"
    assert captured["method"] == "POST"
    assert captured["body"] == {"batch_seq": 7, "events": [{"ts": 1, "kind": "active"}]}
    assert "machine" not in captured["body"]  # absent, not null


def test_ingest_body_includes_present_machine(monkeypatch):
    captured = {}
    monkeypatch.setattr(sender, "_request", lambda u, k, m, b: captured.update(body=b) or {})
    batch = {
        "batch_seq": 0,
        "events": [],
        "machine": {"hostname": "LAPTOP-1", "os": "windows"},
    }
    sender.post_batch("https://x.example", "KEY", batch)
    assert captured["body"]["machine"] == {"hostname": "LAPTOP-1", "os": "windows"}


def test_whoami_maps_camelcase(monkeypatch):
    monkeypatch.setattr(
        sender,
        "_request",
        lambda u, k, m, b: {
            "email": "a@b.c",
            "machineLabel": "Work laptop",
            "status": "active",
            "active": True,
        },
    )
    w = sender.whoami("https://x.example", "KEY")
    assert w.email == "a@b.c"
    assert w.machine_label == "Work laptop"
    assert w.active is True
