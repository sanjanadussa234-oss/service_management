from typing import Optional
from pydantic import BaseModel, EmailStr


# ---------- Auth Schemas ----------
class RegisterUser(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: Optional[str] = "user"  # 'user', 'admin', or 'technician'


class LoginUser(BaseModel):
    email: EmailStr
    password: str


# ---------- Service Request Schemas ----------
class RequestCreate(BaseModel):
    title: str
    description: Optional[str] = None


class RequestAssign(BaseModel):
    technician_id: int


class RequestStatusUpdate(BaseModel):
    status: str  # 'open', 'assigned', 'in_progress', 'resolved', 'closed'