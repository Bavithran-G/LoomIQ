"""End-to-end business workflow: order -> reserve -> weave -> dye -> inspect -> finish -> dispatch."""
import io
from datetime import timedelta

import cv2

from app.services.cv_inspect import synthetic_fabric
from conftest import new_order, today


def jpeg(defect=None, seed=11):
    return cv2.imencode(".jpg", synthetic_fabric(seed=seed, defect=defect))[1].tobytes()


def material(client, H, sku):
    return next(m for m in client.get("/api/inventory/materials", headers=H["store.meena"]).json() if m["sku"] == sku)


def free_loom(client, H, on, shift):
    cap = client.get(f"/api/production/capacity?on={on}&shift={shift}", headers=H["pm.ravi"]).json()
    return next(c for c in cap if c["state"] == "available" and c["free"] >= 180)["machine_id"]


def run_job(client, H, order_id, stage, machine_id, qty, shift="C", day=None, actual=None):
    day = day or today() + timedelta(days=3)
    r = client.post("/api/production/jobs", headers=H["pm.ravi"], json={
        "order_id": order_id, "stage_code": stage, "machine_id": machine_id, "shift": shift,
        "planned_date": str(day), "planned_qty": qty})
    assert r.status_code == 201, r.text
    jid = r.json()["id"]
    assert client.post(f"/api/production/jobs/{jid}/action", json={"action": "start"}, headers=H["pm.ravi"]).status_code == 200
    r = client.post(f"/api/production/jobs/{jid}/action", headers=H["pm.ravi"],
                    json={"action": "complete", "actual_qty": actual if actual is not None else qty, "roll_length": 90})
    return jid, r


def test_full_manufacturing_flow(client, H):
    before = material(client, H, "YRN-CT40-CMB")
    o = new_order(client, H, quantity=180)
    oid = o["id"]
    assert o["status"] == "draft"
    # Nothing reserved just by creating/opening an order
    assert material(client, H, "YRN-CT40-CMB")["reserved"] == before["reserved"]
    client.get(f"/api/orders/{oid}", headers=H["pm.ravi"])
    assert material(client, H, "YRN-CT40-CMB")["available"] == before["available"]

    r = client.post(f"/api/orders/{oid}/transition", json={"action": "confirm"}, headers=H["pm.ravi"])
    assert r.status_code == 200 and r.json()["order"]["status"] == "confirmed"
    after = material(client, H, "YRN-CT40-CMB")
    assert round(after["reserved"] - before["reserved"], 3) == round(180 * 0.19, 3)
    assert round(before["available"] - after["available"], 3) == round(180 * 0.19, 3)

    day = today() + timedelta(days=3)
    loom = free_loom(client, H, day, "C")
    jid, r = run_job(client, H, oid, "weaving", loom, 180, day=day)
    assert r.status_code == 200, r.text
    assert len(r.json()["result"]["rolls_created"]) == 2
    consumed = material(client, H, "YRN-CT40-CMB")
    assert round(consumed["consumed"] - after["consumed"], 3) == round(180 * 0.19, 3)
    assert round(after["reserved"] - consumed["reserved"], 3) == round(180 * 0.19, 3)

    detail = client.get(f"/api/orders/{oid}", headers=H["pm.ravi"]).json()
    assert detail["status"] == "in_production"
    assert detail["metrics"]["produced_m"] == 180
    rolls = detail["rolls"]
    assert all(r["stage"] == "dyeing" for r in rolls)

    jig = next(m["id"] for m in client.get("/api/machines", headers=H["pm.ravi"]).json() if m["code"] == "JG-02")
    _, r = run_job(client, H, oid, "dyeing", jig, 180, day=day)
    assert r.status_code == 200, r.text

    # Roll that is not yet inspected cannot be dispatched
    r = client.post("/api/dispatch", headers=H["dispatch.karthik"], json={
        "order_id": oid, "roll_ids": [rolls[0]["id"]], "planned_date": str(day), "vehicle_no": "TN-01-A-1"})
    assert r.status_code == 409 and "not passed inspection" in r.json()["detail"]

    # Inspection 1: baseline flags a hole; status does not change until a human reviews
    r = client.post("/api/quality/inspections", headers=H["qc.anitha"], data={"roll_id": rolls[0]["id"]},
                    files={"image": ("roll.jpg", io.BytesIO(jpeg("hole")), "image/jpeg")})
    assert r.status_code == 201, r.text
    insp = r.json()
    assert insp["method"] == "baseline_cv" and insp["suggested_outcome"] == "defect_suspected"
    assert insp["model_confidence"] is None          # never fabricated
    assert insp["suggested_defects"][0]["bbox"]
    assert "unvalidated" in insp["analysis_version"]
    roll = client.get(f"/api/rolls/{rolls[0]['roll_no']}/passport", headers=H["qc.anitha"]).json()
    assert roll["quality"] == "pending"
    # Second open inspection on same roll is refused
    r = client.post("/api/quality/inspections", headers=H["qc.anitha"], data={"roll_id": rolls[0]["id"]})
    assert r.status_code == 409

    # Reject requires a defect + note
    r = client.post(f"/api/quality/inspections/{insp['id']}/review", headers=H["qc.anitha"],
                    json={"decision": "reject", "confirmed_defect": "hole", "notes": ""})
    assert r.status_code == 422
    r = client.post(f"/api/quality/inspections/{insp['id']}/review", headers=H["qc.anitha"],
                    json={"decision": "reject", "confirmed_defect": "hole", "notes": "3 holes, not mendable"})
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["baseline_agreed"] is True
    assert res["after"]["rejected_m"] == 90 and res["after"]["projected_shortfall_m"] == 90
    # cannot review twice
    assert client.post(f"/api/quality/inspections/{insp['id']}/review", headers=H["qc.anitha"],
                       json={"decision": "accept"}).status_code == 409

    # Impact chain uses the real records
    chain = client.get(f"/api/rolls/{rolls[0]['id']}/impact", headers=H["pm.ravi"]).json()
    keys = [n["key"] for n in chain["nodes"]]
    assert keys == ["defect", "roll", "order", "shortfall", "remedy", "dispatch", "cost"]
    assert chain["nodes"][3]["value"] == "90 m"
    assert all(n["basis"] in ("measured", "recorded", "derived", "estimated") for n in chain["nodes"])
    assert any(r["requires_approval"] for r in chain["recommendations"])

    # Manual inspection of roll 2 -> accept (fallback without image)
    r = client.post("/api/quality/inspections", headers=H["qc.anitha"], data={"roll_id": rolls[1]["id"]})
    assert r.status_code == 201 and r.json()["method"] == "manual"
    r = client.post(f"/api/quality/inspections/{r.json()['id']}/review", headers=H["qc.anitha"],
                    json={"decision": "accept"})
    assert r.status_code == 200

    stn = next(m["id"] for m in client.get("/api/machines", headers=H["pm.ravi"]).json() if m["code"] == "ST-01")
    _, r = run_job(client, H, oid, "finishing", stn, 90, day=day)
    assert r.status_code == 200, r.text

    # Rejected roll blocked; accepted+packed roll dispatches
    r = client.post("/api/dispatch", headers=H["dispatch.karthik"], json={
        "order_id": oid, "roll_ids": [rolls[0]["id"], rolls[1]["id"]], "planned_date": str(day)})
    assert r.status_code == 409 and "rejected" in r.json()["detail"]
    r = client.post("/api/dispatch", headers=H["dispatch.karthik"], json={
        "order_id": oid, "roll_ids": [rolls[1]["id"]], "planned_date": str(day)})
    assert r.status_code == 201
    did = r.json()["id"]
    # duplicate planning blocked
    r2 = client.post("/api/dispatch", headers=H["dispatch.karthik"], json={
        "order_id": oid, "roll_ids": [rolls[1]["id"]], "planned_date": str(day)})
    assert r2.status_code == 409 and "already on planned dispatch" in r2.json()["detail"]
    # cannot confirm without vehicle
    assert client.post(f"/api/dispatch/{did}/confirm", headers=H["dispatch.karthik"]).status_code == 422
    client.patch(f"/api/dispatch/{did}", json={"vehicle_no": "TN-33-Z-9001"}, headers=H["dispatch.karthik"])
    r = client.post(f"/api/dispatch/{did}/confirm", headers=H["dispatch.karthik"])
    assert r.status_code == 200, r.text
    assert r.json()["order_status"] == "in_production"      # partial: 90 of 180 m
    assert client.post(f"/api/dispatch/{did}/confirm", headers=H["dispatch.karthik"]).status_code == 409
    detail = client.get(f"/api/orders/{oid}", headers=H["pm.ravi"]).json()
    assert detail["dispatch_status"] == "partially_dispatched"
    assert detail["metrics"]["dispatched_m"] == 90

    # Costs: material at lot cost + labour/processing by stage share, traceable to source
    cost = client.get(f"/api/cost/orders/{oid}", headers=H["finance.priya"]).json()
    assert cost["actual"]["material"] > 0 and cost["actual"]["labour"] == round(180 * 9 * 0.5 + 180 * 9 * 0.35 + 90 * 9 * 0.15, 2)
    assert cost["quality"]["cost_embedded_in_rejected"] > 0
    assert all(e["source_type"] in ("job", "rework", "stock_movement", "manual") for e in cost["entries"])


def test_rework_cost_charged_once(client, H):
    rw = next(r for r in client.get("/api/rolls?quality_status=rework", headers=H["qc.anitha"]).json())
    order_id = rw["order_id"]
    before = client.get(f"/api/cost/orders/{order_id}", headers=H["finance.priya"]).json()["actual"]["rework"]
    r = client.post(f"/api/rolls/{rw['id']}/disposition", json={"action": "rework_done", "notes": "mended"},
                    headers=H["qc.anitha"])
    assert r.status_code == 200 and r.json()["quality"] == "pending" and r.json()["stage"] == "inspection"
    after = client.get(f"/api/cost/orders/{order_id}", headers=H["finance.priya"]).json()["actual"]["rework"]
    assert round(after - before, 2) == round(rw["length_m"] * 6, 2)
    # second call refused: roll is no longer in rework
    assert client.post(f"/api/rolls/{rw['id']}/disposition", json={"action": "rework_done"},
                       headers=H["qc.anitha"]).status_code == 409


def test_upload_validation(client, H):
    roll = next(r for r in client.get("/api/quality/queue", headers=H["qc.anitha"]).json() if not r["open_inspection_id"])
    r = client.post("/api/quality/inspections", headers=H["qc.anitha"], data={"roll_id": roll["id"]},
                    files={"image": ("x.gif", io.BytesIO(b"GIF89a...."), "image/gif")})
    assert r.status_code == 415
    r = client.post("/api/quality/inspections", headers=H["qc.anitha"], data={"roll_id": roll["id"]},
                    files={"image": ("x.jpg", io.BytesIO(b"not really a jpeg"), "image/jpeg")})
    # undecodable image: stored, analysis error recorded, manual workflow continues
    assert r.status_code == 201 and r.json()["analysis_error"].startswith("Analysis failed")
    assert r.json()["suggested_outcome"] is None


def test_consumption_is_transactional(client, H):
    """Completing a weaving job without enough yarn changes nothing."""
    o = new_order(client, H, fabric_spec_id=4, quantity=500, colour="Ecru")   # linen blend; linen is short
    client.post(f"/api/orders/{o['id']}/transition", json={"action": "confirm"}, headers=H["pm.ravi"])
    lin_before = material(client, H, "YRN-LIN25-NAT")
    day = today() + timedelta(days=4)
    loom = free_loom(client, H, day, "A")
    jid, r = run_job(client, H, o["id"], "weaving", loom, 180, shift="A", day=day)
    assert r.status_code == 409 and "Insufficient YRN-LIN25-NAT" in r.json()["detail"]
    assert material(client, H, "YRN-LIN25-NAT") == lin_before
    job = next(j for j in client.get(f"/api/production/jobs?order_id={o['id']}", headers=H["pm.ravi"]).json())
    assert job["status"] == "running"
    assert client.get(f"/api/orders/{o['id']}", headers=H["pm.ravi"]).json()["rolls"] == []
