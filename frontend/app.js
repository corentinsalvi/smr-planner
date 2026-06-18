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
    agendaGlobalEmployeId: null
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
    const heures = new Set(CONFIG.HEURES_AGENDA);
    creneaux.forEach(c => {
      if (c.statut !== 'ANNULE' && c.heure_debut) heures.add(c.heure_debut);
    });
    return [...heures].sort((a, b) => minutesDepuis(a) - minutesDepuis(b));
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
          : options.modePro ? ' creneau-carte--pro-global' : '';

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
          corpsCarte = `
            <span class="creneau-pastille" style="background:${couleur}"></span>
            <span class="creneau-titre">${titre}</span>
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
          <div class="agenda-global-vide-icone" aria-hidden="true">📅</div>
          <h3 class="agenda-global-vide-titre">Aucun rendez-vous cette semaine</h3>
          <p class="agenda-global-vide-texte">Ce professionnel n'a pas de séance planifiée sur la période affichée.</p>
        `;
        return;
      }

      vide.innerHTML = `
        <div class="agenda-global-vide-icone" aria-hidden="true">📅</div>
        <h3 class="agenda-global-vide-titre">Aucun rendez-vous cette semaine</h3>
        <p class="agenda-global-vide-texte">Générez le planning automatiquement ou planifiez des séances manuellement.</p>
        <button type="button" class="bouton bouton-principal" id="btn-generer-depuis-vide">Générer la semaine</button>
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

  async function renderAgendaPatient() {
    renderNavigationSemaine('nav-semaine-patient', renderAgendaPatient);

    const patientId = state.patientAgendaId;
    const vide = $('agenda-patient-vide');
    const contenu = $('agenda-patient-contenu');
    const resume = $('fiche-patient-resume');
    const grille = $('grille-patient');
    const sansRdv = $('agenda-patient-sans-rdv');

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
    `;

    if (creneaux.length === 0) {
      grille.hidden = true;
      sansRdv.hidden = false;
      sansRdv.innerHTML = `
        <div class="agenda-patient-vide-icone" aria-hidden="true">📅</div>
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
      'mon-agenda': renderMonAgenda,
      'agenda-global': renderAgendaGlobal,
      'agenda-patient': preparerAgendaPatient,
      'patients': renderListePatients,
      'horaires': async () => {
        state.disponibilitesCourantes = await API.getDisponibilites(state.utilisateur.id);
        renderEditeurHoraires();
      },
      'equipe': renderListeEquipe
    };
    actions[nomVue]?.();
  }

  async function initSession() {
    state.semaineLundi = lundiDe();
    await chargerDonnees();
    await rafraichirPatients();
    afficherApp();
    activerVue('mon-agenda');
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

    $('agenda-global-vide')?.addEventListener('click', e => {
      if (e.target.closest('#btn-generer-depuis-vide')) {
        $('btn-lancer-generation').click();
      }
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
        await renderAgendaGlobal();
      } catch (err) {
        toast(err.message, 'erreur');
      } finally {
        btn.disabled = false;
        if (spinner) spinner.hidden = true;
        if (texte) texte.textContent = 'Générer la semaine';
      }
    });

    $('btn-annuler-creneau').addEventListener('click', async () => {
      if (!state.creneauSelectionne) return;
      await API.annulerCreneau(state.creneauSelectionne.id);
      fermerModale('modale-creneau-fond');
      toast('Rendez-vous annulé.');
      activerVue(document.querySelector('.nav-item.is-active')?.dataset.vue || 'mon-agenda');
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
