let hot1 = null;
let hot2 = null;
let currentPath = '';
let selectedDirectory = '';
let currentTableData1 = null;
let currentTableData2 = null;
let savedSelection1 = null;
let savedSelection2 = null;
let selectedTable = 1;
let isLoading = false;
let currentRelativePath = '';
let totalImages = 0;

const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', function() {
    initHandsontable();
    initEventListeners();
});

function initHandsontable() {
    const container1 = document.getElementById('handsontable-container-1');
    const container2 = document.getElementById('handsontable-container-2');
    
    const commonOptions = {
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
        className: 'htCenter htMiddle'
    };
    
    hot1 = new Handsontable(container1, {
        ...commonOptions,
        afterChange: function(changes, source) {
            if (source !== 'loadData' && !isLoading) {
                selectTable(1);
            }
        },
        afterSelectionEnd: function(r, c, r2, c2) {
            if (!isLoading) {
                savedSelection1 = {
                    from: { row: Math.min(r, r2), col: Math.min(c, c2) },
                    to: { row: Math.max(r, r2), col: Math.max(c, c2) }
                };
                selectTable(1);
            }
        }
    });
    
    hot2 = new Handsontable(container2, {
        ...commonOptions,
        afterChange: function(changes, source) {
            if (source !== 'loadData' && !isLoading) {
                selectTable(2);
            }
        },
        afterSelectionEnd: function(r, c, r2, c2) {
            if (!isLoading) {
                savedSelection2 = {
                    from: { row: Math.min(r, r2), col: Math.min(c, c2) },
                    to: { row: Math.max(r, r2), col: Math.max(c, c2) }
                };
                selectTable(2);
            }
        }
    });
}

function selectTable(tableNum) {
    selectedTable = tableNum;
    const radios = document.querySelectorAll('input[name="tableSelect"]');
    radios.forEach(radio => {
        radio.checked = (parseInt(radio.value) === tableNum);
    });
}

function toggleTable(tableNum) {
    const section1 = document.getElementById('table-section-1');
    const section2 = document.getElementById('table-section-2');
    
    const currentSection = tableNum === 1 ? section1 : section2;
    const otherSection = tableNum === 1 ? section2 : section1;
    const otherTableNum = tableNum === 1 ? 2 : 1;
    
    if (currentSection.classList.contains('collapsed')) {
        currentSection.classList.remove('collapsed');
        otherSection.classList.add('collapsed');
        selectTable(tableNum);
    } else {
        currentSection.classList.add('collapsed');
        otherSection.classList.remove('collapsed');
        selectTable(otherTableNum);
    }
    
    setTimeout(() => {
        if (!section1.classList.contains('collapsed')) {
            hot1.render();
        }
        if (!section2.classList.contains('collapsed')) {
            hot2.render();
        }
    }, 350);
}

function initEventListeners() {
    document.getElementById('selectDirBtn').addEventListener('click', openDirectoryModal);
    document.getElementById('saveBtn').addEventListener('click', saveTable);
    document.getElementById('prevBtn').addEventListener('click', () => prevImage());
    document.getElementById('nextBtn').addEventListener('click', () => nextImage());
    document.getElementById('mergeBtn').addEventListener('click', mergeCells);
    document.getElementById('unmergeBtn').addEventListener('click', unmergeCells);
    document.getElementById('showRelativeImageBtn').addEventListener('click', showFloatingImage);
    document.getElementById('formatErrorBtn').addEventListener('click', markFormatError);
    document.getElementById('gotoBtn').addEventListener('click', () => gotoImage());
    
    document.querySelector('.close').addEventListener('click', closeDirectoryModal);
    document.getElementById('confirmDirBtn').addEventListener('click', confirmDirectory);
    document.getElementById('goPathBtn').addEventListener('click', goToPath);
    
    document.getElementById('pathInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            goToPath();
        }
    });
    
    document.getElementById('gotoInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            gotoImage();
        }
    });
    
    window.addEventListener('click', function(e) {
        const modal = document.getElementById('directoryModal');
        if (e.target === modal) {
            closeDirectoryModal();
        }
        
        const floatingModal = document.getElementById('floatingImageModal');
        if (e.target === floatingModal) {
            closeFloatingImage();
        }
    });
    
    document.querySelectorAll('input[name="tableSelect"]').forEach(radio => {
        radio.addEventListener('change', function() {
            selectedTable = parseInt(this.value);
        });
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
    currentPath = path;
    
    fetch(`${API_BASE}/list_directory_contents`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
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
    document.querySelectorAll('.directory-item').forEach(el => {
        el.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
    selectedDirectory = item.path;
    document.getElementById('confirmDirBtn').disabled = false;
    document.getElementById('pathInput').value = item.path;
}

function goToPath() {
    const path = document.getElementById('pathInput').value.trim();
    if (path) {
        loadDirectoryContents(path);
        selectedDirectory = path;
        document.getElementById('confirmDirBtn').disabled = false;
    }
}

function confirmDirectory() {
    if (!selectedDirectory) {
        alert('请选择一个目录');
        return;
    }
    
    fetch(`${API_BASE}/set_directory`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ directory: selectedDirectory })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('错误: ' + data.error);
            return;
        }
        
        closeDirectoryModal();
        enableControls();
        loadCurrentImage();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('设置目录失败');
    });
}

function enableControls() {
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('prevBtn').disabled = false;
    document.getElementById('nextBtn').disabled = false;
    document.getElementById('mergeBtn').disabled = false;
    document.getElementById('unmergeBtn').disabled = false;
    document.getElementById('showRelativeImageBtn').disabled = false;
    document.getElementById('formatErrorBtn').disabled = false;
    document.getElementById('gotoInput').disabled = false;
    document.getElementById('gotoBtn').disabled = false;
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
        updateTableData(data.tableData1, data.tableData2);
        updateCounter(data.currentIndex, data.total);
        updateImageStatus(data.status);
    })
    .catch(error => {
        console.error('Error:', error);
        alert('加载图片失败');
    });
}

function updateImageDisplay(data) {
    const img = document.getElementById('tableImage');
    const placeholder = document.getElementById('noImagePlaceholder');
    const imageName = document.getElementById('imageName');
    
    img.src = `${API_BASE}/get_image/${encodeURIComponent(data.imagePath)}`;
    img.style.display = 'block';
    placeholder.style.display = 'none';
    imageName.textContent = data.imageName;
    
    currentRelativePath = data.relativePath || '';
}

function updateTableData(tableData1, tableData2) {
    isLoading = true;
    
    currentTableData1 = tableData1;
    currentTableData2 = tableData2;
    
    hot1.updateSettings({ mergeCells: [] });
    hot2.updateSettings({ mergeCells: [] });
    savedSelection1 = null;
    savedSelection2 = null;
    
    loadTableDataToHot(hot1, tableData1);
    loadTableDataToHot(hot2, tableData2);
    
    const section1 = document.getElementById('table-section-1');
    const section2 = document.getElementById('table-section-2');
    section1.classList.remove('collapsed');
    section2.classList.add('collapsed');
    
    setTimeout(() => {
        isLoading = false;
        selectTable(1);
        hot1.render();
    }, 100);
}

function loadTableDataToHot(hot, tableData) {
    if (!tableData || tableData.error) {
        hot.loadData([['']]);
        return;
    }
    
    const data = tableData.data || [['']];
    const mergeCells = tableData.mergeCells || [];
    
    hot.loadData(data);
    
    const rowCount = data.length;
    const colCount = data[0] ? data[0].length : 0;
    
    const validMergeCells = mergeCells.filter(cell => {
        return cell.row >= 0 && 
               cell.col >= 0 && 
               cell.row + cell.rowspan <= rowCount && 
               cell.col + cell.colspan <= colCount;
    });
    
    setTimeout(() => {
        hot.updateSettings({ mergeCells: validMergeCells });
    }, 0);
}

function updateCounter(current, total) {
    totalImages = total;
    document.getElementById('imageCounter').textContent = `${current + 1} / ${total}`;
    document.getElementById('gotoInput').max = total;
}

function autoSave(callback) {
    const hot = selectedTable === 1 ? hot1 : hot2;
    const data = hot.getData();
    const mergeCells = hot.getPlugin('mergeCells').mergedCellsCollection.mergedCells;
    
    const tableData = {
        data: data,
        mergeCells: mergeCells.map(cell => ({
            row: cell.row,
            col: cell.col,
            rowspan: cell.rowspan,
            colspan: cell.colspan
        }))
    };
    
    fetch(`${API_BASE}/save`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            tableData: tableData,
            selectedTable: selectedTable
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            console.error('自动保存失败:', data.error);
        }
        if (callback) callback();
    })
    .catch(error => {
        console.error('Error:', error);
        if (callback) callback();
    });
}

function prevImage() {
    autoSave(() => {
        fetch(`${API_BASE}/prev_image`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                if (data.error !== 'Already at first image') {
                    alert('错误: ' + data.error);
                }
                return;
            }
            
            updateImageDisplay(data);
            updateTableData(data.tableData1, data.tableData2);
            updateCounter(data.currentIndex, data.total);
            updateImageStatus(data.status);
        })
        .catch(error => {
            console.error('Error:', error);
        });
    });
}

function nextImage(skipAutoSave = false) {
    if (skipAutoSave) {
        fetch(`${API_BASE}/next_image`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                if (data.error !== 'Already at last image') {
                    console.error('Error:', data.error);
                }
                return;
            }
            
            updateImageDisplay(data);
            updateTableData(data.tableData1, data.tableData2);
            updateCounter(data.currentIndex, data.total);
            updateImageStatus(data.status);
        })
        .catch(error => {
            console.error('Error:', error);
        });
    } else {
        autoSave(() => {
            fetch(`${API_BASE}/next_image`, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    if (data.error !== 'Already at last image') {
                        alert('错误: ' + data.error);
                    }
                    return;
                }
                
                updateImageDisplay(data);
                updateTableData(data.tableData1, data.tableData2);
                updateCounter(data.currentIndex, data.total);
                updateImageStatus(data.status);
            })
            .catch(error => {
                console.error('Error:', error);
            });
        });
    }
}

function saveTable() {
    const hot = selectedTable === 1 ? hot1 : hot2;
    const data = hot.getData();
    const mergeCells = hot.getPlugin('mergeCells').mergedCellsCollection.mergedCells;
    const saveStatus = document.getElementById('saveStatus');
    
    saveStatus.textContent = '保存中...';
    saveStatus.className = 'save-status saving';
    
    const tableData = {
        data: data,
        mergeCells: mergeCells.map(cell => ({
            row: cell.row,
            col: cell.col,
            rowspan: cell.rowspan,
            colspan: cell.colspan
        }))
    };
    
    fetch(`${API_BASE}/save`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            tableData: tableData,
            selectedTable: selectedTable
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            saveStatus.textContent = '保存失败';
            saveStatus.className = 'save-status error';
            setTimeout(() => {
                saveStatus.textContent = '';
                saveStatus.className = 'save-status';
            }, 2000);
            return;
        }
        
        saveStatus.textContent = '保存成功';
        saveStatus.className = 'save-status success';
        
        setTimeout(() => {
            saveStatus.textContent = '';
            saveStatus.className = 'save-status';
            nextImage(true);
        }, 500);
    })
    .catch(error => {
        console.error('Error:', error);
        saveStatus.textContent = '保存失败';
        saveStatus.className = 'save-status error';
        setTimeout(() => {
            saveStatus.textContent = '';
            saveStatus.className = 'save-status';
        }, 2000);
    });
}

function mergeCells() {
    const hot = selectedTable === 1 ? hot1 : hot2;
    const savedSelection = selectedTable === 1 ? savedSelection1 : savedSelection2;
    
    let selectedRange = null;
    
    const currentRanges = hot.getSelectedRange();
    
    if (currentRanges && currentRanges.length > 0) {
        selectedRange = currentRanges[0];
    } else if (savedSelection) {
        selectedRange = savedSelection;
    }
    
    if (!selectedRange) {
        alert('请先选择要合并的单元格');
        return;
    }
    
    const mergePlugin = hot.getPlugin('mergeCells');
    
    const minRow = Math.min(selectedRange.from.row, selectedRange.to.row);
    const maxRow = Math.max(selectedRange.from.row, selectedRange.to.row);
    const minCol = Math.min(selectedRange.from.col, selectedRange.to.col);
    const maxCol = Math.max(selectedRange.from.col, selectedRange.to.col);
    
    mergePlugin.merge(minRow, minCol, maxRow , maxCol);
    hot.render();
}

function unmergeCells() {
    const hot = selectedTable === 1 ? hot1 : hot2;
    const savedSelection = selectedTable === 1 ? savedSelection1 : savedSelection2;
    
    let selectedRange = null;
    
    const currentRanges = hot.getSelectedRange();
    if (currentRanges && currentRanges.length > 0) {
        selectedRange = currentRanges[0];
    } else if (savedSelection) {
        selectedRange = savedSelection;
    }
    
    if (!selectedRange) {
        alert('请先选择要取消合并的单元格');
        return;
    }
    
    const mergePlugin = hot.getPlugin('mergeCells');
    const mergedCells = mergePlugin.mergedCellsCollection.mergedCells;
    
    let foundMerge = null;
    for (const mergeCell of mergedCells) {
        const row = mergeCell.row;
        const col = mergeCell.col;
        const rowspan = mergeCell.rowspan;
        const colspan = mergeCell.colspan;
        
        const minRow = Math.min(selectedRange.from.row, selectedRange.to.row);
        const maxRow = Math.max(selectedRange.from.row, selectedRange.to.row);
        const minCol = Math.min(selectedRange.from.col, selectedRange.to.col);
        const maxCol = Math.max(selectedRange.from.col, selectedRange.to.col);
        
        if (row >= minRow && row + rowspan - 1 <= maxRow &&
            col >= minCol && col + colspan - 1 <= maxCol) {
            foundMerge = mergeCell;
            break;
        }
    }
    
    if (!foundMerge) {
        alert('选中的单元格不是合并单元格');
        return;
    }
    
    mergePlugin.unmerge(foundMerge.row, foundMerge.col);
    hot.render();
}

function showFloatingImage() {
    if (!currentRelativePath) {
        alert('没有可用的相对路径图片');
        return;
    }
    
    const modal = document.getElementById('floatingImageModal');
    const img = document.getElementById('floatingImage');
    const loading = document.getElementById('floatingImageLoading');
    const error = document.getElementById('floatingImageError');
    const title = document.getElementById('floatingImageTitle');
    
    title.textContent = currentRelativePath;
    img.style.display = 'none';
    error.style.display = 'none';
    loading.style.display = 'block';
    modal.style.display = 'flex';
    
    fetch(`${API_BASE}/get_relative_image`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ relativePath: currentRelativePath })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('图片加载失败');
        }
        return response.blob();
    })
    .then(blob => {
        const url = URL.createObjectURL(blob);
        img.onload = function() {
            loading.style.display = 'none';
            img.style.display = 'block';
            URL.revokeObjectURL(url);
        };
        img.onerror = function() {
            loading.style.display = 'none';
            error.style.display = 'block';
            URL.revokeObjectURL(url);
        };
        img.src = url;
    })
    .catch(err => {
        console.error('Error:', err);
        loading.style.display = 'none';
        error.style.display = 'block';
    });
}

function closeFloatingImage() {
    const modal = document.getElementById('floatingImageModal');
    const img = document.getElementById('floatingImage');
    modal.style.display = 'none';
    img.src = '';
}

function gotoImage() {
    const input = document.getElementById('gotoInput');
    const index = parseInt(input.value);
    
    if (isNaN(index) || index < 1 || index > totalImages) {
        alert(`请输入有效的序号（1 - ${totalImages}）`);
        return;
    }
    
    autoSave(() => {
        fetch(`${API_BASE}/goto_image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ index: index - 1 })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('错误: ' + data.error);
                return;
            }
            
            updateImageDisplay(data);
            updateTableData(data.tableData1, data.tableData2);
            updateCounter(data.currentIndex, data.total);
            updateImageStatus(data.status);
            input.value = '';
        })
        .catch(error => {
            console.error('Error:', error);
            alert('跳转失败');
        });
    });
}

function updateImageStatus(status) {
    const statusElement = document.getElementById('imageStatus');
    statusElement.className = 'image-status';
    
    switch(status) {
        case 'unannotated':
            statusElement.textContent = '未标注';
            statusElement.classList.add('status-unannotated');
            break;
        case 'annotated':
            statusElement.textContent = '已标注';
            statusElement.classList.add('status-annotated');
            break;
        case 'format_error':
            statusElement.textContent = '版式错误';
            statusElement.classList.add('format-error');
            break;
        default:
            statusElement.textContent = '未标注';
            statusElement.classList.add('status-unannotated');
    }
}

function markFormatError() {
    fetch(`${API_BASE}/mark_format_error`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('标记失败: ' + data.error);
            return;
        }
        
        updateImageStatus('format_error');
        setTimeout(() => {
            nextImage(true);
        }, 300);
    })
    .catch(error => {
        console.error('Error:', error);
        alert('标记失败');
    });
}
