import os
import re

files_to_delete = ['mock.js', 'backend/test-firestore.js', 'backend/check-db.js']
for f in files_to_delete:
    if os.path.exists(f):
        os.remove(f)

js_files = []
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root:
        continue
    for file in files:
        if file.endswith('.js') and 'clean.py' not in file:
            js_files.append(os.path.join(root, file))

pattern = re.compile(r'^\s*console\.log\(.*?\);\s*$', re.MULTILINE)
for f in js_files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    new_content = pattern.sub('', content)
    if content != new_content:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(new_content)
        print(f'Removed console.log from {f}')

html_file = 'popup.html'
if os.path.exists(html_file):
    with open(html_file, 'r', encoding='utf-8') as file:
        content = file.read()
    new_content = re.sub(r'\s*<script src="mock\.js"></script>\s*', '\n', content)
    if content != new_content:
        with open(html_file, 'w', encoding='utf-8') as file:
            file.write(new_content)
        print(f'Removed mock.js from {html_file}')
