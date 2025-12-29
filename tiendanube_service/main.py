import os
import requests
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel, Field
from typing import Optional, Any, Dict
from enum import Enum
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

TIENDANUBE_API_KEY = os.getenv("TIENDANUBE_API_KEY")
TIENDANUBE_USER_AGENT = os.getenv("TIENDANUBE_USER_AGENT", "Langchain-Agent (lala.com)")
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN")
TIENDANUBE_STORE_ID = os.getenv("TIENDANUBE_STORE_ID")
if not TIENDANUBE_STORE_ID:
    print("WARNING: TIENDANUBE_STORE_ID not set in environment.")

import structlog
import time
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response
from fastapi import Request

# Initialize structlog
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
    logger_factory=structlog.PrintLoggerFactory(),
)
logger = structlog.get_logger()

# Metrics
REQUESTS = Counter("http_requests_total", "Total Request Count", ["service", "endpoint", "method", "status"])
LATENCY = Histogram("http_request_latency_seconds", "Request Latency", ["service", "endpoint"])

SERVICE_NAME = "tiendanube_service"

@app.middleware("http")
async def add_metrics_and_logs(request: Request, call_next):
    start_time = time.time()
    correlation_id = request.headers.get("X-Correlation-Id") or request.headers.get("traceparent")
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    status_code = response.status_code
    endpoint = request.url.path
    method = request.method
    
    # Update Metrics
    REQUESTS.labels(service=SERVICE_NAME, endpoint=endpoint, method=method, status=status_code).inc()
    LATENCY.labels(service=SERVICE_NAME, endpoint=endpoint).observe(process_time)
    
    # Log
    log = logger.bind(
        service=SERVICE_NAME,
        timestamp=time.time(),
        level="info" if status_code < 400 else "error",
        correlation_id=correlation_id,
        latency_ms=round(process_time * 1000, 2),
        status_code=status_code,
        method=method,
        endpoint=endpoint
    )
    if status_code >= 400:
        log.error("request_failed")
    else:
        log.info("request_completed")
        
    return response

@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/ready")
def ready():
    """Readiness probe."""
    if not TIENDANUBE_API_KEY:
         raise HTTPException(status_code=503, detail="Configuration missing")
    return {"status": "ok"}
    
@app.get("/health")
def health():
    return {"status": "ok"}

# ... existing code ...

# Shared Contract Models (Redefined here to avoid build context complexity if shared not mounted, 
# although ideally we should import from shared.models if available)
class ToolError(BaseModel):

    code: str
    message: str
    retryable: bool
    details: Optional[Dict[str, Any]] = None

class ToolResponse(BaseModel):
    ok: bool
    data: Optional[Any] = None
    error: Optional[ToolError] = None
    meta: Optional[Dict[str, Any]] = None

# Request Models
class ProductSearch(BaseModel):
    q: str = Field(..., description="Search query for products.")

class ProductCategorySearch(BaseModel):
    category: str = Field(..., description="Product category.")
    keyword: str = Field(..., description="Keyword to refine the search.")

class OrderSearch(BaseModel):
    q: str = Field(..., description="Search query for orders (usually order number).")

class Email(BaseModel):
    subject: str
    text: str

def_headers = {
    "Authentication": f"bearer {TIENDANUBE_API_KEY}",
    "User-Agent": TIENDANUBE_USER_AGENT,
    "Content-Type": "application/json",
}

async def verify_token(x_internal_token: str = Header(...)):
    if INTERNAL_API_TOKEN and x_internal_token != INTERNAL_API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid Internal Token")

def handle_tn_error(e: requests.exceptions.HTTPError) -> ToolError:
    status_code = e.response.status_code
    if status_code == 429:
        return ToolError(code="TN_RATE_LIMIT", message="Rate limit exceeded", retryable=True)
    elif status_code in [401, 403]:
        return ToolError(code="TN_UNAUTHORIZED", message="Unauthorized upstream", retryable=False)
    elif status_code >= 500:
        return ToolError(code="UPSTREAM_UNAVAILABLE", message="Tienda Nube down", retryable=True)
    elif status_code in [400, 422]:
         return ToolError(code="TN_BAD_REQUEST", message="Bad request to Tienda Nube", retryable=False)
    else:
        return ToolError(code="TN_UNKNOWN", message=str(e), retryable=False)

def handle_generic_error(e: Exception) -> ToolError:
    return ToolError(code="INTERNAL_ERROR", message=str(e), retryable=False)

@app.post("/tools/productsq", response_model=ToolResponse)
def productsq(search: ProductSearch, token: str = Depends(verify_token)):
    url = f"https://api.tiendanube.com/v1/{TIENDANUBE_STORE_ID}/products"
    params = {"q": search.q, "per_page": 20}
    try:
        response = requests.get(url, headers=def_headers, params=params, timeout=10)
        response.raise_for_status()
        return ToolResponse(ok=True, data=response.json())
    except requests.exceptions.HTTPError as e:
        return ToolResponse(ok=False, error=handle_tn_error(e))
    except Exception as e:
        return ToolResponse(ok=False, error=handle_generic_error(e))

@app.post("/tools/productsq_category", response_model=ToolResponse)
def productsq_category(search: ProductCategorySearch, token: str = Depends(verify_token)):
    url = f"https://api.tiendanube.com/v1/{TIENDANUBE_STORE_ID}/products"
    query = f"{search.category} {search.keyword}"
    params = {"q": query, "per_page": 20}
    try:
        response = requests.get(url, headers=def_headers, params=params, timeout=10)
        response.raise_for_status()
        return ToolResponse(ok=True, data=response.json())
    except requests.exceptions.HTTPError as e:
        return ToolResponse(ok=False, error=handle_tn_error(e))
    except Exception as e:
        return ToolResponse(ok=False, error=handle_generic_error(e))

@app.post("/tools/productsall", response_model=ToolResponse)
def productsall(token: str = Depends(verify_token)):
    url = f"https://api.tiendanube.com/v1/{TIENDANUBE_STORE_ID}/products"
    params = {"per_page": 25}
    try:
        response = requests.get(url, headers=def_headers, params=params, timeout=10)
        response.raise_for_status()
        return ToolResponse(ok=True, data=response.json())
    except requests.exceptions.HTTPError as e:
        return ToolResponse(ok=False, error=handle_tn_error(e))
    except Exception as e:
        return ToolResponse(ok=False, error=handle_generic_error(e))

@app.post("/tools/cupones_list", response_model=ToolResponse)
def cupones_list(token: str = Depends(verify_token)):
    url = f"https://api.tiendanube.com/v1/{TIENDANUBE_STORE_ID}/coupons"
    params = {"per_page": 25}
    try:
        response = requests.get(url, headers=def_headers, params=params, timeout=10)
        response.raise_for_status()
        return ToolResponse(ok=True, data=response.json())
    except requests.exceptions.HTTPError as e:
        return ToolResponse(ok=False, error=handle_tn_error(e))
    except Exception as e:
        return ToolResponse(ok=False, error=handle_generic_error(e))

@app.post("/tools/orders", response_model=ToolResponse)
def orders(search: OrderSearch, token: str = Depends(verify_token)):
    url = f"https://api.tiendanube.com/v1/{TIENDANUBE_STORE_ID}/orders"
    params = {"q": search.q}
    try:
        response = requests.get(url, headers=def_headers, params=params, timeout=10)
        response.raise_for_status()
        return ToolResponse(ok=True, data=response.json())
    except requests.exceptions.HTTPError as e:
        return ToolResponse(ok=False, error=handle_tn_error(e))
    except Exception as e:
        return ToolResponse(ok=False, error=handle_generic_error(e))

@app.post("/tools/sendemail", response_model=ToolResponse)
def sendemail(email: Email, token: str = Depends(verify_token)):
    try:
        # Mock implementation
        print(f"Sending email with subject: {email.subject} and text: {email.text}")
        return ToolResponse(ok=True, data={"status": "email sent (mock)", "subject": email.subject})
    except Exception as e:
        return ToolResponse(ok=False, error=handle_generic_error(e))
