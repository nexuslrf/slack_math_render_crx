from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
source = root / "dist" / "slack-math-viewer"
target = root / "dist" / "slack-math-viewer.zip"
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob("*")):
        if file.is_file():
            # Stable metadata makes local and CI packages byte-for-byte identical.
            info = ZipInfo(file.relative_to(source.parent).as_posix(), (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, file.read_bytes())
print(f"Packaged extension: {target}")
