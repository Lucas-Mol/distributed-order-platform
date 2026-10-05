#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
rm -rf package function.zip
pip install --quiet --no-cache-dir --target package \
  --platform manylinux_2_28_x86_64 --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 \
  --only-binary=:all: -r requirements.txt
cp handler.py package/
python -c "
import pathlib, zipfile
root = pathlib.Path('package')
with zipfile.ZipFile('function.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        archive.write(path, path.relative_to(root))
"
rm -rf package
echo "[lambdas] image_thumbnail/function.zip built"
