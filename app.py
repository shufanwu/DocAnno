from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import os
import json
from pathlib import Path
from werkzeug.utils import secure_filename
from html_parser import HTMLTableParser
from excel_converter import ExcelConverter

app = Flask(__name__)
CORS(app)

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}

current_directory = None
image_files = []
current_index = 0


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_image_files(directory):
    image_dir = Path(directory)/'image'
    files = []
    for f in image_dir.rglob('*'):
        if f.suffix.lower() in ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'):
            files.append(str(f))
    return sorted(files)


def get_label_path(image_path):
    """获取图片对应的标签文件路径"""
    image_path = Path(image_path)
    relative_path = image_path.relative_to(current_directory+'/image') if current_directory else image_path.name
    label_path = Path(current_directory)/'label'/ relative_path.with_suffix('.json')
    return str(label_path)


def get_current_label():
    """获取当前图片的标签数据"""
    global current_directory, image_files, current_index
    
    if not image_files:
        return None
    
    image_path = image_files[current_index]
    label_path = get_label_path(image_path)
    print(label_path)
    if os.path.exists(label_path):
        with open(label_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return convert_to_new_format(data)
    return None


def get_label_for_image(image_path):
    label_path = get_label_path(image_path)
    if not os.path.exists(label_path):
        return {'boxes': []}

    with open(label_path, 'r', encoding='utf-8') as f:
        return convert_to_new_format(json.load(f))


def get_invalid_image_indices():
    indices = []
    for index, image_path in enumerate(image_files):
        label_data = get_label_for_image(image_path)
        if any(box.get('block_valid') is False for box in label_data.get('boxes', [])):
            indices.append(index)
    return indices


def convert_to_new_format(data):
    """将旧格式标签数据转换为新格式"""
    if isinstance(data, dict) and 'boxes' in data:
        return data
    
    boxes = []
    if 'parsing_res_list' in data and isinstance(data['parsing_res_list'], list):
        for item in data['parsing_res_list']:
            if isinstance(item, dict):
                bbox = item.get('block_bbox', [0, 0, 100, 50])
                x = bbox[0]
                y = bbox[1]
                width = bbox[2] - x
                height = bbox[3] - y
                box = {
                    'x': x,
                    'y': y,
                    'width': width if width > 0 else 100,
                    'height': height if height > 0 else 50,
                    'category': item.get('block_label', 'text'),
                    'content': item.get('block_content', ''),
                    'block_order': item.get('block_order'),
                    'points': item.get('block_polygon_points', []),
                    'block_id': item.get('block_id', -1),
                    'block_valid': item.get('block_valid', True)
                }
                boxes.append(box)
    else:
        for key, value in data.items():
            if isinstance(value, dict):
                box = {
                    'x': value.get('x', 0),
                    'y': value.get('y', 0),
                    'width': value.get('width', 100),
                    'height': value.get('height', 50),
                    'category': value.get('type', 'text'),
                    'content': value.get('text', value.get('text_list', [''])[0] if value.get('text_list') else ''),
                    'block_order': value.get('block_order', value.get('readingOrder')),
                    'block_id': value.get('block_id'),
                    'block_valid': value.get('block_valid', True),
                    'score_list': value.get('score_list', []),
                    'match_idx': value.get('match_idx', -1)
                }
                boxes.append(box)
    
    return {'boxes': boxes}


def save_label(label_data):
    """保存标签数据"""
    global current_directory, image_files, current_index
    
    if not image_files:
        return False
    
    image_path = image_files[current_index]
    label_path = get_label_path(image_path)
    
    try:
        os.makedirs(os.path.dirname(label_path), exist_ok=True)
        with open(label_path, 'w', encoding='utf-8') as f:
            json.dump(label_data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Save label error: {e}")
        return False


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/set_directory', methods=['POST'])
def set_directory():
    global current_directory, image_files, current_index
    
    data = request.get_json()
    directory = data.get('directory')
    
    if not directory or not os.path.isdir(directory):
        return jsonify({'error': 'Invalid directory'}), 400
    
    current_directory = directory
    image_files = get_image_files(directory)
    current_index = 0
    
    if not image_files:
        return jsonify({'error': 'No image files found in directory'}), 404
    
    return jsonify({
        'success': True,
        'total': len(image_files),
        'currentIndex': current_index
    })


@app.route('/api/get_current_image', methods=['GET'])
def get_current_image():
    global current_directory, image_files, current_index
    
    if not image_files:
        return jsonify({'error': 'No images loaded'}), 404
    
    image_path = image_files[current_index]
    image_file = Path(image_path).name
    relative_path = str(Path(image_path).relative_to(current_directory)) if current_directory else image_file
    
    label_data = get_current_label()
    if label_data is None:
        label_data = {'boxes': []}
    
    return jsonify({
        'imageName': image_file,
        'imagePath': image_path,
        'relativePath': relative_path,
        'currentIndex': current_index,
        'total': len(image_files),
        'labelData': label_data
    })


@app.route('/api/image_statuses', methods=['GET'])
def image_statuses():
    return jsonify({
        'currentIndex': current_index,
        'total': len(image_files),
        'invalidIndices': get_invalid_image_indices()
    })


@app.route('/api/get_image/<path:image_path>')
def get_image(image_path):
    if os.name == 'nt':
        return send_file(image_path, mimetype='image/jpeg', conditional=False)
    else:
        return send_file('/'+image_path, mimetype='image/jpeg', conditional=False)


@app.route('/api/get_relative_image', methods=['POST'])
def get_relative_image():
    global current_directory
    
    data = request.get_json()
    relative_path = data.get('relativePath')
    
    if not current_directory or not relative_path:
        return jsonify({'error': 'Missing directory or relative path'}), 400
    
    try:
        full_path = os.path.join(current_directory, relative_path)
        if os.path.exists(full_path):
            return send_file(full_path, mimetype='image/jpeg', conditional=False)
        else:
            return jsonify({'error': 'Image not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/next_image', methods=['POST'])
def next_image():
    global current_index
    
    if not image_files:
        return jsonify({'error': 'No images loaded'}), 404
    
    if current_index < len(image_files) - 1:
        current_index += 1
        return get_current_image()
    
    return jsonify({'error': 'Already at last image'}), 400


@app.route('/api/prev_image', methods=['POST'])
def prev_image():
    global current_index
    
    if not image_files:
        return jsonify({'error': 'No images loaded'}), 404
    
    if current_index > 0:
        current_index -= 1
        return get_current_image()
    
    return jsonify({'error': 'Already at first image'}), 400


@app.route('/api/goto_image', methods=['POST'])
def goto_image():
    global current_index
    
    data = request.get_json()
    index = data.get('index')
    
    if not image_files:
        return jsonify({'error': 'No images loaded'}), 404
    
    if 0 <= index < len(image_files):
        current_index = index
        return get_current_image()
    
    return jsonify({'error': 'Invalid index'}), 400


@app.route('/api/save_label', methods=['POST'])
def save_label_api():
    global current_directory, image_files, current_index
    
    data = request.get_json()
    label_data = data.get('labelData')
    
    if not image_files:
        return jsonify({'error': 'No images loaded'}), 404
    
    try:
        success = save_label(label_data)
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Failed to save label'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/table/parse', methods=['POST'])
def parse_table_content():
    data = request.get_json() or {}
    content = data.get('content', '')

    try:
        return jsonify(HTMLTableParser().parse_content(content))
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/table/serialize', methods=['POST'])
def serialize_table_content():
    data = request.get_json() or {}
    table_data = data.get('tableData', {})

    try:
        return jsonify({'content': ExcelConverter().to_html(table_data)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/list_directories', methods=['GET'])
def list_directories():
    drives = []
    if os.name == 'nt':
        import string
        for c in string.ascii_uppercase:
            drive = c + ':'
            if os.path.exists(drive):
                drives.append(drive)
    else:
        drives = ['/']
    return jsonify({'drives': drives})


@app.route('/api/list_directory_contents', methods=['POST'])
def list_directory_contents():
    data = request.get_json()
    path = data.get('path', '')
    
    try:
        if not path:
            if os.name == 'nt':
                import string
                items = [d + ':' for d in string.ascii_uppercase if os.path.exists(d + ':')]
            else:
                items = ['/']
        else:
            items = []
            for item in os.listdir(path):
                full_path = os.path.join(path, item)
                if os.path.isdir(full_path):
                    items.append({
                        'name': item,
                        'path': full_path,
                        'type': 'directory'
                    })
            items.sort(key=lambda x: x['name'].lower())
        
        return jsonify({'items': items, 'currentPath': path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
