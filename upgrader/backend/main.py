from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import router as api_router

app = FastAPI(title="Upgradernc - Odoo Migration Manager")

# Permitir a Next.js conectarse (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En producción se debería restringir a la URL del frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router.router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to Upgradernc API. System is ready."}
