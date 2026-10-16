const API_BASE = "/api";

export class ApiService {
  private static sessionId: string | null = localStorage.getItem("z_session_id");

  private static get headers() {
    return {
      "Content-Type": "application/json",
      "x-session-id": this.sessionId || "",
    };
  }

  static setSession(id: string) {
    this.sessionId = id;
    localStorage.setItem("z_session_id", id);
  }

  static clearSession() {
    this.sessionId = null;
    localStorage.removeItem("z_session_id");
  }

  private static async handleResponse(res: Response) {
    if (!res.ok) {
      let errorMessage = "Unknown error";
      try {
        const data = await res.json();
        errorMessage = data.error || data.message || JSON.stringify(data);
      } catch {
        errorMessage = await res.text();
      }
      throw new Error(errorMessage);
    }
    return res.json();
  }

  static async register(name: string, email: string, password: string, phone?: string, country?: string) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, phone, country }),
    });
    return this.handleResponse(res);
  }

  static async login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return this.handleResponse(res);
  }

  static async getAssets() {
    const res = await fetch(`${API_BASE}/assets`);
    return res.json();
  }

  static async getPaymentSettings() {
    const res = await fetch(`${API_BASE}/payment-settings`);
    return res.json();
  }

  static async updatePaymentSettings(settings: any) {
    const res = await fetch(`${API_BASE}/admin/update-payment-settings`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error("Update rejected");
    return res.json();
  }

  static async getMe() {
    const res = await fetch(`${API_BASE}/user/me`, { headers: this.headers });
    if (!res.ok) throw new Error("Session expired");
    return res.json();
  }

  static async getAdminUsers() {
    const res = await fetch(`${API_BASE}/admin/users`, { headers: this.headers });
    if (!res.ok) throw new Error("Admin access denied");
    return res.json();
  }

  static async adjustBalance(userId: string, amount: number) {
    const res = await fetch(`${API_BASE}/admin/adjust-balance`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ userId, amount }),
    });
    return res.json();
  }

  static async setTrend(assetId: string, trend: string, trendRate?: number) {
    const res = await fetch(`${API_BASE}/admin/set-trend`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ assetId, trend, trendRate }),
    });
    return res.json();
  }

  static async claimBonus() {
    const res = await fetch(`${API_BASE}/user/claim-bonus`, {
      method: "POST",
      headers: this.headers
    });
    return this.handleResponse(res);
  }

  static async getMessages() {
    const res = await fetch(`${API_BASE}/messages`, { headers: this.headers });
    if (!res.ok) return [];
    return res.json();
  }

  static async sendMessage(text: string, sender: string = 'user') {
    const res = await fetch(`${API_BASE}/messages/send`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ text, sender }),
    });
    if (!res.ok) throw new Error("Failed to send message");
    return res.json();
  }

  static async updateUserStatus(userId: string, status: string, verified?: boolean) {
    const res = await fetch(`${API_BASE}/admin/update-user-status`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ userId, status, verified }),
    });
    return res.json();
  }

  static async updateProfile(data: { name?: string; phone?: string; country?: string }) {
    const res = await fetch(`${API_BASE}/user/update-profile`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(data),
    });
    return res.json();
  }
}
