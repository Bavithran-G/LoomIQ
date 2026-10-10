"""Validation, status transitions, access control, risk, simulator."""
from datetime import timedelta

from conftest import new_order, today


def test_auth(client, H):
    assert client.get("/api/orders").status_code == 401
    assert client.post("/api/auth/login", data={"username": "admin", "password": "wrong"}).status_code == 401
    me = client.get("/api/auth/me", headers=H["qc.anitha"]).json()
    assert me["user"]["role"] == "quality_inspector" and "quality.review" in me["permissions"]


def test_role_enforcement(client, H):
    body = {"buyer_id": 1, "buyer_po": "X-1", "fabric_spec_id": 1, "colour": "Red", "quantity": 100,
            "order_date": str(today()), "promised_date": str(today() + timedelta(days=5))}
    assert client.post("/api/orders", json=body, headers=H["store.meena"]).status_code == 403
    assert client.get("/api/cost/orders", headers=H["store.meena"]).status_code == 403
    assert client.post("/api/inventory/adjustments", json={"lot_id": 1, "delta": -1, "reason": "count"},
                       headers=H["qc.anitha"]).status_code == 403
    assert client.post("/api/quality/inspections/1/review", json={"decision": "accept"},
                       headers=H["dispatch.karthik"]).status_code == 403
    assert client.get("/api/admin/users", headers=H["pm.ravi"]).status_code == 403
    # inspector can see order but not its cost block
    o = client.get("/api/orders/1", headers=H["qc.anitha"]).json()
    assert "cost" not in o
    assert "cost" in client.get("/api/orders/1", headers=H["finance.priya"]).json()


def test_order_validation_and_duplicates(client, H):
    base = {"buyer_id": 2, "fabric_spec_id": 2, "colour": "Grey", "quantity": 500, "order_date": str(today()),
            "promised_date": str(today() - timedelta(days=1)), "buyer_po": "DUP-1"}
    r = client.post("/api/orders", json=base, headers=H["pm.ravi"])
    assert r.status_code == 422 and "before the order date" in r.json()["detail"]
    base["promised_date"] = str(today() + timedelta(days=9))
    assert client.post("/api/orders", json={**base, "quantity": -5}, headers=H["pm.ravi"]).status_code == 422
    assert client.post("/api/orders", json=base, headers=H["pm.ravi"]).status_code == 201
    r = client.post("/api/orders", json=base, headers=H["pm.ravi"])
    assert r.status_code == 409 and "Duplicate" in r.json()["detail"]


def test_status_transitions(client, H):
    o = new_order(client, H)
    oid = o["id"]
    t = lambda a, reason="": client.post(f"/api/orders/{oid}/transition", json={"action": a, "reason": reason},
                                         headers=H["pm.ravi"])
    assert t("resume").status_code == 409
    assert t("hold", "x").status_code == 409            # draft cannot be put on hold
    assert t("confirm").status_code == 200
    assert t("confirm").status_code == 409
    assert t("hold").status_code == 422                 # reason required
    assert t("hold", "Buyer changed colour").status_code == 200
    # planning a job on a held order is blocked
    r = client.post("/api/production/jobs", headers=H["pm.ravi"], json={
        "order_id": oid, "stage_code": "weaving", "machine_id": 1, "shift": "A",
        "planned_date": str(today() + timedelta(days=10)), "planned_qty": 50})
    assert r.status_code == 409
    assert t("resume").json()["order"]["status"] == "confirmed"
    reserved_before = sum(m["reserved"] for m in client.get("/api/inventory/materials", headers=H["store.meena"]).json())
    r = t("cancel", "Buyer cancelled PO")
    assert r.status_code == 200 and r.json()["info"]["released_material"] > 0
    reserved_after = sum(m["reserved"] for m in client.get("/api/inventory/materials", headers=H["store.meena"]).json())
    assert reserved_after < reserved_before
    assert t("confirm").status_code == 409              # cancelled is terminal
    # locked fields after confirm
    o2 = new_order(client, H)
    client.post(f"/api/orders/{o2['id']}/transition", json={"action": "confirm"}, headers=H["pm.ravi"])
    r = client.patch(f"/api/orders/{o2['id']}", json={"quantity": 999}, headers=H["pm.ravi"])
    assert r.status_code == 409
    r = client.patch(f"/api/orders/{o2['id']}", json={"priority": "high"}, headers=H["pm.ravi"])
    assert r.status_code == 200 and r.json()["priority"] == "high"


def test_capacity_and_machine_rules(client, H):
    o = new_order(client, H, quantity=1000)
    client.post(f"/api/orders/{o['id']}/transition", json={"action": "confirm"}, headers=H["pm.ravi"])
    day = str(today() + timedelta(days=12))
    job = lambda mid, qty, stage="weaving": client.post("/api/production/jobs", headers=H["pm.ravi"], json={
        "order_id": o["id"], "stage_code": stage, "machine_id": mid, "shift": "B", "planned_date": day, "planned_qty": qty})
    assert job(1, 150).status_code == 201
    r = job(1, 50)
    assert r.status_code == 409 and "Capacity exceeded" in r.json()["detail"]
    assert job(7, 50).status_code == 422     # JG-01 is a dyeing machine
    machines = client.get("/api/machines", headers=H["pm.ravi"]).json()
    maint = next(m for m in machines if m["state"] == "maintenance")
    r = job(maint["id"], 50)
    assert r.status_code == 409 and "maintenance" in r.json()["detail"]


def test_stock_rules(client, H):
    lots = client.get("/api/inventory/lots", headers=H["store.meena"]).json()
    lot = next(l for l in lots if l["qty_available"] > 0)
    r = client.post("/api/inventory/adjustments", headers=H["store.meena"],
                    json={"lot_id": lot["id"], "delta": -(lot["qty_available"] + 1), "reason": "cycle count"})
    assert r.status_code == 409 and "negative" in r.json()["detail"]
    r = client.post("/api/inventory/adjustments", headers=H["store.meena"],
                    json={"lot_id": lot["id"], "delta": -1.5, "reason": "cycle count variance"})
    assert r.status_code == 200 and r.json()["qty_available"] == round(lot["qty_available"] - 1.5, 3)
    po = next(p for p in client.get("/api/inventory/purchase-lines", headers=H["store.meena"]).json() if p["status"] == "open")
    body = {"material_id": po["material_id"], "qty": po["qty"], "unit_cost": po["unit_cost"], "lot_number": "TEST-LOT-1",
            "receipt_date": str(today()), "purchase_line_id": po["id"]}
    assert client.post("/api/inventory/receipts", json=body, headers=H["store.meena"]).status_code == 201
    assert client.post("/api/inventory/receipts", json={**body, "lot_number": "TEST-LOT-2"},
                       headers=H["store.meena"]).status_code == 409   # PO line already received
    assert client.post("/api/inventory/receipts", json={**body, "purchase_line_id": None},
                       headers=H["store.meena"]).status_code == 409   # duplicate lot number


def test_buyer_isolation(client, H):
    mine = client.get("/api/portal/orders", headers=H["buyer.cae"]).json()
    assert mine and all("cost" not in o and "internal_notes" not in o and "buyer" not in o for o in mine)
    nhl = client.get("/api/portal/orders", headers=H["buyer.nhl"]).json()
    assert {o["id"] for o in mine}.isdisjoint({o["id"] for o in nhl})
    other = nhl[0]["id"]
    assert client.get(f"/api/portal/orders/{other}", headers=H["buyer.cae"]).status_code == 404
    assert client.get("/api/orders", headers=H["buyer.cae"]).status_code == 403
    assert client.get("/api/rolls", headers=H["buyer.cae"]).status_code == 403
    d = client.get(f"/api/portal/orders/{mine[0]['id']}", headers=H["buyer.cae"]).json()
    text = str(d).lower()
    for forbidden in ("unit_cost", "supplier", "operator", "internal", "machine", "lm-0", "review_notes"):
        assert forbidden not in text, forbidden
    # packing list of another buyer's dispatch is not visible
    dsp = client.get("/api/dispatch", headers=H["dispatch.karthik"]).json()
    nhl_dsp = next(x for x in dsp if x["buyer"] == "Nordic Home Linens AB" and x["status"] == "confirmed")
    assert client.get(f"/api/dispatch/{nhl_dsp['id']}/packing-list", headers=H["buyer.cae"]).status_code == 404
    assert client.get(f"/api/dispatch/{nhl_dsp['id']}/packing-list", headers=H["buyer.nhl"]).status_code == 200


def test_public_roll_lookup(client, H):
    roll = client.get("/api/rolls", headers=H["pm.ravi"]).json()[0]
    pp = client.get(f"/api/rolls/{roll['roll_no']}/passport", headers=H["pm.ravi"]).json()
    token = pp["public_url"].split("t=")[1]
    assert client.get(f"/api/public/rolls/{roll['roll_no']}?t=wrong").status_code == 404
    pub = client.get(f"/api/public/rolls/{roll['roll_no']}?t={token}").json()
    assert set(pub) == {"roll_no", "order_no", "fabric", "colour", "length_m", "quality", "dispatched",
                        "produced_on", "last_inspected"}
    assert client.get(f"/api/rolls/{roll['roll_no']}/qr.svg", headers=H["pm.ravi"]).text.startswith("<?xml")


def test_risk_engine(client, H):
    data = client.get("/api/insights/risk", headers=H["pm.ravi"]).json()
    a = {x["order_no"]: x for x in data["assessments"]}
    hi = a["SO-2026-0003"]
    assert hi["band"] == "high" and hi["method"].startswith("deterministic")
    assert {f["kind"] for f in hi["factors"]} >= {"material", "quality"}
    for f in hi["factors"]:
        assert f["rule"] and isinstance(f["points"], int)
    assert hi["score"] == sum(f["points"] for f in hi["factors"])
    # all looms down -> unknown
    looms = [m for m in client.get("/api/machines", headers=H["pm.ravi"]).json() if m["stage_code"] == "weaving"]
    prev = {m["id"]: m["state"] for m in looms}
    for m in looms:
        client.post(f"/api/machines/{m['id']}/state", json={"state": "breakdown", "note": "test"}, headers=H["pm.ravi"])
    data = client.get("/api/insights/risk", headers=H["pm.ravi"]).json()
    assert any(x["band"] == "unknown" for x in data["assessments"])
    for mid, st in prev.items():
        client.post(f"/api/machines/{mid}/state", json={"state": st, "note": ""}, headers=H["pm.ravi"])


def test_simulator_is_isolated(client, H):
    snap = lambda: (client.get("/api/inventory/materials", headers=H["store.meena"]).json(),
                    client.get("/api/production/jobs", headers=H["pm.ravi"]).json(),
                    client.get("/api/inventory/purchase-lines", headers=H["store.meena"]).json())
    before = snap()
    po = next(p for p in before[2] if p["status"] == "open")
    r = client.post("/api/insights/simulate", headers=H["pm.ravi"], json={
        "machine_outage": {"machine_id": 1, "shifts": 9}, "po_delay": {"purchase_line_id": po["id"], "days": 10},
        "rejection_rate": 0.2, "prioritize_order_id": 2})
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["label"].startswith("SIMULATION") and s["assumptions"]
    assert s["cost_delta"] > 0               # higher rejection -> more metres to weave
    assert s["orders"][0]["order_id"] == 2   # prioritised order scheduled first
    assert snap() == before
    assert client.post("/api/insights/simulate", headers=H["pm.ravi"], json={"rejection_rate": 0.95}).status_code == 422


def test_dashboard_filters(client, H):
    d = client.get("/api/dashboard", headers=H["pm.ravi"]).json()
    assert d["kpis"]["woven_m"] > 0 and len(d["production_vs_target"]) == 14
    dA = client.get("/api/dashboard?shift=A", headers=H["pm.ravi"]).json()
    assert dA["kpis"]["woven_m"] < d["kpis"]["woven_m"]
    dq = client.get("/api/dashboard?q=Tiruppur", headers=H["pm.ravi"]).json()
    assert all("SO-2026-0003" == r["order_no"] for r in dq["order_risk"])
    assert client.get("/api/dashboard?shift=Z", headers=H["pm.ravi"]).status_code == 422
