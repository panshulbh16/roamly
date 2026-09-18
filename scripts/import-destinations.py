"""Build the local catalogue from GeoNames dumps downloaded separately.
Usage: python3 scripts/import-destinations.py cities500.zip countryInfo.txt admin1CodesASCII.txt
GeoNames data: CC BY 4.0. See data/locations/README.md.
"""
import json, pathlib, sys, zipfile, unicodedata

def normalize(value):
    value = ''.join(c for c in unicodedata.normalize("NFD", value) if not unicodedata.category(c).startswith("M"))
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in value.lower()).split())
out = pathlib.Path('data/locations')
out.mkdir(parents=True, exist_ok=True)
countries = {}
for line in pathlib.Path(sys.argv[2]).read_text().splitlines():
    if line and not line.startswith('#'):
        fields = line.split('\t')
        countries[fields[0]] = fields[4]
admins = {}
for line in pathlib.Path(sys.argv[3]).read_text().splitlines():
    fields = line.split('\t')
    admins[fields[0]] = fields[1]
rows = []
alternate_names = {}
with zipfile.ZipFile(sys.argv[1]) as archive:
    for line in archive.read('cities500.txt').decode().splitlines():
        f = line.split('\t')
        if f[8] not in countries or f[7] in ('PPLX', 'PPLH', 'PPLQ', 'PPLW'):
            continue
        region = admins.get(f[8] + '.' + f[10], '')
        label = ', '.join(dict.fromkeys(x for x in [f[1], region, countries[f[8]]] if x))
        if len(label) <= 120:
            alternate_names[f[0]] = f[3].split(",")
            rows.append([f[0], f[1], f[2] if f[2] != f[1] else '', region, f[8], int(f[14] or 0)])
rows.sort(key=lambda row: -row[5])
index = {}
for position, row in enumerate(rows):
    canonical = {normalize(row[1]), normalize(row[2])} - {''}
    # Ignore short ASCII codes (e.g. airport codes), but retain short native-script names.
    variants = {normalize(name) for name in alternate_names[row[0]]
                if 1 < len(name) <= 120 and not (name.isascii() and len(name) <= 3)}
    for name in canonical | variants:
        if name and not name.isdecimal():
            index.setdefault(name, []).append(position)
# Sorted compact strings allow binary lookup without building a second in-memory map.
name_index = [name + '\t' + ','.join(map(str, index[name])) for name in sorted(index, key=lambda value: value.encode("utf-16-be"))]
for name, value in [('cities', rows), ('countries', countries), ('name-index', name_index)]:
    (out / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))
print(f'Imported {len(rows)} cities/towns and {len(countries)} countries/territories')
