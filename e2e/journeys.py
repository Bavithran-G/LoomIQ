"""Browser journeys against a running LoomIQ (API :8000, UI :5173) on freshly seeded data.

    cd backend && python -m app.seed --reset
    python e2e/journeys.py            # needs: pip install playwright && playwright install chromium

Each journey drives the real UI and asserts on what the user sees."""
import os
import sys
import tempfile

import cv2
from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.services.cv_inspect import synthetic_fabric  # noqa: E402

B = os.environ.get("LOOMIQ_UI", "http://127.0.0.1:5173")
PW = "loomiq@2026"
SHOTS = os.environ.get("LOOMIQ_SHOTS", tempfile.gettempdir())


def login(page, user):
    page.goto(B)
    page.get_by_label("Username").fill(user)
    page.get_by_label("Password").fill(PW)
    page.get_by_role("button", name="Sign in", exact=True).click()
    page.get_by_label("User menu").wait_for()


def logout(page):
    page.get_by_label("User menu").click()
    page.get_by_role("button", name="Sign out").click()
    page.get_by_role("heading", name="Sign in").wait_for()


def j_order(page):
    login(page, "pm.ravi")
    page.goto(B + "/orders")
    page.get_by_role("button", name="New order").click()
    page.get_by_label("Buyer", exact=True).select_option(label="Mumbai Fashion House")
    page.get_by_label("Buyer PO reference").fill("MFH-E2E-01")
    page.get_by_label("Fabric").select_option(index=1)
    page.get_by_label("Colour").fill("Coral")
    page.get_by_label("Quantity (metres)").fill("500")
    expect(page.get_by_text("Material check")).to_be_visible()
    page.get_by_role("button", name="Create draft order").click()
    expect(page.get_by_role("heading", name="SO-2026-")).to_be_visible()
    page.get_by_role("button", name="Confirm order").click()
    page.get_by_role("button", name="Confirm and reserve").click()
    expect(page.get_by_text("Confirmed", exact=True).first).to_be_visible()
    # duplicate buyer PO is refused
    page.goto(B + "/orders")
    page.get_by_role("button", name="New order").click()
    page.get_by_label("Buyer", exact=True).select_option(label="Mumbai Fashion House")
    page.get_by_label("Buyer PO reference").fill("MFH-E2E-01")
    page.get_by_label("Fabric").select_option(index=1)
    page.get_by_label("Colour").fill("Coral")
    page.get_by_role("button", name="Create draft order").click()
    expect(page.get_by_text("Duplicate order").first).to_be_visible()
    page.keyboard.press("Escape")
    logout(page)
    print("ok  order create, confirm, duplicate blocked")


def j_inspect(page, img):
    login(page, "qc.anitha")
    page.goto(B + "/quality")
    page.locator("td button", has_text="Inspect").first.click()
    page.set_input_files("input[type=file]", img)
    page.get_by_role("button", name="Analyse photo").click()
    expect(page.get_by_text("Defect suspected")).to_be_visible()
    expect(page.get_by_text("Confidence: not available")).to_be_visible()
    page.get_by_role("radio", name="Reject").click()
    page.get_by_label("Confirmed defect").select_option("hole")
    page.get_by_label("Inspector notes (required)").fill("Two holes near selvedge")
    page.get_by_role("button", name="Save decision").click()
    expect(page.get_by_text("Decision saved")).to_be_visible()
    expect(page.get_by_text("Accepted-quantity shortfall from quality")).to_be_visible()
    page.screenshot(path=os.path.join(SHOTS, "e2e_inspect.png"))
    page.get_by_role("button", name="Done").click()
    logout(page)
    print("ok  photo inspection, human reject, impact chain")


def j_dispatch(page):
    login(page, "dispatch.karthik")
    page.goto(B + "/dispatch")
    page.get_by_role("button", name="Confirm dispatch").first.click()
    page.get_by_label("Vehicle number").fill("MH-04-KL-7781")
    page.get_by_role("dialog").get_by_role("button", name="Confirm dispatch").click()
    expect(page.get_by_text("confirmed.", exact=False).first).to_be_visible()
    page.get_by_role("tab", name="Shipment history").click()
    expect(page.get_by_text("MH-04-KL-7781")).to_be_visible()
    logout(page)
    print("ok  dispatch confirmed with vehicle")


def j_sim(page):
    login(page, "pm.ravi")
    page.goto(B + "/insights")
    page.get_by_role("tab", name="What-if simulator").click()
    page.get_by_label("Loom unavailable").select_option(index=1)
    page.get_by_label("Rejection rate (%)").fill("20")
    page.get_by_role("button", name="Run simulation").click()
    expect(page.get_by_text("SIMULATION - estimates based on assumptions")).to_be_visible()
    page.screenshot(path=os.path.join(SHOTS, "e2e_sim.png"), full_page=True)
    logout(page)
    print("ok  simulator runs and is labelled")


def j_buyer(page):
    login(page, "buyer.cae")
    expect(page.get_by_role("heading", name="Orders for Coimbatore Apparel Exports")).to_be_visible()
    expect(page.get_by_text("Tiruppur")).to_have_count(0)
    page.goto(B + "/orders")      # internal page: blocked
    expect(page.get_by_text("You don't have access to this page")).to_be_visible()
    page.goto(B + "/portal/orders/3")   # another buyer's order id
    expect(page.get_by_text("Order not found")).to_be_visible()
    logout(page)
    print("ok  buyer portal isolation")


def j_public(page, ctx):
    login(page, "pm.ravi")
    page.goto(B + "/rolls/RL-2026-00001")
    link = page.evaluate("fetch('/api/rolls/RL-2026-00001/passport',{headers:{Authorization:'Bearer '+localStorage.getItem('loomiq.token')}}).then(r=>r.json()).then(j=>j.public_url)")
    logout(page)
    anon = ctx.new_page()
    anon.goto(link)
    expect(anon.get_by_text("Inspected and released")).to_be_visible()
    expect(anon.get_by_text("LM-0")).to_have_count(0)
    anon.close()
    print("ok  public QR verification hides internal data")


if __name__ == "__main__":
    img = os.path.join(tempfile.gettempdir(), "loomiq_e2e_hole.jpg")
    cv2.imwrite(img, synthetic_fabric(seed=99, defect="hole"))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1366, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        for j in (j_order, lambda pg: j_inspect(pg, img), j_dispatch, j_sim, j_buyer, lambda pg: j_public(pg, ctx)):
            j(page)
        browser.close()
    assert not errors, errors
    print("all journeys passed")
