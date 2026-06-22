import { useState, useEffect } from "react";
import { api } from "./api";

const STATUS_COLORS = {
  open: "secondary",
  assigned: "info",
  in_progress: "warning",
  resolved: "success",
  closed: "dark",
};

function StatusBadge({ status }) {
  return (
    <span className={`badge bg-${STATUS_COLORS[status] || "secondary"} status-badge`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ---------- Auth screen: login + register in one card ----------
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "user" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const res = await api.login({ email: form.email, password: form.password });
        localStorage.setItem("token", res.token);
        localStorage.setItem("role", res.role);
        onLogin(res.role);
      } else {
        await api.register(form);
        setMode("login");
        setError("Registered successfully. Please log in.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
      <div className="card shadow-sm" style={{ width: "380px" }}>
        <div className="card-body p-4">
          <h4 className="mb-3">{mode === "login" ? "Log in" : "Create an account"}</h4>

          {error && <div className="alert alert-info py-2">{error}</div>}

          <form onSubmit={submit}>
            {mode === "register" && (
              <div className="mb-3">
                <label className="form-label">Username</label>
                <input className="form-control" required value={form.username} onChange={update("username")} />
              </div>
            )}

            <div className="mb-3">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" required value={form.email} onChange={update("email")} />
            </div>

            <div className="mb-3">
              <label className="form-label">Password</label>
              <input type="password" className="form-control" required value={form.password} onChange={update("password")} />
            </div>

            {mode === "register" && (
              <div className="mb-3">
                <label className="form-label">Role</label>
                <select className="form-select" value={form.role} onChange={update("role")}>
                  <option value="user">User</option>
                  <option value="technician">Technician</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            )}

            <button className="btn btn-primary w-100" disabled={loading}>
              {loading ? "Please wait..." : mode === "login" ? "Log in" : "Register"}
            </button>
          </form>

          <div className="text-center mt-3">
            <button
              className="btn btn-link p-0"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Need an account? Register" : "Already have an account? Log in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Dashboard: behavior changes based on role ----------
function Dashboard({ role, onLogout }) {
  const [requests, setRequests] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [newRequest, setNewRequest] = useState({ title: "", description: "" });
  const [technicianId, setTechnicianId] = useState({}); // { [requestId]: techId }

  const loadRequests = async () => {
    try {
      const res = await api.listRequests();
      setRequests(res.requests);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadDashboard = async () => {
    if (role === "admin" || role === "technician") {
      try {
        const res = await api.dashboard();
        setSummary(res.summary);
      } catch (err) {
        setError(err.message);
      }
    }
  };

  useEffect(() => {
    loadRequests();
    loadDashboard();
  }, []);

  const submitNewRequest = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.createRequest(newRequest);
      setNewRequest({ title: "", description: "" });
      loadRequests();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssign = async (id) => {
    setError("");
    try {
      await api.assignRequest(id, parseInt(technicianId[id], 10));
      loadRequests();
      loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStatusChange = async (id, status) => {
    setError("");
    try {
      await api.updateStatus(id, status);
      loadRequests();
      loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Service Requests</h3>
        <div>
          <span className="badge bg-primary text-uppercase me-2">{role}</span>
          <button className="btn btn-outline-secondary btn-sm" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Dashboard summary, admin + technician only */}
      {summary && (
        <div className="row mb-4">
          {Object.entries(summary).map(([status, count]) => (
            <div className="col" key={status}>
              <div className="card text-center">
                <div className="card-body py-2">
                  <div className="fs-4">{count}</div>
                  <StatusBadge status={status} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New request form, user only */}
      {role === "user" && (
        <div className="card mb-4">
          <div className="card-body">
            <h5 className="card-title">New service request</h5>
            <form onSubmit={submitNewRequest} className="row g-2">
              <div className="col-md-4">
                <input
                  className="form-control"
                  placeholder="Title"
                  required
                  value={newRequest.title}
                  onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <input
                  className="form-control"
                  placeholder="Description (optional)"
                  value={newRequest.description}
                  onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
                />
              </div>
              <div className="col-md-2">
                <button className="btn btn-primary w-100">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Requests table */}
      <div className="card">
        <div className="card-body">
          <h5 className="card-title">
            {role === "user" ? "Your requests" : role === "technician" ? "Assigned to you" : "All requests"}
          </h5>
          <table className="table align-middle">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Description</th>
                <th>Status</th>
                {(role === "admin" || role === "technician") && <th>Assigned To</th>}
                {role === "admin" && <th>Assign technician</th>}
                {(role === "admin" || role === "technician") && <th>Update status</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.title}</td>
                  <td>{r.description}</td>
                  <td><StatusBadge status={r.status} /></td>

                  {(role === "admin" || role === "technician") && (
                  <td>{r.assigned_to ?? <span className="text-muted">Unassigned</span>}</td>
                  )}


                  {role === "admin" && (
                    <td>
                      <div className="d-flex gap-2">
                        <input
                          className="form-control form-control-sm"
                          style={{ width: "90px" }}
                          placeholder="Tech ID"
                          value={technicianId[r.id] || ""}
                          onChange={(e) =>
                            setTechnicianId({ ...technicianId, [r.id]: e.target.value })
                          }
                        />
                        <button className="btn btn-sm btn-outline-primary" onClick={() => handleAssign(r.id)}>
                          Assign
                        </button>
                      </div>
                    </td>
                  )}

                  {(role === "admin" || role === "technician") && (
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={r.status}
                        onChange={(e) => handleStatusChange(r.id, e.target.value)}
                      >
                        {["open", "assigned", "in_progress", "resolved", "closed"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center text-muted">No requests yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------- Root app: decides Auth vs Dashboard ----------
export default function App() {
  const [role, setRole] = useState(localStorage.getItem("role"));

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    setRole(null);
  };

  if (!role) {
    return <AuthScreen onLogin={(r) => setRole(r)} />;
  }

  return <Dashboard role={role} onLogout={handleLogout} />;
}