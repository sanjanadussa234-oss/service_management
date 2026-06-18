// All backend communication lives in this one file.
// Change BASE_URL to your deployed Render URL when you go live.
const BASE_URL = "https://service-management-r0nv.onrender.com";

function getToken() {
  return localStorage.getItem("token");
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    headers["Authorization"] = `Bearer ${getToken()}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Something went wrong");
  }
  return data;
}

export const api = {
  register: (payload) => request("/register", { method: "POST", body: payload }),
  login: (payload) => request("/login", { method: "POST", body: payload }),

  createRequest: (payload) =>
    request("/requests", { method: "POST", body: payload, auth: true }),
  listRequests: () => request("/requests", { auth: true }),
  getRequest: (id) => request(`/requests/${id}`, { auth: true }),
  assignRequest: (id, technician_id) =>
    request(`/requests/${id}/assign`, {
      method: "PUT",
      body: { technician_id },
      auth: true,
    }),
  updateStatus: (id, status) =>
    request(`/requests/${id}/status`, {
      method: "PUT",
      body: { status },
      auth: true,
    }),
  dashboard: () => request("/dashboard", { auth: true }),
};