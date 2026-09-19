#!/bin/bash
# Sube la versión de todos los assets (ejecutar antes de publicar cambios)
V="1.0.$(date +%Y%m%d%H%M%S)"
for f in *.html; do
  sed -i -E "s#(href=\"assets/[^\"?]+\.css)(\?v=[^\"]*)?\"#\1?v=$V\"#g; s#(src=\"assets/[^\"?]+\.js)(\?v=[^\"]*)?\"#\1?v=$V\"#g" "$f"
done
sed -i -E "s/version: \"[^\"]*\"/version: \"$V\"/" assets/config.js
echo "$V" > version.txt
echo "Versión $V aplicada"
