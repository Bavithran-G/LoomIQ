import os
from datetime import date, timedelta

os.environ["LOOMIQ_DATABASE_URL"] = "sqlite:///./test_loomiq.db"
os.environ.setdefault("LOOMIQ_STORAGE_DIR", "/tmp/loomiq-test-storage")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import seed  # noqa: E402
from app.main import app  # noqa: E402

PW = seed.DEMO_PASSWORD


@pytest.fixture(scope="module", autouse=True)
def fresh_db():
    import os
    db_path = os.path.join(os.path.dirname(__file__), "..", "test_loomiq.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    seed.reset()
    seed.seed()
    yield


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def login(client, username):
    r = client.post("/api/auth/login", data={"username": username, "password": PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def H(client):
    """Auth headers per role."""
    return {u: login(client, u) for u in ["admin", "pm.ravi", "store.meena", "qc.anitha", "dispatch.karthik",
                                          "finance.priya", "buyer.cae", "buyer.nhl"]}


def today():
    return date.today()


def new_order(client, H, **kw):
    body = {"buyer_id": 1, "buyer_po": kw.pop("po", f"T-{os.urandom(3).hex()}"), "fabric_spec_id": 1,
            "colour": "White", "quantity": 360, "order_date": str(today()),
            "promised_date": str(today() + timedelta(days=30)), "priority": "normal"}
    body.update(kw)
    r = client.post("/api/orders", json=body, headers=H["pm.ravi"])
    assert r.status_code == 201, r.text
    return r.json()
