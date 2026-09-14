/* app.js — interfaz y estado de la aplicación Libretas */

(() => {
  'use strict';

  const NOTEBOOK_COLORS = ['#3B6E68', '#7A4A42', '#B08A3E', '#47536B', '#6B4763', '#5B6B45'];

  // ---------- Estado ----------
  const state = {
    notebooks: [],
    currentNotebookId: null,
    currentNoteId: null,
    notesCache: [], // notas mostradas actualmente (del cuaderno o de la búsqueda)
    searchQuery: '',
    saveTimer: null,
    imageInsertRange: null,
  };

  // ---------- Referencias DOM ----------
  const el = {
    app: document.getElementById('app'),
    notebookList: document.getElementById('notebook-list'),
    btnNewNotebook: document.getElementById('btn-new-notebook'),
    globalSearch: document.getElementById('global-search'),

    notesPaneTitle: document.getElementById('notes-pane-title'),
    notesPaneSub: document.getElementById('notes-pane-sub'),
    notesList: document.getElementById('notes-list'),
    btnNewNote: document.getElementById('btn-new-note'),

    pageEmpty: document.getElementById('page-empty'),
    pageEditor: document.getElementById('page-editor'),
    noteTitle: document.getElementById('note-title'),
    noteContent: document.getElementById('note-content'),
    saveStatus: document.getElementById('save-status'),
    lineHeightRange: document.getElementById('line-height-range'),
    btnDeleteNote: document.getElementById('btn-delete-note'),
    btnInsertImage: document.getElementById('btn-insert-image'),
    imageInput: document.getElementById('image-input'),

    btnExport: document.getElementById('btn-export'),
    btnImport: document.getElementById('btn-import'),
    importInput: document.getElementById('import-input'),

    modalOverlay: document.getElementById('modal-overlay'),
    modalTitle: document.getElementById('modal-title'),
    modalBody: document.getElementById('modal-body'),
    modalActions: document.getElementById('modal-actions'),

    toast: document.getElementById('toast'),

    backToShelf: document.getElementById('back-to-shelf'),
    backToNotes: document.getElementById('back-to-notes'),
  };

  // ============================================================
  // Utilidades
  // ============================================================
  function showToast(msg, ms = 2600) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.toast.hidden = true; }, ms);
  }

  function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  function closeModal() {
    el.modalOverlay.hidden = true;
    el.modalBody.innerHTML = '';
    el.modalActions.innerHTML = '';
  }

  function openModal({ title, bodyHTML, buttons, onMount }) {
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = bodyHTML || '';
    el.modalActions.innerHTML = '';
    (buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.className || 'btn-secondary');
      btn.textContent = b.label;
      btn.addEventListener('click', () => b.onClick && b.onClick());
      el.modalActions.appendChild(btn);
    });
    el.modalOverlay.hidden = false;
    if (onMount) onMount();
  }

  el.modalOverlay.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) closeModal();
  });

  // ============================================================
  // Navegación móvil (3 columnas -> vistas apiladas)
  // ============================================================
  function setMobileView(view) {
    el.app.classList.remove('view-shelf', 'view-notes', 'view-page');
    el.app.classList.add('view-' + view);
  }
  el.backToShelf.addEventListener('click', () => setMobileView('shelf'));
  el.backToNotes.addEventListener('click', () => setMobileView('notes'));

  // ============================================================
  // Cuadernos
  // ============================================================
  async function loadNotebooks() {
    state.notebooks = await Db.getNotebooks();
    renderNotebooks();
  }

  function renderNotebooks() {
    el.notebookList.innerHTML = '';
    if (state.notebooks.length === 0) {
      el.notebookList.innerHTML = '<div class="shelf-empty">Todavía no tienes cuadernos.<br>Crea el primero con el botón +.</div>';
      return;
    }
    state.notebooks.forEach((nb) => {
      const item = document.createElement('div');
      item.className = 'notebook-item' + (nb.id === state.currentNotebookId ? ' active' : '');
      item.innerHTML = `
        <span class="spine" style="background:${nb.color}"></span>
        <span class="notebook-item-name"></span>
        <span class="notebook-item-count"></span>
        <button class="notebook-item-menu" title="Opciones" aria-label="Opciones del cuaderno">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/></svg>
        </button>`;
      item.querySelector('.notebook-item-name').textContent = nb.name;
      item.addEventListener('click', () => selectNotebook(nb.id));
      item.querySelector('.notebook-item-menu').addEventListener('click', (e) => {
        e.stopPropagation();
        openNotebookMenu(nb);
      });
      el.notebookList.appendChild(item);

      Db.getNotesByNotebook(nb.id).then((notes) => {
        item.querySelector('.notebook-item-count').textContent = notes.length || '';
      });
    });
  }

  function openNotebookMenu(nb) {
    openModal({
      title: nb.name,
      bodyHTML: '<p>¿Qué quieres hacer con este cuaderno?</p>',
      buttons: [
        { label: 'Cancelar', className: 'btn-secondary', onClick: closeModal },
        { label: 'Renombrar', className: 'btn-secondary', onClick: () => { closeModal(); openEditNotebookModal(nb); } },
        { label: 'Eliminar', className: 'btn-danger', onClick: () => { closeModal(); confirmDeleteNotebook(nb); } },
      ],
    });
  }

  function openNewNotebookModal() {
    openEditNotebookModal(null);
  }

  function openEditNotebookModal(existing) {
    const isEdit = !!existing;
    const selectedColor = existing ? existing.color : NOTEBOOK_COLORS[state.notebooks.length % NOTEBOOK_COLORS.length];
    const swatches = NOTEBOOK_COLORS.map((c) =>
      `<span class="color-swatch${c === selectedColor ? ' selected' : ''}" data-color="${c}" style="background:${c}"></span>`
    ).join('');

    openModal({
      title: isEdit ? 'Renombrar cuaderno' : 'Nuevo cuaderno',
      bodyHTML: `
        <label>Nombre
          <input type="text" id="nb-name-input" maxlength="60" placeholder="Ej. Biología" value="${existing ? escapeAttr(existing.name) : ''}" />
        </label>
        <div class="color-picker" id="nb-color-picker">${swatches}</div>
      `,
      buttons: [
        { label: 'Cancelar', className: 'btn-secondary', onClick: closeModal },
        {
          label: isEdit ? 'Guardar' : 'Crear',
          className: 'btn-primary',
          onClick: async () => {
            const input = document.getElementById('nb-name-input');
            const name = input.value.trim();
            if (!name) { input.focus(); return; }
            const chosen = el.modalBody.querySelector('.color-swatch.selected');
            const color = chosen ? chosen.dataset.color : selectedColor;
            if (isEdit) {
              await Db.updateNotebook(existing.id, { name, color });
              showToast('Cuaderno actualizado');
            } else {
              const nb = await Db.createNotebook({ name, color });
              showToast('Cuaderno creado');
              closeModal();
              await loadNotebooks();
              selectNotebook(nb.id);
              return;
            }
            closeModal();
            await loadNotebooks();
          },
        },
      ],
      onMount: () => {
        const inputEl = document.getElementById('nb-name-input');
        inputEl.focus();
        inputEl.select();
        inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.modalActions.lastChild.click(); });
        el.modalBody.querySelectorAll('.color-swatch').forEach((sw) => {
          sw.addEventListener('click', () => {
            el.modalBody.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
            sw.classList.add('selected');
          });
        });
      },
    });
  }

  function confirmDeleteNotebook(nb) {
    openModal({
      title: 'Eliminar cuaderno',
      bodyHTML: `<p>Se eliminará <strong>${escapeHtml(nb.name)}</strong> y todas sus páginas de forma permanente. Esta acción no se puede deshacer.</p>`,
      buttons: [
        { label: 'Cancelar', className: 'btn-secondary', onClick: closeModal },
        {
          label: 'Eliminar',
          className: 'btn-danger',
          onClick: async () => {
            await Db.deleteNotebook(nb.id);
            closeModal();
            if (state.currentNotebookId === nb.id) {
              state.currentNotebookId = null;
              state.currentNoteId = null;
              clearEditor();
              renderNotesPaneEmpty();
            }
            await loadNotebooks();
            showToast('Cuaderno eliminado');
          },
        },
      ],
    });
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ============================================================
  // Selección de cuaderno -> lista de notas
  // ============================================================
  async function selectNotebook(id) {
    state.currentNotebookId = id;
    state.searchQuery = '';
    el.globalSearch.value = '';
    renderNotebooks();
    await refreshNotesList();
    setMobileView('notes');
  }

  async function refreshNotesList() {
    if (!state.currentNotebookId) { renderNotesPaneEmpty(); return; }
    const nb = state.notebooks.find((n) => n.id === state.currentNotebookId);
    state.notesCache = await Db.getNotesByNotebook(state.currentNotebookId);
    el.notesPaneTitle.textContent = nb ? nb.name : 'Cuaderno';
    el.notesPaneSub.textContent = state.notesCache.length === 1 ? '1 página' : `${state.notesCache.length} páginas`;
    el.btnNewNote.disabled = false;
    renderNotesList(state.notesCache, { showNotebookDot: false });
  }

  function renderNotesPaneEmpty() {
    el.notesPaneTitle.textContent = 'Selecciona un cuaderno';
    el.notesPaneSub.textContent = '';
    el.btnNewNote.disabled = true;
    el.notesList.innerHTML = '<div class="notes-list-empty">Elige un cuaderno de la estantería para ver sus páginas.</div>';
  }

  function renderNotesList(notes, { showNotebookDot }) {
    el.notesList.innerHTML = '';
    if (notes.length === 0) {
      el.notesList.innerHTML = '<div class="notes-list-empty">Sin páginas todavía.<br>Crea una con el botón +.</div>';
      return;
    }
    notes.forEach((note) => {
      const card = document.createElement('div');
      card.className = 'note-card' + (note.id === state.currentNoteId ? ' active' : '');
      const nb = state.notebooks.find((n) => n.id === note.notebookId);
      card.innerHTML = `
        <p class="note-card-title"></p>
        <p class="note-card-snippet"></p>
        <div class="note-card-meta">
          ${showNotebookDot && nb ? `<span class="dot" style="background:${nb.color}"></span><span></span>·` : ''}
          <span></span>
        </div>`;
      card.querySelector('.note-card-title').textContent = note.title || 'Sin título';
      card.querySelector('.note-card-snippet').textContent = stripHtml(note.content) || 'Página vacía';
      const metaSpans = card.querySelectorAll('.note-card-meta span:not(.dot)');
      if (showNotebookDot && nb) {
        metaSpans[0].textContent = nb.name;
        metaSpans[1].textContent = formatDate(note.updatedAt);
      } else {
        metaSpans[0].textContent = formatDate(note.updatedAt);
      }
      card.addEventListener('click', () => openNote(note.id, note.notebookId));
      el.notesList.appendChild(card);
    });
  }

  async function createNote() {
    if (!state.currentNotebookId) return;
    const note = await Db.createNote({ notebookId: state.currentNotebookId, title: '', content: '', lineHeight: 32 });
    await refreshNotesList();
    openNote(note.id, note.notebookId);
    el.noteTitle.focus();
  }

  // ============================================================
  // Editor de página
  // ============================================================
  async function openNote(id, notebookId) {
    if (notebookId && notebookId !== state.currentNotebookId) {
      state.currentNotebookId = notebookId;
      renderNotebooks();
      await refreshNotesList();
    }
    const note = await Db.getNote(id);
    if (!note) return;
    state.currentNoteId = id;

    el.pageEmpty.hidden = true;
    el.pageEditor.hidden = false;
    el.noteTitle.value = note.title || '';
    el.noteContent.innerHTML = note.content || '';
    el.lineHeightRange.value = note.lineHeight || 32;
    document.getElementById('paper').style.setProperty('--line-height', (note.lineHeight || 32) + 'px');
    el.noteContent.style.lineHeight = (note.lineHeight || 32) + 'px';
    setSaveStatus('Guardado');

    highlightActiveNoteCard();
    setMobileView('page');
  }

  function highlightActiveNoteCard() {
    el.notesList.querySelectorAll('.note-card').forEach((c) => c.classList.remove('active'));
    const idx = state.notesCache.findIndex((n) => n.id === state.currentNoteId);
    if (idx >= 0 && el.notesList.children[idx]) el.notesList.children[idx].classList.add('active');
  }

  function clearEditor() {
    state.currentNoteId = null;
    el.pageEmpty.hidden = false;
    el.pageEditor.hidden = true;
    el.noteTitle.value = '';
    el.noteContent.innerHTML = '';
  }

  function setSaveStatus(text, saving) {
    el.saveStatus.textContent = text;
    el.saveStatus.classList.toggle('saving', !!saving);
  }

  function scheduleSave() {
    if (!state.currentNoteId) return;
    setSaveStatus('Escribiendo…', true);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveCurrentNote, 550);
  }

  async function saveCurrentNote() {
    if (!state.currentNoteId) return;
    setSaveStatus('Guardando…', true);
    await Db.updateNote(state.currentNoteId, {
      title: el.noteTitle.value.trim(),
      content: el.noteContent.innerHTML,
      lineHeight: Number(el.lineHeightRange.value),
    });
    setSaveStatus('Guardado');
    // refrescar metadatos en la lista sin perder el foco del editor
    if (state.searchQuery) {
      await runSearch(state.searchQuery, { silent: true });
    } else {
      state.notesCache = await Db.getNotesByNotebook(state.currentNotebookId);
      el.notesPaneSub.textContent = state.notesCache.length === 1 ? '1 página' : `${state.notesCache.length} páginas`;
      renderNotesList(state.notesCache, { showNotebookDot: false });
      highlightActiveNoteCard();
    }
    renderNotebooks();
  }

  el.noteTitle.addEventListener('input', scheduleSave);
  el.noteContent.addEventListener('input', scheduleSave);

  el.lineHeightRange.addEventListener('input', () => {
    const px = el.lineHeightRange.value + 'px';
    document.getElementById('paper').style.setProperty('--line-height', px);
    el.noteContent.style.lineHeight = px;
    scheduleSave();
  });

  window.addEventListener('beforeunload', () => {
    if (state.saveTimer) saveCurrentNote();
  });

  document.addEventListener('keydown', (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && document.activeElement === el.noteContent) {
      if (e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); scheduleSave(); }
      if (e.key.toLowerCase() === 'i') { e.preventDefault(); document.execCommand('italic'); scheduleSave(); }
      if (e.key.toLowerCase() === 'u') { e.preventDefault(); document.execCommand('underline'); scheduleSave(); }
    }
  });

  document.querySelectorAll('.tb-btn[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      el.noteContent.focus();
      document.execCommand(btn.dataset.cmd);
      scheduleSave();
    });
  });

  el.btnDeleteNote.addEventListener('click', () => {
    if (!state.currentNoteId) return;
    const id = state.currentNoteId;
    openModal({
      title: 'Eliminar página',
      bodyHTML: '<p>Esta página se eliminará de forma permanente.</p>',
      buttons: [
        { label: 'Cancelar', className: 'btn-secondary', onClick: closeModal },
        {
          label: 'Eliminar',
          className: 'btn-danger',
          onClick: async () => {
            await Db.deleteNote(id);
            closeModal();
            clearEditor();
            if (state.searchQuery) { await runSearch(state.searchQuery); }
            else { await refreshNotesList(); }
            renderNotebooks();
            showToast('Página eliminada');
            setMobileView('notes');
          },
        },
      ],
    });
  });

  // ---------- Inserción de imágenes ----------
  el.btnInsertImage.addEventListener('click', () => {
    el.noteContent.focus();
    const sel = window.getSelection();
    state.imageInsertRange = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    el.imageInput.value = '';
    el.imageInput.click();
  });

  el.imageInput.addEventListener('change', () => {
    const file = el.imageInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Elige un archivo de imagen'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      insertImageAtSaved(reader.result);
      scheduleSave();
    };
    reader.readAsDataURL(file);
  });

  function insertImageAtSaved(dataUrl) {
    const img = document.createElement('img');
    img.src = dataUrl;
    el.noteContent.focus();
    const sel = window.getSelection();
    let range = state.imageInsertRange;
    if (range && el.noteContent.contains(range.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      range = document.createRange();
      range.selectNodeContents(el.noteContent);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    range.insertNode(img);
    range.setStartAfter(img);
    range.setEndAfter(img);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ============================================================
  // Búsqueda global
  // ============================================================
  let searchDebounce = null;
  el.globalSearch.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = el.globalSearch.value.trim();
    searchDebounce = setTimeout(() => {
      if (!q) {
        state.searchQuery = '';
        if (state.currentNotebookId) refreshNotesList(); else renderNotesPaneEmpty();
      } else {
        runSearch(q);
      }
    }, 200);
  });

  async function runSearch(query, opts = {}) {
    state.searchQuery = query;
    const all = await Db.getAllNotes();
    const q = query.toLowerCase();
    const results = all
      .filter((n) => (n.title || '').toLowerCase().includes(q) || stripHtml(n.content).toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    state.notesCache = results;
    if (!opts.silent) {
      el.notesPaneTitle.textContent = 'Resultados de búsqueda';
      el.notesPaneSub.textContent = results.length === 1 ? '1 coincidencia' : `${results.length} coincidencias`;
      el.btnNewNote.disabled = true;
      renderNotesList(results, { showNotebookDot: true });
      setMobileView('notes');
    }
  }

  // ============================================================
  // Copia de seguridad
  // ============================================================
  el.btnExport.addEventListener('click', async () => {
    const data = await Db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `libretas-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Copia de seguridad exportada');
  });

  el.btnImport.addEventListener('click', () => el.importInput.click());

  el.importInput.addEventListener('change', () => {
    const file = el.importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); }
      catch (err) { showToast('El archivo no es un JSON válido'); return; }
      confirmImport(data);
    };
    reader.readAsText(file);
  });

  function confirmImport(data) {
    const nbCount = Array.isArray(data.notebooks) ? data.notebooks.length : 0;
    const noteCount = Array.isArray(data.notes) ? data.notes.length : 0;
    openModal({
      title: 'Importar copia de seguridad',
      bodyHTML: `
        <p>Este archivo contiene ${nbCount} cuaderno(s) y ${noteCount} página(s).</p>
        <div class="import-mode-choice">
          <label><input type="radio" name="import-mode" value="merge" checked>
            <span>Combinar<br><small>Añade estos datos a los que ya tienes.</small></span>
          </label>
          <label><input type="radio" name="import-mode" value="replace">
            <span>Reemplazar<br><small>Borra todo lo actual y lo sustituye por esta copia.</small></span>
          </label>
        </div>`,
      buttons: [
        { label: 'Cancelar', className: 'btn-secondary', onClick: closeModal },
        {
          label: 'Importar',
          className: 'btn-primary',
          onClick: async () => {
            const mode = el.modalBody.querySelector('input[name="import-mode"]:checked').value;
            try {
              await Db.importAll(data, { mode });
              closeModal();
              state.currentNotebookId = null;
              clearEditor();
              await loadNotebooks();
              renderNotesPaneEmpty();
              showToast('Copia importada correctamente');
            } catch (err) {
              showToast(err.message || 'No se pudo importar el archivo');
            }
          },
        },
      ],
    });
  }

  // ============================================================
  // Inicio
  // ============================================================
  el.btnNewNotebook.addEventListener('click', openNewNotebookModal);
  el.btnNewNote.addEventListener('click', createNote);

  async function init() {
    setMobileView('shelf');
    await loadNotebooks();
    renderNotesPaneEmpty();
  }

  init();
})();
