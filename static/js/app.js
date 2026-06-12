let currentDirectory = '';
let imageFiles = [];
let currentIndex = 0;
let totalImages = 0;
let invalidImageIndices = [];
let invalidImagesOnly = false;
let labelData = { boxes: [] };
let selectedBoxIndex = -1;
let currentTool = 'select';
let zoomLevel = 100;
let isDrawing = false;
let drawStart = null;
let history = [];
let historyIndex = -1;
let boxesRenderFrame = null;
let overlayResizeObserver = null;
let draftBox = null;
let polygonPoints = [];
let polygonPointer = null;
let boxInteraction = null;
let labelsVisible = false;
let tableEditor = null;
let tableEditorSelection = null;
let tableEditorLoading = false;
let tableLoadToken = 0;
let invalidOnly = false;
let activeShortcutPanel = 'left';

const API_BASE = '/api';

const categoryColors = {
    text: '#4a69bd',
    formula: '#e53935',
    display_formula: '#e53935',
    inline_formula: '#e53935',
    table: '#4caf50',
    image: '#ff9800'
};

document.addEventListener('DOMContentLoaded', function() {
    initEventListeners();
    initOverlayResizeObserver();
    try {
        initTableEditor();
    } catch (error) {
        console.error('Failed to initialize table editor:', error);
    }
});

function scheduleRenderBoxes() {
    if (boxesRenderFrame !== null) return;

    boxesRenderFrame = requestAnimationFrame(() => {
        boxesRenderFrame = null;
        renderBoxes();
    });
}

function initOverlayResizeObserver() {
    const container = document.getElementById('imageContainer');
    const img = document.getElementById('documentImage');

    if (window.ResizeObserver) {
        overlayResizeObserver = new ResizeObserver(scheduleRenderBoxes);
        overlayResizeObserver.observe(container);
        overlayResizeObserver.observe(img);
    }

    window.addEventListener('resize', scheduleRenderBoxes);
}

function initEventListeners() {
    arrangeDetailsLayout();
    document.getElementById('changeDirBtn').addEventListener('click', openDirectoryModal);
    document.getElementById('shortcutsBtn').addEventListener('click', showShortcutHelp);
    document.getElementById('selectMoveBtn').addEventListener('click', () => setTool('select'));
    document.getElementById('rectBoxBtn').addEventListener('click', () => setTool('rectBox'));
    document.getElementById('polygonBtn').addEventListener('click', () => setTool('polygon'));
    document.getElementById('toggleLabelsBtn').addEventListener('click', toggleLabels);
    document.getElementById('invalidOnlyBtn').addEventListener('click', toggleInvalidOnly);
    document.getElementById('deleteBoxBtn').addEventListener('click', deleteSelectedBox);
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);
    document.getElementById('zoomInBtn').addEventListener('click', () => zoom(10));
    document.getElementById('zoomOutBtn').addEventListener('click', () => zoom(-10));
    document.getElementById('fitWindowBtn').addEventListener('click', fitWindow);
    document.getElementById('firstImageBtn').addEventListener('click', firstImage);
    document.getElementById('prevImageBtn').addEventListener('click', prevImage);
    document.getElementById('nextImageBtn').addEventListener('click', nextImage);
    document.getElementById('lastImageBtn').addEventListener('click', lastImage);
    document.getElementById('invalidImagesOnlyBtn').addEventListener('click', toggleInvalidImagesOnly);
    document.getElementById('prevBoxBtn').addEventListener('click', prevBox);
    document.getElementById('nextBoxBtn').addEventListener('click', nextBox);
    document.getElementById('closePanelBtn').addEventListener('click', closePanel);
    document.getElementById('deleteThisBoxBtn').addEventListener('click', deleteSelectedBox);
    document.getElementById('copyContentBtn').addEventListener('click', copyContent);
    document.getElementById('saveChangesBtn').addEventListener('click', saveChanges);
    document.getElementById('categorySelect').addEventListener('change', onCategoryChange);
    document.getElementById('blockIdInput').addEventListener('change', onBlockIdChange);
    document.getElementById('mergeTableCellsBtn').addEventListener('click', mergeTableCells);
    document.getElementById('unmergeTableCellsBtn').addEventListener('click', unmergeTableCells);
    document.getElementById('contentTextarea').addEventListener('input', onContentChange);
    document.getElementById('contentTextarea').addEventListener('keydown', onContentKeydown);
    
    document.querySelector('.close').addEventListener('click', closeDirectoryModal);
    document.getElementById('confirmDirBtn').addEventListener('click', confirmDirectory);
    document.getElementById('goPathBtn').addEventListener('click', goToPath);
    
    document.getElementById('pathInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') goToPath();
    });
    
    document.getElementById('imageContainer').addEventListener('mousedown', onImageMouseDown);
    document.getElementById('leftPanel').addEventListener('pointerdown', () => {
        activeShortcutPanel = 'left';
    });
    document.getElementById('rightPanel').addEventListener('pointerdown', () => {
        activeShortcutPanel = 'right';
    });
    document.addEventListener('mousemove', onImageMouseMove);
    document.getElementById('imageContainer').addEventListener('dblclick', onImageDoubleClick);
    document.addEventListener('mouseup', onImageMouseUp);
    document.addEventListener('keydown', onDocumentKeydown);
    
    initResizer();
}

function arrangeDetailsLayout() {
    const details = document.getElementById('boxDetails');
    const preview = document.getElementById('boxPreviewSection');
    const contentEditor = document.getElementById('contentEditorSection');
    preview.querySelector('.section-label').textContent = '图片';
    details.insertBefore(preview, contentEditor);
}

function initTableEditor() {
    const container = document.getElementById('tableEditorContainer');
    tableEditor = new Handsontable(container, {
        data: [[]],
        rowHeaders: true,
        colHeaders: true,
        contextMenu: true,
        manualColumnResize: true,
        manualRowResize: true,
        mergeCells: true,
        licenseKey: 'non-commercial-and-evaluation',
        width: '100%',
        height: '100%',
        stretchH: 'all',
        className: 'htCenter htMiddle',
        afterSelectionEnd(r, c, r2, c2) {
            if (tableEditorLoading) return;
            tableEditorSelection = {
                from: { row: Math.min(r, r2), col: Math.min(c, c2) },
                to: { row: Math.max(r, r2), col: Math.max(c, c2) }
            };
        }
    });
}

function initResizer() {
    const resizer = document.getElementById('resizer');
    const leftPanel = document.getElementById('leftPanel');
    const rightPanel = document.getElementById('rightPanel');
    let isResizing = false;
    
    resizer.addEventListener('mousedown', function(e) {
        isResizing = true;
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', stopResize);
        e.preventDefault();
    });
    
    function onResize(e) {
        if (!isResizing) return;
        
        const containerRect = document.querySelector('.main-container').getBoundingClientRect();
        const leftWidth = e.clientX - containerRect.left;
        const containerWidth = containerRect.width;
        const rightWidth = containerWidth - leftWidth - 6;
        
        if (leftWidth > 100 && rightWidth > 100) {
            leftPanel.style.flex = 'none';
            leftPanel.style.width = leftWidth + 'px';
            rightPanel.style.width = rightWidth + 'px';
        }
    }
    
    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', onResize);
        document.removeEventListener('mouseup', stopResize);
        renderBoxes();
    }
}

function setTool(tool) {
    cancelDrawing();
    currentTool = tool;
    
    document.querySelectorAll('#selectMoveBtn, #rectBoxBtn, #polygonBtn')
        .forEach(btn => btn.classList.remove('active'));
    
    switch(tool) {
        case 'select':
            document.getElementById('selectMoveBtn').classList.add('active');
            break;
        case 'rectBox':
            document.getElementById('rectBoxBtn').classList.add('active');
            break;
        case 'polygon':
            document.getElementById('polygonBtn').classList.add('active');
            break;
    }
    
    const container = document.getElementById('imageContainer');
    if (tool === 'rectBox' || tool === 'polygon') {
        container.style.cursor = 'crosshair';
    } else {
        container.style.cursor = 'default';
    }
}

function cancelDrawing() {
    isDrawing = false;
    drawStart = null;
    draftBox = null;
    polygonPoints = [];
    polygonPointer = null;
    boxInteraction = null;
    scheduleRenderBoxes();
}

function toggleLabels() {
    labelsVisible = !labelsVisible;
    const button = document.getElementById('toggleLabelsBtn');
    const label = button.querySelector('.tool-label');
    button.classList.toggle('active', labelsVisible);
    button.title = labelsVisible ? '隐藏标签' : '显示标签';
    label.textContent = labelsVisible ? '隐藏标签' : '显示标签';
    renderBoxes();
}

async function toggleInvalidOnly() {
    if (selectedBoxIndex >= 0 && !await syncTableEditorContent()) return;

    invalidOnly = !invalidOnly;
    const button = document.getElementById('invalidOnlyBtn');
    button.classList.toggle('active', invalidOnly);
    button.title = invalidOnly ? '显示全部框' : '仅显示无效框';
    button.querySelector('.tool-label').textContent = invalidOnly ? '显示全部框' : '仅无效框';

    if (!getVisibleBoxIndices().includes(selectedBoxIndex)) {
        selectedBoxIndex = -1;
        document.getElementById('noBoxSelected').style.display = 'flex';
        document.getElementById('boxDetails').style.display = 'none';
        document.getElementById('rightPanel').classList.remove('expanded', 'table-mode');
    }
    renderBoxes();
    updateBoxCounter();
}

function getVisibleBoxIndices() {
    return labelData.boxes.reduce((indices, box, index) => {
        if (!invalidOnly || box.block_valid === false) indices.push(index);
        return indices;
    }, []);
}

function getBoxId(box) {
    const value = box.block_id;
    return value === null || value === undefined || value === '' ? null : value;
}

function getNextBlockId() {
    const ids = labelData.boxes
        .map(getBoxId)
        .filter(value => value !== null && Number.isFinite(Number(value)))
        .map(Number);
    return ids.length > 0 ? Math.max(...ids) + 1 : 0;
}

function moveBlockId(boxIndex, requestedId) {
    const box = labelData.boxes[boxIndex];
    const oldValue = getBoxId(box);
    const oldId = oldValue === null ? Number.NaN : Number(oldValue);
    const maxId = Math.max(0, labelData.boxes.length - 1);
    const newId = Math.max(0, Math.min(maxId, requestedId));

    if (!Number.isFinite(oldId)) {
        labelData.boxes.forEach((item, index) => {
            const value = getBoxId(item);
            const id = value === null ? Number.NaN : Number(value);
            if (index !== boxIndex && Number.isFinite(id) && id >= newId) {
                item.block_id = id + 1;
            }
        });
    } else if (newId < oldId) {
        labelData.boxes.forEach((item, index) => {
            const value = getBoxId(item);
            const id = value === null ? Number.NaN : Number(value);
            if (index !== boxIndex && id >= newId && id < oldId) {
                item.block_id = id + 1;
            }
        });
    } else if (newId > oldId) {
        labelData.boxes.forEach((item, index) => {
            const value = getBoxId(item);
            const id = value === null ? Number.NaN : Number(value);
            if (index !== boxIndex && id > oldId && id <= newId) {
                item.block_id = id - 1;
            }
        });
    }

    box.block_id = newId;
    return newId;
}

function closeBlockIdGap(deletedId) {
    if (!Number.isFinite(deletedId)) return;

    labelData.boxes.forEach(box => {
        const value = getBoxId(box);
        const id = value === null ? Number.NaN : Number(value);
        if (Number.isFinite(id) && id > deletedId) {
            box.block_id = id - 1;
        }
    });
}

function openDirectoryModal() {
    document.getElementById('directoryModal').style.display = 'block';
    loadDirectoryContents('/');
}

function closeDirectoryModal() {
    document.getElementById('directoryModal').style.display = 'none';
}

function loadDirectoryContents(path) {
    fetch(`${API_BASE}/list_directory_contents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('错误: ' + data.error);
            return;
        }
        updateBreadcrumb(data.currentPath);
        renderDirectoryList(data.items);
    })
    .catch(error => {
        console.error('Error:', error);
        alert('加载目录失败');
    });
}

function updateBreadcrumb(path) {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!path) {
        breadcrumb.textContent = '根目录';
    } else {
        breadcrumb.textContent = path;
    }
}

function renderDirectoryList(items) {
    const list = document.getElementById('directoryList');
    list.innerHTML = '';
    
    if (items.length === 0) {
        list.innerHTML = '<div class="directory-item">没有子目录</div>';
        return;
    }
    
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'directory-item';
        div.dataset.path = item.path;
        div.innerHTML = `
            <span class="directory-icon">📁</span>
            <span>${item.name}</span>
        `;
        div.addEventListener('click', () => selectDirectory(item));
        div.addEventListener('dblclick', () => loadDirectoryContents(item.path));
        list.appendChild(div);
    });
}

function selectDirectory(item) {
    document.querySelectorAll('.directory-item').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    currentDirectory = item.path;
    document.getElementById('confirmDirBtn').disabled = false;
    document.getElementById('pathInput').value = item.path;
}

function goToPath() {
    const path = document.getElementById('pathInput').value.trim();
    if (path) {
        loadDirectoryContents(path);
        currentDirectory = path;
        document.getElementById('confirmDirBtn').disabled = false;
    }
}

function confirmDirectory() {
    if (!currentDirectory) {
        alert('请选择一个目录');
        return;
    }
    
    fetch(`${API_BASE}/set_directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: currentDirectory })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('错误: ' + data.error);
            return;
        }
        
        closeDirectoryModal();
        document.getElementById('currentDir').textContent = currentDirectory;
        imageFiles = [];
        currentIndex = 0;
        refreshImageStatuses().then(loadCurrentImage);
    })
    .catch(error => {
        console.error('Error:', error);
        alert('设置目录失败');
    });
}

function loadCurrentImage() {
    fetch(`${API_BASE}/get_current_image`)
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('错误: ' + data.error);
            return;
        }
        
        updateImageDisplay(data);
        loadLabelData(data.labelData);
        updateCounters(data.currentIndex, data.total);
        updateNavigationButtons(data.currentIndex, data.total);
        updateImageValidityIndicator();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('加载图片失败');
    });
}

function updateImageDisplay(data) {
    const img = document.getElementById('documentImage');
    const placeholder = document.getElementById('noImagePlaceholder');

    img.removeAttribute('src');
    img.style.display = 'none';
    img.src = `${API_BASE}/get_image/${encodeURIComponent(data.imagePath)}`;

    img.onload = function() {
        img.style.display = 'block';
        placeholder.style.display = 'none';
        resetZoom();
        renderBoxes();
    };
    img.onerror = function() {
        img.removeAttribute('src');
        img.style.display = 'none';
        placeholder.style.display = 'flex';
    };
}

function loadLabelData(data) {
    labelData = data || { boxes: [] };
    if (!labelData.boxes) {
        labelData.boxes = [];
    }
    labelData.boxes.forEach(box => {
        if (box.category === 'formula') box.category = 'display_formula';
        const bounds = getBoxBounds(box);
        if (bounds) setBoxBounds(box, bounds);
    });
    selectedBoxIndex = -1;
    history = [JSON.stringify({ boxes: labelData.boxes, selectedIndex: selectedBoxIndex })];
    historyIndex = 0;
    updateUndoRedoButtons();
    renderBoxes();
    updateBoxCounter();
    closePanel();
}

function updateCounters(current, total) {
    currentIndex = current;
    totalImages = total;
    const indices = getNavigableImageIndices();
    const position = indices.indexOf(current);
    document.getElementById('imageCounter').textContent = `${position >= 0 ? position + 1 : 0} / ${indices.length}`;
}

function updateNavigationButtons(current) {
    const indices = getNavigableImageIndices();
    const position = indices.indexOf(current);
    document.getElementById('firstImageBtn').disabled = position <= 0;
    document.getElementById('prevImageBtn').disabled = position <= 0;
    document.getElementById('nextImageBtn').disabled = position < 0 || position >= indices.length - 1;
    document.getElementById('lastImageBtn').disabled = position < 0 || position >= indices.length - 1;
}

function getNavigableImageIndices() {
    if (invalidImagesOnly) return [...invalidImageIndices];
    return Array.from({ length: totalImages }, (_, index) => index);
}

async function refreshImageStatuses() {
    const response = await fetch(`${API_BASE}/image_statuses`);
    const data = await response.json();
    invalidImageIndices = data.invalidIndices || [];
    totalImages = data.total || 0;
    updateImageValidityIndicator();
}

async function toggleInvalidImagesOnly() {
    invalidImagesOnly = !invalidImagesOnly;
    const button = document.getElementById('invalidImagesOnlyBtn');
    button.classList.toggle('active', invalidImagesOnly);
    button.textContent = invalidImagesOnly ? '显示全部图片' : '仅无效图片';

    const indices = getNavigableImageIndices();
    if (indices.length === 0) {
        updateCounters(currentIndex, totalImages);
        updateNavigationButtons(currentIndex);
        return;
    }
    const target = indices.includes(currentIndex) ? currentIndex : indices[0];
    if (target === currentIndex) {
        updateCounters(currentIndex, totalImages);
        updateNavigationButtons(currentIndex);
    } else {
        gotoImage(target);
    }
}

function updateImageValidityIndicator() {
    const indicator = document.getElementById('imageValidityIndicator');
    if (totalImages === 0) {
        indicator.className = 'image-validity-indicator neutral';
        indicator.title = '尚未加载图片';
        return;
    }
    const hasInvalid = labelData.boxes?.some(box => box.block_valid === false);
    indicator.className = `image-validity-indicator ${hasInvalid ? 'invalid' : 'valid'}`;
    indicator.title = hasInvalid ? '当前图片仍有无效框' : '当前图片没有无效框';
}

function updateBoxCounter() {
    const visibleIndices = getVisibleBoxIndices();
    const count = visibleIndices.length;
    const position = visibleIndices.indexOf(selectedBoxIndex);
    const current = position >= 0 ? position + 1 : 0;
    document.getElementById('boxCounter').textContent = `${current} / ${count}`;
    document.getElementById('prevBoxBtn').disabled = position <= 0;
    document.getElementById('nextBoxBtn').disabled = position < 0 || position >= count - 1;
}

function renderBoxes() {
    const svg = document.getElementById('boxesOverlay');
    const img = document.getElementById('documentImage');
    const container = document.getElementById('imageContainer');
    
    if (!img.complete || !img.naturalWidth) {
        setTimeout(renderBoxes, 100);
        return;
    }
    
    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    
    const scaleX = imgRect.width / img.naturalWidth;
    const scaleY = imgRect.height / img.naturalHeight;
    
    svg.setAttribute('width', containerRect.width);
    svg.setAttribute('height', containerRect.height);
    svg.style.left = '0px';
    svg.style.top = '0px';
    
    const offsetX = imgRect.left - containerRect.left;
    const offsetY = imgRect.top - containerRect.top;
    
    svg.innerHTML = '';
    
    labelData.boxes.forEach((box, index) => {
        if (invalidOnly && box.block_valid !== false) return;

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('data-index', index);
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        let x, y, width, height;
        
        if (box.points && box.points.length > 0) {
            const scaledPoints = box.points.map(p => ({
                x: offsetX + p[0] * scaleX,
                y: offsetY + p[1] * scaleY
            }));
            
            const d = scaledPoints.map((p, i) => 
                (i === 0 ? 'M' : 'L') + p.x + ',' + p.y
            ).join(' ') + ' Z';
            path.setAttribute('d', d);
            
            const minX = Math.min(...scaledPoints.map(p => p.x));
            const minY = Math.min(...scaledPoints.map(p => p.y));
            const maxX = Math.max(...scaledPoints.map(p => p.x));
            const maxY = Math.max(...scaledPoints.map(p => p.y));
            x = minX;
            y = minY;
            width = maxX - minX;
            height = maxY - minY;
        } else {
            const bounds = getBoxBounds(box);
            if (!bounds || !bounds.width || !bounds.height) return;
            x = offsetX + bounds.x * scaleX;
            y = offsetY + bounds.y * scaleY;
            width = bounds.width * scaleX;
            height = bounds.height * scaleY;
            const d = `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`;
            path.setAttribute('d', d);
        }
        
        const color = categoryColors[box.category] || '#4a69bd';
        path.setAttribute('fill', color + '33');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', 2);
        path.setAttribute('class', `box-path ${box.category} ${index === selectedBoxIndex ? 'selected' : ''}`);
        path.addEventListener('mousedown', (e) => {
            if (currentTool !== 'select') return;
            e.stopPropagation();
            beginBoxMove(e, index);
        });
        path.addEventListener('click', (e) => {
            e.stopPropagation();
            selectBox(index);
        });
        
        group.appendChild(path);
        
        const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        
        const categoryName = box.category || '未知';
        const blockId = getBoxId(box);
        const labelName = `${blockId ?? '-'} · ${categoryName}`;
        const labelWidth = labelName.length * 10 + 12;
        
        labelBg.setAttribute('x', x);
        labelBg.setAttribute('y', y - 18);
        labelBg.setAttribute('width', labelWidth);
        labelBg.setAttribute('height', 18);
        labelBg.setAttribute('fill', color);
        labelBg.setAttribute('rx', 4);
        
        labelText.setAttribute('x', x + 6);
        labelText.setAttribute('y', y - 6);
        labelText.setAttribute('fill', 'white');
        labelText.setAttribute('font-size', '11');
        labelText.textContent = labelName;
        
        if (labelsVisible) {
            group.appendChild(labelBg);
            group.appendChild(labelText);
        }
        
        svg.appendChild(group);

        if (index === selectedBoxIndex && currentTool === 'select') {
            appendResizeHandles(svg, box, index, offsetX, offsetY, scaleX, scaleY);
        }
    });

    renderDrawingDraft(svg, offsetX, offsetY, scaleX, scaleY);
}

function appendResizeHandles(svg, box, index, offsetX, offsetY, scaleX, scaleY) {
    const bounds = getBoxBounds(box);
    const points = box.points && box.points.length > 0
        ? box.points
        : [
            [bounds.x, bounds.y],
            [bounds.x + bounds.width, bounds.y],
            [bounds.x + bounds.width, bounds.y + bounds.height],
            [bounds.x, bounds.y + bounds.height]
        ];

    points.forEach((point, pointIndex) => {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        handle.setAttribute('cx', offsetX + point[0] * scaleX);
        handle.setAttribute('cy', offsetY + point[1] * scaleY);
        handle.setAttribute('r', 5);
        handle.setAttribute('class', 'resize-handle');
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            beginBoxResize(e, index, pointIndex);
        });
        svg.appendChild(handle);
    });
}

function renderDrawingDraft(svg, offsetX, offsetY, scaleX, scaleY) {
    if (draftBox) {
        const x = offsetX + draftBox.x * scaleX;
        const y = offsetY + draftBox.y * scaleY;
        const width = draftBox.width * scaleX;
        const height = draftBox.height * scaleY;
        const draft = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        draft.setAttribute('x', x);
        draft.setAttribute('y', y);
        draft.setAttribute('width', width);
        draft.setAttribute('height', height);
        draft.setAttribute('class', 'drawing-draft');
        svg.appendChild(draft);
    }

    if (polygonPoints.length > 0) {
        const displayPoints = polygonPointer ? [...polygonPoints, polygonPointer] : polygonPoints;
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polygon.setAttribute('points', displayPoints.map(point =>
            `${offsetX + point[0] * scaleX},${offsetY + point[1] * scaleY}`
        ).join(' '));
        polygon.setAttribute('class', 'drawing-draft polygon-draft');
        svg.appendChild(polygon);

        polygonPoints.forEach((point, index) => {
            const vertex = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            vertex.setAttribute('cx', offsetX + point[0] * scaleX);
            vertex.setAttribute('cy', offsetY + point[1] * scaleY);
            vertex.setAttribute('r', index === 0 ? 6 : 4);
            vertex.setAttribute('class', 'polygon-draft-point');
            svg.appendChild(vertex);
        });
    }
}

function getImagePoint(e, clampToImage = true) {
    const img = document.getElementById('documentImage');
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    let x = (e.clientX - rect.left) * img.naturalWidth / rect.width;
    let y = (e.clientY - rect.top) * img.naturalHeight / rect.height;
    if (clampToImage) {
        x = Math.max(0, Math.min(img.naturalWidth, x));
        y = Math.max(0, Math.min(img.naturalHeight, y));
    }
    return [x, y];
}

function cloneBox(box) {
    return JSON.parse(JSON.stringify(box));
}

function beginBoxMove(e, index) {
    selectedBoxIndex = index;
    boxInteraction = {
        type: 'move',
        index,
        start: getImagePoint(e),
        original: cloneBox(labelData.boxes[index]),
        changed: false
    };
    renderBoxes();
}

function beginBoxResize(e, index, pointIndex) {
    selectedBoxIndex = index;
    boxInteraction = {
        type: 'resize',
        index,
        pointIndex,
        start: getImagePoint(e),
        original: cloneBox(labelData.boxes[index]),
        changed: false
    };
}

function syncBoxBoundsFromPoints(box) {
    const xs = box.points.map(point => point[0]);
    const ys = box.points.map(point => point[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    setBoxBounds(box, {
        x,
        y,
        width: Math.max(...xs) - x,
        height: Math.max(...ys) - y
    });
}

async function selectBox(index) {
    if (selectedBoxIndex >= 0 && selectedBoxIndex !== index) {
        const synced = await syncTableEditorContent();
        if (!synced) return;
    }
    selectedBoxIndex = index;
    renderBoxes();
    showPanel();
    updateBoxDetails(index);
    updateBoxCounter();
}

function showPanel() {
    const panel = document.getElementById('rightPanel');
    panel.classList.add('expanded');
    scheduleRenderBoxes();
}

async function closePanel() {
    if (selectedBoxIndex >= 0) {
        const synced = await syncTableEditorContent();
        if (!synced) return;
    }
    const panel = document.getElementById('rightPanel');
    panel.classList.remove('expanded', 'table-mode');
    selectedBoxIndex = -1;
    document.getElementById('noBoxSelected').style.display = 'flex';
    document.getElementById('boxDetails').style.display = 'none';
    scheduleRenderBoxes();
}

function updateBoxDetails(index) {
    if (index < 0 || index >= labelData.boxes.length) return;
    
    const box = labelData.boxes[index];
    document.getElementById('noBoxSelected').style.display = 'none';
    document.getElementById('boxDetails').style.display = 'block';
    
    document.getElementById('categorySelect').value = box.category || 'text';
    document.getElementById('blockIdInput').value = getBoxId(box) ?? '';
    document.getElementById('contentTextarea').value = box.content || '';
    updateCharCount();
    renderContentPreview();
    updateBoxPreview(box);
    updateDetailsMode(box);
}

function updateDetailsMode(box) {
    const isTable = box.category === 'table';
    const panel = document.getElementById('rightPanel');
    panel.classList.toggle('table-mode', isTable);
    document.getElementById('boxPreviewSection').style.display = 'block';
    document.getElementById('contentEditorSection').style.display = isTable ? 'none' : 'block';
    document.getElementById('renderResultSection').style.display = isTable ? 'none' : 'block';
    document.getElementById('tableEditorSection').style.display = isTable ? 'block' : 'none';

    if (isTable) {
        loadTableEditor(box.content || '');
        setTimeout(() => tableEditor.render(), 350);
    }
    scheduleRenderBoxes();
}

async function loadTableEditor(content) {
    const token = ++tableLoadToken;
    setTableEditorStatus('正在解析表格...');

    try {
        const response = await fetch(`${API_BASE}/table/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        const tableData = await response.json();
        if (token !== tableLoadToken) return;
        if (tableData.error) throw new Error(tableData.error);
        loadTableDataToEditor(tableData);
        setTableEditorStatus('');
    } catch (error) {
        if (token !== tableLoadToken) return;
        loadTableDataToEditor({ data: [['']], mergeCells: [] });
        setTableEditorStatus(`表格解析失败: ${error.message}`, true);
    }
}

function loadTableDataToEditor(tableData) {
    tableEditorLoading = true;
    tableEditorSelection = null;
    tableEditor.updateSettings({ mergeCells: [] });
    const data = tableData.data && tableData.data.length ? tableData.data : [['']];
    tableEditor.loadData(data);

    const mergeCells = (tableData.mergeCells || []).filter(cell =>
        cell.row >= 0 && cell.col >= 0 &&
        cell.row + cell.rowspan <= data.length &&
        cell.col + cell.colspan <= (data[0] ? data[0].length : 0)
    );
    tableEditor.updateSettings({ mergeCells });
    tableEditorLoading = false;
    tableEditor.render();
}

function setTableEditorStatus(message, isError = false) {
    const status = document.getElementById('tableEditorStatus');
    status.textContent = message;
    status.classList.toggle('error', isError);
}

function getTableEditorData() {
    const mergeCells = tableEditor.getPlugin('mergeCells').mergedCellsCollection.mergedCells;
    return {
        data: tableEditor.getData(),
        mergeCells: mergeCells.map(cell => ({
            row: cell.row,
            col: cell.col,
            rowspan: cell.rowspan,
            colspan: cell.colspan
        }))
    };
}

async function syncTableEditorContent() {
    if (selectedBoxIndex < 0 || labelData.boxes[selectedBoxIndex].category !== 'table') return true;
    setTableEditorStatus('正在保存表格...');

    try {
        const response = await fetch(`${API_BASE}/table/serialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tableData: getTableEditorData() })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        labelData.boxes[selectedBoxIndex].content = data.content;
        document.getElementById('contentTextarea').value = data.content;
        setTableEditorStatus('表格内容已更新');
        return true;
    } catch (error) {
        setTableEditorStatus(`表格保存失败: ${error.message}`, true);
        return false;
    }
}

function mergeTableCells() {
    const range = tableEditor.getSelectedRange()?.[0] || tableEditorSelection;
    if (!range) {
        alert('请先选择要合并的单元格');
        return;
    }
    const from = range.from || range;
    const to = range.to || range;
    tableEditor.getPlugin('mergeCells').merge(
        Math.min(from.row, to.row), Math.min(from.col, to.col),
        Math.max(from.row, to.row), Math.max(from.col, to.col)
    );
    tableEditor.render();
}

function unmergeTableCells() {
    const range = tableEditor.getSelectedRange()?.[0] || tableEditorSelection;
    if (!range) {
        alert('请先选择要取消合并的单元格');
        return;
    }
    const from = range.from || range;
    const to = range.to || range;
    const minRow = Math.min(from.row, to.row);
    const maxRow = Math.max(from.row, to.row);
    const minCol = Math.min(from.col, to.col);
    const maxCol = Math.max(from.col, to.col);
    const mergedCells = tableEditor.getPlugin('mergeCells').mergedCellsCollection.mergedCells;
    const found = mergedCells.find(cell =>
        cell.row >= minRow && cell.row + cell.rowspan - 1 <= maxRow &&
        cell.col >= minCol && cell.col + cell.colspan - 1 <= maxCol
    );
    if (!found) {
        alert('选中的单元格不是合并单元格');
        return;
    }
    tableEditor.getPlugin('mergeCells').unmerge(found.row, found.col);
    tableEditor.render();
}

function getBoxBounds(box) {
    if (box.points && box.points.length > 0) {
        const xs = box.points.map(point => point[0]);
        const ys = box.points.map(point => point[1]);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
    if (Array.isArray(box.block_bbox) && box.block_bbox.length >= 4) {
        const [x1, y1, x2, y2] = box.block_bbox.map(Number);
        if ([x1, y1, x2, y2].every(Number.isFinite)) {
            return {
                x: Math.min(x1, x2),
                y: Math.min(y1, y2),
                width: Math.abs(x2 - x1),
                height: Math.abs(y2 - y1)
            };
        }
    }
    if ([box.x, box.y, box.width, box.height].every(value => Number.isFinite(Number(value)))) {
        return {
            x: Number(box.x),
            y: Number(box.y),
            width: Number(box.width),
            height: Number(box.height)
        };
    }
    return null;
}

function setBoxBounds(box, bounds) {
    box.block_bbox = [
        bounds.x,
        bounds.y,
        bounds.x + bounds.width,
        bounds.y + bounds.height
    ];
}

function updateBoxPreview(box) {
    const canvas = document.getElementById('boxPreview');
    const ctx = canvas.getContext('2d');
    const img = document.getElementById('documentImage');
    
    if (!img.complete) {
        setTimeout(() => updateBoxPreview(box), 100);
        return;
    }
    
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    
    const { x, y, width, height } = getBoxBounds(box);
    
    const previewWidth = 360;
    const previewHeight = Math.min(150, (height / width) * previewWidth);
    
    canvas.width = previewWidth;
    canvas.height = previewHeight;
    
    ctx.drawImage(
        img,
        x, y, width, height,
        0, 0, previewWidth, previewHeight
    );
}

function updateCharCount() {
    const textarea = document.getElementById('contentTextarea');
    const count = textarea.value.length;
    const maxLength = 2000;
    document.getElementById('charCount').textContent = `${count} / ${maxLength}`;
    
    if (count > maxLength) {
        textarea.value = textarea.value.substring(0, maxLength);
        document.getElementById('charCount').textContent = `${maxLength} / ${maxLength}`;
    }
}

async function onCategoryChange() {
    if (selectedBoxIndex >= 0) {
        const box = labelData.boxes[selectedBoxIndex];
        if (box.category === 'table') {
            const synced = await syncTableEditorContent();
            if (!synced) {
                document.getElementById('categorySelect').value = 'table';
                return;
            }
        }
        saveToHistory();
        box.category = document.getElementById('categorySelect').value;
        renderBoxes();
        renderContentPreview();
        updateDetailsMode(box);
    }
}

function onBlockIdChange() {
    if (selectedBoxIndex < 0) return;

    const input = document.getElementById('blockIdInput');
    const requestedId = Number.parseInt(input.value, 10);
    if (!Number.isFinite(requestedId)) {
        input.value = getBoxId(labelData.boxes[selectedBoxIndex]) ?? '';
        return;
    }

    saveToHistory();
    input.value = moveBlockId(selectedBoxIndex, requestedId);
    renderBoxes();
}

function onContentChange() {
    updateCharCount();
    renderContentPreview();
    
    if (selectedBoxIndex >= 0) {
        labelData.boxes[selectedBoxIndex].content = document.getElementById('contentTextarea').value;
    }
}

function onContentKeydown(e) {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveChanges();
    }
}

function renderContentPreview() {
    const content = document.getElementById('contentTextarea').value;
    const category = document.getElementById('categorySelect').value;
    const renderContainer = document.getElementById('renderContent');
    
    if (!content.trim()) {
        renderContainer.innerHTML = '<p style="color: #999;">无内容</p>';
        return;
    }
    
    switch(category) {
        case 'formula':
        case 'display_formula':
        case 'inline_formula': {
            const latex = content.trim()
                .replace(/^\$\$|\$\$$/g, '')
                .replace(/^\$|\$$/g, '')
                .replace(/^\\\[|\\\]$/g, '')
                .replace(/^\\\(|\\\)$/g, '')
                .trim();
            const formula = document.createElement('div');
            formula.style.cssText = 'font-size:16px;text-align:center;padding:20px;';
            formula.textContent = category === 'inline_formula'
                ? `\\(${latex}\\)`
                : `\\[${latex}\\]`;
            renderContainer.replaceChildren(formula);
            if (window.MathJax?.typesetPromise) {
                MathJax.typesetClear?.([renderContainer]);
                MathJax.typesetPromise([renderContainer]).catch(error => {
                    console.error('MathJax render failed:', error);
                });
            }
            break;
        }
        case 'table':
            renderContainer.innerHTML = content;
            break;
        case 'image':
            renderContainer.innerHTML = `<img src="${content}" style="max-width: 100%; max-height: 150px;" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;100&quot; height=&quot;100&quot;%3E%3Ctext y=&quot;.9em&quot; font-size=&quot;90&quot;%3E?%3C/text%3E%3C/svg%3E'">`;
            break;
        default:
            renderContainer.innerHTML = `<pre style="white-space: pre-wrap; word-break: break-all;">${content}</pre>`;
    }
}

function onImageMouseDown(e) {
    if (currentTool === 'select') {
        if (e.target.classList.contains('box-path') || e.target.classList.contains('resize-handle')) {
            return;
        }
        selectedBoxIndex = -1;
        renderBoxes();
        closePanel();
        return;
    }
    
    if (currentTool === 'rectBox') {
        isDrawing = true;
        drawStart = getImagePoint(e);
        draftBox = { x: drawStart[0], y: drawStart[1], width: 0, height: 0 };
        renderBoxes();
        return;
    }

    if (currentTool === 'polygon') {
        const point = getImagePoint(e);
        if (!point) return;

        if (polygonPoints.length >= 3) {
            const img = document.getElementById('documentImage');
            const rect = img.getBoundingClientRect();
            const closeDistance = 10 * img.naturalWidth / rect.width;
            const first = polygonPoints[0];
            if (Math.hypot(point[0] - first[0], point[1] - first[1]) <= closeDistance) {
                finishPolygon();
                return;
            }
        }

        polygonPoints.push(point);
        polygonPointer = point;
        renderBoxes();
    }
}

function onImageMouseMove(e) {
    const point = getImagePoint(e);
    if (!point) return;

    if (boxInteraction) {
        updateBoxInteraction(point);
        return;
    }

    if (currentTool === 'polygon' && polygonPoints.length > 0) {
        polygonPointer = point;
        renderBoxes();
        return;
    }

    if (!isDrawing || !drawStart) return;

    draftBox = {
        x: Math.min(drawStart[0], point[0]),
        y: Math.min(drawStart[1], point[1]),
        width: Math.abs(point[0] - drawStart[0]),
        height: Math.abs(point[1] - drawStart[1])
    };
    renderBoxes();
}

function onImageMouseUp(e) {
    if (boxInteraction) {
        const interaction = boxInteraction;
        if (interaction.changed) {
            saveToHistory();
        }
        boxInteraction = null;
        selectBox(interaction.index);
        return;
    }

    if (!isDrawing || !drawStart) return;

    if (draftBox && draftBox.width > 5 && draftBox.height > 5) {
        const newBox = {
            block_bbox: [
                draftBox.x,
                draftBox.y,
                draftBox.x + draftBox.width,
                draftBox.y + draftBox.height
            ],
            category: 'text',
            content: '',
            block_id: getNextBlockId()
        };
        
        labelData.boxes.push(newBox);
        selectedBoxIndex = labelData.boxes.length - 1;
        saveToHistory();
        renderBoxes();
        showPanel();
        updateBoxDetails(selectedBoxIndex);
        updateBoxCounter();
    }
    
    isDrawing = false;
    drawStart = null;
    draftBox = null;
    renderBoxes();
}

function updateBoxInteraction(point) {
    const interaction = boxInteraction;
    const box = labelData.boxes[interaction.index];
    const original = interaction.original;
    const dx = point[0] - interaction.start[0];
    const dy = point[1] - interaction.start[1];
    const img = document.getElementById('documentImage');

    if (!interaction.changed && Math.hypot(dx, dy) < 2) return;

    if (interaction.type === 'move') {
        if (original.points && original.points.length > 0) {
            const xs = original.points.map(item => item[0]);
            const ys = original.points.map(item => item[1]);
            const limitedDx = Math.max(-Math.min(...xs), Math.min(img.naturalWidth - Math.max(...xs), dx));
            const limitedDy = Math.max(-Math.min(...ys), Math.min(img.naturalHeight - Math.max(...ys), dy));
            box.points = original.points.map(item => [item[0] + limitedDx, item[1] + limitedDy]);
            syncBoxBoundsFromPoints(box);
        } else {
            const originalBounds = getBoxBounds(original);
            setBoxBounds(box, {
                ...originalBounds,
                x: Math.max(0, Math.min(img.naturalWidth - originalBounds.width, originalBounds.x + dx)),
                y: Math.max(0, Math.min(img.naturalHeight - originalBounds.height, originalBounds.y + dy))
            });
        }
    } else if (original.points && original.points.length > 0) {
        box.points = original.points.map(item => [...item]);
        box.points[interaction.pointIndex] = point;
        syncBoxBoundsFromPoints(box);
    } else {
        resizeRectangle(box, original, interaction.pointIndex, point);
    }

    interaction.changed = true;
    renderBoxes();
}

function resizeRectangle(box, original, pointIndex, point) {
    const bounds = getBoxBounds(original);
    const oppositePoints = [
        [bounds.x + bounds.width, bounds.y + bounds.height],
        [bounds.x, bounds.y + bounds.height],
        [bounds.x, bounds.y],
        [bounds.x + bounds.width, bounds.y]
    ];
    const opposite = oppositePoints[pointIndex];
    const minSize = 2;
    let x = Math.min(point[0], opposite[0]);
    let y = Math.min(point[1], opposite[1]);
    let width = Math.abs(point[0] - opposite[0]);
    let height = Math.abs(point[1] - opposite[1]);

    if (width < minSize) width = minSize;
    if (height < minSize) height = minSize;
    setBoxBounds(box, { x, y, width, height });
}

function onImageDoubleClick(e) {
    if (currentTool !== 'polygon' || polygonPoints.length < 3) return;
    e.preventDefault();

    const count = polygonPoints.length;
    if (count >= 2) {
        const last = polygonPoints[count - 1];
        const previous = polygonPoints[count - 2];
        if (Math.hypot(last[0] - previous[0], last[1] - previous[1]) < 5) {
            polygonPoints.pop();
        }
    }
    finishPolygon();
}

function finishPolygon() {
    if (polygonPoints.length < 3) return;

    const newBox = {
        points: polygonPoints.map(point => [...point]),
        category: 'text',
        content: '',
        block_id: getNextBlockId()
    };
    syncBoxBoundsFromPoints(newBox);
    labelData.boxes.push(newBox);
    selectedBoxIndex = labelData.boxes.length - 1;
    polygonPoints = [];
    polygonPointer = null;
    saveToHistory();
    renderBoxes();
    showPanel();
    updateBoxDetails(selectedBoxIndex);
    updateBoxCounter();
}

function onDocumentKeydown(e) {
    if (e.key === 'Escape' && (isDrawing || polygonPoints.length > 0 || boxInteraction)) {
        cancelDrawing();
        return;
    }

    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey ||
        isShortcutInput(e.target) || isModalOpen()) return;

    const focusedPanel = e.target instanceof Element
        ? e.target.closest('#leftPanel, #rightPanel')
        : null;
    if (focusedPanel) {
        activeShortcutPanel = focusedPanel.id === 'rightPanel' ? 'right' : 'left';
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (activeShortcutPanel === 'right') {
            if (e.key === 'ArrowLeft') prevBox();
            else nextBox();
        } else {
            if (e.key === 'ArrowLeft') prevImage();
            else nextImage();
        }
        return;
    }

    switch (e.key.toLowerCase()) {
        case 'a':
            e.preventDefault();
            setTool(currentTool === 'polygon' ? 'polygon' : 'rectBox');
            break;
        case 'd':
            if (selectedBoxIndex < 0) return;
            e.preventDefault();
            deleteSelectedBox();
            break;
        case 's':
            e.preventDefault();
            toggleLabels();
            break;
        case 'w':
            e.preventDefault();
            toggleInvalidOnly();
            break;
    }
}

function isShortcutInput(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(
        'input, textarea, select, [contenteditable="true"], .handsontable'
    ));
}

function isModalOpen() {
    return getComputedStyle(document.getElementById('directoryModal')).display !== 'none';
}

function showShortcutHelp() {
    alert([
        '快捷键',
        '← / →：左栏切换图片，右栏切换框',
        'A：进入新增框模式（默认矩形，已选多边形时保持多边形）',
        'D：删除当前选中的框',
        'S：显示/隐藏标签',
        'W：仅显示无效框/显示全部框'
    ].join('\n'));
}

function deleteSelectedBox() {
    if (selectedBoxIndex < 0 || selectedBoxIndex >= labelData.boxes.length) {
        alert('请先选择一个框');
        return;
    }
    
    if (!confirm('确定要删除这个框吗？')) return;
    
    const visibleIndicesBefore = getVisibleBoxIndices();
    const visiblePosition = visibleIndicesBefore.indexOf(selectedBoxIndex);
    const deletedIndex = selectedBoxIndex;
    const deletedValue = getBoxId(labelData.boxes[deletedIndex]);
    const deletedId = deletedValue === null ? Number.NaN : Number(deletedValue);
    saveToHistory();
    labelData.boxes.splice(deletedIndex, 1);
    closeBlockIdGap(deletedId);

    const visibleIndicesAfter = getVisibleBoxIndices();
    const nextPosition = Math.min(visiblePosition, visibleIndicesAfter.length - 1);
    selectedBoxIndex = nextPosition >= 0 ? visibleIndicesAfter[nextPosition] : -1;
    
    renderBoxes();
    updateBoxCounter();
    
    if (selectedBoxIndex >= 0) {
        showPanel();
        updateBoxDetails(selectedBoxIndex);
    } else {
        closePanel();
    }
}

function saveToHistory() {
    const state = JSON.stringify({
        boxes: labelData.boxes,
        selectedIndex: selectedBoxIndex
    });
    
    history = history.slice(0, historyIndex + 1);
    history.push(state);
    historyIndex = history.length - 1;
    
    updateUndoRedoButtons();
}

function undo() {
    if (historyIndex <= 0) return;
    
    historyIndex--;
    const state = JSON.parse(history[historyIndex]);
    labelData.boxes = state.boxes;
    selectedBoxIndex = state.selectedIndex;
    
    renderBoxes();
    updateBoxCounter();
    
    if (selectedBoxIndex >= 0) {
        showPanel();
        updateBoxDetails(selectedBoxIndex);
    } else {
        closePanel();
    }
    
    updateUndoRedoButtons();
}

function redo() {
    if (historyIndex >= history.length - 1) return;
    
    historyIndex++;
    const state = JSON.parse(history[historyIndex]);
    labelData.boxes = state.boxes;
    selectedBoxIndex = state.selectedIndex;
    
    renderBoxes();
    updateBoxCounter();
    
    if (selectedBoxIndex >= 0) {
        showPanel();
        updateBoxDetails(selectedBoxIndex);
    } else {
        closePanel();
    }
    
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    document.getElementById('undoBtn').disabled = historyIndex <= 0;
    document.getElementById('redoBtn').disabled = historyIndex >= history.length - 1;
}

function zoom(delta) {
    zoomLevel = Math.max(25, Math.min(400, zoomLevel + delta));
    document.getElementById('zoomLevel').textContent = zoomLevel + '%';
    
    const img = document.getElementById('documentImage');
    img.style.transform = `scale(${zoomLevel / 100})`;
    img.style.transformOrigin = 'center center';
    renderBoxes();
}

function resetZoom() {
    zoomLevel = 100;
    document.getElementById('zoomLevel').textContent = '100%';
    
    const img = document.getElementById('documentImage');
    img.style.transform = 'none';
    renderBoxes();
}

function fitWindow() {
    const container = document.querySelector('.image-container-wrapper');
    const img = document.getElementById('documentImage');
    
    if (!img.complete) return;
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    
    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    const scale = Math.min(scaleX, scaleY, 1);
    
    zoomLevel = Math.round(scale * 100);
    document.getElementById('zoomLevel').textContent = zoomLevel + '%';
    img.style.transform = `scale(${scale})`;
    img.style.transformOrigin = 'center center';
    renderBoxes();
}

function prevBox() {
    const visibleIndices = getVisibleBoxIndices();
    const position = visibleIndices.indexOf(selectedBoxIndex);
    if (position > 0) selectBox(visibleIndices[position - 1]);
}

function nextBox() {
    const visibleIndices = getVisibleBoxIndices();
    const position = visibleIndices.indexOf(selectedBoxIndex);
    if (position >= 0 && position < visibleIndices.length - 1) {
        selectBox(visibleIndices[position + 1]);
    }
}

async function copyContent() {
    if (!await syncTableEditorContent()) return;
    const content = document.getElementById('contentTextarea').value;
    navigator.clipboard.writeText(content).then(() => {
        alert('内容已复制到剪贴板');
    }).catch(() => {
        alert('复制失败');
    });
}

async function saveChanges() {
    if (!await syncTableEditorContent()) return;

    const savedBox = selectedBoxIndex >= 0 ? labelData.boxes[selectedBoxIndex] : null;
    const previousValidity = savedBox?.block_valid;
    if (savedBox?.block_valid === false) savedBox.block_valid = true;

    fetch(`${API_BASE}/save_label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelData: labelData })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            if (savedBox) savedBox.block_valid = previousValidity;
            alert('保存失败: ' + data.error);
            return;
        }
        
        
        alert('保存成功');
        updateImageValidityIndicator();
        refreshImageStatuses().then(() => handleImageListAfterSave());
    })
    .catch(error => {
        if (savedBox) savedBox.block_valid = previousValidity;
        console.error('Error:', error);
        alert('保存失败');
    });
}

function handleImageListAfterSave() {
    const indices = getNavigableImageIndices();
    if (!invalidImagesOnly || indices.includes(currentIndex)) {
        updateCounters(currentIndex, totalImages);
        updateNavigationButtons(currentIndex);
    } else if (indices.length > 0) {
        const nextIndex = indices.find(index => index > currentIndex) ?? indices[0];
        gotoImage(nextIndex);
    } else {
        updateCounters(currentIndex, totalImages);
        updateNavigationButtons(currentIndex);
    }
}

function firstImage() {
    const indices = getNavigableImageIndices();
    if (indices.length > 0 && currentIndex !== indices[0]) gotoImage(indices[0]);
}

function prevImage() {
    const indices = getNavigableImageIndices();
    const position = indices.indexOf(currentIndex);
    if (position > 0) gotoImage(indices[position - 1]);
}

function nextImage() {
    const indices = getNavigableImageIndices();
    const position = indices.indexOf(currentIndex);
    if (position >= 0 && position < indices.length - 1) gotoImage(indices[position + 1]);
}

function lastImage() {
    const indices = getNavigableImageIndices();
    const lastIndex = indices[indices.length - 1];
    if (indices.length > 0 && currentIndex !== lastIndex) gotoImage(lastIndex);
}

function gotoImage(index) {
    fetch(`${API_BASE}/goto_image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('错误: ' + data.error);
            return;
        }
        
        updateImageDisplay(data);
        loadLabelData(data.labelData);
        updateCounters(data.currentIndex, data.total);
        updateNavigationButtons(data.currentIndex, data.total);
        updateImageValidityIndicator();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('跳转失败');
    });
}

function saveLabelIfChanged() {
}
