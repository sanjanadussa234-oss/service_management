from fastapi import FastAPI, HTTPException, Depends
from contextlib import asynccontextmanager

from schemas import RegisterUser, LoginUser, RequestCreate, RequestAssign, RequestStatusUpdate
from database import init_db, get_db
from auth import hash_password, verify_password, create_token, get_current_user, require_role

VALID_STATUSES = {"open", "assigned", "in_progress", "resolved", "closed"}
VALID_ROLES = {"user", "admin", "technician"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Service Request Management System", lifespan=lifespan)


# ==================== AUTH ====================

@app.post("/register")
def register(user: RegisterUser):
    if user.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {VALID_ROLES}")
    try:
        hashed_password = hash_password(user.password)
        with get_db() as cur:
            cur.execute(
                "INSERT INTO users (username, email, password, role) VALUES (%s, %s, %s, %s) RETURNING id",
                (user.username, user.email, hashed_password, user.role,)
            )
            user_id = cur.fetchone()[0]
        return {"message": "User registered successfully", "user_id": user_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/login")
def login(user: LoginUser):
    with get_db() as cur:
        cur.execute(
            "SELECT id, password, role FROM users WHERE email=%s", (user.email,)
        )
        res = cur.fetchone()

    if res is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id, db_password, role = res
    if not verify_password(user.password, db_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user_id, role)
    return {"message": "Login successful", **token, "role": role}


# ==================== SERVICE REQUESTS ====================

@app.post("/requests")
def create_request(request: RequestCreate, current_user: dict = Depends(require_role("user"))):
    """Only regular users can submit a service request."""
    try:
        with get_db() as cur:
            cur.execute(
                "INSERT INTO service_requests (user_id, title, description) VALUES (%s, %s, %s) RETURNING id",
                (current_user["user_id"], request.title, request.description,)
            )
            request_id = cur.fetchone()[0]
        return {"message": "Service request created successfully", "request_id": request_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/requests")
def list_requests(current_user: dict = Depends(get_current_user)):
    """
    Users see only their own requests.
    Admins see all requests.
    Technicians see requests assigned to them.
    """
    try:
        with get_db() as cur:
            if current_user["role"] == "admin":
                cur.execute(
                    "SELECT id, user_id, title, description, status, assigned_to, created_at, updated_at FROM service_requests ORDER BY created_at DESC"
                )
            elif current_user["role"] == "technician":
                cur.execute(
                    "SELECT id, user_id, title, description, status, assigned_to, created_at, updated_at FROM service_requests WHERE assigned_to=%s ORDER BY created_at DESC",
                    (current_user["user_id"],)
                )
            else:  # role == "user"
                cur.execute(
                    "SELECT id, user_id, title, description, status, assigned_to, created_at, updated_at FROM service_requests WHERE user_id=%s ORDER BY created_at DESC",
                    (current_user["user_id"],)
                )
            rows = cur.fetchall()

        requests = [
            {
                "id": r[0], "user_id": r[1], "title": r[2], "description": r[3],
                "status": r[4], "assigned_to": r[5], "created_at": r[6], "updated_at": r[7]
            }
            for r in rows
        ]
        return {"requests": requests}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/requests/{request_id}")
def get_request(request_id: int, current_user: dict = Depends(get_current_user)):
    try:
        with get_db() as cur:
            cur.execute(
                "SELECT id, user_id, title, description, status, assigned_to, created_at, updated_at FROM service_requests WHERE id=%s",
                (request_id,)
            )
            r = cur.fetchone()

        if r is None:
            raise HTTPException(status_code=404, detail="Request not found")

        # Permission check: user can only view their own; technician only if assigned; admin can view all
        if current_user["role"] == "user" and r[1] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="You cannot view this request")
        if current_user["role"] == "technician" and r[5] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="You cannot view this request")

        return {
            "id": r[0], "user_id": r[1], "title": r[2], "description": r[3],
            "status": r[4], "assigned_to": r[5], "created_at": r[6], "updated_at": r[7]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/requests/{request_id}/assign")
def assign_request(request_id: int, assign: RequestAssign, current_user: dict = Depends(require_role("admin"))):
    """Only admin can assign a technician to a request."""
    try:
        with get_db() as cur:
            # verify technician exists and has correct role
            cur.execute("SELECT role FROM users WHERE id=%s", (assign.technician_id,))
            tech = cur.fetchone()
            if tech is None or tech[0] != "technician":
                raise HTTPException(status_code=400, detail="Invalid technician_id")

            cur.execute(
                "UPDATE service_requests SET assigned_to=%s, status='assigned', updated_at=NOW() WHERE id=%s RETURNING id",
                (assign.technician_id, request_id,)
            )
            updated = cur.fetchone()

        if updated is None:
            raise HTTPException(status_code=404, detail="Request not found")

        return {"message": "Technician assigned successfully", "request_id": request_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/requests/{request_id}/status")
def update_status(request_id: int, status_update: RequestStatusUpdate, current_user: dict = Depends(require_role("admin", "technician"))):
    """Admin or assigned technician can update request status."""
    if status_update.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of {VALID_STATUSES}")

    try:
        with get_db() as cur:
            cur.execute("SELECT assigned_to FROM service_requests WHERE id=%s", (request_id,))
            r = cur.fetchone()
            if r is None:
                raise HTTPException(status_code=404, detail="Request not found")

            # technician can only update requests assigned to them
            if current_user["role"] == "technician" and r[0] != current_user["user_id"]:
                raise HTTPException(status_code=403, detail="This request is not assigned to you")

            cur.execute(
                "UPDATE service_requests SET status=%s, updated_at=NOW() WHERE id=%s",
                (status_update.status, request_id,)
            )

        return {"message": "Status updated successfully", "request_id": request_id, "status": status_update.status}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== DASHBOARD ====================

@app.get("/dashboard")
def dashboard(current_user: dict = Depends(require_role("admin", "technician"))):
    """Summary counts of requests by status, for monitoring resolution progress."""
    try:
        with get_db() as cur:
            if current_user["role"] == "admin":
                cur.execute("SELECT status, COUNT(*) FROM service_requests GROUP BY status")
            else:  # technician sees only their assigned requests
                cur.execute(
                    "SELECT status, COUNT(*) FROM service_requests WHERE assigned_to=%s GROUP BY status",
                    (current_user["user_id"],)
                )
            rows = cur.fetchall()

        summary = {status: 0 for status in VALID_STATUSES}
        for status, count in rows:
            summary[status] = count

        return {"summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))