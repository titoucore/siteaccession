// ============================================================
// projets.js — Récap des projets (kanban, fiche détail)
// Dépend de wiki-projets-core.js (chargé avant, via TOOL_DEPS).
// ============================================================

  // ===== Projets : kanban Archives / En cours / À venir =====
  const MILESTONES = [
    ['acquisitionFoncier','Acquisition du foncier'],
    ['demolition','Démolition'],
    ['achevementFondations','Achèvement des fondations'],
    ['achevementPlancherR1','Achèvement du plancher bas R+1'],
    ['horsEau',"Mise hors d'eau de l'immeuble"],
    ['achevementCloisons','Achèvement des cloisons'],
    ['achevementImmeuble',"Achèvement de l'immeuble"],
    ['livraison','Livraison'],
    ['daact','DAACT'],
    ['finGPA','Fin de GPA'],
  ];
  function buildAvancement(overrides){
    overrides = overrides || {};
    return MILESTONES.map(([key,label]) => {
      const o = overrides[key] || {};
      return { key, label, checked: !!o.checked, date: o.date || '' };
    });
  }

  let projets = [
    { id:'proj1', numOperation:'OP-2024-014', numProgrammePIH:'PIH-64-0142',
      nom:'Résidence Les Tilleuls', adresse:'12 rue des Tilleuls', commune:'Pau',
      zonageRobien:'B1', anneeProgrammation:2024,
      dateReceptionPrev:'2024-10-01', dateLivraisonPrev:'2024-11-15',
      nbLogementsAccession:24, modeCommercialisation:'PSLA', nbLogementsLLS:0,
      ventilationTypologies:'T2 : 6, T3 : 12, T4 : 6',
      formeUrbaine:'Collectif', nbNiveaux:4,
      categorie:'MOD', nomArchiMOE:'Cabinet Delmas Architectes', nomPromoteur:'',
      rpi:'S. Dupuy', gestionnaireAdministratif:'C. Larrieu', juridique:'Me Bataille',
      accession:'S. Dupuy', notaire:'Me Lefort', notaireCoordonnees:'05 59 XX XX XX',
      dateDeliberationGrillePrix:'2024-02-01', caPrevisionnel:3200000,
      dateLancementOS:'2024-03-01', datePreCommercialisation:'2024-04-15',
      avancementChantier: buildAvancement({
        acquisitionFoncier:{checked:true,date:'2023-09-04'},
        demolition:{checked:true,date:'2023-10-02'},
        achevementFondations:{checked:true,date:'2023-12-11'},
        achevementPlancherR1:{checked:true,date:'2024-01-22'},
        horsEau:{checked:true,date:'2024-03-15'},
        achevementCloisons:{checked:true,date:'2024-05-20'},
        achevementImmeuble:{checked:true,date:'2024-08-01'},
        livraison:{checked:true,date:'2024-11-15'},
        daact:{checked:true,date:'2024-12-10'},
        finGPA:{checked:true,date:'2025-11-15'},
      }),
      photo:'', statut:'archives', documents:[], checklists:[] },
    { id:'proj2', numOperation:'OP-2025-006', numProgrammePIH:'PIH-64-0158',
      nom:'Résidence Le Clos Fleuri', adresse:'', commune:'Billère',
      zonageRobien:'B1', anneeProgrammation:2025,
      dateReceptionPrev:'2026-10-01', dateLivraisonPrev:'2026-12-01',
      nbLogementsAccession:18, modeCommercialisation:'BRS', nbLogementsLLS:6,
      ventilationTypologies:'T2 : 4, T3 : 10, T4 : 4',
      formeUrbaine:'Collectif', nbNiveaux:3,
      categorie:'VEFA', nomArchiMOE:'', nomPromoteur:'Promoteur ABC',
      rpi:'M. Garcia', gestionnaireAdministratif:'C. Larrieu', juridique:'Me Bataille',
      accession:'M. Garcia', notaire:'', notaireCoordonnees:'',
      dateDeliberationGrillePrix:'2025-04-01', caPrevisionnel:2450000,
      dateLancementOS:'2025-06-01', datePreCommercialisation:'2025-07-15',
      avancementChantier: buildAvancement({
        acquisitionFoncier:{checked:true,date:'2025-02-10'},
        demolition:{checked:true,date:'2025-03-05'},
        achevementFondations:{checked:true,date:'2025-05-20'},
        achevementPlancherR1:{checked:true,date:'2025-07-01'},
        horsEau:{checked:true,date:'2025-09-15'},
      }),
      photo:'', statut:'encours', documents:[], checklists:[] },
    { id:'proj3', numOperation:'', numProgrammePIH:'',
      nom:'Résidence Les Hortensias', adresse:'', commune:'Lons',
      zonageRobien:'', anneeProgrammation:2027,
      dateReceptionPrev:'', dateLivraisonPrev:'',
      nbLogementsAccession:30, modeCommercialisation:'Accession Directe', nbLogementsLLS:0,
      ventilationTypologies:'', formeUrbaine:'Collectif', nbNiveaux:0,
      categorie:'MOD', nomArchiMOE:'', nomPromoteur:'',
      rpi:'', gestionnaireAdministratif:'', juridique:'', accession:'', notaire:'', notaireCoordonnees:'',
      dateDeliberationGrillePrix:'', caPrevisionnel:0,
      dateLancementOS:'', datePreCommercialisation:'',
      avancementChantier: buildAvancement({}),
      photo:'', statut:'avenir', documents:[], checklists:[] },
  ];
  let projetSelectedId = null;
  let projetDraggedId = null;
  const STATUT_LABELS = { archives:'Archives', encours:'En cours', avenir:'À venir' };

  function badgeStyle(mode){
    const map = {
      'PSLA':'background:#eee9f6;color:#9888C0;',
      'BRS':'background:#fdeee7;color:#EC663C;',
      'Accession Directe':'background:#e8f0fb;color:#0062AD;',
    };
    return map[mode] || 'background:#eef1ee;color:#9aa39c;';
  }

  function renderProjets(){
    ['archives','encours','avenir'].forEach(statut => {
      const col = document.getElementById('col-' + statut);
      const list = projets.filter(p => p.statut === statut);
      document.getElementById('count-' + statut).textContent = list.length;
      col.innerHTML = '';
      list.forEach(p => col.appendChild(renderProjetCard(p)));
    });
  }

  function renderProjetCard(p){
    const card = document.createElement('div');
    card.className = 'projet-card';
    card.draggable = true;
    card.dataset.id = p.id;
    const done = p.avancementChantier.filter(m => m.checked).length;
    const pct = Math.round(done / p.avancementChantier.length * 100);
    const totalLgt = (Number(p.nbLogementsAccession) || 0) + (Number(p.nbLogementsLLS) || 0);
    card.innerHTML =
      (p.photo ? '<div class="projet-card-thumb"><img src="' + p.photo + '" alt=""></div>' : '') +
      '<h4>' + escHtml(p.nom) + '</h4>' +
      '<div class="projet-commune">' + escHtml(p.commune || 'Commune non renseignée') + '</div>' +
      '<div class="projet-badges"><span class="projet-badge" style="' + badgeStyle(p.modeCommercialisation) + '">' + escHtml(p.modeCommercialisation || 'Autre') + '</span></div>' +
      '<div class="projet-progress"><div class="projet-progress-bar" style="width:' + pct + '%"></div></div>' +
      '<div class="projet-card-footer"><span>' + totalLgt + ' lgt</span><span>' + escHtml(p.rpi || 'Non assigné') + '</span></div>';
    card.addEventListener('click', () => openProjet(p.id));
    card.addEventListener('dragstart', () => { projetDraggedId = p.id; card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    return card;
  }

  document.querySelectorAll('.kanban-col-body').forEach(col => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && col.contains(e.relatedTarget)) return;
      col.classList.remove('drag-over');
    });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (!projetDraggedId) return;
      const p = projets.find(pr => pr.id === projetDraggedId);
      if (p) p.statut = col.closest('.kanban-col').dataset.statut;
      projetDraggedId = null;
      renderProjets();
    });
  });
  document.addEventListener('dragend', () => {
    document.querySelectorAll('.kanban-col-body.drag-over').forEach(c => c.classList.remove('drag-over'));
  });

  document.getElementById('btn-new-projet').addEventListener('click', () => {
    askPrompt('Nouveau projet', "Nom de l'opération", '', (nom) => {
      const p = { id:wikiNewId('p'), numOperation:'', numProgrammePIH:'',
        nom, adresse:'', commune:'', zonageRobien:'', anneeProgrammation:'',
        dateReceptionPrev:'', dateLivraisonPrev:'',
        nbLogementsAccession:0, modeCommercialisation:'PSLA', nbLogementsLLS:0,
        ventilationTypologies:'', formeUrbaine:'Collectif', nbNiveaux:0,
        categorie:'MOD', nomArchiMOE:'', nomPromoteur:'',
        rpi:'', gestionnaireAdministratif:'', juridique:'', accession:'', notaire:'', notaireCoordonnees:'',
        dateDeliberationGrillePrix:'', caPrevisionnel:0,
        dateLancementOS:'', datePreCommercialisation:'',
        avancementChantier: buildAvancement({}),
        photo:'', statut:'avenir', documents:[], checklists:[] };
      projets.push(p);
      renderProjets();
      openProjet(p.id);
    });
  });

  // ----- Fiche détail d'un projet -----
  const projetOverlay = document.getElementById('projet-overlay');
  const projetTitleDisplay = document.getElementById('projet-title-display');
  const projetStatutLabel = document.getElementById('projet-statut-label');
  const projetBody = document.getElementById('projet-body');

  function openProjet(id){
    projetSelectedId = id;
    renderProjetDetail();
    projetOverlay.classList.remove('hidden');
  }
  function closeProjet(){
    projetOverlay.classList.add('hidden');
    renderProjets();
  }
  document.getElementById('projet-close').addEventListener('click', closeProjet);
  projetOverlay.addEventListener('click', (e) => { if (e.target === projetOverlay) closeProjet(); });
  document.getElementById('projet-delete').addEventListener('click', () => {
    const p = projets.find(pr => pr.id === projetSelectedId);
    if (!p) return;
    askConfirm('Supprimer « ' + p.nom + ' » ?', 'Cette action est définitive.', () => {
      projets = projets.filter(pr => pr.id !== projetSelectedId);
      closeProjet();
    }, true);
  });

  function champTexte(field, label, val){
    return '<label>' + label + '<input data-field="' + field + '" value="' + escHtml(val || '') + '"></label>';
  }
  function champCommune(val){
    return '<label class="projet-autocomplete-wrap">Commune' +
      '<input data-field="commune" autocomplete="off" value="' + escHtml(val || '') + '">' +
      '<div class="projet-suggestions" id="commune-suggestions"></div>' +
      '</label>';
  }
  function champNombre(field, label, val, min, max){
    return '<label>' + label + '<input type="number"' + (min !== undefined ? ' min="' + min + '"' : '') + (max !== undefined ? ' max="' + max + '"' : '') +
      ' data-field="' + field + '" value="' + (val || 0) + '"></label>';
  }
  function champDate(field, label, val){
    return '<label>' + label + '<input type="date" data-field="' + field + '" value="' + (val || '') + '"></label>';
  }
  function champSelect(field, label, val, options){
    const opts = options.map(o => {
      const v = Array.isArray(o) ? o[0] : o;
      const l = Array.isArray(o) ? o[1] : o;
      return '<option value="' + v + '"' + (v === val ? ' selected' : '') + '>' + l + '</option>';
    }).join('');
    return '<label>' + label + '<select data-field="' + field + '">' + opts + '</select></label>';
  }
  function champTextarea(field, label, val, rows, full){
    return '<label' + (full ? ' class="projet-grid-full"' : '') + '>' + label +
      '<textarea data-field="' + field + '" rows="' + (rows || 2) + '">' + escHtml(val || '') + '</textarea></label>';
  }
  function champWrap(id, show, innerHtml){
    return '<span id="' + id + '" class="projet-field-wrap' + (show ? '' : ' champ-hidden') + '">' + innerHtml + '</span>';
  }

  function renderAvancementBlock(p){
    const total = p.avancementChantier.length;
    const done = p.avancementChantier.filter(m => m.checked).length;
    const pct = Math.round(done / total * 100);
    const summary = '<div class="avancement-summary">' + done + ' / ' + total + ' étapes réalisées (' + pct + '%)</div>';
    const gauge = '<div class="avancement-gauge">' +
      p.avancementChantier.map((m, i) => {
        const opacity = (0.2 + (i / (total - 1)) * 0.8).toFixed(2);
        const style = m.checked ? ' style="opacity:' + opacity + '"' : '';
        return '<div class="gauge-seg' + (m.checked ? ' done' : '') + '"' + style + ' title="' + escHtml(m.label) + '"></div>';
      }).join('') +
      '</div>';
    const rows = '<div class="avancement-list">' +
      p.avancementChantier.map(m =>
        '<div class="avancement-row' + (m.checked ? ' done' : '') + '">' +
        '<input type="checkbox" data-milestone="' + m.key + '" data-kind="checked" id="ms-' + m.key + '"' + (m.checked ? ' checked' : '') + '>' +
        '<label for="ms-' + m.key + '">' + escHtml(m.label) + '</label>' +
        '<input type="date" data-milestone="' + m.key + '" data-kind="date" value="' + (m.date || '') + '">' +
        '</div>'
      ).join('') +
      '</div>';
    return summary + gauge + rows;
  }

  function wireAvancement(p){
    projetBody.querySelectorAll('[data-milestone]').forEach(el => {
      el.addEventListener('change', () => {
        const key = el.dataset.milestone;
        const kind = el.dataset.kind;
        const m = p.avancementChantier.find(x => x.key === key);
        if (!m) return;
        if (kind === 'checked'){
          m.checked = el.checked;
          if (m.checked && !m.date) m.date = new Date().toISOString().slice(0,10);
        } else {
          m.date = el.value;
        }
        const block = document.getElementById('avancement-block');
        if (block) block.innerHTML = renderAvancementBlock(p);
        wireAvancement(p);
        renderProjets();
      });
    });
  }

  function renderProjetPhotoBlock(p){
    return '<div class="projet-photo-wrap">' +
      (p.photo ? '<img src="' + p.photo + '" alt="Perspective du programme">' : '<div class="projet-photo-placeholder">Aucune perspective ajoutée</div>') +
      '<button type="button" class="projet-photo-btn" id="projet-photo-btn">' + (p.photo ? 'Changer l’image' : '+ Ajouter une image') + '</button>' +
      '</div>';
  }

  function wireProjetPhoto(p){
    const btn = document.getElementById('projet-photo-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          p.photo = reader.result;
          const block = document.getElementById('projet-photo-block');
          if (block) block.innerHTML = renderProjetPhotoBlock(p);
          wireProjetPhoto(p);
          renderProjets();
        };
        reader.readAsDataURL(file);
      });
      input.click();
    });
  }

  function renderProjetDetail(){
    const p = projets.find(pr => pr.id === projetSelectedId);
    if (!p) return;
    projetTitleDisplay.textContent = p.nom;
    projetStatutLabel.textContent = STATUT_LABELS[p.statut] || '';
    projetBody.innerHTML =
      '<div class="projet-section"><h5>Perspective du programme</h5><div id="projet-photo-block">' + renderProjetPhotoBlock(p) + '</div></div>' +
      '<div class="projet-section"><h5>Identité de l’opération</h5><div class="projet-grid">' +
        champTexte('numOperation', "N° de l'opération", p.numOperation) +
        champTexte('numProgrammePIH', 'N° du programme PIH', p.numProgrammePIH) +
        champTexte('nom', 'Nom du programme', p.nom) +
        champCommune(p.commune) +
        champTexte('adresse', 'Adresse', p.adresse) +
        champSelect('zonageRobien', 'Zonage Robien', p.zonageRobien, ['','A','A bis','B1','B2','C']) +
        champNombre('anneeProgrammation', 'Année de programmation', p.anneeProgrammation, 2000, 2100) +
        champSelect('statut', 'Statut', p.statut, [['avenir','À venir'],['encours','En cours'],['archives','Archives']]) +
      '</div></div>' +
      '<div class="projet-section"><h5>Localisation</h5><div id="projet-map-wrap">' + renderProjetMap(p) + '</div></div>' +
      '<div class="projet-section"><h5>Composition</h5><div class="projet-grid">' +
        champNombre('nbLogementsAccession', 'Logements en accession', p.nbLogementsAccession, 0) +
        champSelect('modeCommercialisation', 'Mode de commercialisation', p.modeCommercialisation, ['BRS','PSLA','Accession Directe']) +
        champNombre('nbLogementsLLS', 'Logements en LLS', p.nbLogementsLLS, 0) +
        champTextarea('ventilationTypologies', 'Ventilation des typologies (T2 / T3 / T4…)', p.ventilationTypologies, 1, true) +
        champSelect('formeUrbaine', 'Forme urbaine', p.formeUrbaine, ['Collectif','Pavillon']) +
        champWrap('champ-nbNiveaux', p.formeUrbaine !== 'Pavillon', champNombre('nbNiveaux', 'Nombre de niveaux', p.nbNiveaux, 0)) +
        champSelect('categorie', 'Catégorie', p.categorie, ['MOD','VEFA','Réhab']) +
        champWrap('champ-nomArchiMOE', p.categorie === 'MOD', champTexte('nomArchiMOE', 'Architecte / MOE', p.nomArchiMOE)) +
        champWrap('champ-nomPromoteur', p.categorie === 'VEFA', champTexte('nomPromoteur', 'Promoteur', p.nomPromoteur)) +
      '</div></div>' +
      '<div class="projet-section"><h5>Équipe</h5><div class="projet-grid">' +
        champTexte('rpi', 'R.P.I.', p.rpi) +
        champTexte('gestionnaireAdministratif', 'Gestionnaire administratif', p.gestionnaireAdministratif) +
        champTexte('juridique', 'Juridique', p.juridique) +
        champTexte('accession', 'Accession', p.accession) +
        champTexte('notaire', 'Notaire', p.notaire) +
        champTexte('notaireCoordonnees', 'Coordonnées du notaire', p.notaireCoordonnees) +
      '</div></div>' +
      '<div class="projet-section"><h5>Dates et jalons</h5><div class="projet-grid">' +
        champDate('dateDeliberationGrillePrix', 'Délibération grille de prix', p.dateDeliberationGrillePrix) +
        champNombre('caPrevisionnel', 'CA prévisionnel — prix de revient (€)', p.caPrevisionnel, 0) +
        champDate('dateLancementOS', "Lancement de l'OS", p.dateLancementOS) +
        champDate('datePreCommercialisation', 'Obtention pré-commercialisation', p.datePreCommercialisation) +
        champDate('dateReceptionPrev', 'Réception prévisionnelle', p.dateReceptionPrev) +
        champDate('dateLivraisonPrev', 'Livraison prévisionnelle', p.dateLivraisonPrev) +
      '</div></div>' +
      '<div class="projet-section"><h5>État d’avancement du chantier</h5><div id="avancement-block">' + renderAvancementBlock(p) + '</div></div>' +
      '<div class="projet-section"><div class="projet-section-header"><h5>Documents liés</h5>' +
        '<button class="btn-wiki-action" id="projet-add-doc" style="width:auto;">+ Ajouter un document</button></div>' +
        '<div id="projet-docs-list"></div></div>' +
      '<div class="projet-section"><div class="projet-section-header"><h5>Checklists</h5>' +
        '<button class="btn-wiki-action" id="projet-add-checklist" style="width:auto;">+ Attacher une checklist</button></div>' +
        '<div id="projet-checklists-list"></div></div>';

    const NUMERIC_FIELDS = ['nbLogementsAccession','nbLogementsLLS','nbNiveaux','anneeProgrammation','caPrevisionnel'];
    projetBody.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('change', () => {
        const field = el.dataset.field;
        let val = el.value;
        if (NUMERIC_FIELDS.includes(field)) val = Number(val) || 0;
        p[field] = val;
        if (field === 'nom') projetTitleDisplay.textContent = val;
        if (field === 'statut') projetStatutLabel.textContent = STATUT_LABELS[val] || '';
        if (field === 'adresse' || field === 'commune'){
          const mapWrap = document.getElementById('projet-map-wrap');
          if (mapWrap) mapWrap.innerHTML = renderProjetMap(p);
        }
        if (field === 'categorie'){
          const archiWrap = document.getElementById('champ-nomArchiMOE');
          const promoWrap = document.getElementById('champ-nomPromoteur');
          if (archiWrap) archiWrap.classList.toggle('champ-hidden', val !== 'MOD');
          if (promoWrap) promoWrap.classList.toggle('champ-hidden', val !== 'VEFA');
        }
        if (field === 'formeUrbaine'){
          const niveauxWrap = document.getElementById('champ-nbNiveaux');
          if (niveauxWrap) niveauxWrap.classList.toggle('champ-hidden', val === 'Pavillon');
        }
        renderProjets();
      });
    });

    wireAvancement(p);
    wireProjetPhoto(p);

    const communeInput = projetBody.querySelector('[data-field="commune"]');
    const communeSuggest = document.getElementById('commune-suggestions');
    if (communeInput && communeSuggest){
      let communeDebounce = null;
      communeInput.addEventListener('input', () => {
        clearTimeout(communeDebounce);
        const q = communeInput.value.trim();
        if (q.length < 2){ communeSuggest.classList.remove('show'); return; }
        communeDebounce = setTimeout(() => {
          fetch('https://geo.api.gouv.fr/communes?nom=' + encodeURIComponent(q) + '&boost=population&limit=8&fields=nom,codesPostaux')
            .then(r => r.ok ? r.json() : [])
            .then(list => {
              if (!Array.isArray(list) || !list.length){ communeSuggest.classList.remove('show'); return; }
              communeSuggest.innerHTML = list.map(c =>
                '<div class="projet-suggestion-item" data-nom="' + escHtml(c.nom) + '">' + escHtml(c.nom) +
                (c.codesPostaux && c.codesPostaux[0] ? ' <span style="color:#9aa39c;">(' + c.codesPostaux[0] + ')</span>' : '') +
                '</div>'
              ).join('');
              communeSuggest.querySelectorAll('.projet-suggestion-item').forEach(item => {
                item.addEventListener('click', () => {
                  communeInput.value = item.dataset.nom;
                  communeSuggest.classList.remove('show');
                  communeInput.dispatchEvent(new Event('change'));
                });
              });
              communeSuggest.classList.add('show');
            })
            .catch(() => { communeSuggest.classList.remove('show'); });
        }, 250);
      });
      communeInput.addEventListener('blur', () => {
        setTimeout(() => communeSuggest.classList.remove('show'), 150);
      });
    }

    document.getElementById('projet-add-doc').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.addEventListener('change', () => {
        [...input.files].forEach(file => p.documents.push({ id:wikiNewId('pd'), type:'file', name:file.name, fileObj:file }));
        renderProjetDocs(p);
      });
      input.click();
    });

    document.getElementById('projet-add-checklist').addEventListener('click', () => {
      const templates = wikiCollectChecklistTemplates();
      if (!templates.length){ showToast('Aucun modèle de checklist trouvé dans le Wiki.'); return; }
      openTemplatePicker(templates, (tpl) => {
        p.checklists.push({ id:wikiNewId('pc'), name:tpl.name, items: tpl.items.map(i => ({ id:wikiNewId('i'), label:i.label, checked:false })) });
        renderProjetChecklists(p);
      });
    });

    renderProjetDocs(p);
    renderProjetChecklists(p);
  }

  function renderProjetMap(p){
    const q = [p.adresse, p.commune].filter(Boolean).join(', ');
    if (!q) return '<div class="checklist-empty">Renseignez une adresse ou une commune pour afficher la carte.</div>';
    const url = 'https://www.google.com/maps?q=' + encodeURIComponent(q) + '&output=embed';
    const link = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
    return '<iframe class="projet-map-frame" src="' + url + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
      '<a class="projet-map-link" href="' + link + '" target="_blank" rel="noopener">Ouvrir dans Google Maps ↗</a>';
  }

  function renderProjetDocs(p){
    const el = document.getElementById('projet-docs-list');
    if (!el) return;
    if (!p.documents.length){ el.innerHTML = '<div class="checklist-empty">Aucun document lié pour l’instant.</div>'; return; }
    el.innerHTML = p.documents.map(f =>
      '<div class="wiki-file-row" data-id="' + f.id + '">' + ICON_FILE +
      '<span class="wiki-file-name">' + escHtml(f.name) + '</span>' +
      '<span class="wiki-file-actions">' +
      '<button data-action="preview" data-id="' + f.id + '" title="Aperçu">' + ICON_EYE + '</button>' +
      '<button class="btn-delete-file" data-action="delete" data-id="' + f.id + '" title="Supprimer">' + ICON_TRASH + '</button>' +
      '</span></div>'
    ).join('');
    el.querySelectorAll('[data-action="preview"]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const f = p.documents.find(d => d.id === btn.dataset.id);
      if (f) openPreview(f);
    }));
    el.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      askConfirm('Supprimer ce document ?', '', () => {
        p.documents = p.documents.filter(d => d.id !== btn.dataset.id);
        renderProjetDocs(p);
      }, true);
    }));
  }

  function renderProjetChecklists(p){
    const el = document.getElementById('projet-checklists-list');
    if (!el) return;
    if (!p.checklists.length){ el.innerHTML = '<div class="checklist-empty">Aucune checklist attachée pour l’instant.</div>'; return; }
    el.innerHTML = p.checklists.map(c => {
      const done = c.items.filter(i => i.checked).length;
      return '<div class="wiki-file-row" data-id="' + c.id + '">' + ICON_CHECKLIST +
        '<span class="wiki-file-name">' + escHtml(c.name) + '<br><span style="font-size:11.5px;color:#9aa39c;font-weight:400;">' + done + ' / ' + c.items.length + ' étapes complétées</span></span>' +
        '<span class="wiki-file-actions"><button class="btn-delete-file" data-action="delete" data-id="' + c.id + '" title="Supprimer">' + ICON_TRASH + '</button></span></div>';
    }).join('');
    el.querySelectorAll('.wiki-file-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        const c = p.checklists.find(ch => ch.id === row.dataset.id);
        if (c) openChecklist(c, 'projet', p);
      });
    });
    el.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      askConfirm('Supprimer cette checklist ?', '', () => {
        p.checklists = p.checklists.filter(c => c.id !== btn.dataset.id);
        renderProjetChecklists(p);
      }, true);
    }));
  }


  const pickerOverlay = document.getElementById('picker-overlay');
  const pickerList = document.getElementById('picker-list');
  document.getElementById('picker-cancel').addEventListener('click', () => pickerOverlay.classList.add('hidden'));
  pickerOverlay.addEventListener('click', (e) => { if (e.target === pickerOverlay) pickerOverlay.classList.add('hidden'); });

  function openTemplatePicker(templates, onPick){
    pickerList.innerHTML = templates.map(t =>
      '<button class="btn-wiki-action" data-id="' + t.id + '" style="justify-content:flex-start;background:var(--gris-fond);color:var(--noir);">' +
      escHtml(t.name) + ' (' + t.items.length + ' étapes)</button>'
    ).join('');
    pickerList.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const tpl = templates.find(t => t.id === btn.dataset.id);
        pickerOverlay.classList.add('hidden');
        if (tpl) onPick(tpl);
      });
    });
    pickerOverlay.classList.remove('hidden');
  }

  renderProjets();

