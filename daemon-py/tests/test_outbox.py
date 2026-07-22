import json

from flexitracker.outbox import MAX_BATCH_EVENTS, Outbox


def ev(ts, kind="heartbeat"):
    return {"ts": ts, "kind": kind}


def test_buffers_persists_and_acks(tmp_path):
    path = tmp_path / "outbox.json"
    ob = Outbox.open(path)
    ob.append([ev(1, "active")])
    ob.append([ev(2, "idle")])
    assert ob.pending_len() == 2

    # Reopen: pending survived the "restart".
    ob = Outbox.open(path)
    assert ob.pending_len() == 2
    batch = ob.next_batch()
    assert batch["batch_seq"] == 0
    assert len(batch["events"]) == 2
    ob.ack()
    assert ob.pending_len() == 0
    assert ob.next_batch() is None

    ob.append([ev(3, "active")])
    assert ob.next_batch()["batch_seq"] == 1


def test_on_disk_format_matches_rust_schema(tmp_path):
    path = tmp_path / "outbox.json"
    ob = Outbox.open(path)
    ob.append([ev(1, "active")])
    state = json.loads(path.read_text())
    # Keys and shape must match the Rust OutboxState so either daemon can resume
    # the other's outbox.
    assert set(state.keys()) == {"next_seq", "pending", "machine"}
    assert state["next_seq"] == 0
    assert state["pending"] == [{"ts": 1, "kind": "active"}]
    assert state["machine"] is None


def test_torn_file_does_not_strand_the_daemon(tmp_path):
    path = tmp_path / "outbox.json"
    path.write_text('{"next_seq":3,"pending":[{"ts":1,"ki')  # truncated
    ob = Outbox.open(path)
    assert ob.pending_len() == 0
    assert (tmp_path / "outbox.corrupt").exists()


def test_trims_only_events_older_than_the_edit_window(tmp_path):
    ob = Outbox.open(tmp_path / "outbox.json")
    now = 200 * 86_400_000
    ob.append([ev(now - 150 * 86_400_000), ev(now - 10 * 86_400_000), ev(now)])
    assert ob.trim_expired(now) == 1
    assert ob.pending_len() == 2


def test_backlog_drains_across_chunks(tmp_path):
    ob = Outbox.open(tmp_path / "outbox.json")
    total = MAX_BATCH_EVENTS + 500
    ob.append([ev(i) for i in range(total)])
    first = ob.next_batch()
    assert len(first["events"]) == MAX_BATCH_EVENTS
    assert first["batch_seq"] == 0
    ob.ack()
    assert ob.pending_len() == 500
    second = ob.next_batch()
    assert len(second["events"]) == 500
    assert second["batch_seq"] == 1
    assert second["events"][0]["ts"] == MAX_BATCH_EVENTS
