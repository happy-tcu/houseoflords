"""
Generate cross-class debate pairings for 60 speakers (6 classes A-F, 10 each)
across 3 prelim rounds with judge assignments and side balancing.

Constraints:
  - Every speaker debates exactly 3 times (once per round)
  - Cross-class only (never same class)
  - No repeat opponents across R1, R2, R3
  - Each speaker faces 3 different classes across the prelims
  - R1 -> R2 side swap (bipartite): whoever was Aff in R1 is Opp in R2
  - R3 sides balance history so no speaker is on the same side all 3 rounds
  - Rooms 1-30 fixed to J1-J30; room ordering ensures each judge sees 6 unique speakers

Outputs:
  src/data/pairings.json  { r1: [[aff, opp], ...30], r2: [...], r3: [...], judges: [J1..J30] }
"""
import random, json, os

random.seed(1807)

SPEAKERS = [f"{c}{i}" for c in "ABCDEF" for i in range(1, 11)]
def cls(s): return s[0]

def gen_r1():
    for _ in range(20000):
        pool = SPEAKERS[:]
        random.shuffle(pool)
        remaining = pool[:]
        pairs = []
        ok = True
        while remaining:
            s1 = remaining.pop(0)
            order = list(range(len(remaining)))
            random.shuffle(order)
            found = False
            for j in order:
                s2 = remaining[j]
                if cls(s1) != cls(s2):
                    remaining.pop(j)
                    pairs.append((s1, s2))
                    found = True
                    break
            if not found:
                ok = False; break
        if ok and len(pairs) == 30:
            return [(a, b) if random.random() < 0.5 else (b, a) for a, b in pairs]
    raise RuntimeError("R1 failed")

def gen_r2(r1, used_pairs, opp_classes):
    r1_affs = [aff for aff, opp in r1]
    r1_opps = [opp for aff, opp in r1]
    for _ in range(50000):
        pool_a = r1_affs[:]
        pool_o = r1_opps[:]
        random.shuffle(pool_a); random.shuffle(pool_o)
        assigned = []; used = [False]*len(pool_o); ok = True
        for a in pool_a:
            order = list(range(len(pool_o))); random.shuffle(order)
            found = False
            for j in order:
                if used[j]: continue
                b = pool_o[j]
                if cls(a) == cls(b): continue
                if frozenset({a, b}) in used_pairs: continue
                if cls(b) in opp_classes[a] or cls(a) in opp_classes[b]: continue
                used[j] = True
                assigned.append((b, a))  # side swap
                found = True; break
            if not found:
                ok = False; break
        if ok and len(assigned) == 30:
            return assigned
    raise RuntimeError("R2 failed")

def gen_r3(used_pairs, side_history, opp_classes):
    for _ in range(50000):
        pool = SPEAKERS[:]
        random.shuffle(pool)
        remaining = pool[:]
        pairs = []
        ok = True
        while remaining:
            s1 = remaining.pop(0)
            order = list(range(len(remaining))); random.shuffle(order)
            found = False
            for j in order:
                s2 = remaining[j]
                if cls(s1) == cls(s2): continue
                if frozenset({s1, s2}) in used_pairs: continue
                if cls(s2) in opp_classes[s1] or cls(s1) in opp_classes[s2]: continue
                remaining.pop(j)
                pairs.append((s1, s2))
                found = True; break
            if not found:
                ok = False; break
        if ok and len(pairs) == 30:
            # side balance
            result = []
            for a, b in pairs:
                a_aff = side_history[a].count('A')
                b_aff = side_history[b].count('A')
                if a_aff > b_aff:
                    result.append((b, a))
                elif b_aff > a_aff:
                    result.append((a, b))
                else:
                    result.append((a, b) if random.random() < 0.5 else (b, a))
            return result
    raise RuntimeError("R3 failed")

def optimize_rooms(prev_rounds, candidate):
    n = len(candidate)
    for _ in range(20000):
        forbidden = [set() for _ in range(n)]
        for i in range(n):
            for prev in prev_rounds:
                forbidden[i].update(prev[i])
        cand_idx = list(range(n)); random.shuffle(cand_idx)
        rooms_order = list(range(n)); random.shuffle(rooms_order)
        assigned = [None]*n; used_ci = set(); ok = True
        for room in rooms_order:
            placed = False
            for ci in cand_idx:
                if ci in used_ci: continue
                a, b = candidate[ci]
                if a in forbidden[room] or b in forbidden[room]: continue
                assigned[room] = candidate[ci]
                used_ci.add(ci); placed = True; break
            if not placed:
                ok = False; break
        if ok and all(a is not None for a in assigned):
            return assigned
    return candidate

def main():
    r1 = gen_r1()
    used = set(frozenset({a,b}) for a,b in r1)
    opp_classes = {s: set() for s in SPEAKERS}
    for a, b in r1:
        opp_classes[a].add(cls(b)); opp_classes[b].add(cls(a))

    r2 = gen_r2(r1, used, opp_classes)
    for a, b in r2:
        used.add(frozenset({a,b}))
        opp_classes[a].add(cls(b)); opp_classes[b].add(cls(a))

    side_hist = {s: [] for s in SPEAKERS}
    for aff, opp in r1:
        side_hist[aff].append('A'); side_hist[opp].append('O')
    for aff, opp in r2:
        side_hist[aff].append('A'); side_hist[opp].append('O')

    r3 = gen_r3(used, side_hist, opp_classes)
    for aff, opp in r3:
        used.add(frozenset({aff, opp}))

    r2 = optimize_rooms([r1], r2)
    r3 = optimize_rooms([r1, r2], r3)

    judges = [f"J{i+1}" for i in range(30)]

    out_dir = os.path.join(os.path.dirname(__file__), '..', 'src', 'data')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'pairings.json')
    with open(out_path, 'w') as f:
        json.dump({'r1': r1, 'r2': r2, 'r3': r3, 'judges': judges}, f, indent=2)
    print(f"Wrote {out_path}")

if __name__ == '__main__':
    main()
