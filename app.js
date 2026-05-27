import { fetchTasks, createTask, updateTask, deleteTask, reorderTasks, subscribeToTasks } from './supabase.js';

// ---- State ----
let tasks = [];
let draggedTaskId = null;
let appInitialized = false;
let openTaskId = null;
let saveTimeout = null;
let showingArchive = false;

// ---- DOM ----
const detailOverlay = document.getElementById('detail-overlay');
const detailPanel = document.getElementById('detail-panel');
const detailCloseBtn = document.getElementById('detail-close-btn');
const detailTitle = document.getElementById('detail-title');
const detailStatus = document.getElementById('detail-status');
const detailDescription = document.getElementById('detail-description');
const detailDueDate = document.getElementById('detail-due-date');
const detailLinks = document.getElementById('detail-links');
const linkLabelInput = document.getElementById('link-label-input');
const linkUrlInput = document.getElementById('link-url-input');
const addLinkBtn = document.getElementById('add-link-btn');
const detailArchiveBtn = document.getElementById('detail-archive-btn');
const detailDeleteBtn = document.getElementById('detail-delete-btn');
const archiveToggleBtn = document.getElementById('archive-toggle-btn');
const archiveView = document.getElementById('archive-view');
const archiveList = document.getElementById('archive-list');
const archiveCount = document.getElementById('archive-count');
const archiveEmpty = document.getElementById('archive-empty');
const matrixEl = document.querySelector('.matrix');

// ---- Init ----

export async function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  tasks = await fetchTasks();
  renderAllQuadrants();
  setupDragAndDrop();
  setupAddForms();
  setupDetailPanel();
  setupArchiveToggle();
  subscribeToTasks(handleRealtimeEvent);
}

// ---- Rendering ----

function renderAllQuadrants() {
  for (let q = 1; q <= 4; q++) {
    renderQuadrant(q);
  }
}

function renderQuadrant(quadrant) {
  const list = document.querySelector(`.task-list[data-quadrant="${quadrant}"]`);
  const quadrantTasks = tasks
    .filter(t => t.quadrant === quadrant && !t.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order);

  list.innerHTML = '';
  quadrantTasks.forEach(task => {
    list.appendChild(createTaskCard(task));
  });
}

function createTaskCard(task) {
  const status = task.status || 'todo';
  const card = document.createElement('div');
  card.className = `task-card status-${status}`;
  card.draggable = true;
  card.dataset.taskId = task.id;

  const body = document.createElement('div');
  body.className = 'task-card-body';
  body.addEventListener('click', (e) => {
    if (e.target.contentEditable === 'true') return;
    openDetailPanel(task.id);
  });

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;

  body.appendChild(title);

  // Meta row: status + due date + link count
  const meta = document.createElement('div');
  meta.className = 'task-meta';

  const statusLabels = {
    todo: 'Todo',
    in_progress: 'In Progress',
    done: 'Done',
    paused: 'Paused',
    cancelled: 'Cancelled',
  };
  const statusBadge = document.createElement('span');
  statusBadge.className = 'task-status';
  statusBadge.dataset.status = status;
  statusBadge.textContent = statusLabels[status] || status;
  meta.appendChild(statusBadge);

  if (task.due_date) {
    const due = document.createElement('span');
    due.className = 'task-due';
    const dueDate = new Date(task.due_date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      due.classList.add('overdue');
      due.textContent = `Overdue (${formatDate(task.due_date)})`;
    } else if (diffDays <= 2) {
      due.classList.add('due-soon');
      due.textContent = diffDays === 0 ? 'Due today' : diffDays === 1 ? 'Due tomorrow' : `Due in 2d`;
    } else {
      due.textContent = formatDate(task.due_date);
    }
    meta.appendChild(due);

  }

  const links = task.links || [];
  if (links.length > 0) {
    const linkCount = document.createElement('span');
    linkCount.className = 'task-link-count';
    linkCount.textContent = `${links.length} link${links.length > 1 ? 's' : ''}`;
    meta.appendChild(linkCount);

  }

  body.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const editBtn = document.createElement('button');
  editBtn.textContent = 'edit';
  editBtn.title = 'Edit title';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startEditing(card, task);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = 'x';
  deleteBtn.title = 'Delete task';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDelete(task.id);
  });

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  card.appendChild(body);
  card.appendChild(actions);

  card.addEventListener('dragstart', (e) => {
    draggedTaskId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedTaskId = null;
    clearDropIndicators();
  });

  return card;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// ---- Detail Panel ----

function setupDetailPanel() {
  detailCloseBtn.addEventListener('click', closeDetailPanel);
  detailOverlay.addEventListener('click', closeDetailPanel);

  // Auto-save on field changes with debounce
  detailTitle.addEventListener('input', () => debounceSaveDetail());
  detailDescription.addEventListener('input', () => debounceSaveDetail());
  detailStatus.addEventListener('change', () => saveDetailNow());
  detailDueDate.addEventListener('change', () => saveDetailNow());

  addLinkBtn.addEventListener('click', addLink);
  linkUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addLink(); }
  });

  detailArchiveBtn.addEventListener('click', () => {
    if (openTaskId) {
      handleArchiveToggle(openTaskId);
      closeDetailPanel();
    }
  });

  detailDeleteBtn.addEventListener('click', () => {
    if (openTaskId) {
      handleDelete(openTaskId);
      closeDetailPanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openTaskId) closeDetailPanel();
  });
}

function openDetailPanel(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  openTaskId = taskId;
  detailTitle.value = task.title;
  detailStatus.value = task.status || 'todo';
  detailDescription.value = task.description || '';
  detailDueDate.value = task.due_date || '';
  renderDetailLinks(task.links || []);

  // Update archive button text
  detailArchiveBtn.textContent = task.archived_at ? 'Unarchive' : 'Archive';

  detailOverlay.classList.add('open');
  detailPanel.classList.add('open');
}

function closeDetailPanel() {
  // Save any pending changes
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
    saveDetailNow();
  }
  openTaskId = null;
  detailOverlay.classList.remove('open');
  detailPanel.classList.remove('open');
}

function debounceSaveDetail() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    saveDetailNow();
  }, 500);
}

async function saveDetailNow() {
  if (!openTaskId) return;
  const task = tasks.find(t => t.id === openTaskId);
  if (!task) return;

  const newTitle = detailTitle.value.trim();
  const newStatus = detailStatus.value;
  const newDescription = detailDescription.value.trim() || null;
  const newDueDate = detailDueDate.value || null;

  if (!newTitle) return;

  const updates = {};
  if (newTitle !== task.title) updates.title = newTitle;
  if (newStatus !== (task.status || 'todo')) updates.status = newStatus;
  if (newDescription !== (task.description || null)) updates.description = newDescription;
  if (newDueDate !== (task.due_date || null)) updates.due_date = newDueDate;

  if (Object.keys(updates).length === 0) return;

  Object.assign(task, updates);
  renderQuadrant(task.quadrant);

  await updateTask(task.id, updates);
}

function renderDetailLinks(links) {
  detailLinks.innerHTML = '';
  links.forEach((link, idx) => {
    const item = document.createElement('div');
    item.className = 'link-item';

    if (link.label && link.label !== link.url) {
      const label = document.createElement('span');
      label.className = 'link-label';
      label.textContent = link.label;
      item.appendChild(label);
    }

    const a = document.createElement('a');
    const isSafeUrl = /^https?:\/\//.test(link.url) || /^\//.test(link.url) || /^file:\/\//.test(link.url);
    a.href = isSafeUrl ? link.url : '#';
    a.textContent = link.url;
    a.target = '_blank';
    a.rel = 'noopener';
    if (!isSafeUrl) a.title = link.url;
    item.appendChild(a);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'link-remove-btn';
    removeBtn.textContent = 'x';
    removeBtn.addEventListener('click', () => removeLink(idx));
    item.appendChild(removeBtn);

    detailLinks.appendChild(item);
  });
}

async function addLink() {
  if (!openTaskId) return;
  const task = tasks.find(t => t.id === openTaskId);
  if (!task) return;

  const url = linkUrlInput.value.trim();
  if (!url) return;

  const label = linkLabelInput.value.trim() || url;
  const links = [...(task.links || []), { label, url }];

  task.links = links;
  renderDetailLinks(links);
  linkLabelInput.value = '';
  linkUrlInput.value = '';

  await updateTask(task.id, { links });
  renderQuadrant(task.quadrant);
}

async function removeLink(index) {
  if (!openTaskId) return;
  const task = tasks.find(t => t.id === openTaskId);
  if (!task) return;

  const links = [...(task.links || [])];
  links.splice(index, 1);
  task.links = links;
  renderDetailLinks(links);

  await updateTask(task.id, { links });
  renderQuadrant(task.quadrant);
}

// ---- Archive ----

function setupArchiveToggle() {
  archiveToggleBtn.addEventListener('click', () => {
    showingArchive = !showingArchive;
    archiveToggleBtn.classList.toggle('active', showingArchive);
    archiveView.hidden = !showingArchive;
    matrixEl.style.display = showingArchive ? 'none' : '';
    if (showingArchive) renderArchiveView();
  });
}

function renderArchiveView() {
  const archived = tasks
    .filter(t => t.archived_at)
    .sort((a, b) => new Date(b.archived_at) - new Date(a.archived_at));

  archiveCount.textContent = `${archived.length} task${archived.length !== 1 ? 's' : ''}`;
  archiveEmpty.hidden = archived.length > 0;
  archiveList.innerHTML = '';

  const quadrantNames = { 1: 'Do', 2: 'Schedule', 3: 'Delegate', 4: 'Eliminate' };

  archived.forEach(task => {
    const card = document.createElement('div');
    card.className = 'archive-card';
    card.addEventListener('click', () => openDetailPanel(task.id));

    const statusBadge = document.createElement('span');
    statusBadge.className = 'task-status';
    statusBadge.dataset.status = task.status || 'todo';
    const statusLabels = { todo: 'Todo', in_progress: 'In Progress', done: 'Done', paused: 'Paused', cancelled: 'Cancelled' };
    statusBadge.textContent = statusLabels[task.status] || task.status || 'Todo';

    const body = document.createElement('div');
    body.className = 'archive-card-body';

    const title = document.createElement('span');
    title.className = 'archive-card-title';
    title.textContent = task.title;

    const meta = document.createElement('div');
    meta.className = 'archive-card-meta';

    const qLabel = document.createElement('span');
    qLabel.className = 'archive-card-quadrant';
    qLabel.textContent = quadrantNames[task.quadrant] || 'Unknown';
    meta.appendChild(qLabel);

    const archivedDate = document.createElement('span');
    archivedDate.textContent = `Archived ${formatDateTime(task.archived_at)}`;
    meta.appendChild(archivedDate);

    if (task.due_date) {
      const due = document.createElement('span');
      due.textContent = `Due ${formatDate(task.due_date)}`;
      meta.appendChild(due);
    }

    body.appendChild(title);
    body.appendChild(meta);
    card.appendChild(statusBadge);
    card.appendChild(body);
    archiveList.appendChild(card);
  });
}

function formatDateTime(isoStr) {
  const d = new Date(isoStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

async function handleArchiveToggle(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const isArchived = !!task.archived_at;
  const archived_at = isArchived ? null : new Date().toISOString();

  task.archived_at = archived_at;
  await updateTask(task.id, { archived_at });

  renderQuadrant(task.quadrant);
  if (showingArchive) renderArchiveView();
}

// ---- Inline Editing ----

function startEditing(card, task) {
  const titleEl = card.querySelector('.task-title');
  titleEl.contentEditable = true;
  titleEl.focus();

  const range = document.createRange();
  range.selectNodeContents(titleEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finishEdit = async () => {
    titleEl.contentEditable = false;
    const newTitle = titleEl.textContent.trim();
    if (newTitle && newTitle !== task.title) {
      task.title = newTitle;
      await updateTask(task.id, { title: newTitle });
    } else {
      titleEl.textContent = task.title;
    }
  };

  titleEl.addEventListener('blur', finishEdit, { once: true });
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleEl.blur();
    }
    if (e.key === 'Escape') {
      titleEl.textContent = task.title;
      titleEl.blur();
    }
  });
}

// ---- Delete ----

async function handleDelete(taskId) {
  const task = tasks.find(t => t.id === taskId);
  const success = await deleteTask(taskId);
  if (success) {
    tasks = tasks.filter(t => t.id !== taskId);
    if (task) renderQuadrant(task.quadrant);
  }
}

// ---- Add Task Forms ----

function setupAddForms() {
  document.querySelectorAll('.add-task-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      const title = input.value.trim();
      if (!title) return;

      const quadrant = parseInt(form.dataset.quadrant);
      input.value = '';

      const task = await createTask(title, quadrant);
      if (task) {
        tasks.push(task);
        renderQuadrant(quadrant);
      }
    });
  });
}

// ---- Drag and Drop ----

function setupDragAndDrop() {
  document.querySelectorAll('.task-list').forEach(list => {
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const quadrant = list.closest('.quadrant');
      quadrant.classList.add('drag-over');

      const afterCard = getDragAfterElement(list, e.clientY);
      clearDropIndicators();
      const indicator = document.createElement('div');
      indicator.className = 'drop-indicator';

      if (afterCard) {
        list.insertBefore(indicator, afterCard);
      } else {
        list.appendChild(indicator);
      }
    });

    list.addEventListener('dragleave', (e) => {
      const quadrant = list.closest('.quadrant');
      if (!quadrant.contains(e.relatedTarget)) {
        quadrant.classList.remove('drag-over');
        clearDropIndicators();
      }
    });

    list.addEventListener('drop', async (e) => {
      e.preventDefault();
      const quadrant = list.closest('.quadrant');
      quadrant.classList.remove('drag-over');
      clearDropIndicators();

      if (!draggedTaskId) return;

      const newQuadrant = parseInt(list.dataset.quadrant);
      const afterCard = getDragAfterElement(list, e.clientY);

      const task = tasks.find(t => t.id === draggedTaskId);
      if (!task) return;

      const oldQuadrant = task.quadrant;
      task.quadrant = newQuadrant;

      const quadrantTasks = tasks
        .filter(t => t.quadrant === newQuadrant && t.id !== draggedTaskId && !t.archived_at)
        .sort((a, b) => a.sort_order - b.sort_order);

      let insertIndex = quadrantTasks.length;
      if (afterCard) {
        const afterId = afterCard.dataset.taskId;
        const idx = quadrantTasks.findIndex(t => t.id === afterId);
        if (idx !== -1) insertIndex = idx;
      }

      quadrantTasks.splice(insertIndex, 0, task);

      const updates = quadrantTasks.map((t, i) => {
        t.sort_order = i;
        return { id: t.id, sort_order: i, quadrant: newQuadrant };
      });

      renderQuadrant(newQuadrant);
      if (oldQuadrant !== newQuadrant) {
        renderQuadrant(oldQuadrant);
      }

      await reorderTasks(updates);
    });
  });
}

function getDragAfterElement(list, y) {
  const cards = [...list.querySelectorAll('.task-card:not(.dragging)')];

  let closest = null;
  let closestOffset = Number.NEGATIVE_INFINITY;

  cards.forEach(card => {
    const box = card.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset;
      closest = card;
    }
  });

  return closest;
}

function clearDropIndicators() {
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  document.querySelectorAll('.quadrant.drag-over').forEach(el => el.classList.remove('drag-over'));
}

// ---- Realtime Sync ----

function handleRealtimeEvent(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  switch (eventType) {
    case 'INSERT': {
      if (!tasks.find(t => t.id === newRecord.id)) {
        tasks.push(newRecord);
        renderQuadrant(newRecord.quadrant);
        if (showingArchive) renderArchiveView();
      }
      break;
    }
    case 'UPDATE': {
      const idx = tasks.findIndex(t => t.id === newRecord.id);
      if (idx !== -1) {
        const oldQuadrant = tasks[idx].quadrant;
        tasks[idx] = newRecord;
        renderQuadrant(newRecord.quadrant);
        if (oldQuadrant !== newRecord.quadrant) {
          renderQuadrant(oldQuadrant);
        }
        if (showingArchive) renderArchiveView();
        if (openTaskId === newRecord.id) {
          detailTitle.value = newRecord.title;
          detailStatus.value = newRecord.status || 'todo';
          detailDescription.value = newRecord.description || '';
          detailDueDate.value = newRecord.due_date || '';
          renderDetailLinks(newRecord.links || []);
          detailArchiveBtn.textContent = newRecord.archived_at ? 'Unarchive' : 'Archive';
        }
      }
      break;
    }
    case 'DELETE': {
      const task = tasks.find(t => t.id === oldRecord.id);
      if (task) {
        tasks = tasks.filter(t => t.id !== oldRecord.id);
        renderQuadrant(task.quadrant);
        if (showingArchive) renderArchiveView();
        if (openTaskId === oldRecord.id) closeDetailPanel();
      }
      break;
    }
  }
}
