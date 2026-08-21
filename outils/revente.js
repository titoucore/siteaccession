(function(){
  // ─── ÉTAT GLOBAL ───
  let indicesIRL = [];
  let indicesICC = [];
  let indicesSourceIRL = 'aucune'; // 'auto' | 'manuel' | 'aucune'
  let indicesSourceICC = 'aucune';
  let indicesAutoUpdatedAt = null; // ISO, horodatage de la dernière synchro auto (direct INSEE ou data/indices.json)
  let indicesLiveOK = null; // true = valeurs obtenues en direct depuis l'INSEE à l'instant, false = repli sur data/indices.json, null = pas encore su

  // Séries INSEE utilisées (mêmes idbank que scripts/update-indices.mjs).
  var SERIES_IRL = '001515333'; // Indice de référence des loyers
  var SERIES_ICC = '000008630'; // Indice du coût de la construction

  // ─── PERSISTANCE ───
  // Seul un import manuel (CSV) est écrit dans localStorage : les valeurs automatiques
  // (data/indices.json) sont re-chargées à chaque ouverture, jamais dupliquées ici, pour ne
  // jamais figer une valeur qui deviendrait périmée.
  function sauvegarderIndices() {
    try {
      localStorage.setItem('o64-irl', JSON.stringify(indicesIRL));
      localStorage.setItem('o64-icc', JSON.stringify(indicesICC));
    } catch(e) {}
  }

  // Interroge directement le service public SDMX de l'INSEE depuis le navigateur (même
  // service que scripts/update-indices.mjs, mais appelé ici en direct, sans passer par
  // GitHub Actions). Ne fonctionne que si l'INSEE autorise les requêtes cross-origin
  // (CORS) depuis un navigateur — sinon le fetch échoue et chargerIndices() se replie sur
  // data/indices.json. Un délai maximum de 8 s évite de bloquer l'affichage si l'INSEE est
  // lent ou injoignable.
  function fetchLiveINSEE(idbank) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, 8000) : null;
    return fetch('https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/' + idbank, {
      headers: { Accept: 'application/xml' },
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function(res) {
      if (!res.ok) throw new Error('INSEE a répondu ' + res.status + ' pour la série ' + idbank);
      return res.text();
    }).then(function(xml) {
      var data = parseObservationsSDMX(xml);
      if (!data.length) throw new Error('Aucune observation exploitable pour la série ' + idbank);
      return data;
    }).finally(function() {
      if (timer) clearTimeout(timer);
    });
  }

  // Parseur SDMX-ML « structure specific » : identique à celui de scripts/update-indices.mjs
  // (regex sur les balises <Obs .../> à plat), pour ne pas dépendre d'une librairie XML.
  function parseObservationsSDMX(xml) {
    var obsTagRegex = /<Obs\b([^>]*)\/>/g;
    var attrRegex = /(\w+)="([^"]*)"/g;
    var out = [];
    var obsMatch;
    while ((obsMatch = obsTagRegex.exec(xml))) {
      var attrs = {};
      var attrMatch;
      attrRegex.lastIndex = 0;
      while ((attrMatch = attrRegex.exec(obsMatch[1]))) {
        attrs[attrMatch[1]] = attrMatch[2];
      }
      var periode = attrs.TIME_PERIOD;
      var valeur = parseFloat(attrs.OBS_VALUE);
      var date = normalizeDateSDMX(attrs.DATE_JO);
      if (!periode || isNaN(valeur) || !date) continue;
      out.push({ date: date, periode: periode, valeur: valeur });
    }
    out.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  function normalizeDateSDMX(raw) {
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    var m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return m[3] + '-' + m[2] + '-' + m[1];
    return null;
  }

  // Charge les indices avec la priorité suivante :
  //   1. Un import manuel encore en mémoire (localStorage) — reste prioritaire, pour pouvoir
  //      forcer une valeur ponctuellement (litige, correction, valeur non encore publiée...).
  //   2. À défaut, une interrogation directe de l'INSEE à l'instant (fetchLiveINSEE) — c'est
  //      la source normale : à chaque ouverture de l'outil, la page va chercher elle-même les
  //      dernières valeurs, sans action de l'utilisateur.
  //   3. Si le direct échoue (pas de connexion, CORS refusé par l'INSEE...), repli silencieux
  //      sur data/indices.json, le fichier partagé mis à jour mensuellement par
  //      .github/workflows/update-indices.yml — un filet de sécurité, pas la source normale.
  // Asynchrone à cause du fetch — les écrans dépendant des indices se rafraîchissent une
  // fois la réponse arrivée (voir l'appel à majIndicesDepuisDates() en fin de fonction).
  async function chargerIndices() {
    try {
      const irl = localStorage.getItem('o64-irl');
      const icc = localStorage.getItem('o64-icc');
      if(irl) indicesIRL = JSON.parse(irl);
      if(icc) indicesICC = JSON.parse(icc);
    } catch(e) {}

    indicesSourceIRL = indicesIRL.length ? 'manuel' : 'aucune';
    indicesSourceICC = indicesICC.length ? 'manuel' : 'aucune';

    if (indicesSourceIRL !== 'manuel' || indicesSourceICC !== 'manuel') {
      try {
        const [irlLive, iccLive] = await Promise.all([
          fetchLiveINSEE(SERIES_IRL),
          fetchLiveINSEE(SERIES_ICC),
        ]);
        if (indicesSourceIRL !== 'manuel' && irlLive.length) { indicesIRL = irlLive; indicesSourceIRL = 'auto'; }
        if (indicesSourceICC !== 'manuel' && iccLive.length) { indicesICC = iccLive; indicesSourceICC = 'auto'; }
        indicesAutoUpdatedAt = new Date().toISOString();
        indicesLiveOK = true;
      } catch(e) {
        indicesLiveOK = false;
        try {
          const res = await fetch('data/indices.json', { cache: 'no-store' });
          if (res.ok) {
            const json = await res.json();
            if (indicesSourceIRL !== 'manuel' && Array.isArray(json.irl) && json.irl.length) {
              indicesIRL = json.irl;
              indicesSourceIRL = 'auto';
            }
            if (indicesSourceICC !== 'manuel' && Array.isArray(json.icc) && json.icc.length) {
              indicesICC = json.icc;
              indicesSourceICC = 'auto';
            }
            indicesAutoUpdatedAt = json.updatedAt || null;
          }
        } catch(e2) {
          // Ni le direct ni le fichier de secours ne sont disponibles : on reste avec des
          // tableaux vides, l'import manuel (CSV) et le message d'état expliquent la
          // situation à l'utilisateur.
        }
      }
    }

    mettreAJourCompteur();
    mettreAJourDatesMaj();
    majIndicesDepuisDates();
  }

  // ─── PARSER CSV INSEE ───
  // Format réel : 4 colonnes séparées par ;
  // Col 0 = Période (2025-T4), Col 1 = Indice, Col 2 = Code (A), Col 3 = Date parution JO (dd/mm/yyyy)
  function parserCSVInsee(texte, typeAttendu) {
    var lignes = texte.replace(/^\uFEFF/, '').split('\n');
    var data = [];
    for (var i = 0; i < lignes.length; i++) {
      var ligne = lignes[i].replace(/\r$/, '').trim();
      if (!ligne) continue;
      var cols = ligne.split(';').map(function(c) { return c.replace(/^"|"$/g, '').trim(); });
      if (cols.length < 4) continue;
      var periode = cols[0];
      var indiceBrut = cols[1];
      var dateJO = cols[3];
      // Période : ex "2025-T4"
      if (!/^\d{4}-T[1-4]$/.test(periode)) continue;
      // Date JO : ex "26/03/2026"
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateJO)) continue;
      var valeur = parseFloat(indiceBrut.replace(',', '.'));
      if (isNaN(valeur)) continue;
      var parts = dateJO.split('/');
      var date = parts[2] + '-' + parts[1] + '-' + parts[0];
      data.push({ date: date, periode: periode, valeur: valeur });
    }
    data.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
    return { type: typeAttendu, data: data };
  }

  // ─── CHERCHER L'INDICE APPLICABLE ───
  function trouverIndice(dateCible, tableau) {
    if (!dateCible || !tableau || !tableau.length) return null;
    var cible = dateCible;
    var candidat = null;
    for (var i = 0; i < tableau.length; i++) {
      if (tableau[i].date <= cible) candidat = tableau[i];
    }
    return candidat;
  }

  // ─── BLOC COHÉRENCE ───
  function formatDateFR(isoDate) {
    if (!isoDate) return '—';
    var p = isoDate.split('-');
    if (p.length < 3) return isoDate;
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function mettreAJourBlocCoherence(targetId, label, item, dateSaisie) {
    var el = document.getElementById(targetId);
    if (!el) return;
    if (item) {
      el.innerHTML = '<strong>' + label + '</strong> : indice <strong>' + item.valeur + '</strong>'
        + ' &middot; p&eacute;riode <strong>' + item.periode + '</strong>'
        + ' &middot; JO du <strong>' + formatDateFR(item.date) + '</strong>'
        + (dateSaisie ? ' &middot; date saisie\u00a0: <strong>' + formatDateFR(dateSaisie) + '</strong>' : '');
    } else if (dateSaisie) {
      el.innerHTML = '<strong>' + label + '</strong> : aucun indice publi&eacute; au JO trouv&eacute; pour le <strong>' + formatDateFR(dateSaisie) + '</strong>.';
    } else {
      el.textContent = 'Aucune valeur retenue pour l\'instant.';
    }
  }

  // ─── MAJ INDICES DEPUIS DATES ───
  function majIndicesDepuisDates() {
    var type = document.getElementById('type_indice').value;
    var table = (type === 'irl') ? indicesIRL : indicesICC;
    var dateActe = document.getElementById('date_acte').value;
    var dateRevente = document.getElementById('date_revente').value;

    var iActe = trouverIndice(dateActe, table);
    var statusInit = document.getElementById('status_initial');
    if (iActe) {
      document.getElementById('indice_initial').value = iActe.valeur;
      statusInit.textContent = iActe.periode;
      statusInit.className = 'indice-status found';
    } else if (dateActe && table.length > 0) {
      document.getElementById('indice_initial').value = '';
      statusInit.textContent = 'Non trouv\u00e9';
      statusInit.className = 'indice-status notfound';
    } else {
      statusInit.textContent = '\u2014';
      statusInit.className = 'indice-status';
    }
    mettreAJourBlocCoherence('coherence_initial', 'Indice retenu \u00e0 l\'acquisition', iActe, dateActe);

    var iRev = trouverIndice(dateRevente, table);
    var statusRev = document.getElementById('status_revente');
    if (iRev) {
      document.getElementById('indice_revente').value = iRev.valeur;
      statusRev.textContent = iRev.periode;
      statusRev.className = 'indice-status found';
    } else if (dateRevente && table.length > 0) {
      document.getElementById('indice_revente').value = '';
      statusRev.textContent = 'Non trouv\u00e9';
      statusRev.className = 'indice-status notfound';
    } else {
      statusRev.textContent = '\u2014';
      statusRev.className = 'indice-status';
    }
    mettreAJourBlocCoherence('coherence_revente', 'Indice retenu \u00e0 la revente', iRev, dateRevente);
    recalculer();
  }

  // ─── IMPORT CSV ───
  function importerFichierIndice(file, typeAttendu) {
    if (!file) return;
    var statusId = typeAttendu === 'IRL' ? 'irl-status' : 'icc-status';
    afficherStatut(statusId, 'Lecture du fichier en cours\u2026', '');
    var reader = new FileReader();
    reader.onload = function(e) {
      var texte = e.target.result;
      var result = parserCSVInsee(texte, typeAttendu);
      if (result.data.length === 0) {
        afficherStatut(statusId, '\u26a0\ufe0f Aucune ligne exploitable dans ce CSV. V\u00e9rifiez le format : s\u00e9parateur ; et colonnes A=p\u00e9riode, B=indice, D=date JO.', 'update-err');
        return;
      }
      if (typeAttendu === 'IRL') {
        indicesIRL = result.data;
        indicesSourceIRL = 'manuel';
        try {
          localStorage.setItem('o64-irl', JSON.stringify(indicesIRL));
          localStorage.setItem('o64-irl-updated-at', new Date().toISOString());
          localStorage.setItem('o64-irl-filename', file.name);
        } catch(e) {}
        afficherStatut('irl-status', '\u2705 IRL import\u00e9\u00a0: ' + result.data.length + ' valeurs', 'update-ok');
      } else {
        indicesICC = result.data;
        indicesSourceICC = 'manuel';
        try {
          localStorage.setItem('o64-icc', JSON.stringify(indicesICC));
          localStorage.setItem('o64-icc-updated-at', new Date().toISOString());
          localStorage.setItem('o64-icc-filename', file.name);
        } catch(e) {}
        afficherStatut('icc-status', '\u2705 ICC import\u00e9\u00a0: ' + result.data.length + ' valeurs', 'update-ok');
      }
      mettreAJourDatesMaj();
      mettreAJourCompteur();
      majIndicesDepuisDates();
    };
    reader.onerror = function() {
      afficherStatut(statusId, '\u26a0\ufe0f Le navigateur n\'a pas pu lire le fichier.', 'update-err');
    };
    reader.readAsText(file, 'utf-8');
  }

  // ─── BOUTONS IMPORT ───
  document.getElementById('btnImportIRL').addEventListener('click', function() {
    document.getElementById('fileIRL').click();
  });
  document.getElementById('btnImportICC').addEventListener('click', function() {
    document.getElementById('fileICC').click();
  });
  document.getElementById('fileIRL').addEventListener('change', function() {
    if (this.files && this.files[0]) {
      afficherStatut('irl-status', 'Fichier s\u00e9lectionn\u00e9\u00a0: ' + this.files[0].name, '');
      importerFichierIndice(this.files[0], 'IRL');
    }
    this.value = '';
  });
  document.getElementById('fileICC').addEventListener('change', function() {
    if (this.files && this.files[0]) {
      afficherStatut('icc-status', 'Fichier s\u00e9lectionn\u00e9\u00a0: ' + this.files[0].name, '');
      importerFichierIndice(this.files[0], 'ICC');
    }
    this.value = '';
  });

  // ─── EFFACER / REVENIR À LA MISE À JOUR AUTOMATIQUE ───
  // Supprime uniquement l'éventuel import manuel (CSV) : l'outil retombe alors sur les
  // valeurs automatiques (data/indices.json) au lieu de rester vide, puisque ce sont deux
  // couches distinctes désormais (voir chargerIndices).
  document.getElementById('btnEffacerIndices').addEventListener('click', function() {
    indicesIRL = [];
    indicesICC = [];
    try {
      ['o64-irl','o64-icc','o64-irl-updated-at','o64-icc-updated-at','o64-irl-filename','o64-icc-filename'].forEach(function(k){ localStorage.removeItem(k); });
    } catch(e) {}
    afficherStatut('irl-status', 'Import manuel effac\u00e9 \u2014 retour \u00e0 la mise \u00e0 jour automatique.', '');
    afficherStatut('icc-status', 'Import manuel effac\u00e9 \u2014 retour \u00e0 la mise \u00e0 jour automatique.', '');
    chargerIndices();
  });

  // ─── COMPTEUR ET DATES ───
  function mettreAJourCompteur() {
    var total = indicesIRL.length + indicesICC.length;
    document.getElementById('indice-count').textContent = total + ' valeur(s)';
    var preview = document.getElementById('indice-preview');
    if (total === 0) {
      preview.innerHTML = '<em>Aucun indice charg\u00e9 pour l\'instant (synchronisation automatique en attente, ou importez un fichier CSV en secours).</em>';
      return;
    }
    var all = indicesIRL.map(function(i){ return Object.assign({}, i, {type:'IRL'}); })
      .concat(indicesICC.map(function(i){ return Object.assign({}, i, {type:'ICC'}); }))
      .sort(function(a,b){ return a.date < b.date ? 1 : -1; })
      .slice(0, 15);
    var html = '<table style="width:100%;border-collapse:collapse;"><tr style="font-weight:700;border-bottom:1px solid var(--color-divider)"><td>Type</td><td>P\u00e9riode</td><td>JO</td><td>Valeur</td></tr>';
    all.forEach(function(i) {
      html += '<tr style="border-bottom:1px solid var(--color-divider)">'
        + '<td>' + i.type + '</td>'
        + '<td>' + i.periode + '</td>'
        + '<td>' + formatDateFR(i.date) + '</td>'
        + '<td style="font-weight:700;color:var(--color-primary)">' + i.valeur + '</td></tr>';
    });
    html += '</table>';
    preview.innerHTML = html;
  }

  // Un indice est publié chaque trimestre : au-delà de ~120 jours sans synchro, on considère
  // la donnée potentiellement périmée et on le signale plutôt que de laisser croire à tort
  // que tout est à jour.
  function estPerime(iso) {
    if (!iso) return false;
    var jours = (Date.now() - new Date(iso).getTime()) / 86400000;
    return jours > 120;
  }

  function texteStatutIndice(source, updatedAtISO, storageKeyDate, storageKeyName) {
    if (source === 'manuel') {
      var d = localStorage.getItem(storageKeyDate);
      var n = localStorage.getItem(storageKeyName);
      return '\u26a0\ufe0f Valeur import\u00e9e manuellement le '
        + (d ? new Date(d).toLocaleString('fr-FR') : '?')
        + (n ? ' \u00b7 ' + n : '')
        + ' \u2014 remplace la mise \u00e0 jour automatique.';
    }
    if (source === 'auto' && updatedAtISO) {
      var perime = estPerime(updatedAtISO);
      return (perime ? '\u26a0\ufe0f ' : '\u2705 ') + 'Mise \u00e0 jour automatique (INSEE) du '
        + new Date(updatedAtISO).toLocaleString('fr-FR')
        + (perime ? ' \u2014 plus de 4 mois, v\u00e9rifiez que la synchronisation automatique fonctionne toujours.' : '.');
    }
    return 'Aucune valeur automatique disponible pour l\u2019instant \u2014 importez un fichier CSV INSEE en attendant, ou lancez la mise \u00e0 jour depuis l\u2019onglet Actions du d\u00e9p\u00f4t GitHub.';
  }

  function mettreAJourDatesMaj() {
    try {
      document.getElementById('irl-date').textContent =
        texteStatutIndice(indicesSourceIRL, indicesAutoUpdatedAt, 'o64-irl-updated-at', 'o64-irl-filename');
      document.getElementById('icc-date').textContent =
        texteStatutIndice(indicesSourceICC, indicesAutoUpdatedAt, 'o64-icc-updated-at', 'o64-icc-filename');
    } catch(e) {}
    try {
      var el = document.getElementById('sync-global-date');
      if (el) {
        if (indicesAutoUpdatedAt && indicesLiveOK) {
          el.textContent = '✅ Connecté en direct à l’INSEE — valeurs à jour au '
            + new Date(indicesAutoUpdatedAt).toLocaleString('fr-FR') + '.';
        } else if (indicesAutoUpdatedAt) {
          var perime = estPerime(indicesAutoUpdatedAt);
          el.textContent = '🔄 Connexion directe à l’INSEE indisponible — valeurs de secours (synchronisation mensuelle) du '
            + new Date(indicesAutoUpdatedAt).toLocaleString('fr-FR')
            + (perime ? '. ⚠️ Plus de 4 mois : vérifiez que l’Action GitHub tourne toujours.' : '.');
        } else {
          el.textContent = 'Aucune valeur disponible pour l’instant (ni en direct, ni en secours).';
        }
      }
    } catch(e) {}
  }

  // ─── STATUTS ───
  function afficherStatut(id, msg, cls) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = 'update-status ' + cls;
    if (cls !== 'update-err') {
      setTimeout(function(){ if(el.textContent === msg){ el.textContent = ''; el.className = 'update-status'; } }, 8000);
    }
  }

  // ─── CALCULATRICE FACTURES ───
  function recalculerFactures() {
    var inputs = document.querySelectorAll('.facture-input');
    var total = 0;
    inputs.forEach(function(i){ total += parseFloat(i.value) || 0; });
    document.getElementById('factures_total').textContent = total ? fmt(total) + ' \u20ac' : '\u2014 \u20ac';
    recalculer();
  }

  var tbodyFactures = document.querySelector('#table_factures tbody');
  var nbFactures = 1;

  function supprimerLigne(btn) {
    var tr = btn.closest('tr');
    var rows = tbodyFactures.querySelectorAll('tr');
    if (rows.length <= 1) {
      // Vider la ligne plutôt que la supprimer si c'est la dernière
      tr.querySelector('.facture-libelle').value = '';
      tr.querySelector('.facture-input').value = '';
    } else {
      tr.remove();
    }
    recalculerFactures();
  }

  document.getElementById('ajouterFacture').addEventListener('click', function() {
    nbFactures++;
    var tr = document.createElement('tr');
    tr.innerHTML = '<td><input type="text" class="facture-libelle" placeholder="Facture ' + nbFactures + '" style="width:100%;background:var(--color-surface-offset);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-2);font-size:var(--text-xs);font-family:var(--font-body);color:var(--color-text);" /></td>'
      + '<td><input class="facture-input" type="number" min="0" step="10" placeholder="0" /></td>'
      + '<td><button type="button" class="facture-del-btn" title="Supprimer cette ligne" onclick="supprimerLigne(this)">&#x2715;</button></td>';
    tbodyFactures.appendChild(tr);
    tr.querySelector('.facture-input').addEventListener('input', recalculerFactures);
  });

  document.getElementById('supprimerFacture').addEventListener('click', function() {
    var rows = tbodyFactures.querySelectorAll('tr');
    if (rows.length > 1) { rows[rows.length - 1].remove(); recalculerFactures(); }
  });

  document.querySelectorAll('.facture-input').forEach(function(el){
    el.addEventListener('input', recalculerFactures);
  });

  // ─── FORMAT MONÉTAIRE ───
  function fmt(n) {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  // ─── CLAUSE ANTI-SPÉCULATIVE (PSLA / Accession directe : durée limitée ; BRS : toujours) ───
  // Ajoute des années civiles à une date ISO (YYYY-MM-DD), sans dépendre du fuseau du navigateur.
  function addYears(isoDate, years) {
    if (!isoDate) return null;
    var p = isoDate.split('-').map(Number);
    if (p.length < 3 || !p[0] || !p[1] || !p[2]) return null;
    var d = new Date(Date.UTC(p[0] + years, p[1] - 1, p[2]));
    return d.toISOString().slice(0, 10);
  }

  // Affiche/masque le champ de durée selon le dispositif, et détermine si la clause
  // anti-spéculative est encore active à la date de revente saisie (BRS = toujours active ;
  // PSLA / Accession directe = active jusqu'à la fin de la durée saisie/détectée).
  function evaluerClauseAntiSpeculative(dispositif, dateActe, dateRevente) {
    var champDuree = document.getElementById('field-duree-clause');
    var champBrs = document.getElementById('field-duree-clause-brs');
    var statusEl = document.getElementById('clause-status');
    var warnEl = document.getElementById('clause-expiree-warning');
    var warnDateEl = document.getElementById('clause-expiree-date');

    if (dispositif === 'brs') {
      if (champDuree) champDuree.style.display = 'none';
      if (champBrs) champBrs.style.display = '';
      if (warnEl) warnEl.style.display = 'none';
      return { active: true, fin: null };
    }

    if (champDuree) champDuree.style.display = '';
    if (champBrs) champBrs.style.display = 'none';

    var duree = parseFloat(document.getElementById('duree_clause_annees').value) || 0;
    var fin = (dateActe && duree > 0) ? addYears(dateActe, duree) : null;

    var active = null;
    if (fin && dateRevente) active = dateRevente <= fin;

    if (statusEl) {
      if (!duree) {
        statusEl.textContent = 'Renseignez la dur\u00e9e et la date de l\u2019acte pour v\u00e9rifier si la clause s\u2019applique encore.';
        statusEl.className = 'indice-status';
      } else if (!fin || !dateRevente) {
        statusEl.textContent = 'Fin de clause estim\u00e9e au ' + (fin ? formatDateFR(fin) : '\u2014') + ' \u2014 renseignez la date de revente pour confirmer.';
        statusEl.className = 'indice-status';
      } else if (active) {
        statusEl.textContent = 'Clause active jusqu\u2019au ' + formatDateFR(fin) + '.';
        statusEl.className = 'indice-status found';
      } else {
        statusEl.textContent = 'Clause expir\u00e9e depuis le ' + formatDateFR(fin) + '.';
        statusEl.className = 'indice-status notfound';
      }
    }
    if (warnEl) {
      warnEl.style.display = (active === false) ? '' : 'none';
      if (warnDateEl && fin) warnDateEl.textContent = formatDateFR(fin);
    }
    return { active: active, fin: fin };
  }

  // ─── CALCUL PRINCIPAL ───
  function recalculer() {
    var prixInitial = parseFloat(document.getElementById('prix_initial').value) || 0;
    var indiceInitial = parseFloat(document.getElementById('indice_initial').value) || 0;
    var indiceRevente = parseFloat(document.getElementById('indice_revente').value) || 0;
    var dispositif = document.getElementById('dispositif').value;
    var dateActe = document.getElementById('date_acte').value;
    var dateRevente = document.getElementById('date_revente').value;

    evaluerClauseAntiSpeculative(dispositif, dateActe, dateRevente);

    var totalFactures = 0;
    document.querySelectorAll('.facture-input').forEach(function(i){ totalFactures += parseFloat(i.value) || 0; });

    var coef = (indiceInitial > 0 && indiceRevente > 0) ? indiceRevente / indiceInitial : 0;
    document.getElementById('coef_indice').value = coef ? coef.toFixed(4) : '\u2014';

    var prixRevalorise = prixInitial * coef;
    var travauxRetenus = totalFactures;
    if (dispositif === 'brs' && prixInitial > 0) {
      travauxRetenus = Math.min(totalFactures, prixInitial * 0.10);
    }
    var sousTotal = prixRevalorise + travauxRetenus;

    document.getElementById('prix_plafond').textContent = sousTotal ? fmt(sousTotal) + ' \u20ac' : '\u2014 \u20ac';
    document.getElementById('detail_prix_initial').value = prixInitial ? fmt(prixInitial) + ' \u20ac' : '\u2014';
    document.getElementById('detail_coef').value = coef ? coef.toFixed(4) : '\u2014';
    document.getElementById('detail_revalorise').value = prixRevalorise ? fmt(prixRevalorise) + ' \u20ac' : '\u2014';
    document.getElementById('detail_factures').value = totalFactures ? fmt(totalFactures) + ' \u20ac' : '\u2014';
    document.getElementById('detail_travaux_retenus').value = travauxRetenus ? fmt(travauxRetenus) + ' \u20ac' : '\u2014';
    document.getElementById('detail_sous_total').value = sousTotal ? fmt(sousTotal) + ' \u20ac' : '\u2014';
  }

  // ─── ÉCOUTEURS ───
  ['dispositif','prix_initial','type_indice','indice_initial','indice_revente','duree_clause_annees'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.addEventListener('input', recalculer); el.addEventListener('change', recalculer); }
  });
  ['date_acte','date_revente','type_indice'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', majIndicesDepuisDates);
  });

  // ─── INIT ───
  chargerIndices();
  recalculer();



  // ══════════════════════════════════════════════════════
  // MODULE IMPORT ACTE — lecture PDF + détection clauses
  // ══════════════════════════════════════════════════════
  (function() {
    var PDFJS_URL    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    var pdfLoaded = false;
    var pendingData = null;

    // ── Helpers UI ────────────────────────────────────
    function setBar(msg, pct) {
      var bar = document.getElementById('import-bar');
      bar.classList.add('show');
      document.getElementById('import-bar-txt').textContent = msg;
      document.getElementById('import-bar-fill').style.width = pct + '%';
    }
    function hideBar() { document.getElementById('import-bar').classList.remove('show'); }
    function showErr(msg) {
      var el = document.getElementById('import-err');
      el.textContent = msg; el.classList.add('show'); hideBar();
    }
    function hideErr() { document.getElementById('import-err').classList.remove('show'); }
    function hideRes() { document.getElementById('import-res').classList.remove('show'); }

    // ── Chargement lazy de PDF.js ─────────────────────
    function ensurePdfJs(cb) {
      if (pdfLoaded) { cb(); return; }
      var s = document.createElement('script');
      s.src = PDFJS_URL;
      s.onload = function() {
        try {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        } catch(e) {}
        pdfLoaded = true; cb();
      };
      s.onerror = function() {
        showErr('Impossible de charger le moteur PDF. Vérifiez votre connexion internet.');
      };
      document.head.appendChild(s);
    }

    // ── Zone de dépôt ─────────────────────────────────
    var label = document.getElementById('import-label');
    var input = document.getElementById('import-input');

    // Drag & drop sur le label
    ['dragenter','dragover'].forEach(function(ev) {
      label.addEventListener(ev, function(e) {
        e.preventDefault(); e.stopPropagation();
        document.getElementById('card-import').classList.add('drag-active');
      });
    });
    ['dragleave','dragend'].forEach(function(ev) {
      label.addEventListener(ev, function() {
        document.getElementById('card-import').classList.remove('drag-active');
      });
    });
    label.addEventListener('drop', function(e) {
      e.preventDefault(); e.stopPropagation();
      document.getElementById('card-import').classList.remove('drag-active');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) processFile(files[0]);
    });

    // Sélection via input natif (label for → input, pas de .click() JS)
    input.addEventListener('change', function() {
      if (input.files && input.files[0]) processFile(input.files[0]);
    });

    // Bouton fermer résultat
    document.getElementById('import-res-close').addEventListener('click', function() {
      hideRes(); hideErr(); pendingData = null; input.value = '';
    });

    // Bouton pré-remplir
    document.getElementById('import-apply').addEventListener('click', function() {
      if (!pendingData) return;
      var d = pendingData;
      if (d.dispositif) {
        var s = document.getElementById('dispositif');
        if (s) { s.value = d.dispositif; s.dispatchEvent(new Event('change')); }
      }
      if (d.prix) {
        var inp = document.getElementById('prix_initial');
        if (inp) { inp.value = d.prix; inp.dispatchEvent(new Event('input')); }
      }
      if (d.date) {
        var di = document.getElementById('date_acte');
        if (di) { di.value = d.date; di.dispatchEvent(new Event('change')); }
      }
      if (d.duree_clause) {
        var dcNum = parseInt(d.duree_clause, 10);
        var dc = document.getElementById('duree_clause_annees');
        if (dc && !isNaN(dcNum)) { dc.value = dcNum; dc.dispatchEvent(new Event('input')); }
      }
      if (d.indice) {
        var ti = document.getElementById('type_indice');
        if (ti) {
          ti.value = d.indice.toLowerCase();
          ti.dispatchEvent(new Event('change'));
        }
        // Synchroniser aussi les statuts/champs visibles liés au type d'indice
        var ev = new Event('input');
        var evc = new Event('change');
        var ii = document.getElementById('indice_initial');
        var ir = document.getElementById('indice_revente');
        if (ii) ii.dispatchEvent(ev);
        if (ir) ir.dispatchEvent(ev);
        if (ti) ti.dispatchEvent(evc);
      }
      var btn = document.getElementById('import-apply');
      btn.textContent = '✓ Formulaire pré-rempli — complétez maintenant les indices';
      btn.style.background = 'var(--color-success)';
      setTimeout(function() {
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> Pré-remplir le simulateur avec ces données';
        btn.style.background = '';
      }, 3000);
      var firstCard = document.querySelector('.card:not(.card-import)');
      if (firstCard) firstCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ── Traitement du fichier ─────────────────────────
    function processFile(file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        showErr('Format non supporté. Veuillez choisir un fichier PDF.'); return;
      }
      hideErr(); hideRes();
      setBar('Chargement du moteur PDF…', 15);
      ensurePdfJs(function() {
        setBar('Lecture du fichier…', 30);
        var reader = new FileReader();
        reader.onload = function(e) {
          setBar('Extraction du texte…', 50);
          var data = new Uint8Array(e.target.result);
          window.pdfjsLib.getDocument({ data: data }).promise.then(function(pdf) {
            var total = pdf.numPages;
            var texts = new Array(total);
            var done = 0;
            for (var p = 1; p <= total; p++) {
              (function(pn) {
                pdf.getPage(pn).then(function(page) {
                  page.getTextContent().then(function(tc) {
                    texts[pn - 1] = tc.items.map(function(it) { return it.str; }).join(' ');
                    done++;
                    setBar('Page ' + pn + '/' + total + '…', 50 + Math.round(done / total * 40));
                    if (done === total) {
                      setBar('Analyse des clauses…', 95);
                      setTimeout(function() {
                        var full = texts.join('\n');
                        analyzeAndShow(full, texts[0] || '');
                        hideBar();
                      }, 100);
                    }
                  }).catch(function() {
                    done++; texts[pn - 1] = '';
                    if (done === total) { var full = texts.join('\n'); analyzeAndShow(full); hideBar(); }
                  });
                });
              })(p);
            }
          }).catch(function(err) {
            hideBar();
            showErr('Impossible de lire ce PDF. Il est peut-être scanné (image) ou protégé. Erreur : ' + (err.message || err));
          });
        };
        reader.onerror = function() { hideBar(); showErr('Erreur lors de la lecture du fichier.'); };
        reader.readAsArrayBuffer(file);
      });
    }

    // ── Analyse du texte ──────────────────────────────
    function analyzeAndShow(txt, page1txt) {
      var d = {};

      // 1. Dispositif
      if (/bail\s+r[ée]el\s+solidaire|\bBRS\b/i.test(txt)) d.dispositif = 'brs';
      else if (/\bPSLA\b|location[\s-]acc[eé]ssion/i.test(txt)) d.dispositif = 'psla';

      // 2. Prix d'accession — cherche le montant en chiffres entre parenthèses près de "prix d'accession"
      var zones = [];
      // Zone 1 : après "prix d'accession"
      var m1idx = txt.search(/prix\s+d['']acc[eé]ssion/i);
      if (m1idx >= 0) zones.push(txt.substring(m1idx, m1idx + 400));
      // Zone 2 : avant "prix d'accession"
      if (m1idx >= 0) zones.push(txt.substring(Math.max(0, m1idx - 100), m1idx + 200));
      // Zone 3 : tout le texte pour pattern "(283 000,00 EUR)"
      zones.push(txt);
      for (var zi = 0; zi < zones.length && !d.prix; zi++) {
        var m = zones[zi].match(/\((\d[\d\s]*(?:[.,]\d{2})?)\s*(?:EUR|€)\)/);
        if (m) {
          var n = parseFloat(m[1].replace(/\s/g,'').replace(',','.'));
          if (n >= 30000 && n <= 2000000) d.prix = n;
        }
      }
      // Fallback: "XXX 000,00 EUR" sans parenthèses
      if (!d.prix && m1idx >= 0) {
        var sub = txt.substring(m1idx, m1idx + 300);
        var m2 = sub.match(/(\d[\d\s]{3,}(?:[.,]\d{2})?)\s*(?:EUR|€)/);
        if (m2) {
          var n2 = parseFloat(m2[1].replace(/\s/g,'').replace(',','.'));
          if (n2 >= 30000 && n2 <= 2000000) d.prix = n2;
        }
      }

      // 3. Date de l'acte — uniquement sur la 1ère page, en toutes lettres
      var JMAP = {
        'PREMIER':'01','DEUX':'02','TROIS':'03','QUATRE':'04','CINQ':'05','SIX':'06',
        'SEPT':'07','HUIT':'08','NEUF':'09','DIX':'10','ONZE':'11','DOUZE':'12',
        'TREIZE':'13','QUATORZE':'14','QUINZE':'15','SEIZE':'16',
        'DIX SEPT':'17','DIX-SEPT':'17','DIX HUIT':'18','DIX-HUIT':'18',
        'DIX NEUF':'19','DIX-NEUF':'19','VINGT':'20',
        'VINGT ET UN':'21','VINGT-ET-UN':'21',
        'VINGT DEUX':'22','VINGT-DEUX':'22','VINGT TROIS':'23','VINGT-TROIS':'23',
        'VINGT QUATRE':'24','VINGT-QUATRE':'24','VINGT CINQ':'25','VINGT-CINQ':'25',
        'VINGT SIX':'26','VINGT-SIX':'26','VINGT SEPT':'27','VINGT-SEPT':'27',
        'VINGT HUIT':'28','VINGT-HUIT':'28','VINGT NEUF':'29','VINGT-NEUF':'29',
        'TRENTE':'30','TRENTE ET UN':'31','TRENTE-ET-UN':'31'
      };
      var MMAP = {
        'JANVIER':'01','FEVRIER':'02','FÉVRIER':'02','MARS':'03','AVRIL':'04',
        'MAI':'05','JUIN':'06','JUILLET':'07','AOUT':'08','AOÛT':'08',
        'SEPTEMBRE':'09','OCTOBRE':'10','NOVEMBRE':'11','DECEMBRE':'12','DÉCEMBRE':'12'
      };
      // Années possibles : "DEUX MILLE VINGT SIX" → on cherche ce qui suit "DEUX MILLE "
      var AMAP = {
        'VINGT ET UN':'2021','VINGT-ET-UN':'2021',
        'VINGT DEUX':'2022','VINGT-DEUX':'2022',
        'VINGT TROIS':'2023','VINGT-TROIS':'2023',
        'VINGT QUATRE':'2024','VINGT-QUATRE':'2024',
        'VINGT CINQ':'2025','VINGT-CINQ':'2025',
        'VINGT SIX':'2026','VINGT-SIX':'2026',
        'VINGT SEPT':'2027','VINGT-SEPT':'2027',
        'VINGT HUIT':'2028','VINGT-HUIT':'2028',
        'VINGT NEUF':'2029','VINGT-NEUF':'2029',
        'TRENTE':'2030','TRENTE ET UN':'2031','TRENTE-ET-UN':'2031'
      };

      // Stratégie : chercher UNIQUEMENT dans les 1200 premiers caractères (page 1)
      // On normalise les séquences d'espaces pour éviter les problèmes d'extraction PDF
      // page1txt = texte brut de la 1ère page uniquement (passé en paramètre)
      var page1raw = page1txt && page1txt.length > 50 ? page1txt : txt.substring(0, 1200);
      var head = page1raw.toUpperCase().replace(/\s+/g, ' ');

      var annee = '', mois = '', jour = '';

      // Chercher l'année : ce qui suit "DEUX MILLE "
      var anMatch = head.match(/DEUX MILLE ([A-Z][A-Z\s-]+?)(?:[,.]|\s{2}|LE\b)/);
      if (anMatch) {
        var anStr = anMatch[1].trim().replace(/\s+/g,' ');
        annee = AMAP[anStr] || '';
      }
      // Fallback : parcourir toutes les clés AMAP
      if (!annee) {
        for (var ak in AMAP) { if (head.indexOf(ak) >= 0) { annee = AMAP[ak]; break; } }
      }

      // Chercher le mois dans page 1
      for (var mk in MMAP) { if (head.indexOf(mk) >= 0) { mois = MMAP[mk]; break; } }

      // Chercher le jour : "LE HUIT JANVIER" → on prend le mot après "LE "
      var jourRe = /\bLE (PREMIER|DEUX|TROIS|QUATRE|CINQ|SIX|SEPT|HUIT|NEUF|DIX|ONZE|DOUZE|TREIZE|QUATORZE|QUINZE|SEIZE|DIX[\s-]SEPT|DIX[\s-]HUIT|DIX[\s-]NEUF|VINGT(?:[\s-](?:ET[\s-]UN|DEUX|TROIS|QUATRE|CINQ|SIX|SEPT|HUIT|NEUF))?|TRENTE(?:[\s-]ET[\s-]UN)?)\b/;
      var jourMatch = head.match(jourRe);
      if (jourMatch) {
        var jk = jourMatch[1].replace(/\s+/g,' ');
        jour = JMAP[jk] || JMAP[jk.replace(/-/g,' ')] || '01';
      }

      if (annee && mois) d.date = annee + '-' + mois + '-' + (jour || '01');

      // Fallback numérique (si l'entête ne contient pas de date en lettres)
      if (!d.date) {
        var dn = txt.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/);
        if (dn && parseInt(dn[3]) > 2010) {
          d.date = dn[3] + '-' + dn[2].padStart(2,'0') + '-' + dn[1].padStart(2,'0');
        }
      }

      // 4. Indice
      if (/indice\s+de\s+r[ée]f[ée]rence\s+des\s+loyers|\bIRL\b/i.test(txt)) d.indice = 'IRL';
      else if (/indice\s+du\s+co[ûu]t\s+de\s+la\s+construction|\bICC\b/i.test(txt)) d.indice = 'ICC';

      // 5. Clause de revente
      var ci = txt.search(/modalit[ée]s\s+de\s+calcul\s+du\s+prix\s+de\s+cession/i);
      if (ci < 0) ci = txt.search(/prix\s+de\s+cession/i);
      if (ci >= 0) d.clause = txt.substring(ci, ci + 600).replace(/\s+/g, ' ').trim();


      // 6. Identité acquéreur(s) — patterns actes notariés
      var acqBloc = '';
      var acqIdx = txt.search(/l['']acqu[eé]reur|ci[\s-]apr[eè]s[\s\S]{0,20}acqu[eé]reur/i);
      acqBloc = acqIdx >= 0 ? txt.substring(acqIdx, acqIdx + 800) : txt.substring(0, 1500);

      // Civilité + nom : "Madame/Monsieur NOM Prénom, né(e) le…"
      var civRe = /(Madame|Monsieur)\s+([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ\s\-]{1,40}?)\s*,?\s*(n[eé][e]?\s+le|demeurant|n[eé]\s+le)/;
      var civM = acqBloc.match(civRe);
      if (civM) { d.civilite = civM[1]; d.nom = civM[2].trim().replace(/\s+/g,' '); }

      // Co-acquéreur : 2e occurrence Madame/Monsieur dans le même bloc
      var allAcq = []; var caRe = /(Madame|Monsieur)\s+([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ\s\-]{1,40}?)\s*(?:,|n[eé]e?\s+le|demeurant)/gi;
      var caM; while ((caM = caRe.exec(acqBloc)) !== null) allAcq.push(caM[1]+' '+caM[2].trim().replace(/\s+/g,' '));
      if (allAcq.length >= 2 && allAcq[1] !== allAcq[0]) d.coacq = allAcq[1];

      // 7. Adresse du bien — patterns actes : "sis", "situé", "désigné"
      var adRe = /(?:sis(?:e)?|situ[eé](?:e)?\s+(?:au|à)|d[eé]sign[eé][^,]{0,20}?)\s*[:–-]?\s*([^,\n]{10,80})\s*,?\s*(?:commune|code\s+postal|[0-9]{5})/i;
      var adM = txt.match(adRe);
      if (adM) d.adresse = adM[1].trim().replace(/\s+/g,' ');
      // Fallback : "demeurant [adresse], [CP] [Commune]"
      if (!d.adresse) {
        var ad2 = txt.match(/demeurant\s+([^,\n]{10,80}),\s*([0-9]{5})\s+([A-Z][A-Za-zÀ-ÿ\-\s]{2,30})/);
        if (ad2) { d.adresse = ad2[1].trim().replace(/\s+/g,' '); if (!d.cp) d.cp = ad2[2]; if (!d.commune) d.commune = ad2[3].trim().replace(/\s+/g,' '); }
      }

      // 8. Code postal (département 64 prioritaire) + commune
      if (!d.cp || !d.commune) {
        var cpRe64 = /\b(6[0-9]{4})\s+([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÀ-ÿ\s\-]{2,30}?)[\s,\n\.]/g;
        var cpM64; while ((cpM64 = cpRe64.exec(txt)) !== null) {
          if (!d.cp) d.cp = cpM64[1];
          if (!d.commune) d.commune = cpM64[2].trim().replace(/\s+/g,' ');
        }
        // Fallback : tout CP français
        if (!d.cp) {
          var cpFR = txt.match(/\b([0-9]{5})\s+([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÀ-ÿ\s\-]{2,30}?)[\s,\n\.]/);
          if (cpFR) { d.cp = cpFR[1]; d.commune = d.commune || cpFR[2].trim().replace(/\s+/g,' '); }
        }
      }

      // 9. Résidence / programme
      var residRe = /(?:r[eé]sidence|programme|ensemble\s+immobilier|lotissement)\s+[«""\u00ab\u00bb]?([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÀ-ÿ\s\-]{2,40}?)[»""\u00ab\u00bb,\n]/i;
      var residM = txt.match(residRe);
      if (residM) d.residence = residM[1].trim().replace(/\s+/g,' ');

      // 10. Type logement
      var logRe = /\b(T[1-5]|[Ss]tudio|[Aa]ppartement|[Mm]aison|[Vv]illa|[1-5]\s+pi[eè]ces?)\b/;
      var logM  = txt.match(logRe);
      if (logM) d.type_logement = logM[1];

      // 11. Lots
      var lotsRe = /lots?\s+(?:(?:num[eé]ro[s]?|n[o°]?\.?)\s*)?([0-9]+(?:\s*(?:,|et)\s*[0-9]+)*)/i;
      var lotsM  = txt.match(lotsRe);
      if (lotsM) d.lots = 'lot' + (lotsM[1].indexOf(',') > 0 || lotsM[1].indexOf('et') > 0 ? 's' : '') + ' n° ' + lotsM[1].trim().replace(/\s+/g,' ');

      // 12. Durée clause anti-spéculative
      var dureeRe = /(\d+)\s*(?:ann[eé]es?|ans)\s*(?:suivant|[àa]\s+compter|[àa]\s+partir)/i;
      var dureeM  = txt.match(dureeRe);
      if (dureeM) d.duree_clause = dureeM[1] + ' ans';
      // Fallback BRS → 99 ans (durée légale du bail, fixe) uniquement.
      // Pour PSLA et Accession directe, la durée de la clause varie d'un programme à l'autre
      // (10, 15 ans...) : pas de valeur par défaut, à détecter dans l'acte ou saisir manuellement.
      if (!d.duree_clause) d.duree_clause = d.dispositif === 'brs' ? '99 ans' : '';

      // ── Exposition globale pour le module courrier ──
      window._o64ActeData = d;

      pendingData = d;
      renderResults(d);
    }

    // ── Affichage des résultats ───────────────────────
    function renderResults(d) {
      var rows = document.getElementById('import-rows');
      var MOISNOMS = {'01':'janvier','02':'février','03':'mars','04':'avril','05':'mai','06':'juin','07':'juillet','08':'août','09':'septembre','10':'octobre','11':'novembre','12':'décembre'};

      function row(lbl, val, ok) {
        return '<div class="import-row">' +
          '<span class="import-row-dot ' + (ok ? 'ok' : 'na') + '"></span>' +
          '<span class="import-row-lbl">' + lbl + '</span>' +
          '<span class="import-row-val">' + (val || '<em style="color:var(--color-text-faint);font-weight:400">Non détecté</em>') + '</span>' +
          '</div>';
      }

      var h = '';
      var dispLabels = { brs: 'BRS — Bail Réel Solidaire', psla: 'PSLA', 'accession-directe': 'Accession directe' };
      h += row('Dispositif', d.dispositif ? dispLabels[d.dispositif] : null, !!d.dispositif);
      if (d.prix) {
        var pf = new Intl.NumberFormat('fr-FR', {style:'currency',currency:'EUR',maximumFractionDigits:0}).format(d.prix);
        h += row("Prix d'accession", pf, true);
      } else {
        h += row("Prix d'accession", null, false);
      }
      if (d.date) {
        var dp = d.date.split('-');
        var df = parseInt(dp[2]) + ' ' + (MOISNOMS[dp[1]] || dp[1]) + ' ' + dp[0];
        h += row("Date de l'acte", df, true);
      } else {
        h += row("Date de l'acte", null, false);
      }
      h += row('Indice de revalorisation détecté', d.indice || null, !!d.indice);
      rows.innerHTML = h;

      var ct = document.getElementById('import-clause-txt');
      ct.textContent = d.clause ? d.clause.substring(0, 500) + (d.clause.length > 500 ? '…' : '') : 'Clause non localisée dans ce document.';

      document.getElementById('import-res').classList.add('show');
    }

  })(); // fin module import
  // ══════════════════════════════════════════════════════


// ── Courrier module ──
// ══════════════════════════════════════════════════════
// MODULE COURRIER DE REVENTE — v7-3
// ══════════════════════════════════════════════════════
(function initCourrier() {
  var LOGO_B64 = "outils/assets/revente-logo.png";
  var FOOTER_B64 = "outils/assets/revente-footer.jpg";


  var courrierBtn   = document.getElementById('courrierToggleBtn');
  var courrierPanel = document.getElementById('courrierBody');
  var syncBtn       = document.getElementById('courrierSyncBtn');
  var apercuBtn     = document.getElementById('courrierApercuBtn');
  var printBtn      = document.getElementById('courrierPrintBtn');

  if (!courrierBtn || !courrierPanel) return;

  // ── Toggle ouverture/fermeture ──
  courrierBtn.addEventListener('click', function () {
    var nowOpen = courrierPanel.style.display === 'none' || courrierPanel.style.display === '';
    courrierPanel.style.display = nowOpen ? 'block' : 'none';
    courrierBtn.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
    var caret = courrierBtn.querySelector('.caret');
    if (caret) caret.style.transform = nowOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    if (nowOpen) { syncCourrier(); buildApercu(); }
  });

  if (syncBtn) syncBtn.addEventListener('click', function () { syncCourrier(); buildApercu(); });
  if (apercuBtn) apercuBtn.addEventListener('click', buildApercu);
  if (printBtn) printBtn.addEventListener('click', doPrint);

  // ── Auto-aperçu sur saisie ──
  var liveFields = ['cr_civilite','cr_nom','cr_coacq','cr_adresse','cr_adresse_courrier',
    'cr_cp','cr_commune','cr_residence','cr_type_logement','cr_lots',
    'cr_date_courrier','cr_date_reception','cr_duree_clause','cr_motif',
    'cr_clause_texte','cr_details_travaux'];
  liveFields.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', buildApercu);
    el.addEventListener('change', buildApercu);
  });

  // ── Helpers ──
  function fmtEur(n) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    var M = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    return parseInt(p[2], 10) + ' ' + (M[parseInt(p[1], 10) - 1] || p[1]) + ' ' + p[0];
  }
  function pickVal(id) {
    var el = document.getElementById(id);
    if (!el) return '';
    return (el.value || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // ── Synchronisation depuis le simulateur ──
  function syncCourrier() {

    // ── 1. Valeurs verrouillées depuis le simulateur ──
    var disp = pickVal('dispositif');
    var dispLabel = disp === 'brs' ? 'BRS — Bail Réel Solidaire' : disp === 'psla' ? 'PSLA' : disp === 'accession-directe' ? 'Accession directe' : '—';
    setText('cl_dispositif', dispLabel);

    var ti   = pickVal('type_indice');
    var iAcq = pickVal('indice_initial');
    var iRev = pickVal('indice_revente');
    var indLabel = (ti ? ti.toUpperCase() : '?');
    if (iAcq && iRev) indLabel += ' (' + iAcq + ' → ' + iRev + ')';
    setText('cl_indice', indLabel || '—');

    var prixInitial = parseFloat(pickVal('prix_initial')) || 0;
    setText('cl_prix_acq', prixInitial ? fmtEur(prixInitial) : '—');

    var elRev = document.getElementById('detail_revalorise');
    setText('cl_prix_rev', elRev ? (elRev.value || '—') : '—');

    var elTrv = document.getElementById('detail_travaux_retenus');
    setText('cl_travaux', elTrv ? (elTrv.value || '—') : '—');

    var elPlaf = document.getElementById('prix_plafond');
    setText('cl_plafond', elPlaf ? (elPlaf.textContent || '—') : '—');

    // ── 2. Pré-remplissage depuis les données de l'acte importé ──
    var acte = window._o64ActeData || {};

    function fillIfEmpty(id, val) {
      if (!val) return;
      var el = document.getElementById(id);
      if (el && !el.value) el.value = val;
    }
    function setIfEmpty(id, val) {
      if (!val) return;
      var el = document.getElementById(id);
      if (el && el.tagName === 'SELECT' && !el.value) el.value = val;
      else if (el && !el.value) el.value = val;
    }

    // Civilité
    if (acte.civilite) {
      var civEl = document.getElementById('cr_civilite');
      if (civEl && !civEl.value) {
        var civOpts = Array.from(civEl.options).map(function(o){ return o.value; });
        var matched = civOpts.find(function(v){ return v.toLowerCase().startsWith(acte.civilite.toLowerCase()); });
        if (matched) civEl.value = matched;
      }
    }
    fillIfEmpty('cr_nom',            acte.nom         || '');
    fillIfEmpty('cr_coacq',          acte.coacq        || '');
    fillIfEmpty('cr_adresse',        acte.adresse      || '');
    fillIfEmpty('cr_cp',             acte.cp           || '');
    fillIfEmpty('cr_commune',        acte.commune      || '');
    fillIfEmpty('cr_residence',      acte.residence    || '');
    fillIfEmpty('cr_type_logement',  acte.type_logement|| '');
    fillIfEmpty('cr_lots',           acte.lots         || '');
    // BRS = 99 ans (durée légale fixe). PSLA / Accession directe : pas de défaut, ça varie
    // selon le programme (10, 15 ans...) — à détecter dans l'acte ou saisir manuellement.
    fillIfEmpty('cr_duree_clause',   acte.duree_clause || (disp === 'brs' ? '99 ans' : ''));

    // Clause : priorité à l'extrait de l'acte (import-clause-txt), sinon texte type
    var clTA = document.getElementById('cr_clause_texte');
    if (clTA && !clTA.value) {
      var clauseActeTxt = '';
      var clauseEl = document.getElementById('import-clause-txt');
      if (clauseEl && clauseEl.textContent && clauseEl.textContent.trim().length > 20
          && clauseEl.textContent.indexOf('non localisée') < 0) {
        clauseActeTxt = clauseEl.textContent.trim();
      } else if (acte.clause) {
        clauseActeTxt = acte.clause;
      }
      if (clauseActeTxt) {
        clTA.value = clauseActeTxt;
      } else {
        // Le programme peut être indexé sur IRL ou sur ICC quel que soit le dispositif — seul
        // le plafonnement des travaux à 10 % est propre au BRS (actes Office 64).
        var indiceTxt = ti === 'irl'
          ? "de l'indice de référence des loyers (IRL)"
          : "de l'indice du coût de la construction (ICC)";
        var travauxTxt = disp === 'brs'
          ? "dans la limite de 10 % du prix d'accession"
          : "sur présentation des factures correspondantes";
        clTA.value = "En cas de revente de tout ou partie du bien pendant cette période, le prix ne pourra être supérieur au prix d'achat figurant dans l'acte d'acquisition modifié en fonction de la variation " + indiceTxt + " et augmenté, après acceptation par l'Office 64 de l'Habitat, du coût des travaux d'aménagement ou d'embellissement " + travauxTxt + ".";
      }
    }

    // Date courrier : aujourd'hui si vide
    var dcEl = document.getElementById('cr_date_courrier');
    if (dcEl && !dcEl.value) {
      dcEl.value = new Date().toISOString().slice(0, 10);
    }

    // ── 3. Phrase travaux ──
    var detTA = document.getElementById('cr_details_travaux');
    if (detTA && !detTA.value) {
      var trvStr = elTrv ? (elTrv.value || '') : '';
      var trvNum = parseFloat(trvStr.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
      var totalF = 0;
      document.querySelectorAll('.facture-input').forEach(function (i) { totalF += parseFloat(i.value) || 0; });
      if (trvNum > 0 && totalF > trvNum + 1) {
        var exclu = totalF - trvNum;
        detTA.value = fmtEur(trvNum) + ' retenus (' + fmtEur(totalF) + ' présentés, ' + fmtEur(exclu) + ' exclus car non valorisables selon les conditions du dispositif).';
      } else if (trvNum > 0) {
        detTA.value = fmtEur(trvNum) + ' de travaux, selon les factures produites.';
      }
    }
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Construire le HTML de la lettre ──
  function buildLettreHtml() {
    try {
      var logoSrc   = (typeof LOGO_B64   !== 'undefined') ? LOGO_B64   : '';
      var footerSrc = (typeof FOOTER_B64 !== 'undefined') ? FOOTER_B64 : '';

      function v(id, fallback) {
        var el = document.getElementById(id);
        if (!el) return fallback || '';
        return (el.tagName === 'SELECT' ? el.options[el.selectedIndex].text : el.value || el.textContent || '')
          .replace(/\s+/g,' ').trim() || fallback || '';
      }
      function vRaw(id) {
        var el = document.getElementById(id);
        if (!el) return '';
        return (el.value || el.textContent || '').replace(/\s+/g,' ').trim();
      }

      var civ     = vRaw('cr_civilite')  || 'Madame, Monsieur';
      var nom     = vRaw('cr_nom')       || '[Nom acquéreur]';
      var coacq   = vRaw('cr_coacq').trim();
      var adLog   = vRaw('cr_adresse')   || '[Adresse logement]';
      var adPost  = vRaw('cr_adresse_courrier').trim() || adLog;
      var cp      = vRaw('cr_cp')        || '[CP]';
      var commune = (vRaw('cr_commune') || '[COMMUNE]').toUpperCase();
      var resid   = vRaw('cr_residence') || '[Résidence]';
      var typeLog = vRaw('cr_type_logement') || '[Type logement]';
      var lots    = vRaw('cr_lots')      || '[Lots]';
      var dateC   = fmtDate(vRaw('cr_date_courrier'))  || '[Date courrier]';
      var dateRec = fmtDate(vRaw('cr_date_reception')) || '[Date réception]';
      var dateAct = fmtDate(vRaw('date_acte'))         || '[Date acte]';
      var duree   = vRaw('cr_duree_clause') || '[durée]';
      var motif   = vRaw('cr_motif')    || '[motif de revente]';
      var clause  = vRaw('cr_clause_texte');
      var detTrv  = vRaw('cr_details_travaux');

      var elPrixAcq = document.getElementById('cl_prix_acq');
      var elPrixRev = document.getElementById('cl_prix_rev');
      var elTravaux = document.getElementById('cl_travaux');
      var elPlafond = document.getElementById('cl_plafond');
      var prixAcq = elPrixAcq ? elPrixAcq.textContent.trim() : '\u2014';
      var prixRev = elPrixRev ? elPrixRev.textContent.trim() : '\u2014';
      var travaux = elTravaux ? elTravaux.textContent.trim() : '\u2014';
      var plafond = elPlafond ? elPlafond.textContent.trim() : '\u2014';

      var trvNum  = parseFloat((travaux || '').replace(/\s/g,'').replace(/[^0-9,.]/g,'').replace(',','.')) || 0;
      var trvOk   = trvNum > 0;
      var coacqPh = coacq ? ', en indivision avec\u00a0' + coacq + ',' : '';
      var tiUp    = (vRaw('type_indice') || 'icc').toUpperCase();
      var indLib  = tiUp === 'IRL'
          ? "de l\u2019indice de r\u00e9f\u00e9rence des loyers\u00a0(IRL)"
          : "de l\u2019indice du co\u00fbt de la construction\u00a0(ICC)";

      var h = '<div class="ltr-page">';

      /* ── En-tête ── */
      h += '<div class="ltr-header">';
      h += '<div class="ltr-logo-wrap">';
      if (logoSrc) {
        h += '<img src="' + logoSrc + '" alt="Office 64 de l\'Habitat" class="ltr-logo-img">';
      }
      h += '<span class="ltr-logo-txt">Office Public de l\'Habitat<br>des Pyr\u00e9n\u00e9es-Atlantiques</span>';
      h += '</div>';
      h += '<div class="ltr-dest">';
      h += '<p>' + esc(civ) + '\u00a0' + esc(nom) + '</p>';
      if (coacq) h += '<p>' + esc(coacq) + '</p>';
      h += '<p>' + esc(adPost) + '</p>';
      h += '<p>' + esc(cp) + '\u00a0' + esc(commune) + '</p>';
      h += '</div></div>';

      /* ── Objet ── */
      h += '<div class="ltr-objet">';
      h += '<p><strong>OBJET\u00a0: ' + esc(commune) + ' \u2013 ' + esc(resid) + '</strong></p>';
      h += '<p><strong><u>Lettre recommand\u00e9e avec AR \u2013 Revente de logement</u></strong></p>';
      h += '</div>';

      h += '<p class="ltr-date">Bayonne, le ' + esc(dateC) + '</p>';
      h += '<p class="ltr-appel">' + esc(civ) + ',</p>';

      /* ── Corps ── */
      h += '<p class="ltr-p">Vous avez acquis aupr\u00e8s de notre organisme, par acte authentique, le\u00a0<strong>'
        + esc(dateAct) + '</strong>' + coacqPh + ', le\u00a0' + esc(typeLog) + '\u00a0; '
        + esc(lots) + '\u00a0; R\u00e9sidence\u00a0' + esc(resid) + '\u00a0; '
        + esc(commune) + '\u00a0' + esc(cp) + '.</p>';

      h += '<p class="ltr-p">Nous avons bien re\u00e7u votre courrier en date du\u00a0<strong>'
        + esc(dateRec) + '</strong>, nous indiquant votre intention de revendre le logement sis\u00a0'
        + esc(adLog) + ' et ce suite \u00e0\u00a0' + esc(motif) + '.</p>';

      h += '<p class="ltr-p">Conform\u00e9ment aux clauses contractuelles qui nous lient, nous vous rappelons que le bien acquis est issu d\u2019un programme \u00e0 caract\u00e8re social et qu\u2019ainsi durant\u00a0<strong>'
        + esc(duree) + '</strong> ce bien doit \u00eatre votre r\u00e9sidence principale.</p>';

      h += '<p class="ltr-p">Dans l\u2019hypoth\u00e8se de la revente ou d\u2019une mutation de tout ou partie du bien durant la p\u00e9riode de\u00a0<strong>'
        + esc(duree) + '</strong> suivant la date d\u2019acquisition, l\u2019Office 64 de l\u2019Habitat b\u00e9n\u00e9ficie d\u2019un droit de pr\u00e9f\u00e9rence dont il peut user.</p>';

      if (clause) {
        h += '<p class="ltr-p ltr-clause">' + esc(clause).replace(/\n/g,'<br>') + '</p>';
      }

      h += '<p class="ltr-p">\u00c0 ce jour, nous vous informons que le\u00a0<strong>prix de revente ne pourra \u00eatre sup\u00e9rieur \u00e0\u00a0<u>'
        + esc(plafond) + '</u></strong>\u00a0soit\u00a0:</p>';

      h += '<ul class="ltr-ul">';
      h += '<li>Le prix d\u2019achat initial de\u00a0<strong>' + esc(prixAcq)
        + '</strong> revaloris\u00e9 en fonction ' + indLib
        + ' soit\u00a0<strong>' + esc(prixRev) + '</strong>,</li>';
      if (trvOk) {
        h += '<li>Les montants des travaux d\u2019\u00e9quipement compl\u00e9mentaires effectu\u00e9s dans le logement, selon les factures produites soit\u00a0<strong>'
          + esc(travaux) + '</strong>'
          + (detTrv ? '\u00a0(' + esc(detTrv) + ')' : '') + '.</li>';
      }
      h += '</ul>';

      h += '<p class="ltr-p ltr-politesse">En esp\u00e9rant avoir r\u00e9pondu \u00e0 vos interrogations, nous vous prions d\u2019agr\u00e9er, '
        + esc(civ) + ', nos sinc\u00e8res salutations.</p>';

      h += '<div class="ltr-sign"><p><strong>Myl\u00e8ne SUISSA</strong></p>'
        + '<p><strong>Directrice Adjointe des Affaires G\u00e9n\u00e9rales</strong></p></div>';

      /* ── Footer image (en flux en aperçu, absolu en print via CSS) ── */
      if (footerSrc) {
        h += '<div class="ltr-footer-img"><img src="' + footerSrc + '" alt=""></div>';
      }

      h += '</div>';
      return h;
    } catch(err) {
      return '<div style="padding:1rem;color:red;font-family:sans-serif"><b>Erreur g\u00e9n\u00e9ration courrier\u00a0:</b> ' + err.message + '</div>';
    }
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function buildApercu() {
    var el = document.getElementById('courrier-preview');
    if (!el) return;
    el.innerHTML = buildLettreHtml();
  }

  function doPrint() {
    var pz = document.getElementById('print-zone-revente');
    if (!pz) { window.print(); return; }
    pz.innerHTML = buildLettreHtml();
    /* Laisser le navigateur rendre les images avant d'imprimer */
    var imgs = pz.querySelectorAll('img');
    var loaded = 0;
    if (!imgs.length) { window.print(); return; }
    imgs.forEach(function(img) {
      if (img.complete) { loaded++; if (loaded === imgs.length) window.print(); }
      else {
        img.onload = img.onerror = function() {
          loaded++;
          if (loaded === imgs.length) window.print();
        };
      }
    });
  }

})();
// ══════════════════════════════════════════════════════ FIN MODULE COURRIER
})();