// ============================================================
// wiki-projets-core.js — module partagé Wiki + Récap. projets
// Chargé une seule fois (cache par URL dans loadExternalScript),
// avant wiki.js et/ou projets.js. Déclarations en portée globale
// (PAS d'IIFE ici) : wiki.js et projets.js doivent pouvoir
// référencer ces identifiants directement.
// ============================================================

  // ===== Wiki : explorateur de dossiers/fichiers (création, renommage, suppression, glisser-déposer) =====
  let wikiTree = [
    { id:'cat-procedures', type:'folder', name:'I. Procédures', children:[
      { id:'cat-crm', type:'folder', name:'1. CRM', children:[] },
      { id:'cat-accession-sociale', type:'folder', name:'2. Accession Sociale', children:[] },
      { id:'cat-livraison', type:'folder', name:'3. Livraison', children:[
        { id:'chk-livraison-neuf', type:'checklist', name:"Livraison d'un logement neuf", items:[
          { id:'i1', label:"Déclaration d'achèvement des travaux (DAACT) déposée et validée", checked:false },
          { id:'i2', label:'Réserves de réception de chantier levées', checked:false },
          { id:'i3', label:'Diagnostics obligatoires réalisés (DPE, mesurage le cas échéant)', checked:false },
          { id:'i4', label:"Dossier acquéreur finalisé (attestation de prêt, notification PTZ/PSLA)", checked:false },
          { id:'i5', label:'Solde du prix vérifié (dernier appel de fonds VEFA soldé)', checked:false },
          { id:'i6', label:"Convocation de l'acquéreur pour la livraison envoyée", checked:false },
          { id:'i7', label:"État des lieux contradictoire d'entrée réalisé", checked:false },
          { id:'i8', label:"Clés et carnet d'entretien du logement remis", checked:false },
          { id:'i9', label:'Garanties remises (parfait achèvement, biennale, décennale)', checked:false },
          { id:'i10', label:'Information sur la garantie de rachat/relogement donnée (si PSLA/BRS)', checked:false },
          { id:'i11', label:'Documents de copropriété / carnet d’information transmis', checked:false },
          { id:'i12', label:'Dossier de vente clôturé administrativement', checked:false },
        ]},
      ]},
      { id:'cat-garanties', type:'folder', name:'4. Garanties', children:[] },
      { id:'cat-pih', type:'folder', name:'5. PIH', children:[] },
      { id:'cat-vente-patrimoine', type:'folder', name:'6. Vente de patrimoine', children:[
        { id:'chk-vente-patrimoine', type:'checklist', name:'Vente de patrimoine', items:[
          { id:'i13', label:"Éligibilité du logement à la vente vérifiée (ancienneté, avis du maire, accord du représentant de l'État)", checked:false },
          { id:'i14', label:"Décision du Conseil d'Administration obtenue", checked:false },
          { id:'i15', label:'Diagnostics techniques réalisés (DPE, amiante, plomb, termites, état des risques)', checked:false },
          { id:'i16', label:'Prix de vente évalué (avis des Domaines)', checked:false },
          { id:'i17', label:'Locataire occupant informé de son droit de priorité', checked:false },
          { id:'i18', label:'Dossier acquéreur constitué (identité, ressources, plan de financement)', checked:false },
          { id:'i19', label:'Conditions de ressources vérifiées si accession sociale', checked:false },
          { id:'i20', label:'Avant-contrat rédigé (promesse ou compromis de vente)', checked:false },
          { id:'i21', label:'Droit de préemption purgé (commune, le cas échéant)', checked:false },
          { id:'i22', label:'Acte authentique signé chez le notaire', checked:false },
          { id:'i23', label:'État des lieux et remise des clés effectués', checked:false },
          { id:'i24', label:'Registre patrimonial mis à jour et dossier clôturé', checked:false },
        ]},
        { id:'chk-vente-vacant', type:'checklist', name:"Vente d'un logement vacant", items:[
          { id:'i25', label:'Éligibilité du logement à la vente vérifiée', checked:false },
          { id:'i26', label:'Diagnostics techniques obligatoires réalisés', checked:false },
          { id:'i27', label:'Prix de vente estimé (avis des Domaines)', checked:false },
          { id:'i28', label:'Logement mis en commercialisation (annonce, visites)', checked:false },
          { id:'i29', label:"Acquéreur sélectionné et éligibilité vérifiée (ressources, financement)", checked:false },
          { id:'i30', label:"Dossier de financement de l'acquéreur constitué", checked:false },
          { id:'i31', label:'Compromis de vente rédigé et signé', checked:false },
          { id:'i32', label:'Droits de préemption purgés', checked:false },
          { id:'i33', label:'Acte notarié signé', checked:false },
          { id:'i34', label:'État des lieux et remise des clés effectués', checked:false },
          { id:'i35', label:'Registre patrimonial mis à jour', checked:false },
        ]},
      ]},
    ]},
    { id:'cat-textes', type:'folder', name:'II. Textes de référence', children:[] },
    { id:'cat-ush', type:'folder', name:'III. USH', children:[] },
  ];
  let wikiSelectedId = 'cat-procedures';
  let wikiOpenFolders = new Set(['cat-procedures']);
  let wikiDraggedId = null;

  const ICON_FOLDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>';
  const ICON_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
  const ICON_PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
  const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
  const ICON_CHECKLIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2h6v4H9z"/><path d="m9.5 13.5 1.5 1.5 3.5-3.5"/></svg>';
  const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

  function escHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ----- Boîte de dialogue maison (remplace prompt/confirm, bloqués dans certains aperçus) -----
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalMessage = document.getElementById('modal-message');
  const modalInput = document.getElementById('modal-input');
  const modalCancel = document.getElementById('modal-cancel');
  const modalConfirm = document.getElementById('modal-confirm');
  let modalOnConfirm = null;

  function closeModal(){ modalOverlay.classList.add('hidden'); modalOnConfirm = null; }
  modalCancel.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  modalConfirm.addEventListener('click', () => {
    const cb = modalOnConfirm;
    const value = modalInput.classList.contains('hidden') ? true : modalInput.value.trim();
    closeModal();
    if (cb && value) cb(value);
  });
  modalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter'){ e.preventDefault(); modalConfirm.click(); } });

  function askPrompt(title, message, defaultValue, onConfirm){
    modalTitle.textContent = title;
    modalMessage.textContent = message || '';
    modalMessage.style.display = message ? 'block' : 'none';
    modalInput.classList.remove('hidden');
    modalInput.value = defaultValue || '';
    modalConfirm.textContent = 'Valider';
    modalConfirm.classList.remove('danger');
    modalOnConfirm = onConfirm;
    modalOverlay.classList.remove('hidden');
    setTimeout(() => { modalInput.focus(); modalInput.select(); }, 30);
  }
  function askConfirm(title, message, onConfirm, danger){
    modalTitle.textContent = title;
    modalMessage.textContent = message || '';
    modalMessage.style.display = 'block';
    modalInput.classList.add('hidden');
    modalConfirm.textContent = danger ? 'Supprimer' : 'Confirmer';
    modalConfirm.classList.toggle('danger', !!danger);
    modalOnConfirm = () => onConfirm();
    modalOverlay.classList.remove('hidden');
  }

  // ----- Notification légère -----
  let toastTimer = null;
  function showToast(message){
    let toast = document.getElementById('toast');
    if (!toast){
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function wikiFindNode(nodes, id, parentArray){
    parentArray = parentArray || nodes;
    for (const n of nodes){
      if (n.id === id) return { node:n, parentChildren:parentArray };
      if (n.children && n.children.length){
        const found = wikiFindNode(n.children, id, n.children);
        if (found) return found;
      }
    }
    return null;
  }
  function wikiIsDescendant(node, targetId){
    if (!node.children) return false;
    for (const c of node.children){
      if (c.id === targetId || wikiIsDescendant(c, targetId)) return true;
    }
    return false;
  }
  function wikiNewId(prefix){ return prefix + Date.now() + Math.random().toString(36).slice(2,6); }

  // ----- Checklists interactives -----
  const checklistOverlay = document.getElementById('checklist-overlay');
  const checklistTitleEl = document.getElementById('checklist-title');
  const checklistProgressEl = document.getElementById('checklist-progress');
  const checklistItemsEl = document.getElementById('checklist-items');
  let checklistCurrentNode = null;
  let checklistContext = null;
  let checklistContextProjet = null;

  function refreshChecklistContext(){
    if (checklistContext === 'projet' && checklistContextProjet) renderProjetChecklists(checklistContextProjet);
    else renderWikiPanel();
  }

  function renderChecklistItems(){
    const list = checklistCurrentNode.items;
    const done = list.filter(i => i.checked).length;
    checklistProgressEl.textContent = done + ' / ' + list.length + ' étapes complétées';
    if (!list.length){
      checklistItemsEl.innerHTML = '<div class="checklist-empty">Aucune étape pour l’instant — ajoutez-en une ci-dessous.</div>';
      return;
    }
    checklistItemsEl.innerHTML = '';
    list.forEach(item => {
      const row = document.createElement('div');
      row.className = 'checklist-item' + (item.checked ? ' done' : '');
      row.innerHTML = '<input type="checkbox" id="ci-' + item.id + '"' + (item.checked ? ' checked' : '') + '>' +
        '<label for="ci-' + item.id + '">' + escHtml(item.label) + '</label>' +
        '<button data-id="' + item.id + '" title="Supprimer l’étape">' + ICON_TRASH + '</button>';
      row.querySelector('input').addEventListener('change', (e) => {
        item.checked = e.target.checked;
        renderChecklistItems();
        refreshChecklistContext();
      });
      row.querySelector('button').addEventListener('click', () => {
        checklistCurrentNode.items = checklistCurrentNode.items.filter(i => i.id !== item.id);
        renderChecklistItems();
        refreshChecklistContext();
      });
      checklistItemsEl.appendChild(row);
    });
  }

  function openChecklist(node, context, projetRef){
    checklistCurrentNode = node;
    checklistContext = context || 'wiki';
    checklistContextProjet = projetRef || null;
    checklistTitleEl.textContent = node.name;
    renderChecklistItems();
    checklistOverlay.classList.remove('hidden');
  }
  function closeChecklist(){
    checklistOverlay.classList.add('hidden');
    refreshChecklistContext();
  }
  document.getElementById('checklist-close').addEventListener('click', closeChecklist);
  checklistOverlay.addEventListener('click', (e) => { if (e.target === checklistOverlay) closeChecklist(); });
  document.getElementById('checklist-reset').addEventListener('click', () => {
    askConfirm('Réinitialiser cette checklist ?', 'Toutes les cases seront décochées.', () => {
      checklistCurrentNode.items.forEach(i => i.checked = false);
      renderChecklistItems();
      refreshChecklistContext();
    });
  });
  document.getElementById('checklist-add-item').addEventListener('click', () => {
    askPrompt('Nouvelle étape', '', '', (label) => {
      checklistCurrentNode.items.push({ id:wikiNewId('i'), label, checked:false });
      renderChecklistItems();
      refreshChecklistContext();
    });
  });

  // ----- Visionneuse de documents -----
  const previewOverlay = document.getElementById('preview-overlay');
  const previewTitle = document.getElementById('preview-title');
  const previewBody = document.getElementById('preview-body');
  const previewDownload = document.getElementById('preview-download');
  const previewClose = document.getElementById('preview-close');

  function closePreview(){
    previewOverlay.classList.add('hidden');
    previewBody.innerHTML = '';
  }
  previewClose.addEventListener('click', closePreview);
  previewOverlay.addEventListener('click', (e) => { if (e.target === previewOverlay) closePreview(); });

  function openPreview(fileNode){
    previewTitle.textContent = fileNode.name;
    previewDownload.classList.add('hidden');

    if (!fileNode.fileObj){
      previewBody.innerHTML = '<div class="wiki-empty">' + ICON_FILE + '<strong>Aperçu indisponible</strong><span>Le contenu de ce document n’est plus disponible dans cette session.</span></div>';
      previewOverlay.classList.remove('hidden');
      return;
    }

    previewBody.innerHTML = '<div class="wiki-empty">' + ICON_FILE + '<strong>Chargement de l’aperçu…</strong><span></span></div>';
    previewOverlay.classList.remove('hidden');

    const ext = (fileNode.name.split('.').pop() || '').toLowerCase();
    const mime = fileNode.fileObj.type || '';

    if (mime.startsWith('text/') || ['txt','csv','md','json'].includes(ext)){
      fileNode.fileObj.text().then(text => {
        previewBody.innerHTML = '';
        const pre = document.createElement('pre');
        pre.className = 'preview-text';
        pre.textContent = text.slice(0, 20000);
        previewBody.appendChild(pre);
        previewDownload.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
        previewDownload.download = fileNode.name;
        previewDownload.classList.remove('hidden');
      });
      return;
    }

    // Encodage en base64 (data URL) plutôt qu'en URL temporaire : passe mieux les aperçus intégrés en bac à sable,
    // et fonctionnera de toute façon une fois le site réellement déployé.
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      previewDownload.href = dataUrl;
      previewDownload.download = fileNode.name;
      previewDownload.classList.remove('hidden');
      previewBody.innerHTML = '';

      if (mime.startsWith('image/')){
        const img = document.createElement('img');
        img.className = 'preview-img';
        img.src = dataUrl;
        previewBody.appendChild(img);
      } else if (mime === 'application/pdf' || ext === 'pdf'){
        const frame = document.createElement('iframe');
        frame.className = 'preview-frame';
        frame.src = dataUrl;
        previewBody.appendChild(frame);
      } else {
        previewBody.innerHTML = '<div class="wiki-empty">' + ICON_FILE +
          '<strong>Aperçu non disponible pour ce type de fichier</strong>' +
          '<span>Les formats Word / Excel / PowerPoint ne peuvent pas s’afficher directement dans le navigateur — ce sera possible via un lecteur en ligne une fois le stockage réel branché. Téléchargez le document ci-dessus.</span></div>';
      }
    };
    reader.onerror = () => {
      previewBody.innerHTML = '<div class="wiki-empty">' + ICON_FILE + '<strong>Impossible de lire ce fichier</strong><span></span></div>';
    };
    reader.readAsDataURL(fileNode.fileObj);
  }

  // ----- Sélecteur de modèle de checklist (issu du Wiki) -----
  function wikiCollectChecklistTemplates(){
    const acc = [];
    (function walk(nodes){
      nodes.forEach(n => {
        if (n.type === 'checklist') acc.push(n);
        if (n.children) walk(n.children);
      });
    })(wikiTree);
    return acc;
  }

