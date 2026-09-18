"""Build the local catalogue from GeoNames dumps downloaded separately.
Usage: python3 scripts/import-destinations.py cities500.zip countryInfo.txt admin1CodesASCII.txt
GeoNames data: CC BY 4.0. See data/locations/README.md.
"""
import json, pathlib, sys, zipfile
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
with zipfile.ZipFile(sys.argv[1]) as archive:
    for line in archive.read('cities500.txt').decode().splitlines():
        f = line.split('\t')
        if f[8] not in countries or f[7] in ('PPLX', 'PPLH', 'PPLQ', 'PPLW'):
            continue
        region = admins.get(f[8] + '.' + f[10], '')
        label = ', '.join(dict.fromkeys(x for x in [f[1], region, countries[f[8]]] if x))
        if len(label) <= 120:
            rows.append([f[0], f[1], f[2] if f[2] != f[1] else '', region, f[8], int(f[14] or 0)])
rows.sort(key=lambda row: -row[5])
for name, value in [('cities', rows), ('countries', countries)]:
    (out / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))
print(f'Imported {len(rows)} cities/towns and {len(countries)} countries/territories')
