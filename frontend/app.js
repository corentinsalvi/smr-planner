(function () {
  const state = {
    utilisateur: null,
    employes: [],
    patients: [],
    roles: {},
    jours: [],
    semaineLundi: null,
    creneauSelectionne: null,
    patientAgendaId: null,
    agendaGlobalEmployeId: null,
    patientAgendaMode: 'agenda',
    espaceOnglet: 'agenda',
    absencesCourantes: [],
    espaceEmployeId: null
  };

  const $ = id => document.getElementById(id);

  function formaterDateLocale(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const jour = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${jour}`;
  }

  function parseDateLocale(dateStr) {
    const [y, m, jour] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, jour);
  }

  function minutesDepuis(heure) {
    const [h, m] = heure.split(':').map(Number);
    return h * 60 + m;
  }

  function finHeureSlot(heureDebut) {
    const fin = minutesDepuis(heureDebut) + CONFIG.DUREE_SEANCE;
    return `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`;
  }

  function lundiDe(date = new Date()) {
    const d = new Date(date);
    const jour = d.getDay();
    const diff = jour === 0 ? -6 : 1 - jour;
    d.setDate(d.getDate() + diff);
    return formaterDateLocale(d);
  }

  function joursDeLaSemaine(lundi) {
    const base = parseDateLocale(lundi);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return formaterDateLocale(d);
    });
  }

  function heuresAgenda(creneaux = []) {
    const heures = [...CONFIG.HEURES_AGENDA];
    creneaux.forEach(c => {
      if (c.statut !== 'ANNULE' && c.heure_debut && !heures.includes(c.heure_debut)) {
        heures.push(c.heure_debut);
      }
    });
    return heures.sort((a, b) => minutesDepuis(a) - minutesDepuis(b));
  }

  function lignesAgenda(creneaux = []) {
    const seances = heuresAgenda(creneaux);
    const result = [];
    let pauseMidiInseree = false;

    for (const heure of seances) {
      if (!pauseMidiInseree && minutesDepuis(heure) >= minutesDepuis('13:30')) {
        result.push({ type: 'pause-midi', heure: '11:15 – 13:30' });
        pauseMidiInseree = true;
      }
      result.push({ type: 'seance', heure });
    }

    return result;
  }

  function formatDateCourte(dateStr) {
    return parseDateLocale(dateStr).toLocaleDateString('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short'
    });
  }

  function nomComplet(p) {
    return `${p.prenom} ${p.nom}`;
  }

  function initiales(p) {
    return `${p.prenom[0] || ''}${p.nom[0] || ''}`.toUpperCase();
  }

  function toast(message, type = 'info') {
    const zone = $('toasts');
    const el = document.createElement('div');
    el.className = `toast toast-${type === 'erreur' ? 'erreur' : 'succes'}`;
    el.textContent = message;
    zone.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function afficherErreur(id, message) {
    const el = $(id);
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function ouvrirModale(id) { $(id).hidden = false; }
  function fermerModale(id) { $(id).hidden = true; }

  function renderNavigationSemaine(containerId, onChange) {
    const cont = $(containerId);
    const lundi = state.semaineLundi;
    const vendredi = joursDeLaSemaine(lundi)[4];
    cont.innerHTML = `
      <button class="nav-semaine-bouton" data-dir="-1" title="Semaine précédente">‹</button>
      <span class="nav-semaine-label">${formatDateCourte(lundi)} — ${formatDateCourte(vendredi)}</span>
      <button class="nav-semaine-bouton" data-dir="1" title="Semaine suivante">›</button>
    `;
    cont.querySelectorAll('[data-dir]').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = parseDateLocale(state.semaineLundi);
        d.setDate(d.getDate() + Number(btn.dataset.dir) * 7);
        state.semaineLundi = formaterDateLocale(d);
        onChange();
      });
    });
  }

  function couleurRole(role) {
    return state.roles[role]?.couleur || '#2D6A4F';
  }

  function labelRole(role) {
    return state.roles[role]?.label || role;
  }

  function estGestionnaire() {
    return CONFIG.GESTIONNAIRE_ROLES.includes(state.utilisateur?.role);
  }

  function employeAbsenceId() {
    return estGestionnaire() && state.espaceEmployeId
      ? state.espaceEmployeId
      : state.utilisateur.id;
  }

  function labelTypeAbsence(type) {
    return CONFIG.TYPES_ABSENCE[type]?.label || type;
  }

  function couleurTypeAbsence(type) {
    return CONFIG.TYPES_ABSENCE[type]?.couleur || '#8E8E93';
  }

  function dateDansPlage(date, debut, fin) {
    return date >= debut && date <= fin;
  }

  function absenceCouvreCreneau(absence, date, heureDebut, heureFin) {
    if (!dateDansPlage(date, absence.date_debut, absence.date_fin)) return false;
    if (absence.journee_entiere !== false) return true;
    if (!absence.heure_debut || !absence.heure_fin) return true;
    const d1 = minutesDepuis(heureDebut);
    const f1 = minutesDepuis(heureFin);
    const d2 = minutesDepuis(absence.heure_debut);
    const f2 = minutesDepuis(absence.heure_fin);
    return d1 < f2 && d2 < f1;
  }

  function absencePourCreneau(absences, employeId, date, heureDebut, heureFin) {
    return absences.find(a =>
      a.employe_id === employeId &&
      absenceCouvreCreneau(a, date, heureDebut, heureFin)
    ) || null;
  }

  function renderGrilleAgenda(containerId, creneaux, options = {}) {
    const cont = $(containerId);
    const jours = joursDeLaSemaine(state.semaineLundi);
    const entetes = jours.map(d => {
      const date = parseDateLocale(d);
      const jour = date.toLocaleDateString('fr-FR', { weekday: 'long' });
      const num = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      if (options.modeGlobal || options.modePatient || options.modePro) {
        return `<th><span class="agenda-jour-nom">${jour}</span><span class="agenda-jour-date">${num}</span></th>`;
      }
      return `<th>${formatDateCourte(d)}</th>`;
    }).join('');

    const lignes = lignesAgenda(creneaux).map(ligne => {
      const heure = ligne.heure;

      if (ligne.type === 'pause-midi') {
        const cellules = jours.map(() =>
          '<td class="cellule-pause cellule-pause--midi"><span class="cellule-pause-label">Pause</span></td>'
        ).join('');
        return `<tr class="ligne-pause ligne-pause--midi"><td class="col-heure col-heure--pause">${heure}</td>${cellules}</tr>`;
      }

      const cellules = jours.map(date => {
        const creneau = creneaux.find(c =>
          c.date === date && c.heure_debut === heure && c.statut !== 'ANNULE'
        );
        if (!creneau) {
          return (options.modeGlobal || options.modePatient || options.modePro)
            ? '<td class="cellule-vide"><span class="cellule-vide-point"></span></td>'
            : '<td></td>';
        }

        const patient = state.patients.find(p => p.id === creneau.patient_id);
        const employe = state.employes.find(e => e.id === creneau.employe_id);
        let titre, sousTitre;
        if (options.modePatient) {
          titre = employe ? nomComplet(employe) : labelRole(creneau.role);
          sousTitre = `${creneau.heure_debut} – ${creneau.heure_fin}`;
        } else if (options.modePro) {
          titre = patient ? nomComplet(patient) : '—';
          sousTitre = `${creneau.heure_debut} – ${creneau.heure_fin}`;
        } else if (options.modeGlobal) {
          titre = patient ? nomComplet(patient) : '—';
          sousTitre = employe ? nomComplet(employe) : labelRole(creneau.role);
        } else {
          titre = patient ? nomComplet(patient) : '—';
          sousTitre = labelRole(creneau.role);
        }
        const couleur = couleurRole(creneau.role);
        const classeVariante = options.modeGlobal ? ' creneau-carte--global'
          : options.modePatient ? ' creneau-carte--patient'
          : options.modePro ? ' creneau-carte--pro-global'
          : ' creneau-carte--perso';

        let corpsCarte;
        if (options.modePro) {
          corpsCarte = `
            <span class="creneau-badge-role" style="background:${couleur}18;color:${couleur}">${labelRole(creneau.role)}</span>
            <span class="creneau-titre">${titre}</span>
            <span class="creneau-sous-titre creneau-horaire">${sousTitre}</span>`;
        } else if (options.modeGlobal) {
          corpsCarte = `
            <span class="creneau-badge-role" style="background:${couleur}18;color:${couleur}">${labelRole(creneau.role)}</span>
            <span class="creneau-titre">${titre}</span>
            <div class="creneau-pro-ligne">
              ${employe ? `<span class="creneau-pro-avatar" style="background:${couleur}">${initiales(employe)}</span>` : ''}
              <span class="creneau-sous-titre">${sousTitre}</span>
            </div>`;
        } else if (options.modePatient) {
          corpsCarte = `
            <span class="creneau-badge-role" style="background:${couleur}18;color:${couleur}">${labelRole(creneau.role)}</span>
            <span class="creneau-titre">${titre}</span>
            <div class="creneau-pro-ligne">
              ${employe ? `<span class="creneau-pro-avatar" style="background:${couleur}">${initiales(employe)}</span>` : ''}
              <span class="creneau-sous-titre creneau-horaire">${sousTitre}</span>
            </div>`;
        } else {
          const titreEchappe = titre.replace(/"/g, '&quot;');
          corpsCarte = `
            <div class="creneau-ligne-titre">
              <span class="creneau-pastille" style="background:${couleur}"></span>
              <span class="creneau-titre" title="${titreEchappe}">${titre}</span>
            </div>
            <span class="creneau-sous-titre">${sousTitre}</span>`;
        }

        return `<td>
          <div class="creneau-carte${classeVariante} ${creneau.statut === 'ANNULE' ? 'statut-annule' : ''}"
               data-creneau-id="${creneau.id}"
               style="background:${couleur}14;border-color:${couleur}33;border-left-color:${couleur}">
            ${corpsCarte}
          </div>
        </td>`;
      }).join('');

      return `<tr><td class="col-heure">${heure}</td>${cellules}</tr>`;
    }).join('');

    cont.innerHTML = `
      <table class="agenda-table${options.modeGlobal || options.modePatient || options.modePro ? ' agenda-table--global' : ''}">
        <thead><tr><th class="col-heure">Heure</th>${entetes}</tr></thead>
        <tbody>${lignes}</tbody>
      </table>
    `;

    cont.querySelectorAll('[data-creneau-id]').forEach(el => {
      el.addEventListener('click', () => {
        const creneau = creneaux.find(c => c.id === el.dataset.creneauId);
        if (creneau) ouvrirModaleCreneau(creneau);
      });
    });
  }

  function renderStatsAgendaGlobal(creneaux) {
    const cont = $('agenda-global-stats');
    if (!cont) return;

    const patients = new Set(creneaux.map(c => c.patient_id));
    const pros = new Set(creneaux.map(c => c.employe_id));
    const roles = new Set(creneaux.map(c => c.role));

    cont.innerHTML = `
      <article class="stat-carte">
        <span class="stat-carte-valeur">${creneaux.length}</span>
        <span class="stat-carte-label">Rendez-vous</span>
      </article>
      <article class="stat-carte">
        <span class="stat-carte-valeur">${patients.size}</span>
        <span class="stat-carte-label">Patients planifiés</span>
      </article>
      <article class="stat-carte">
        <span class="stat-carte-valeur">${pros.size}</span>
        <span class="stat-carte-label">Professionnels</span>
      </article>
      <article class="stat-carte">
        <span class="stat-carte-valeur">${roles.size}</span>
        <span class="stat-carte-label">Spécialités actives</span>
      </article>
    `;
  }

  function renderAgendaGlobalVide(afficher, options = {}) {
    const vide = $('agenda-global-vide');
    const grille = $('grille-globale');
    if (!vide || !grille) return;

    if (afficher) {
      grille.hidden = true;
      vide.hidden = false;

      if (options.attentePro) {
        const roleLabel = options.role ? labelRole(options.role) : 'ce métier';
        vide.innerHTML = `
          <div class="agenda-global-vide-icone" aria-hidden="true">👤</div>
          <h3 class="agenda-global-vide-titre">Aucun professionnel disponible</h3>
          <p class="agenda-global-vide-texte">Aucun professionnel actif n'est enregistré pour ${roleLabel}.</p>
        `;
        return;
      }

      if (options.sansRdvPro) {
        vide.innerHTML = `
          <h3 class="agenda-global-vide-titre">Aucun rendez-vous cette semaine</h3>
          <p class="agenda-global-vide-texte">Ce professionnel n'a pas de séance planifiée sur la période affichée.</p>
        `;
        return;
      }

      vide.innerHTML = `
        <h3 class="agenda-global-vide-titre">Aucun rendez-vous cette semaine</h3>
        <p class="agenda-global-vide-texte">Les professionnels peuvent générer leur agenda depuis Mon espace.</p>
      `;
    } else {
      grille.hidden = false;
      vide.hidden = true;
    }
  }

  function employesActifsPourRole(role) {
    return state.employes
      .filter(e => e.actif !== false && e.role === role)
      .sort((a, b) => nomComplet(a).localeCompare(nomComplet(b), 'fr'));
  }

  function proCorrespondRecherche(employe, requete) {
    const q = requete.trim().toLowerCase();
    if (!q) return true;
    return [employe.prenom, employe.nom, nomComplet(employe)]
      .some(v => v.toLowerCase().includes(q));
  }

  function mettreAJourVisibiliteFiltrePro(role) {
    const label = $('filtre-pro-global-label');
    if (label) label.hidden = !role;
  }

  function selectionnerProAgendaGlobal(employeId) {
    state.agendaGlobalEmployeId = employeId;
    const employe = state.employes.find(e => e.id === employeId);
    const input = $('selecteur-pro-agenda-global');
    if (input) {
      input.value = employe ? nomComplet(employe) : '';
    }
  }

  function renderEnteteProAgendaGlobal(employe) {
    const entete = $('agenda-global-pro-entete');
    if (!entete) return;

    if (!employe) {
      entete.hidden = true;
      entete.innerHTML = '';
      return;
    }

    const couleur = couleurRole(employe.role);
    entete.hidden = false;
    entete.innerHTML = `
      <div class="agenda-global-pro-avatar" style="background:${couleur}">${initiales(employe)}</div>
      <div class="agenda-global-pro-info">
        <strong class="agenda-global-pro-nom">${nomComplet(employe)}</strong>
        <span class="agenda-global-pro-role" style="color:${couleur}">${labelRole(employe.role)}</span>
      </div>
    `;
  }

  function fermerComboboxProGlobal() {
    const liste = $('liste-options-pro-agenda-global');
    const input = $('selecteur-pro-agenda-global');
    if (liste) liste.hidden = true;
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  function afficherOptionsComboboxProGlobal(requete = '') {
    const liste = $('liste-options-pro-agenda-global');
    const input = $('selecteur-pro-agenda-global');
    const role = $('filtre-role-global')?.value;
    if (!liste || !input || !role) return;

    const pros = employesActifsPourRole(role).filter(e => proCorrespondRecherche(e, requete));

    if (!pros.length) {
      liste.innerHTML = '<li class="combobox-option combobox-option--vide">Aucun professionnel trouvé</li>';
      liste.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    liste.innerHTML = pros.map(e => `
      <li role="option"
          data-employe-id="${e.id}"
          class="combobox-option${e.id === state.agendaGlobalEmployeId ? ' is-selected' : ''}"
          aria-selected="${e.id === state.agendaGlobalEmployeId}">
        ${nomComplet(e)}
      </li>
    `).join('');

    liste.hidden = false;
    input.setAttribute('aria-expanded', 'true');

    liste.querySelectorAll('[data-employe-id]').forEach(li => {
      li.addEventListener('mousedown', ev => {
        ev.preventDefault();
        selectionnerProAgendaGlobal(li.dataset.employeId);
        fermerComboboxProGlobal();
        renderAgendaGlobal();
      });
    });
  }

  function initComboboxProAgendaGlobal() {
    const input = $('selecteur-pro-agenda-global');
    const combobox = $('combobox-pro-agenda-global');
    if (!input || !combobox) return;

    input.addEventListener('input', () => afficherOptionsComboboxProGlobal(input.value));
    input.addEventListener('focus', () => afficherOptionsComboboxProGlobal(input.value));

    input.addEventListener('keydown', e => {
      const liste = $('liste-options-pro-agenda-global');
      const options = [...liste.querySelectorAll('[data-employe-id]')];
      const active = liste.querySelector('.combobox-option.is-highlighted');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!options.length) return;
        const index = active ? options.indexOf(active) : -1;
        const suivant = options[Math.min(index + 1, options.length - 1)];
        options.forEach(o => o.classList.remove('is-highlighted'));
        suivant.classList.add('is-highlighted');
        suivant.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!options.length) return;
        const index = active ? options.indexOf(active) : options.length;
        const precedent = options[Math.max(index - 1, 0)];
        options.forEach(o => o.classList.remove('is-highlighted'));
        precedent.classList.add('is-highlighted');
        precedent.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cible = active || options[0];
        if (cible) {
          selectionnerProAgendaGlobal(cible.dataset.employeId);
          fermerComboboxProGlobal();
          renderAgendaGlobal();
        }
      } else if (e.key === 'Escape') {
        fermerComboboxProGlobal();
        const employe = state.employes.find(e => e.id === state.agendaGlobalEmployeId);
        input.value = employe ? nomComplet(employe) : '';
      }
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#combobox-pro-agenda-global')) {
        fermerComboboxProGlobal();
        const employe = state.employes.find(e => e.id === state.agendaGlobalEmployeId);
        if (employe) input.value = nomComplet(employe);
      }
    });
  }

  function reinitialiserFiltreProGlobal() {
    state.agendaGlobalEmployeId = null;
    const input = $('selecteur-pro-agenda-global');
    if (input) input.value = '';
    fermerComboboxProGlobal();
  }

  function choisirProAleatoirePourRole(role) {
    const pros = employesActifsPourRole(role);
    if (!pros.length) return null;
    return pros[Math.floor(Math.random() * pros.length)].id;
  }

  function preparerFiltreProPourRole(role) {
    reinitialiserFiltreProGlobal();
    if (!role) return;

    const proId = choisirProAleatoirePourRole(role);
    if (proId) selectionnerProAgendaGlobal(proId);
  }

  async function chargerCreneaux(filtres = {}) {
    const jours = joursDeLaSemaine(state.semaineLundi);
    return API.getCreneaux({
      ...filtres,
      date_debut: jours[0],
      date_fin: jours[4]
    });
  }

  function copierDansPressePapier(texte) {
    return navigator.clipboard.writeText(texte);
  }

  function formaterDateRelative(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function afficherStatutSync(statut) {
    const vide = $('sync-etat-vide');
    const actif = $('sync-etat-actif');
    const nouvelle = $('sync-url-nouvelle');
    const btnRevoquer = $('btn-revoquer-sync');
    const btnGenerer = $('btn-generer-sync-url');

    nouvelle.hidden = true;

    if (!statut.actif) {
      vide.hidden = false;
      actif.hidden = true;
      btnRevoquer.hidden = true;
      btnGenerer.textContent = 'Générer un lien';
      return;
    }

    vide.hidden = true;
    actif.hidden = false;
    btnRevoquer.hidden = false;
    btnGenerer.textContent = 'Régénérer le lien';
    $('sync-url').value = statut.url_masquee || '';
    $('sync-meta').textContent =
      `Créé le ${formaterDateRelative(statut.created_at)}` +
      (statut.last_accessed_at ? ` · Dernière synchro ${formaterDateRelative(statut.last_accessed_at)}` : '');
  }

  async function ouvrirModaleSync() {
    $('sync-url-nouvelle').hidden = true;
    try {
      const statut = await API.getCalendarSync();
      afficherStatutSync(statut);
      ouvrirModale('modale-sync-fond');
    } catch (err) {
      toast(err.message, 'erreur');
    }
  }

  async function genererSyncUrl() {
    const btn = $('btn-generer-sync-url');
    btn.disabled = true;
    try {
      const resultat = await API.createCalendarSync();
      $('sync-etat-vide').hidden = true;
      $('sync-etat-actif').hidden = true;
      $('sync-url-nouvelle').hidden = false;
      $('sync-url-nouvelle-input').value = resultat.url;
      $('btn-revoquer-sync').hidden = false;
      btn.textContent = 'Régénérer le lien';
      toast(resultat.message);
    } catch (err) {
      toast(err.message, 'erreur');
    } finally {
      btn.disabled = false;
    }
  }

  async function revoquerSyncUrl() {
    if (!confirm('Révoquer ce lien ? Les agendas externes ne recevront plus de mises à jour.')) return;
    try {
      await API.revokeCalendarSync();
      afficherStatutSync({ actif: false });
      $('sync-url-nouvelle').hidden = true;
      toast('Lien révoqué.');
    } catch (err) {
      toast(err.message, 'erreur');
    }
  }

  async function telechargerAgendaIcs() {
    const jours = joursDeLaSemaine(state.semaineLundi);
    const btn = $('btn-export-ics');
    btn.disabled = true;

    try {
      const blob = await API.exportAgendaIcs({
        date_debut: jours[0],
        date_fin: jours[4]
      });
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = `agenda-smr-${jours[0]}.ics`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
      toast('Agenda exporté. Importez le fichier dans Google ou Apple Calendrier.');
    } catch (err) {
      toast(err.message, 'erreur');
    } finally {
      btn.disabled = false;
    }
  }

  async function renderMonAgenda() {
    renderNavigationSemaine('nav-semaine-mon-agenda', renderMonAgenda);
    const creneaux = await chargerCreneaux({ employe_id: state.utilisateur.id });
    renderGrilleAgenda('grille-mon-agenda', creneaux);
  }

  function activerEspaceOnglet(onglet) {
    state.espaceOnglet = onglet;
    document.querySelectorAll('[data-espace-onglet]').forEach(btn => {
      const actif = btn.dataset.espaceOnglet === onglet;
      btn.classList.toggle('is-active', actif);
      btn.setAttribute('aria-selected', actif ? 'true' : 'false');
    });
    document.querySelectorAll('[data-espace-panel]').forEach(panel => {
      panel.hidden = panel.dataset.espacePanel !== onglet;
    });

    const actions = {
      agenda: renderMonAgenda,
      horaires: async () => {
        state.disponibilitesCourantes = await API.getDisponibilites(state.utilisateur.id);
        renderEditeurHoraires();
      },
      absences: renderAbsences
    };
    actions[onglet]?.();
  }

  async function renderMonEspace() {
    if (!state.espaceEmployeId) state.espaceEmployeId = state.utilisateur.id;
    preparerSelecteurAbsenceEmploye();
    activerEspaceOnglet(state.espaceOnglet || 'agenda');
  }

  function preparerSelecteurAbsenceEmploye() {
    const zone = $('absences-selecteur-pro');
    const select = $('select-absence-employe');
    if (!zone || !select) return;

    if (!estGestionnaire()) {
      zone.hidden = true;
      state.espaceEmployeId = state.utilisateur.id;
      return;
    }

    zone.hidden = false;
    const actifs = state.employes.filter(e => e.actif !== false);
    select.innerHTML = actifs.map(e =>
      `<option value="${e.id}" ${e.id === state.espaceEmployeId ? 'selected' : ''}>${nomComplet(e)} — ${labelRole(e.role)}</option>`
    ).join('');
  }

  function absencesPourJour(date) {
    return state.absencesCourantes.filter(a => dateDansPlage(date, a.date_debut, a.date_fin));
  }

  function formatPeriodeAbsence(absence) {
    const debut = formatDateCourte(absence.date_debut);
    const fin = formatDateCourte(absence.date_fin);
    const dates = absence.date_debut === absence.date_fin ? debut : `${debut} → ${fin}`;
    if (absence.journee_entiere === false && absence.heure_debut) {
      return `${dates}, ${absence.heure_debut} – ${absence.heure_fin}`;
    }
    return dates;
  }

  async function chargerAbsencesSemaine() {
    const jours = joursDeLaSemaine(state.semaineLundi);
    state.absencesCourantes = await API.getAbsences({
      employe_id: employeAbsenceId(),
      date_debut: jours[0],
      date_fin: jours[4]
    });
  }

  async function renderAbsences() {
    preparerSelecteurAbsenceEmploye();
    renderNavigationSemaine('nav-semaine-absences', renderAbsences);
    await chargerAbsencesSemaine();

    const jours = joursDeLaSemaine(state.semaineLundi);
    const calendrier = $('calendrier-absences');
    if (calendrier) {
      calendrier.innerHTML = `
        <div class="calendrier-absences-grille">
          ${jours.map(date => {
            const absencesJour = absencesPourJour(date);
            const dateObj = parseDateLocale(date);
            const jourNom = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
            const jourNum = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
            const puces = absencesJour.length
              ? absencesJour.map(a => {
                  const couleur = couleurTypeAbsence(a.type);
                  return `<span class="absence-puce" style="background:${couleur}22;color:${couleur};border-color:${couleur}55">${labelTypeAbsence(a.type)}</span>`;
                }).join('')
              : '<span class="calendrier-absences-vide">Disponible</span>';
            return `
              <article class="calendrier-absences-jour">
                <header class="calendrier-absences-jour-entete">
                  <span class="calendrier-absences-jour-nom">${jourNom}</span>
                  <span class="calendrier-absences-jour-date">${jourNum}</span>
                </header>
                <div class="calendrier-absences-jour-corps">${puces}</div>
              </article>
            `;
          }).join('')}
        </div>
      `;
    }

    const liste = $('liste-absences');
    if (liste) {
      const triees = [...state.absencesCourantes].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
      if (!triees.length) {
        liste.innerHTML = '<p class="liste-absences-vide">Aucune absence sur cette semaine.</p>';
      } else {
        liste.innerHTML = `
          <h3 class="liste-absences-titre">Absences de la semaine</h3>
          <ul class="liste-absences-items">
            ${triees.map(a => {
              const couleur = couleurTypeAbsence(a.type);
              return `
                <li class="absence-item">
                  <div class="absence-item-info">
                    <span class="absence-item-type" style="color:${couleur}">${labelTypeAbsence(a.type)}</span>
                    <span class="absence-item-dates">${formatPeriodeAbsence(a)}</span>
                    ${a.commentaire ? `<span class="absence-item-commentaire">${a.commentaire.replace(/</g, '&lt;')}</span>` : ''}
                  </div>
                  <button type="button" class="bouton bouton-mini bouton-danger" data-supprimer-absence="${a.id}">Supprimer</button>
                </li>
              `;
            }).join('')}
          </ul>
        `;
        liste.querySelectorAll('[data-supprimer-absence]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Supprimer cette absence ?')) return;
            try {
              await API.deleteAbsence(btn.dataset.supprimerAbsence);
              toast('Absence supprimée.');
              await renderAbsences();
              if (state.espaceOnglet === 'agenda') await renderMonAgenda();
            } catch (err) {
              toast(err.message, 'erreur');
            }
          });
        });
      }
    }

    const selectType = $('absence-type');
    if (selectType && !selectType.options.length) {
      selectType.innerHTML = Object.entries(CONFIG.TYPES_ABSENCE).map(([code, info]) =>
        `<option value="${code}">${info.label}</option>`
      ).join('');
    }
  }

  async function renderAgendaGlobal() {
    renderNavigationSemaine('nav-semaine-global', renderAgendaGlobal);

    const role = $('filtre-role-global').value;
    mettreAJourVisibiliteFiltrePro(role);

    let creneaux = await chargerCreneaux();
    let modePro = false;

    if (role) {
      const pros = employesActifsPourRole(role);

      if (!state.agendaGlobalEmployeId && pros.length) {
        selectionnerProAgendaGlobal(choisirProAleatoirePourRole(role));
      }

      if (!state.agendaGlobalEmployeId) {
        renderEnteteProAgendaGlobal(null);
        renderStatsAgendaGlobal([]);
        renderAgendaGlobalVide(true, { attentePro: true, role });
        return;
      }

      const employe = state.employes.find(e => e.id === state.agendaGlobalEmployeId);
      if (!employe || employe.role !== role) {
        reinitialiserFiltreProGlobal();
        const proId = choisirProAleatoirePourRole(role);
        if (proId) {
          selectionnerProAgendaGlobal(proId);
        } else {
          renderEnteteProAgendaGlobal(null);
          renderStatsAgendaGlobal([]);
          renderAgendaGlobalVide(true, { attentePro: true, role });
          return;
        }
      }

      creneaux = creneaux.filter(c => c.employe_id === state.agendaGlobalEmployeId);
      modePro = true;
      renderEnteteProAgendaGlobal(state.employes.find(e => e.id === state.agendaGlobalEmployeId));
    } else {
      reinitialiserFiltreProGlobal();
      renderEnteteProAgendaGlobal(null);
    }

    renderStatsAgendaGlobal(creneaux);

    if (creneaux.length === 0) {
      renderAgendaGlobalVide(true, modePro ? { sansRdvPro: true } : {});
      return;
    }

    renderAgendaGlobalVide(false);
    renderGrilleAgenda(
      'grille-globale',
      creneaux,
      modePro ? { modePro: true } : { modeGlobal: true }
    );
  }

  function patientsActifs() {
    return state.patients.filter(p => p.statut === 'ACTIF');
  }

  function choisirPatientAleatoire() {
    const actifs = patientsActifs();
    if (!actifs.length) return null;
    return actifs[Math.floor(Math.random() * actifs.length)].id;
  }

  function selectionnerPatientAgenda(patientId) {
    state.patientAgendaId = patientId;
    state.patientAgendaMode = 'agenda';
    const patient = state.patients.find(p => p.id === patientId);
    const input = $('selecteur-patient-agenda');
    if (input) {
      input.value = patient ? nomComplet(patient) : '';
    }
  }

  function fermerComboboxPatient() {
    const liste = $('liste-options-patient-agenda');
    const input = $('selecteur-patient-agenda');
    if (liste) liste.hidden = true;
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  function afficherOptionsCombobox(requete = '') {
    const liste = $('liste-options-patient-agenda');
    const input = $('selecteur-patient-agenda');
    if (!liste || !input) return;

    const actifs = patientsActifs().filter(p => patientCorrespondRecherche(p, requete));

    if (!actifs.length) {
      liste.innerHTML = '<li class="combobox-option combobox-option--vide">Aucun patient trouvé</li>';
      liste.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    liste.innerHTML = actifs.map(p => `
      <li role="option"
          data-patient-id="${p.id}"
          class="combobox-option${p.id === state.patientAgendaId ? ' is-selected' : ''}"
          aria-selected="${p.id === state.patientAgendaId}">
        ${nomComplet(p)}
      </li>
    `).join('');

    liste.hidden = false;
    input.setAttribute('aria-expanded', 'true');

    liste.querySelectorAll('[data-patient-id]').forEach(li => {
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        selectionnerPatientAgenda(li.dataset.patientId);
        fermerComboboxPatient();
        renderAgendaPatient();
      });
    });
  }

  function initComboboxPatientAgenda() {
    const input = $('selecteur-patient-agenda');
    const combobox = $('combobox-patient-agenda');
    if (!input || !combobox) return;

    input.addEventListener('input', () => afficherOptionsCombobox(input.value));
    input.addEventListener('focus', () => afficherOptionsCombobox(input.value));

    input.addEventListener('keydown', e => {
      const liste = $('liste-options-patient-agenda');
      const options = [...liste.querySelectorAll('[data-patient-id]')];
      const active = liste.querySelector('.combobox-option.is-highlighted');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!options.length) return;
        const index = active ? options.indexOf(active) : -1;
        const suivant = options[Math.min(index + 1, options.length - 1)];
        options.forEach(o => o.classList.remove('is-highlighted'));
        suivant.classList.add('is-highlighted');
        suivant.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!options.length) return;
        const index = active ? options.indexOf(active) : options.length;
        const precedent = options[Math.max(index - 1, 0)];
        options.forEach(o => o.classList.remove('is-highlighted'));
        precedent.classList.add('is-highlighted');
        precedent.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cible = active || options[0];
        if (cible) {
          selectionnerPatientAgenda(cible.dataset.patientId);
          fermerComboboxPatient();
          renderAgendaPatient();
        }
      } else if (e.key === 'Escape') {
        fermerComboboxPatient();
        const patient = state.patients.find(p => p.id === state.patientAgendaId);
        input.value = patient ? nomComplet(patient) : '';
      }
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#combobox-patient-agenda')) {
        fermerComboboxPatient();
        const patient = state.patients.find(p => p.id === state.patientAgendaId);
        if (patient) input.value = nomComplet(patient);
      }
    });
  }

  async function preparerAgendaPatient() {
    const id = choisirPatientAleatoire();
    if (id) selectionnerPatientAgenda(id);
    await renderAgendaPatient();
  }

  function formaterHeuresForfait(heures) {
    const arrondi = Math.round(heures * 10) / 10;
    if (!arrondi) return '0 h';
    return Number.isInteger(arrondi)
      ? `${arrondi} h`
      : `${String(arrondi).replace('.', ',')} h`;
  }

  function calculerScoreConformiteForfait(besoins, creneaux) {
    const dureeSeanceMin = CONFIG.DUREE_SEANCE;
    const besoinsActifs = (besoins || []).filter(b => b.actif !== false);

    const seancesPrevues = besoinsActifs.reduce(
      (total, besoin) => total + (Number(besoin.seances_par_semaine) || 0),
      0
    );
    const seancesPlanifiees = creneaux.filter(c => c.statut !== 'ANNULE').length;

    const heuresForfait = (seancesPrevues * dureeSeanceMin) / 60;
    const heuresPlanifiees = (seancesPlanifiees * dureeSeanceMin) / 60;

    let score = 0;
    if (heuresForfait > 0) {
      score = Math.round((heuresPlanifiees / heuresForfait) * 100);
    } else if (seancesPlanifiees > 0) {
      score = 100;
    }

    const scoreAffiche = Math.min(score, 100);
    const conforme = heuresForfait > 0 && score >= 100;

    return {
      score: scoreAffiche,
      conforme,
      heuresPlanifiees,
      heuresForfait,
      seancesPlanifiees,
      seancesPrevues,
      forfaitDefini: heuresForfait > 0
    };
  }

  function renderBarreConformiteForfait(besoins, creneaux) {
    const conformite = calculerScoreConformiteForfait(besoins, creneaux);

    if (!conformite.forfaitDefini) {
      return `
        <div class="fiche-patient-conformite fiche-patient-conformite--vide">
          <div class="conformite-entete">
            <span class="conformite-label">Score de conformité du forfait</span>
            <span class="conformite-valeur">—</span>
          </div>
          <div class="conformite-barre-fond" aria-hidden="true">
            <div class="conformite-barre-remplissage conformite-barre--neutre" style="width: 0%"></div>
          </div>
          <p class="conformite-message">Aucun forfait défini pour ce patient.</p>
        </div>
      `;
    }

    const classeBarre = conformite.conforme ? 'conformite-barre--succes' : 'conformite-barre--alerte';
    const message = conformite.conforme
      ? 'Planning 100% conforme'
      : `${formaterHeuresForfait(conformite.heuresPlanifiees)} planifiées sur ${formaterHeuresForfait(conformite.heuresForfait)} prévues`;

    return `
      <div class="fiche-patient-conformite">
        <div class="conformite-entete">
          <span class="conformite-label">Score de conformité du forfait</span>
          <span class="conformite-valeur${conformite.conforme ? ' conformite-valeur--succes' : ' conformite-valeur--alerte'}">${conformite.score}%</span>
        </div>
        <div class="conformite-barre-fond"
             role="progressbar"
             aria-valuemin="0"
             aria-valuemax="100"
             aria-valuenow="${conformite.score}"
             aria-label="Score de conformité du forfait">
          <div class="conformite-barre-remplissage ${classeBarre}" style="width: ${conformite.score}%"></div>
        </div>
        <p class="conformite-message${conformite.conforme ? ' conformite-message--succes' : ''}">${message}</p>
      </div>
    `;
  }

  function iconeTogglePatientAgenda(mode) {
    if (mode === 'graphique') {
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
      </svg>`;
    }
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2v10l7 7"/>
    </svg>`;
  }

  function calculerRepartitionPatient(creneaux) {
    const actifs = creneaux.filter(c => c.statut !== 'ANNULE');
    const parRole = new Map();

    actifs.forEach(c => {
      const role = c.role || 'AUTRE';
      parRole.set(role, (parRole.get(role) || 0) + 1);
    });

    const total = actifs.length;
    return [...parRole.entries()]
      .map(([role, count]) => {
        const partExacte = total ? (count / total) * 100 : 0;
        return {
          role,
          label: labelRole(role),
          couleur: couleurRole(role),
          count,
          partExacte,
          pourcent: Math.round(partExacte)
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  function cheminPartCamembert(cx, cy, rayon, debutPct, finPct) {
    if (finPct - debutPct >= 99.99) {
      return [
        `M ${cx} ${cy - rayon}`,
        `A ${rayon} ${rayon} 0 1 1 ${cx - 0.01} ${cy - rayon}`,
        'Z'
      ].join(' ');
    }

    const angle = pct => (pct / 100) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + rayon * Math.cos(angle(debutPct));
    const y1 = cy + rayon * Math.sin(angle(debutPct));
    const x2 = cx + rayon * Math.cos(angle(finPct));
    const y2 = cy + rayon * Math.sin(angle(finPct));
    const grandArc = finPct - debutPct > 50 ? 1 : 0;

    return `M ${cx} ${cy} L ${x1} ${y1} A ${rayon} ${rayon} 0 ${grandArc} 1 ${x2} ${y2} Z`;
  }

  function calculerConformiteParProfession(besoins, creneaux) {
    const besoinsActifs = (besoins || []).filter(b => b.actif !== false);
    const creneauxActifs = creneaux.filter(c => c.statut !== 'ANNULE');
    const parRole = new Map();

    besoinsActifs.forEach(besoin => {
      const role = besoin.role || 'AUTRE';
      const ligne = parRole.get(role) || { role, necessaires: 0, planifiees: 0 };
      ligne.necessaires += Number(besoin.seances_par_semaine) || 0;
      parRole.set(role, ligne);
    });

    creneauxActifs.forEach(creneau => {
      const role = creneau.role || 'AUTRE';
      const ligne = parRole.get(role) || { role, necessaires: 0, planifiees: 0 };
      ligne.planifiees += 1;
      parRole.set(role, ligne);
    });

    return [...parRole.values()]
      .filter(ligne => ligne.necessaires > 0 || ligne.planifiees > 0)
      .map(ligne => {
        const ratio = ligne.necessaires > 0
          ? ligne.planifiees / ligne.necessaires
          : (ligne.planifiees > 0 ? 1 : 0);
        const conforme = ligne.necessaires > 0
          ? ligne.planifiees >= ligne.necessaires
          : ligne.planifiees === 0;

        return {
          ...ligne,
          label: labelRole(ligne.role),
          couleur: couleurRole(ligne.role),
          ratio,
          ratioAffiche: Math.min(ratio, 1),
          conforme
        };
      })
      .sort((a, b) => {
        if (a.conforme !== b.conforme) return a.conforme ? 1 : -1;
        return a.label.localeCompare(b.label, 'fr');
      });
  }

  function renderGraphiqueConformiteForfait(besoins, creneaux) {
    const conformite = calculerScoreConformiteForfait(besoins, creneaux);
    const metiers = calculerConformiteParProfession(besoins, creneaux);

    if (!conformite.forfaitDefini) {
      return `
        <section class="graphique-conformite graphique-conformite--vide">
          <div class="graphique-conformite-entete">
            <h4 class="graphique-conformite-titre">Score de conformité du forfait</h4>
            <span class="graphique-conformite-pourcent">—</span>
          </div>
          <p class="graphique-conformite-message">Aucun forfait défini pour ce patient.</p>
        </section>
      `;
    }

    const message = conformite.conforme
      ? 'Planning 100% conforme'
      : `${formaterHeuresForfait(conformite.heuresPlanifiees)} planifiées sur ${formaterHeuresForfait(conformite.heuresForfait)} prévues`;

    const lignesMetiers = metiers.length
      ? metiers.map(metier => {
        const classeBarre = metier.conforme
          ? 'graphique-conformite-barre--succes'
          : 'graphique-conformite-barre--alerte';
        const classeRatio = metier.conforme
          ? 'graphique-conformite-metier-ratio--succes'
          : 'graphique-conformite-metier-ratio--alerte';
        const ratioTexte = metier.necessaires > 0
          ? `${metier.planifiees}/${metier.necessaires}`
          : `${metier.planifiees}/0`;

        return `
          <li class="graphique-conformite-metier">
            <div class="graphique-conformite-metier-entete">
              <span class="graphique-conformite-pastille" style="background:${metier.couleur}"></span>
              <span class="graphique-conformite-metier-nom">${metier.label}</span>
              <span class="graphique-conformite-metier-ratio ${classeRatio}">${ratioTexte}</span>
            </div>
            <div class="graphique-conformite-piste" aria-hidden="true">
              <div class="graphique-conformite-barre ${classeBarre}" style="width: ${Math.round(metier.ratioAffiche * 100)}%; background: linear-gradient(90deg, ${metier.couleur}99, ${metier.couleur})"></div>
            </div>
            <span class="graphique-conformite-metier-detail">
              ${metier.planifiees} séance${metier.planifiees > 1 ? 's' : ''} planifiée${metier.planifiees > 1 ? 's' : ''}
              · ${metier.necessaires} nécessaire${metier.necessaires > 1 ? 's' : ''}
            </span>
          </li>
        `;
      }).join('')
      : `
        <li class="graphique-conformite-metier graphique-conformite-metier--vide">
          <p class="graphique-conformite-message">Aucune profession à suivre pour ce forfait.</p>
        </li>
      `;

    return `
      <section class="graphique-conformite">
        <div class="graphique-conformite-entete">
          <h4 class="graphique-conformite-titre">Score de conformité du forfait</h4>
          <span class="graphique-conformite-pourcent${conformite.conforme ? ' graphique-conformite-pourcent--succes' : ' graphique-conformite-pourcent--alerte'}">${conformite.score}%</span>
        </div>

        <ul class="graphique-conformite-metiers">
          ${lignesMetiers}
        </ul>

        <div class="conformite-barre-fond graphique-conformite-progression"
             role="progressbar"
             aria-valuemin="0"
             aria-valuemax="100"
             aria-valuenow="${conformite.score}"
             aria-label="Score de conformité du forfait">
          <div class="conformite-barre-remplissage ${conformite.conforme ? 'conformite-barre--succes' : 'conformite-barre--alerte'}" style="width: ${conformite.score}%"></div>
        </div>

        <p class="graphique-conformite-message${conformite.conforme ? ' graphique-conformite-message--succes' : ''}">${message}</p>
      </section>
    `;
  }

  function renderGraphiqueRepartitionPatient(besoins, creneaux) {
    const cont = $('agenda-patient-graphique');
    if (!cont) return;

    const segments = calculerRepartitionPatient(creneaux);
    const total = segments.reduce((s, seg) => s + seg.count, 0);
    const dureeTotale = total * CONFIG.DUREE_SEANCE;
    const sectionConformite = renderGraphiqueConformiteForfait(besoins, creneaux);

    let sectionRepartition;
    if (!total) {
      sectionRepartition = `
        <div class="graphique-patient-section graphique-patient-section--vide">
          <div class="graphique-patient-vide graphique-patient-vide--inline">
            <div class="graphique-patient-vide-icone" aria-hidden="true">◔</div>
            <h3 class="graphique-patient-vide-titre">Aucune séance planifiée</h3>
            <p class="graphique-patient-vide-texte">La répartition par métier apparaîtra dès que des séances seront ajoutées au planning.</p>
          </div>
        </div>
      `;
    } else {
      let cumul = 0;
      const parts = segments.map(seg => {
        const debut = cumul;
        cumul += seg.partExacte;
        return { ...seg, debut, fin: cumul };
      });

      const cx = 100;
      const cy = 100;
      const rayon = 88;
      const partsSvg = parts.map(seg => `
        <path class="graphique-patient-part"
              d="${cheminPartCamembert(cx, cy, rayon, seg.debut, seg.fin)}"
              fill="${seg.couleur}"
              data-role="${seg.role}">
          <title>${seg.label} : ${seg.pourcent}% (${seg.count} séance${seg.count > 1 ? 's' : ''})</title>
        </path>
      `).join('');

      sectionRepartition = `
        <div class="graphique-patient-section">
          <div class="graphique-patient-entete">
            <h3 class="graphique-patient-titre">Répartition du temps de rééducation</h3>
            <p class="graphique-patient-sous-titre">
              ${total} séance${total > 1 ? 's' : ''} · ${dureeTotale} min cette semaine
            </p>
          </div>
          <div class="graphique-patient-corps">
            <div class="graphique-patient-visuel">
              <svg class="graphique-patient-svg" viewBox="0 0 200 200" role="img" aria-label="Camembert de répartition par métier">
                ${partsSvg}
                <circle cx="${cx}" cy="${cy}" r="46" fill="var(--fond-releve)"/>
              </svg>
            </div>
            <ul class="graphique-patient-legende">
              ${segments.map(seg => `
                <li class="graphique-patient-legende-item">
                  <span class="graphique-patient-pastille" style="background:${seg.couleur}"></span>
                  <span class="graphique-patient-legende-label">${seg.label}</span>
                  <span class="graphique-patient-legende-valeur">${seg.pourcent}%</span>
                  <span class="graphique-patient-legende-detail">${seg.count} séance${seg.count > 1 ? 's' : ''}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      `;
    }

    cont.innerHTML = `
      <div class="graphique-patient-carte">
        ${sectionRepartition}
        <div class="graphique-patient-separateur" aria-hidden="true"></div>
        ${sectionConformite}
      </div>
    `;
  }

  function formaterJourCourtImpression(dateStr) {
    const date = parseDateLocale(dateStr);
    const jour = date.toLocaleDateString('fr-FR', { weekday: 'long' });
    const num = date.getDate();
    return `${jour.charAt(0).toUpperCase()}${jour.slice(1)} ${num}`;
  }

  function formaterPeriodeSemaineCourte(lundi) {
    const jours = joursDeLaSemaine(lundi);
    const debut = parseDateLocale(jours[0]);
    const fin = parseDateLocale(jours[4]);
    const memeMois = debut.getMonth() === fin.getMonth();
    const debutTexte = debut.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: memeMois ? undefined : 'long'
    });
    const finTexte = fin.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return `Semaine du ${debutTexte} au ${finTexte}`;
  }

  function lignesImpressionJour() {
    const result = [];
    let pauseMidiInseree = false;

    for (const heure of CONFIG.HEURES_AGENDA) {
      if (!pauseMidiInseree && minutesDepuis(heure) >= minutesDepuis('13:30')) {
        result.push({ type: 'pause-midi' });
        pauseMidiInseree = true;
      }
      result.push({ type: 'seance', heure });
    }

    return result;
  }

  function genererFeuilleImpressionPatient(patient, creneaux, lundi) {
    const jours = joursDeLaSemaine(lundi);
    const actifs = creneaux.filter(c => c.statut !== 'ANNULE');
    const lignes = lignesImpressionJour();

    const sectionsJours = jours.map(date => {
      const lignesJour = lignes.map(ligne => {
        if (ligne.type === 'pause-midi') {
          return '<li class="feuille-patient-pause">Pause déjeuner</li>';
        }

        const creneau = actifs.find(c => c.date === date && c.heure_debut === ligne.heure);
        if (creneau) {
          const employe = state.employes.find(e => e.id === creneau.employe_id);
          const pro = employe ? nomComplet(employe) : '—';
          const metier = labelRole(creneau.role);
          const couleur = couleurRole(creneau.role);
          return `
            <li class="feuille-patient-rdv" style="border-left-color:${couleur}">
              <span class="feuille-patient-rdv-heure">${creneau.heure_debut}</span>
              <span class="feuille-patient-rdv-detail">${metier} — ${pro}</span>
            </li>
          `;
        }

        return `
          <li class="feuille-patient-creneau-vide">
            <span class="feuille-patient-rdv-heure">${ligne.heure}</span>
          </li>
        `;
      }).join('');

      return `
        <section class="feuille-patient-jour">
          <h2 class="feuille-patient-jour-titre">${formaterJourCourtImpression(date)}</h2>
          <ul class="feuille-patient-liste">${lignesJour}</ul>
        </section>
      `;
    }).join('');

    return `
      <article class="feuille-patient">
        <header class="feuille-patient-entete">
          <h1 class="feuille-patient-nom">${nomComplet(patient)}</h1>
          <p class="feuille-patient-periode">${formaterPeriodeSemaineCourte(lundi)}</p>
        </header>
        <div class="feuille-patient-jours">
          ${sectionsJours}
        </div>
      </article>
    `;
  }

  function stylesImpressionPatient() {
    return `<style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        font-family: "Segoe UI", Arial, sans-serif;
        color: #1a1a1a;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .feuille-patient {
        width: 100%;
        max-height: 185mm;
        overflow: hidden;
        page-break-after: avoid;
        page-break-inside: avoid;
      }
      .feuille-patient-entete {
        text-align: center;
        margin-bottom: 8mm;
        padding-bottom: 4mm;
        border-bottom: 2px solid #007AFF;
      }
      .feuille-patient-nom {
        margin: 0 0 2mm;
        font-size: 24pt;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.1;
      }
      .feuille-patient-periode {
        margin: 0;
        font-size: 13pt;
        font-weight: 500;
        color: #5c6370;
      }
      .feuille-patient-jours {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 3mm;
        align-items: stretch;
      }
      .feuille-patient-jour {
        background: #f5f8fc;
        border: 1px solid #d8e2ef;
        border-radius: 8px;
        padding: 3mm;
        min-height: 0;
        page-break-inside: avoid;
      }
      .feuille-patient-jour-titre {
        margin: 0 0 3mm;
        padding: 2.5mm 2mm;
        font-size: 11.5pt;
        font-weight: 700;
        text-align: center;
        color: #fff;
        background: #007AFF;
        border-radius: 6px;
        line-height: 1.2;
      }
      .feuille-patient-liste {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .feuille-patient-rdv,
      .feuille-patient-creneau-vide {
        background: #fff;
        margin-bottom: 1.5mm;
        padding: 2mm 2.5mm;
        border: 1px solid #e4ebf4;
        border-radius: 5px;
        line-height: 1.25;
        min-height: 9.5mm;
      }
      .feuille-patient-rdv {
        border-left: 3px solid #007AFF;
      }
      .feuille-patient-creneau-vide {
        border-style: dashed;
        border-color: #dce4ee;
        background: #fafcff;
      }
      .feuille-patient-rdv:last-child,
      .feuille-patient-creneau-vide:last-child,
      .feuille-patient-pause:last-child { margin-bottom: 0; }
      .feuille-patient-rdv-heure {
        display: block;
        font-size: 10.5pt;
        font-weight: 700;
        color: #111;
        margin-bottom: 0.5mm;
      }
      .feuille-patient-rdv-detail {
        display: block;
        font-size: 9pt;
        font-weight: 500;
        color: #3d4654;
      }
      .feuille-patient-pause {
        list-style: none;
        margin: 1.5mm 0;
        padding: 1.5mm 0;
        font-size: 8pt;
        font-weight: 600;
        text-align: center;
        color: #8a93a3;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        border-top: 1px dashed #d0d8e4;
        border-bottom: 1px dashed #d0d8e4;
      }
    </style>`;
  }

  function genererDocumentImpressionPatient(patient, creneaux, lundi) {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title></title>
  ${stylesImpressionPatient()}
</head>
<body>
  ${genererFeuilleImpressionPatient(patient, creneaux, lundi)}
</body>
</html>`;
  }

  async function imprimerSemainePatient() {
    const patientId = state.patientAgendaId;
    if (!patientId) {
      toast('Sélectionnez un patient pour imprimer son planning.', 'erreur');
      return;
    }

    const patient = state.patients.find(p => p.id === patientId);
    if (!patient) return;

    const creneaux = await chargerCreneaux({ patient_id: patientId });
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(genererDocumentImpressionPatient(patient, creneaux, state.semaineLundi));
    doc.close();

    const lancerImpression = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } finally {
        setTimeout(() => iframe.remove(), 1000);
      }
    };

    if (iframe.contentDocument?.readyState === 'complete') {
      setTimeout(lancerImpression, 50);
    } else {
      iframe.onload = () => setTimeout(lancerImpression, 50);
    }
  }

  async function renderAgendaPatient() {
    renderNavigationSemaine('nav-semaine-patient', renderAgendaPatient);

    const patientId = state.patientAgendaId;
    const vide = $('agenda-patient-vide');
    const contenu = $('agenda-patient-contenu');
    const resume = $('fiche-patient-resume');
    const grille = $('grille-patient');
    const graphique = $('agenda-patient-graphique');
    const sansRdv = $('agenda-patient-sans-rdv');
    const modeGraphique = state.patientAgendaMode === 'graphique';

    if (!patientId) {
      vide.hidden = false;
      contenu.hidden = true;
      return;
    }

    vide.hidden = true;
    contenu.hidden = false;

    const patient = state.patients.find(p => p.id === patientId);
    const creneaux = await chargerCreneaux({ patient_id: patientId });
    const besoins = patient.besoins || [];

    resume.innerHTML = `
      <div class="fiche-patient-avatar">${initiales(patient)}</div>
      <div class="fiche-patient-info">
        <strong class="fiche-patient-nom">${nomComplet(patient)}</strong>
        <span class="fiche-patient-meta">
          ${creneaux.length} séance${creneaux.length > 1 ? 's' : ''} cette semaine
          · ${besoins.length} besoin${besoins.length > 1 ? 's' : ''} actif${besoins.length > 1 ? 's' : ''}
        </span>
      </div>
      <div class="fiche-patient-besoins">
        ${besoins.length ? besoins.map(b => `
          <span class="puce-besoin" style="border-color:${couleurRole(b.role)};color:${couleurRole(b.role)}">
            ${labelRole(b.role)} · ${b.seances_par_semaine}/sem
          </span>
        `).join('') : '<span class="fiche-patient-aucun-besoin">Aucun besoin défini</span>'}
      </div>
      ${renderBarreConformiteForfait(besoins, creneaux)}
      <div class="fiche-patient-actions">
        <button type="button"
                class="bouton bouton-discret bouton-imprimer-patient"
                id="btn-imprimer-semaine-patient"
                title="Imprimer la semaine du patient">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/>
            <rect x="6" y="14" width="12" height="8" rx="1"/>
          </svg>
          <span>Imprimer la semaine</span>
        </button>
        <button type="button"
                class="bouton-icone fiche-patient-toggle-vue"
                id="btn-toggle-vue-patient"
                aria-label="${modeGraphique ? 'Afficher l\'agenda' : 'Afficher la répartition par métier'}"
                title="${modeGraphique ? 'Voir l\'agenda' : 'Voir la répartition par métier'}">
          ${iconeTogglePatientAgenda(state.patientAgendaMode)}
        </button>
      </div>
    `;

    $('btn-toggle-vue-patient')?.addEventListener('click', () => {
      state.patientAgendaMode = modeGraphique ? 'agenda' : 'graphique';
      renderAgendaPatient();
    });

    $('btn-imprimer-semaine-patient')?.addEventListener('click', imprimerSemainePatient);

    if (modeGraphique) {
      grille.hidden = true;
      sansRdv.hidden = true;
      if (graphique) graphique.hidden = false;
      renderGraphiqueRepartitionPatient(besoins, creneaux);
      return;
    }

    if (graphique) graphique.hidden = true;

    if (creneaux.length === 0) {
      grille.hidden = true;
      sansRdv.hidden = false;
      sansRdv.innerHTML = `
        <h3 class="agenda-patient-vide-titre">Aucun rendez-vous cette semaine</h3>
        <p class="agenda-patient-vide-texte">Ce patient n'a pas encore de séances planifiées pour la semaine affichée.</p>
      `;
      return;
    }

    grille.hidden = false;
    sansRdv.hidden = true;
    renderGrilleAgenda('grille-patient', creneaux, { modePatient: true });
  }

  function normaliserRecherche(texte) {
    return String(texte || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  function patientCorrespondRecherche(patient, requete) {
    if (!requete) return true;
    const q = normaliserRecherche(requete);
    return [patient.prenom, patient.nom, nomComplet(patient)]
      .some(champ => normaliserRecherche(champ).includes(q));
  }

  function renderListePatients() {
    const statut = document.querySelector('#filtre-statut-patient .is-active')?.dataset.statut || 'ACTIF';
    const requete = $('recherche-patient')?.value || '';
    const cont = $('liste-patients');
    const patients = state.patients
      .filter(p => p.statut === statut)
      .filter(p => patientCorrespondRecherche(p, requete));

    if (!patients.length) {
      cont.innerHTML = requete
        ? `<p class="vue-description">Aucun patient ne correspond à « ${requete.trim().replace(/</g, '&lt;')} ».</p>`
        : '<p class="vue-description">Aucun patient dans cette catégorie.</p>';
      return;
    }

    cont.innerHTML = patients.map(p => `
      <article class="carte-patient">
        <div class="carte-patient-entete">
          <h3>${nomComplet(p)}</h3>
          <span class="carte-patient-statut">${p.statut === 'ACTIF' ? 'Actif' : 'Archivé'}</span>
        </div>
        <div class="carte-patient-besoins">
          ${(p.besoins || []).map(b => `
            <span class="puce-besoin" style="border-color:${couleurRole(b.role)};color:${couleurRole(b.role)}">
              ${labelRole(b.role)} · ${b.seances_par_semaine}/sem · P${b.priorite}
            </span>
          `).join('') || '<span class="carte-patient-vide">Aucun besoin défini</span>'}
        </div>
        <div class="carte-patient-actions">
          <button class="bouton bouton-discret" data-editer-patient="${p.id}">Modifier</button>
          ${p.statut === 'ACTIF' ? `<button class="bouton bouton-discret" data-archiver-patient="${p.id}">Archiver</button>` : ''}
        </div>
      </article>
    `).join('');

    cont.querySelectorAll('[data-editer-patient]').forEach(btn => {
      btn.addEventListener('click', () => ouvrirModalePatient(btn.dataset.editerPatient));
    });
    cont.querySelectorAll('[data-archiver-patient]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await API.archivePatient(btn.dataset.archiverPatient);
        await rafraichirPatients();
        renderListePatients();
        toast('Patient archivé.');
      });
    });
  }

  function renderListeEquipe() {
    const cont = $('liste-equipe');
    cont.innerHTML = state.employes.map(e => `
      <article class="carte-employe">
        <div class="carte-employe-avatar">${initiales(e)}</div>
        <div>
          <div class="carte-employe-nom">${nomComplet(e)}</div>
          <div class="carte-employe-role">${labelRole(e.role)}</div>
          <div class="carte-employe-email">${e.email}</div>
        </div>
      </article>
    `).join('');
  }

  function renderEditeurHoraires() {
    const cont = $('editeur-horaires');
    const disposParJour = state.disponibilitesCourantes || [];

    cont.innerHTML = state.jours.map(jour => {
      const dispos = disposParJour.filter(d => d.jour_semaine === jour.numero);
      const lignes = dispos.length
        ? dispos.map((d, i) => ligneDispo(jour.numero, d, i)).join('')
        : ligneDispo(jour.numero, null, 0);

      return `
        <section class="jour-horaires">
          <h3 class="jour-horaires-titre">${jour.label}</h3>
          <div class="jour-horaires-lignes" data-jour="${jour.numero}">${lignes}</div>
          <button type="button" class="bouton bouton-mini" data-ajouter-plage="${jour.numero}">+ Plage</button>
        </section>
      `;
    }).join('');

    cont.querySelectorAll('[data-ajouter-plage]').forEach(btn => {
      btn.addEventListener('click', () => {
        const jour = Number(btn.dataset.ajouterPlage);
        const zone = cont.querySelector(`[data-jour="${jour}"]`);
        const index = zone.querySelectorAll('.ligne-horaire').length;
        zone.insertAdjacentHTML('beforeend', ligneDispo(jour, null, index));
      });
    });

    cont.querySelectorAll('[data-supprimer-plage]').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.ligne-horaire').remove());
    });
  }

  function validerPlageHoraire(debut, fin) {
    const duree = minutesDepuis(fin) - minutesDepuis(debut);
    if (duree <= 0) return 'L\'heure de fin doit être après l\'heure de début.';
    if (minutesDepuis(debut) % CONFIG.PAS_MINUTES !== 0 || minutesDepuis(fin) % CONFIG.PAS_MINUTES !== 0) {
      return 'Les horaires doivent être espacés par tranches de 5 minutes.';
    }
    if (duree % CONFIG.DUREE_BLOC !== 0) {
      return `Chaque plage doit durer un multiple de ${CONFIG.DUREE_BLOC} minutes (ex. 08:00–11:20).`;
    }
    return null;
  }

  function ligneDispo(jour, dispo, index) {
    return `
      <div class="ligne-horaire" data-jour="${jour}">
        <input type="time" step="300" value="${dispo?.heure_debut || '08:00'}" data-champ="debut">
        <span>→</span>
        <input type="time" step="300" value="${dispo?.heure_fin || '11:20'}" data-champ="fin">
        <button type="button" class="ligne-besoin-supprimer" data-supprimer-plage title="Supprimer">×</button>
      </div>
    `;
  }

  function lireDisponibilitesFormulaire() {
    const dispos = [];
    $('editeur-horaires').querySelectorAll('.ligne-horaire').forEach(ligne => {
      const debut = ligne.querySelector('[data-champ="debut"]').value;
      const fin = ligne.querySelector('[data-champ="fin"]').value;
      if (debut && fin) {
        dispos.push({
          jour_semaine: Number(ligne.dataset.jour),
          heure_debut: debut,
          heure_fin: fin
        });
      }
    });
    return dispos;
  }

  function ouvrirModaleCreneau(creneau) {
    state.creneauSelectionne = creneau;
    const patient = state.patients.find(p => p.id === creneau.patient_id);
    const employe = state.employes.find(e => e.id === creneau.employe_id);

    $('modale-creneau-corps').innerHTML = `
      <div class="detail-creneau-ligne"><span>Patient</span><span>${patient ? nomComplet(patient) : '—'}</span></div>
      <div class="detail-creneau-ligne"><span>Professionnel</span><span>${employe ? nomComplet(employe) : '—'}</span></div>
      <div class="detail-creneau-ligne"><span>Métier</span><span>${labelRole(creneau.role)}</span></div>
      <div class="detail-creneau-ligne"><span>Date</span><span>${formatDateCourte(creneau.date)}</span></div>
      <div class="detail-creneau-ligne"><span>Horaire</span><span>${creneau.heure_debut} – ${creneau.heure_fin}</span></div>
      <div class="detail-creneau-ligne"><span>Statut</span><span>${creneau.statut}</span></div>
    `;
    ouvrirModale('modale-creneau-fond');
  }

  function ouvrirModalePatient(patientId = null) {
    const patient = patientId ? state.patients.find(p => p.id === patientId) : null;
    $('modale-patient-titre').textContent = patient ? 'Modifier le patient' : 'Nouveau patient';
    $('patient-id').value = patient?.id || '';
    $('patient-prenom').value = patient?.prenom || '';
    $('patient-nom').value = patient?.nom || '';
    $('patient-naissance').value = patient?.date_naissance || '';
    afficherErreur('patient-erreur', null);
    renderBesoinsFormulaire(patient?.besoins || []);
    ouvrirModale('modale-patient-fond');
  }

  function renderBesoinsFormulaire(besoins) {
    const cont = $('liste-besoins-form');
    const lignes = besoins.length ? besoins : [{ role: '', seances_par_semaine: 1, priorite: 5 }];
    cont.innerHTML = lignes.map((b, i) => ligneBesoin(b, i)).join('');
    cont.querySelectorAll('[data-supprimer-besoin]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (cont.querySelectorAll('.ligne-besoin').length > 1) btn.closest('.ligne-besoin').remove();
      });
    });
  }

  function ligneBesoin(b, index) {
    const options = Object.entries(state.roles).map(([code, info]) =>
      `<option value="${code}" ${b.role === code ? 'selected' : ''}>${info.label}</option>`
    ).join('');
    return `
      <div class="ligne-besoin">
        <select data-champ="role" required>
          <option value="">Métier…</option>${options}
        </select>
        <input type="number" min="1" max="10" value="${b.seances_par_semaine || 1}" data-champ="seances" placeholder="Séances/sem">
        <input type="number" min="1" max="9" value="${b.priorite || 5}" data-champ="priorite" placeholder="Priorité">
        <button type="button" class="ligne-besoin-supprimer" data-supprimer-besoin title="Supprimer">×</button>
      </div>
    `;
  }

  function lireBesoinsFormulaire() {
    return [...$('liste-besoins-form').querySelectorAll('.ligne-besoin')].map(ligne => ({
      role: ligne.querySelector('[data-champ="role"]').value,
      seances_par_semaine: Number(ligne.querySelector('[data-champ="seances"]').value),
      priorite: Number(ligne.querySelector('[data-champ="priorite"]').value)
    })).filter(b => b.role);
  }

  function ouvrirModaleEmploye() {
    $('form-employe').reset();
    afficherErreur('employe-erreur', null);
    const select = $('employe-role');
    select.innerHTML = Object.entries(state.roles).map(([code, info]) =>
      `<option value="${code}">${info.label}</option>`
    ).join('');
    ouvrirModale('modale-employe-fond');
  }

  function afficherApp() {
    $('ecran-login').hidden = true;
    $('app').hidden = false;
    $('profil-nom').textContent = nomComplet(state.utilisateur);
    $('profil-role').textContent = labelRole(state.utilisateur.role);
    $('profil-avatar').textContent = initiales(state.utilisateur);
  }

  function afficherLogin() {
    $('ecran-login').hidden = false;
    $('app').hidden = true;
  }

  async function rafraichirPatients() {
    state.patients = await API.getPatients();
    if (state.patientAgendaId && !state.patients.find(p => p.id === state.patientAgendaId)) {
      state.patientAgendaId = null;
    }
    const patient = state.patients.find(p => p.id === state.patientAgendaId);
    const input = $('selecteur-patient-agenda');
    if (input && patient) input.value = nomComplet(patient);
  }

  async function chargerDonnees() {
    const [employes, referentiel, patients] = await Promise.all([
      API.getEmployes(),
      API.getReferentielRoles(),
      API.getPatients()
    ]);
    state.employes = employes;
    state.patients = patients;
    state.roles = referentiel.roles;
    state.jours = referentiel.jours;

    const filtreRole = $('filtre-role-global');
    const valeurRole = filtreRole?.value || '';
    if (filtreRole) {
      filtreRole.innerHTML = '<option value="">Tous les métiers</option>' +
        Object.entries(state.roles).map(([code, info]) =>
          `<option value="${code}">${info.label}</option>`
        ).join('');
      filtreRole.value = valeurRole;
    }
  }

  function activerVue(nomVue) {
    document.querySelectorAll('.vue').forEach(v => { v.hidden = v.dataset.vue !== nomVue; });
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('is-active', n.dataset.vue === nomVue);
    });

    const actions = {
      'mon-espace': renderMonEspace,
      'agenda-global': renderAgendaGlobal,
      'agenda-patient': preparerAgendaPatient,
      'patients': renderListePatients,
      'equipe': renderListeEquipe
    };
    actions[nomVue]?.();
  }

  async function initSession() {
    state.semaineLundi = lundiDe();
    await chargerDonnees();
    await rafraichirPatients();
    afficherApp();
    activerVue('mon-espace');
  }

  async function handleLogin(e) {
    e.preventDefault();
    const btn = $('btn-login');
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    afficherErreur('login-erreur', null);
    btn.disabled = true;

    try {
      const { token, employe } = await API.login(email, password);
      API.setToken(token);
      state.utilisateur = employe;
      await initSession();
    } catch (err) {
      afficherErreur('login-erreur', err.message);
    } finally {
      btn.disabled = false;
    }
  }

  function initEvenements() {
    $('form-login').addEventListener('submit', handleLogin);

    $('btn-logout').addEventListener('click', () => {
      API.setToken(null);
      state.utilisateur = null;
      afficherLogin();
    });

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => activerVue(btn.dataset.vue));
    });

    $('btn-export-ics')?.addEventListener('click', ouvrirModaleSync);
    $('btn-generer-sync-url')?.addEventListener('click', genererSyncUrl);
    $('btn-revoquer-sync')?.addEventListener('click', revoquerSyncUrl);
    $('btn-telecharger-ics')?.addEventListener('click', telechargerAgendaIcs);
    $('btn-copier-sync-url')?.addEventListener('click', async () => {
      const url = $('sync-url').value;
      if (!url || url.includes('••••')) {
        toast('Générez un nouveau lien pour obtenir l\'URL complète.', 'erreur');
        return;
      }
      await copierDansPressePapier(url);
      toast('URL copiée.');
    });
    $('btn-copier-sync-url-nouvelle')?.addEventListener('click', async () => {
      await copierDansPressePapier($('sync-url-nouvelle-input').value);
      toast('URL copiée. Collez-la dans votre application de calendrier.');
    });

    initComboboxPatientAgenda();
    initComboboxProAgendaGlobal();

    $('filtre-role-global').addEventListener('change', () => {
      preparerFiltreProPourRole($('filtre-role-global').value);
      renderAgendaGlobal();
    });

    document.querySelectorAll('#filtre-statut-patient .segmented-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#filtre-statut-patient .segmented-item').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        renderListePatients();
      });
    });

    $('recherche-patient')?.addEventListener('input', renderListePatients);

    $('btn-nouveau-patient').addEventListener('click', () => ouvrirModalePatient());
    $('btn-ajouter-besoin').addEventListener('click', () => {
      $('liste-besoins-form').insertAdjacentHTML('beforeend', ligneBesoin({}, 0));
    });

    $('btn-enregistrer-patient').addEventListener('click', async () => {
      const id = $('patient-id').value;
      const data = {
        nom: $('patient-nom').value.trim(),
        prenom: $('patient-prenom').value.trim(),
        date_naissance: $('patient-naissance').value || null
      };
      const besoins = lireBesoinsFormulaire();

      try {
        if (id) {
          await API.updatePatient(id, data);
          await API.saveBesoins(id, besoins);
        } else {
          await API.createPatient({ ...data, besoins });
        }
        await rafraichirPatients();
        fermerModale('modale-patient-fond');
        renderListePatients();
        toast('Patient enregistré.');
      } catch (err) {
        afficherErreur('patient-erreur', err.message);
      }
    });

    $('btn-nouvel-employe').addEventListener('click', ouvrirModaleEmploye);
    $('btn-enregistrer-employe').addEventListener('click', async () => {
      try {
        await API.createEmploye({
          nom: $('employe-nom').value.trim(),
          prenom: $('employe-prenom').value.trim(),
          email: $('employe-email').value.trim(),
          mot_de_passe: $('employe-password').value,
          role: $('employe-role').value
        });
        state.employes = await API.getEmployes();
        fermerModale('modale-employe-fond');
        renderListeEquipe();
        toast('Employé créé.');
      } catch (err) {
        afficherErreur('employe-erreur', err.message);
      }
    });

    $('btn-enregistrer-horaires').addEventListener('click', async () => {
      const dispos = lireDisponibilitesFormulaire();
      for (const d of dispos) {
        const erreur = validerPlageHoraire(d.heure_debut, d.heure_fin);
        if (erreur) {
          toast(erreur, 'erreur');
          return;
        }
      }
      try {
        await API.saveDisponibilites(state.utilisateur.id, dispos);
        const conf = $('confirmation-horaires');
        conf.hidden = false;
        setTimeout(() => { conf.hidden = true; }, 2500);
        toast('Horaires enregistrés.');
      } catch (err) {
        toast(err.message, 'erreur');
      }
    });

    $('btn-lancer-generation').addEventListener('click', async () => {
      const btn = $('btn-lancer-generation');
      const spinner = $('spinner-generation');
      const texte = btn.querySelector('.btn-texte-generation');
      btn.disabled = true;
      if (spinner) spinner.hidden = false;
      if (texte) texte.textContent = 'Génération…';

      try {
        const resultat = await API.genererPlanning(state.semaineLundi);
        toast(resultat.message);
        if (resultat.conflits?.length) {
          toast(`${resultat.conflits.length} séance(s) non planifiée(s)`, 'erreur');
        }
        await renderMonAgenda();
      } catch (err) {
        toast(err.message, 'erreur');
      } finally {
        btn.disabled = false;
        if (spinner) spinner.hidden = true;
        if (texte) texte.textContent = 'Générer mon agenda';
      }
    });

    document.querySelectorAll('[data-espace-onglet]').forEach(btn => {
      btn.addEventListener('click', () => activerEspaceOnglet(btn.dataset.espaceOnglet));
    });

    $('select-absence-employe')?.addEventListener('change', e => {
      state.espaceEmployeId = e.target.value;
      if (state.espaceOnglet === 'absences') renderAbsences();
    });

    $('absence-journee-entiere')?.addEventListener('change', e => {
      $('absence-horaires-partiels').hidden = e.target.checked;
    });

    $('form-absence')?.addEventListener('submit', async e => {
      e.preventDefault();
      const journeeEntiere = $('absence-journee-entiere').checked;
      const data = {
        employe_id: employeAbsenceId(),
        type: $('absence-type').value,
        date_debut: $('absence-date-debut').value,
        date_fin: $('absence-date-fin').value,
        journee_entiere: journeeEntiere,
        commentaire: $('absence-commentaire').value.trim()
      };
      if (!journeeEntiere) {
        data.heure_debut = $('absence-heure-debut').value;
        data.heure_fin = $('absence-heure-fin').value;
      }

      try {
        await API.createAbsence(data);
        $('form-absence').reset();
        $('absence-journee-entiere').checked = true;
        $('absence-horaires-partiels').hidden = true;
        toast('Absence enregistrée.');
        await renderAbsences();
        if (state.espaceOnglet === 'agenda') await renderMonAgenda();
      } catch (err) {
        toast(err.message, 'erreur');
      }
    });

    $('btn-annuler-creneau').addEventListener('click', async () => {
      if (!state.creneauSelectionne) return;
      await API.annulerCreneau(state.creneauSelectionne.id);
      fermerModale('modale-creneau-fond');
      toast('Rendez-vous annulé.');
      activerVue(document.querySelector('.nav-item.is-active')?.dataset.vue || 'mon-espace');
    });

    document.querySelectorAll('[data-fermer-modale]').forEach(btn => {
      btn.addEventListener('click', () => fermerModale(btn.dataset.fermerModale));
    });
  }

  async function demarrer() {
    initEvenements();
    if (!API.getToken()) {
      afficherLogin();
      return;
    }
    try {
      const { utilisateur } = await API.me();
      state.utilisateur = utilisateur;
      await initSession();
    } catch {
      API.setToken(null);
      afficherLogin();
    }
  }

  document.addEventListener('DOMContentLoaded', demarrer);
})();
