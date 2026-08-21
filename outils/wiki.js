// ============================================================
// wiki.js — Wiki de l'accession (arborescence, panneau, DnD)
// Dépend de wiki-projets-core.js (chargé avant, via TOOL_DEPS).
// ============================================================

  function renderWikiTree(){
    const root = document.getElementById('wiki-categories');
    root.innerHTML = '';
    root.appendChild(renderWikiNodes(wikiTree, 0));
  }

  function renderWikiNodes(nodes, depth){
    const wrap = document.createElement('div');
    wrap.className = 'wiki-node-children' + (depth > 0 ? ' nested' : '');
    nodes.filter(n => n.type === 'folder').forEach(node => wrap.appendChild(renderWikiNode(node, depth)));
    return wrap;
  }

  function renderWikiNode(node, depth){
    const container = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'wiki-node-row type-' + node.type + (node.id === wikiSelectedId ? ' active' : '');
    row.draggable = true;
    row.dataset.id = node.id;

    const open = node.type === 'folder' && wikiOpenFolders.has(node.id);
    let inner = '<span class="chevron-wrap" style="transform:rotate(' + (open ? '90deg' : '0deg') + ')">' + (node.type === 'folder' ? ICON_CHEVRON : '') + '</span>';
    inner += '<span class="wiki-node-icon">' + (node.type === 'folder' ? ICON_FOLDER : ICON_FILE) + '</span>';
    inner += '<span class="wiki-node-name">' + node.name + '</span>';
    inner += '<span class="wiki-node-actions">';
    if (node.type === 'folder') inner += '<button data-action="add" title="Nouveau sous-dossier">' + ICON_PLUS + '</button>';
    inner += '<button data-action="rename" title="Renommer">' + ICON_PENCIL + '</button>';
    inner += '<button data-action="delete" title="Supprimer">' + ICON_TRASH + '</button>';
    inner += '</span>';
    row.innerHTML = inner;

    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      if (node.type === 'folder'){
        if (wikiOpenFolders.has(node.id)) wikiOpenFolders.delete(node.id);
        else wikiOpenFolders.add(node.id);
      }
      wikiSelectedId = node.id;
      renderWikiTree();
      renderWikiPanel();
    });

    row.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'add'){
          askPrompt('Nouveau sous-dossier', 'Créé dans « ' + node.name + ' »', '', (name) => {
            node.children.push({ id:wikiNewId('f'), type:'folder', name, children:[] });
            wikiOpenFolders.add(node.id);
            renderWikiTree();
          });
        } else if (action === 'rename'){
          askPrompt('Renommer', '', node.name, (name) => {
            node.name = name; renderWikiTree(); renderWikiPanel();
          });
        } else if (action === 'delete'){
          askConfirm('Supprimer « ' + node.name + ' » ?', 'Le dossier et tout son contenu seront supprimés.', () => {
            const found = wikiFindNode(wikiTree, node.id);
            if (found){
              const idx = found.parentChildren.indexOf(node);
              if (idx > -1) found.parentChildren.splice(idx, 1);
              if (wikiSelectedId === node.id) wikiSelectedId = 'cat-procedures';
              renderWikiTree();
              renderWikiPanel();
            }
          }, true);
        }
      });
    });

    row.addEventListener('dragstart', (e) => { wikiDraggedId = node.id; row.classList.add('dragging'); e.stopPropagation(); });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (e) => {
      e.preventDefault(); e.stopPropagation();
      document.querySelectorAll('.wiki-node-row.drag-over, .wiki-node-row.drop-line-above, .wiki-node-row.drop-line-below')
        .forEach(r => { r.classList.remove('drag-over', 'drop-line-above', 'drop-line-below'); delete r.dataset.dropZone; });
      const rect = row.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      if (ratio < 0.25){
        row.classList.add('drop-line-above');
        row.dataset.dropZone = 'before';
      } else if (ratio > 0.75 || node.type !== 'folder'){
        row.classList.add('drop-line-below');
        row.dataset.dropZone = 'after';
      } else {
        row.classList.add('drag-over');
        row.dataset.dropZone = 'inside';
      }
    });
    row.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && row.contains(e.relatedTarget)) return;
      row.classList.remove('drag-over', 'drop-line-above', 'drop-line-below');
      delete row.dataset.dropZone;
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      const zone = row.dataset.dropZone || 'inside';
      row.classList.remove('drag-over', 'drop-line-above', 'drop-line-below');
      delete row.dataset.dropZone;
      if (!wikiDraggedId || wikiDraggedId === node.id) return;
      const draggedFound = wikiFindNode(wikiTree, wikiDraggedId);
      if (!draggedFound) return;
      if (wikiIsDescendant(draggedFound.node, node.id)){ showToast("Impossible de déplacer un dossier dans l'un de ses propres sous-dossiers."); return; }

      const idxOld = draggedFound.parentChildren.indexOf(draggedFound.node);
      if (idxOld > -1) draggedFound.parentChildren.splice(idxOld, 1);

      if (zone === 'inside'){
        node.children.push(draggedFound.node);
        wikiOpenFolders.add(node.id);
      } else {
        const targetFound = wikiFindNode(wikiTree, node.id);
        if (!targetFound){
          wikiTree.push(draggedFound.node);
        } else {
          let insertIdx = targetFound.parentChildren.indexOf(targetFound.node);
          if (zone === 'after') insertIdx += 1;
          targetFound.parentChildren.splice(insertIdx, 0, draggedFound.node);
        }
      }
      wikiSelectedId = draggedFound.node.id;
      wikiDraggedId = null;
      renderWikiTree();
      renderWikiPanel();
      wikiFlashRow(wikiSelectedId);
    });

    container.appendChild(row);
    if (node.type === 'folder' && open && node.children.length){
      container.appendChild(renderWikiNodes(node.children, depth + 1));
    }
    return container;
  }

  function wikiBreadcrumb(id){
    function walk(nodes, path){
      for (const n of nodes){
        const newPath = path.concat([n.name]);
        if (n.id === id) return newPath;
        if (n.children){
          const found = walk(n.children, newPath);
          if (found) return found;
        }
      }
      return null;
    }
    return walk(wikiTree, []) || [];
  }

  function renderWikiPanel(){
    const found = wikiFindNode(wikiTree, wikiSelectedId);
    const title = document.getElementById('wiki-panel-title');
    const sub = document.getElementById('wiki-panel-sub');
    const breadcrumb = document.getElementById('wiki-breadcrumb');
    const filesList = document.getElementById('wiki-files-list');

    if (!found || found.node.type !== 'folder'){
      title.textContent = 'Sélectionnez un dossier';
      sub.textContent = '';
      breadcrumb.textContent = '';
      filesList.innerHTML = '';
      return;
    }
    const node = found.node;
    const crumb = wikiBreadcrumb(node.id);
    breadcrumb.textContent = crumb.slice(0, -1).join(' / ') || 'Racine du wiki';
    title.textContent = node.name;
    const folders = node.children.filter(c => c.type === 'folder');
    const items = node.children.filter(c => c.type === 'file' || c.type === 'checklist');
    sub.textContent = items.length + ' élément(s)' + (folders.length ? ' · ' + folders.length + ' sous-dossier(s)' : '');

    if (!items.length){
      filesList.innerHTML = '<div class="wiki-empty">' + ICON_FILE + '<strong>Aucun document pour l’instant</strong><span>Ajoutez un fichier ou une checklist avec les boutons ci-dessus, ou glissez un document depuis un autre dossier.</span></div>';
      return;
    }
    filesList.innerHTML = items.map(it => {
      if (it.type === 'checklist'){
        const done = it.items.filter(i => i.checked).length;
        return '<div class="wiki-file-row" data-id="' + it.id + '" data-type="checklist">' + ICON_CHECKLIST +
          '<span class="wiki-file-name">' + it.name + '<br><span style="font-size:11.5px;color:#9aa39c;font-weight:400;">' + done + ' / ' + it.items.length + ' étapes complétées</span></span>' +
          '<span class="wiki-file-actions"><button class="btn-delete-file" data-action="delete-item" data-id="' + it.id + '" title="Supprimer">' + ICON_TRASH + '</button></span></div>';
      }
      return '<div class="wiki-file-row" draggable="true" data-id="' + it.id + '" data-type="file">' + ICON_FILE +
        '<span class="wiki-file-name">' + it.name + '</span>' +
        '<span class="wiki-file-actions">' +
        '<button data-action="preview-file" data-id="' + it.id + '" title="Aperçu">' + ICON_EYE + '</button>' +
        '<button class="btn-delete-file" data-action="delete-item" data-id="' + it.id + '" title="Supprimer">' + ICON_TRASH + '</button>' +
        '</span></div>';
    }).join('');
    filesList.querySelectorAll('[data-action="delete-item"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        askConfirm('Supprimer cet élément ?', '', () => {
          node.children = node.children.filter(c => c.id !== btn.dataset.id);
          renderWikiPanel();
          renderWikiTree();
        }, true);
      });
    });
    filesList.querySelectorAll('[data-action="preview-file"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const f = node.children.find(c => c.id === btn.dataset.id);
        if (f) openPreview(f);
      });
    });
    filesList.querySelectorAll('.wiki-file-row').forEach(row => {
      row.addEventListener('click', () => {
        const it = node.children.find(c => c.id === row.dataset.id);
        if (!it) return;
        if (it.type === 'checklist') openChecklist(it, 'wiki');
        else openPreview(it);
      });
      if (row.dataset.type === 'file'){
        row.addEventListener('dragstart', () => { wikiDraggedId = row.dataset.id; row.classList.add('dragging'); });
        row.addEventListener('dragend', () => row.classList.remove('dragging'));
      }
    });
  }

  function wikiFlashRow(id){
    requestAnimationFrame(() => {
      const el = document.querySelector('.wiki-node-row[data-id="' + id + '"]');
      if (!el) return;
      el.scrollIntoView({ behavior:'smooth', block:'nearest' });
      el.classList.add('flash-row');
      setTimeout(() => el.classList.remove('flash-row'), 900);
    });
  }

  function wikiCollectFolderIds(nodes, acc){
    nodes.forEach(n => { if (n.type === 'folder'){ acc.push(n.id); wikiCollectFolderIds(n.children, acc); } });
    return acc;
  }

  document.getElementById('btn-expand-all').addEventListener('click', () => {
    wikiOpenFolders = new Set(wikiCollectFolderIds(wikiTree, []));
    renderWikiTree();
  });
  document.getElementById('btn-collapse-all').addEventListener('click', () => {
    wikiOpenFolders = new Set();
    renderWikiTree();
  });


  document.getElementById('btn-add-checklist').addEventListener('click', () => {
    const found = wikiFindNode(wikiTree, wikiSelectedId);
    if (!found || found.node.type !== 'folder'){ showToast('Sélectionnez un dossier avant de créer une checklist.'); return; }
    askPrompt('Nouvelle checklist', 'Créée dans « ' + found.node.name + ' »', '', (name) => {
      found.node.children.push({ id:wikiNewId('c'), type:'checklist', name, items:[] });
      wikiOpenFolders.add(found.node.id);
      renderWikiTree();
      renderWikiPanel();
    });
  });

  document.getElementById('btn-new-root-folder').addEventListener('click', () => {
    askPrompt('Nouveau dossier', 'Créé à la racine du wiki', '', (name) => {
      wikiTree.push({ id:wikiNewId('f'), type:'folder', name, children:[] });
      renderWikiTree();
    });
  });

  document.getElementById('btn-add-doc').addEventListener('click', () => {
    const found = wikiFindNode(wikiTree, wikiSelectedId);
    if (!found || found.node.type !== 'folder'){ showToast('Sélectionnez un dossier avant d’ajouter un document.'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.addEventListener('change', () => {
      if (input.files.length){
        [...input.files].forEach(file => found.node.children.push({ id:wikiNewId('d'), type:'file', name:file.name, fileObj:file }));
        wikiOpenFolders.add(found.node.id);
        renderWikiTree();
        renderWikiPanel();
      }
    });
    input.click();
  });

  const wikiRootZone = document.getElementById('wiki-categories');
  wikiRootZone.addEventListener('dragover', (e) => e.preventDefault());
  wikiRootZone.addEventListener('drop', (e) => {
    if (e.target.closest('.wiki-node-row')) return;
    if (!wikiDraggedId) return;
    const draggedFound = wikiFindNode(wikiTree, wikiDraggedId);
    if (!draggedFound) return;
    const idx = draggedFound.parentChildren.indexOf(draggedFound.node);
    if (idx > -1) draggedFound.parentChildren.splice(idx, 1);
    wikiTree.push(draggedFound.node);
    wikiSelectedId = draggedFound.node.id;
    wikiDraggedId = null;
    renderWikiTree();
    renderWikiPanel();
    wikiFlashRow(wikiSelectedId);
  });

  // Filet de sécurité : nettoie tout contour/trait de dépôt "collé" si le glisser se termine hors zone valide
  document.addEventListener('dragend', () => {
    document.querySelectorAll('.drag-over, .drop-line-above, .drop-line-below').forEach(r => {
      r.classList.remove('drag-over', 'drop-line-above', 'drop-line-below');
      delete r.dataset.dropZone;
    });
    document.querySelectorAll('.dragging').forEach(r => r.classList.remove('dragging'));
    wikiDraggedId = null;
  });

  renderWikiTree();
  renderWikiPanel();

