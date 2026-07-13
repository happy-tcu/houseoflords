"""Generate an INSERT SQL statement for pairings from src/data/pairings.json."""
import json, os

here = os.path.dirname(__file__)
with open(os.path.join(here, '..', 'src', 'data', 'pairings.json')) as f:
    p = json.load(f)

judges = p['judges']
rounds = [('R1', p['r1']), ('R2', p['r2']), ('R3', p['r3'])]

lines = ["delete from pairings where round_id in ('R1','R2','R3');",
         "insert into pairings (round_id, room, aff_code, opp_code, judge_code) values"]
values = []
for rid, pairs in rounds:
    for i, (aff, opp) in enumerate(pairs):
        room = i + 1
        judge = judges[i]
        values.append(f"  ('{rid}', {room}, '{aff}', '{opp}', '{judge}')")
lines.append(",\n".join(values) + ";")

out = os.path.join(here, 'seed_pairings.sql')
with open(out, 'w') as f:
    f.write("\n".join(lines) + "\n")
print(f"Wrote {out}")
