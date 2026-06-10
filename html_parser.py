from bs4 import BeautifulSoup
import re


class HTMLTableParser:
    def __init__(self):
        pass
    
    def parse(self, html_file):
        with open(html_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        soup = BeautifulSoup(content, 'lxml')
        tables = soup.find_all('table')
        
        if not tables:
            return {'data': [], 'mergeCells': []}
        
        table = tables[0]
        return self._parse_table(table)
    
    def _parse_table(self, table):
        rows = table.find_all('tr')
        if not rows:
            return {'data': [], 'mergeCells': []}
        
        grid = []
        max_cols = 0
        
        for row_idx, row in enumerate(rows):
            cells = row.find_all(['td', 'th'])
            if row_idx==len(grid):
                grid.append([])
            col_idx = 0
            
            for cell in cells:
                while col_idx < len(grid[row_idx]) and grid[row_idx][col_idx] is not None:
                    col_idx += 1
                
                text = cell.get_text(strip=True)
                colspan = int(cell.get('colspan', 1))
                rowspan = int(cell.get('rowspan', 1))
                
                while len(grid[row_idx]) < col_idx + colspan:
                    grid[row_idx].append(None)
                
                for c in range(colspan):
                    grid[row_idx][col_idx + c] = text if c == 0 else ''
                
                for r in range(1, rowspan):
                    while len(grid) <= row_idx + r:
                        grid.append([])
                    while len(grid[row_idx + r]) < col_idx + colspan:
                        grid[row_idx + r].append(None)
                    for c in range(colspan):
                        grid[row_idx + r][col_idx + c] = ''
                
                max_cols = max(max_cols, col_idx + colspan)
                col_idx += colspan
        
        data = []
        for row in grid:
            while len(row) < max_cols:
                row.append('')
            data.append(row)
        
        merge_cells = self._find_merged_cells(table, len(data), max_cols)
        
        return {
            'data': data,
            'mergeCells': merge_cells
        }
    
    def _find_merged_cells(self, table, num_rows, num_cols):
        merge_cells = []
        grid = [[None for _ in range(num_cols)] for _ in range(num_rows)]
        
        rows = table.find_all('tr')
        row_idx = 0
        
        for row in rows:
            if row_idx >= num_rows:
                break
            
            cells = row.find_all(['td', 'th'])
            col_idx = 0
            
            for cell in cells:
                while col_idx < num_cols and grid[row_idx][col_idx] is not None:
                    col_idx += 1
                
                if col_idx >= num_cols:
                    break
                
                colspan = int(cell.get('colspan', 1))
                rowspan = int(cell.get('rowspan', 1))
                
                for r in range(rowspan):
                    for c in range(colspan):
                        if row_idx + r < num_rows and col_idx + c < num_cols:
                            grid[row_idx + r][col_idx + c] = 'occupied'
                
                if colspan > 1 or rowspan > 1:
                    merge_cells.append({
                        'row': row_idx,
                        'col': col_idx,
                        'rowspan': rowspan,
                        'colspan': colspan
                    })
                
                col_idx += colspan
            
            row_idx += 1
        
        return merge_cells
