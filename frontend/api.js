const API = {
  getToken() {
    return localStorage.getItem(CONFIG.TOKEN_KEY);
  },

  setToken(token) {
    if (token) localStorage.setItem(CONFIG.TOKEN_KEY, token);
    else localStorage.removeItem(CONFIG.TOKEN_KEY);
  },

  async request(method, path, body, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${CONFIG.API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const erreur = new Error(data.erreur || `Erreur ${res.status}`);
      erreur.statut = res.status;
      throw erreur;
    }
    return data;
  },

  login(email, mot_de_passe) {
    return this.request('POST', '/auth/login', { email, mot_de_passe });
  },

  me() {
    return this.request('GET', '/auth/me');
  },

  getEmployes() {
    return this.request('GET', '/employes');
  },

  getReferentielRoles() {
    return this.request('GET', '/employes/referentiel-roles');
  },

  createEmploye(data) {
    return this.request('POST', '/employes', data);
  },

  getDisponibilites(employeId) {
    return this.request('GET', `/employes/${employeId}/disponibilites`);
  },

  saveDisponibilites(employeId, disponibilites) {
    return this.request('PUT', `/employes/${employeId}/disponibilites`, { disponibilites });
  },

  getPatients(statut) {
    const q = statut ? `?statut=${statut}` : '';
    return this.request('GET', `/patients${q}`);
  },

  createPatient(data) {
    return this.request('POST', '/patients', data);
  },

  updatePatient(id, data) {
    return this.request('PUT', `/patients/${id}`, data);
  },

  archivePatient(id) {
    return this.request('DELETE', `/patients/${id}`);
  },

  saveBesoins(patientId, besoins) {
    return this.request('PUT', `/patients/${patientId}/besoins`, { besoins });
  },

  getCreneaux(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request('GET', `/creneaux${q ? `?${q}` : ''}`);
  },

  annulerCreneau(id) {
    return this.request('DELETE', `/creneaux/${id}`);
  },

  genererPlanning(date) {
    return this.request('POST', '/creneaux/generer', { date });
  },

  async exportAgendaIcs(params = {}) {
    const q = new URLSearchParams(params).toString();
    const headers = {};
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${CONFIG.API_BASE}/creneaux/export/ics${q ? `?${q}` : ''}`, { headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.erreur || `Erreur ${res.status}`);
    }
    return res.blob();
  },

  getCalendarSync() {
    return this.request('GET', '/calendar/sync');
  },

  createCalendarSync() {
    return this.request('POST', '/calendar/sync');
  },

  revokeCalendarSync() {
    return this.request('DELETE', '/calendar/sync');
  }
};
