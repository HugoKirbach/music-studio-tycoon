# Assemble le jeu en un seul fichier HTML, copié dans ../www pour les applications.
# Usage : python game/build.py
import subprocess, sys, os, shutil
here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)
if not os.path.exists('vendor/three.global.js'):
    subprocess.run([sys.executable, 'mkthree.py'], check=True)
read = lambda p: open(p, encoding='utf-8').read()
t = read('template.html')
for key, path in (('/*THREE*/', 'vendor/three.global.js'), ('/*DATA*/', 'data.js'), ('/*ENGINE*/', 'engine.js'), ('/*SCENE*/', 'scene3d.js'), ('/*UI*/', 'ui.js')):
    js = read(path)
    assert '</script' not in js.lower(), path
    t = t.replace(key, js, 1)
os.makedirs('dist', exist_ok=True)
open('dist/index.html', 'w', encoding='utf-8').write(t)
shutil.copy('dist/index.html', os.path.join('..', 'www', 'index.html'))
print('ok', len(t.encode('utf-8')), 'octets -> www/index.html')
