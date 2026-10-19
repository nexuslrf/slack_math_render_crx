from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
source = root / "dist" / "slack-math-viewer"
target = root / "dist" / "slack-math-viewer.zip"
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob("*")):
        if file.is_file():
            archive.write(file, file.relative_to(source.parent))
print(f"Packaged extension: {target}")
