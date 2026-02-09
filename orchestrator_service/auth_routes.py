from fastapi import APIRouter, HTTPException, Depends, Request, status
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid
import logging
from db import db
from auth_service import auth_service

router = APIRouter(prefix="/auth", tags=["Nexus Auth"])
logger = logging.getLogger("auth_routes")

# --- MODELS ---

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    role: str = "professional" # Default for self-reg if enabled
    first_name: str
    last_name: Optional[str] = ""
    google_calendar_id: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict

# --- ROUTES ---

@router.post("/register")
async def register(payload: UserRegister):
    """
    Registers a new user in 'pending' status.
    Implements Protocol Omega for fail-safe activation.
    """
    # 1. Check if user exists
    existing = await db.fetchval("SELECT id FROM users WHERE email = $1", payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="El correo ya se encuentra registrado.")

    # 2. Hash password
    password_hash = auth_service.get_password_hash(payload.password)
    user_id = str(uuid.uuid4())
    
    # 3. Save User
    try:
        await db.execute("""
            INSERT INTO users (id, email, password_hash, role, status, first_name, last_name)
            VALUES ($1, $2, $3, $4, 'pending', $5, $6)
        """, user_id, payload.email, password_hash, payload.role, payload.first_name, payload.last_name)
        
        # 4. If professional, create profile record
        if payload.role == "professional":
            await db.execute("""
                INSERT INTO professionals (tenant_id, user_id, first_name, last_name, email, is_active, google_calendar_id)
                VALUES (1, $1, $2, $3, $4, FALSE, $5)
            """, user_id, payload.first_name, payload.last_name, payload.email, payload.google_calendar_id)

        # 5. Protocol Omega: Log activation token (simulated for now)
        activation_token = str(uuid.uuid4())
        auth_service.log_protocol_omega_activation(payload.email, activation_token)
        
        return {
            "status": "pending",
            "message": "Registro exitoso. Tu cuenta está pendiente de aprobación por el CEO.",
            "user_id": user_id
        }
    except Exception as e:
        logger.error(f"Error registering user: {e}")
        raise HTTPException(status_code=500, detail="Error interno durante el registro.")

@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin):
    """ Authenticates user and returns JWT. Checks for 'active' status. """
    user = await db.fetchrow("SELECT * FROM users WHERE email = $1", payload.email)
    
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales inválidas.")
    
    if not auth_service.verify_password(payload.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Credenciales inválidas.")
    
    if user['status'] != 'active':
        raise HTTPException(
            status_code=403, 
            detail=f"Tu cuenta está en estado '{user['status']}'. Contactá al administrador."
        )

    # Regla de Oro: resolver tenant_id desde professionals por user_id (aislamiento total)
    tenant_id = await db.fetchval(
        "SELECT tenant_id FROM professionals WHERE user_id = $1",
        user['id']
    )
    if tenant_id is None:
        # CEO/secretary: no tienen fila en professionals, usar primera clínica
        tenant_id = await db.fetchval("SELECT id FROM tenants ORDER BY id ASC LIMIT 1") or 1
    tenant_id = int(tenant_id)

    token_data = {
        "user_id": str(user['id']),
        "email": user['email'],
        "role": user['role'],
        "tenant_id": tenant_id,
    }
    token = auth_service.create_access_token(token_data)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user['id']),
            "email": user['email'],
            "role": user['role'],
            "tenant_id": tenant_id,
        }
    }

@router.get("/me")
async def get_me(request: Request):
    """ Returns the current authenticated user data. """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    
    token = auth_header.split(" ")[1]
    token_data = auth_service.decode_token(token)
    
    if not token_data:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        
    return token_data

class ProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    google_calendar_id: Optional[str] = None

@router.get("/profile")
async def get_profile(request: Request):
    """ Returns the detailed clinical profile of the current professional/user. """
    user_data = await get_me(request)
    user_id = user_data.user_id
    
    # Base user data
    user = await db.fetchrow("SELECT id, email, role, first_name, last_name FROM users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    profile = dict(user)
    
    # Professional specific data
    if user['role'] == 'professional':
        prof = await db.fetchrow("SELECT google_calendar_id, is_active FROM professionals WHERE user_id = $1", uuid.UUID(user_id))
        if prof:
            profile.update(dict(prof))
            
    return profile

@router.patch("/profile")
async def update_profile(payload: ProfileUpdate, request: Request):
    """ Updates the clinical profile of the current professional/user. """
    user_data = await get_me(request)
    user_id = user_data.user_id
    
    # Update users table
    update_users_fields = []
    params = []
    if payload.first_name is not None:
        update_users_fields.append(f"first_name = ${len(params)+1}")
        params.append(payload.first_name)
    if payload.last_name is not None:
        update_users_fields.append(f"last_name = ${len(params)+1}")
        params.append(payload.last_name)
        
    if update_users_fields:
        params.append(user_id)
        query = f"UPDATE users SET {', '.join(update_users_fields)} WHERE id = ${len(params)}"
        await db.execute(query, *params)
        
    # Update professionals table if applicable
    if user_data.role == 'professional' and payload.google_calendar_id is not None:
        await db.execute("""
            UPDATE professionals 
            SET google_calendar_id = $1 
            WHERE user_id = $2
        """, payload.google_calendar_id, uuid.UUID(user_id))
        
    return {"message": "Perfil actualizado correctamente."}
