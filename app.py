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
    files = []
    for f in Path(directory).rglob('*'):
        if f.suffix.lower() in ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'):
            files.append(str(f))
    return sorted(files)


def get_html_files(image_file):
    image_file = Path(image_file)
    html_1_path = image_file.with_suffix('.md')
    html_2_path = image_file.with_suffix('.md1')
    
    result = {'html1': None, 'html2': None}
    
    if os.path.exists(html_1_path):
        result['html1'] = html_1_path
    if os.path.exists(html_2_path):
        result['html2'] = html_2_path
    
    return result


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
    html_files = get_html_files(image_path)
    table_data_1 = None
    table_data_2 = None
    
    parser = HTMLTableParser()
    
    if html_files['html1']:
        try:
            table_data_1 = parser.parse(html_files['html1'])
        except Exception as e:
            table_data_1 = {'error': str(e)}
    
    if html_files['html2']:
        try:
            table_data_2 = parser.parse(html_files['html2'])
        except Exception as e:
            table_data_2 = {'error': str(e)}
    
    annotated_flag = Path(image_path).with_suffix('.annotated.flag')
    format_error_flag = Path(image_path).with_suffix('.format_error.flag')
    status = 'unannotated'
    if format_error_flag.exists():
        status = 'format_error'
    elif annotated_flag.exists():
        status = 'annotated'
    
    return jsonify({
        'imageName': image_file,
        'imagePath': image_path,
        'relativePath': relative_path,
        'currentIndex': current_index,
        'total': len(image_files),
        'tableData1': table_data_1,
        'tableData2': table_data_2,
        'status': status
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


@app.route('/api/save', methods=['POST'])
def save():
    global current_directory, image_files, current_index
    
    data = request.get_json()
    table_data = data.get('tableData')
    
    if not image_files:
        return jsonify({'error': 'No images loaded'}), 404
    
    image_file = image_files[current_index]
    
    try:
        converter = ExcelConverter()
        html_path = str(Path(image_file).with_suffix('.md'))
        converter.save_html(table_data, html_path)
        
        annotated_flag = Path(image_file).with_suffix('.annotated.flag')
        annotated_flag.touch()
        
        # format_error_flag = Path(image_file).with_suffix('.format_error.flag')
        # if format_error_flag.exists():
        #     format_error_flag.unlink()
        
        return jsonify({
            'success': True,
            'htmlPath': html_path
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/mark_format_error', methods=['POST'])
def mark_format_error():
    global current_directory, image_files, current_index
    
    if not image_files:
        return jsonify({'error': 'No images loaded'}), 404
    
    image_file = image_files[current_index]
    format_error_flag = Path(image_file).with_suffix('.format_error.flag')
    print(format_error_flag)
    try:
        format_error_flag.touch()
        
        annotated_flag = Path(image_file).with_suffix('.annotated.flag')
        if annotated_flag.exists():
            annotated_flag.unlink()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
