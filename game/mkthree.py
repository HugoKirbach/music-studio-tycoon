# Transforme le module ES de Three.js en script classique qui expose window.THREE (pour un fichier HTML unique, hors ligne).
import re
src = open('vendor/three.module.min.js', encoding='utf-8').read()
assert 'import ' not in src[:2000] and 'import.meta' not in src
m = re.search(r'export\s*\{([^}]*)\}\s*;?\s*$', src)
assert m, 'export introuvable'
pairs = []
for part in m.group(1).split(','):
    part = part.strip()
    if not part: continue
    a, _, b = part.partition(' as ')
    pairs.append((b.strip() or a.strip(), a.strip()))
body = src[:m.start()]
obj = ','.join('%s:%s' % (k, v) for k, v in pairs)
out = '/* three.js r160, MIT License, https://threejs.org */\nwindow.THREE=(function(){"use strict";' + body + '\nreturn{' + obj + '};})();\n'
open('vendor/three.global.js', 'w', encoding='utf-8').write(out)
print('ok', len(pairs), 'exports', len(out), 'octets')
