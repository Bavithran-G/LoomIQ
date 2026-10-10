from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config
from .routers import finance, insights, operations, orders, quality
from .services.core import BusinessError

app = FastAPI(
    title="LoomIQ API",
    version="1.0.0",
    description="Textile manufacturing intelligence for Everest Textile Mills. "
                "Every roll traceable. Every order visible. Every decision informed.",
)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(BusinessError)
async def business_error(_: Request, exc: BusinessError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "code": exc.code})


@app.exception_handler(ValueError)
async def value_error(_: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc), "code": "invalid_value"})


for r in (insights.router, orders.router, operations.router, quality.router, finance.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "loomiq"}


# Single-port demo mode: serve the built React app (frontend/dist) if it exists.
_DIST = config.BASE_DIR.parent / "frontend" / "dist"
if _DIST.exists():
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        f = (_DIST / path).resolve()
        if path and _DIST.resolve() in f.parents and f.is_file():
            return FileResponse(f)
        return FileResponse(_DIST / "index.html")
