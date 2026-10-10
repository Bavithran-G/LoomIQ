"""Application settings, read from environment variables with safe local defaults."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / ".env")
    load_dotenv(BASE_DIR.parent / ".env")
except ImportError:
    pass

_default_db = f"sqlite:///{(BASE_DIR / 'loomiq.db').as_posix()}"
DATABASE_URL = os.getenv("LOOMIQ_DATABASE_URL", _default_db)
# Secret for signing JWTs. MUST be overridden in any shared deployment.
SECRET_KEY = os.getenv("LOOMIQ_SECRET_KEY", "dev-only-change-me-loomiq-secret")
ACCESS_TOKEN_MINUTES = int(os.getenv("LOOMIQ_TOKEN_MINUTES", "720"))
STORAGE_DIR = Path(os.getenv("LOOMIQ_STORAGE_DIR", str(BASE_DIR / "storage")))
MAX_UPLOAD_BYTES = int(os.getenv("LOOMIQ_MAX_UPLOAD_MB", "10")) * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
# Public base URL printed in roll QR codes. Empty = derived from the incoming request host.
FRONTEND_URL = os.getenv("LOOMIQ_FRONTEND_URL", "")
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "LOOMIQ_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
(STORAGE_DIR / "inspections").mkdir(parents=True, exist_ok=True)
