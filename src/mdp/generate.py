"""
MDP V-table pre-computation script.
Run: python generate.py
Outputs: jiaxu_standard.js, jiaxu_mage.js,
         gufu_standard.js,  gufu_mage.js,
         faultrobot_standard.js, faultrobot_mage.js
Each file exports a plain JS Array of floats: export default [...]
"""
import json, os, time

MAX_JI      = 12
MAX_LO      = 5
GAMMA       = 0.92
MAX_ITER    = 400
CONV_THRESH = 1e-5

BASE_ACTIONS = {
    'ji':        {'type':'ji',      'cost':0, 'def':0, 'atk':0, 'damage':0},
    'defense_0': {'type':'defense', 'cost':0, 'def':3, 'atk':0, 'damage':0},
    'defense_1': {'type':'defense', 'cost':1, 'def':6, 'atk':0, 'damage':0},
    'defense_2': {'type':'defense', 'cost':2, 'def':7, 'atk':0, 'damage':0},
    'attack_1':  {'type':'attack',  'cost':1, 'def':0, 'atk':1, 'damage':1},
    'attack_2':  {'type':'attack',  'cost':2, 'def':0, 'atk':2, 'damage':1},
    'attack_3':  {'type':'attack',  'cost':3, 'def':0, 'atk':3, 'damage':1},
    'attack_4':  {'type':'attack',  'cost':4, 'def':0, 'atk':4, 'damage':1},
    'attack_5':  {'type':'attack',  'cost':5, 'def':0, 'atk':5, 'damage':1},
    'attack_6':  {'type':'attack',  'cost':6, 'def':0, 'atk':6, 'damage':1},
    'attack_7':  {'type':'attack',  'cost':7, 'def':0, 'atk':7, 'damage':1},
}
MAGE_RELEASE_ACT = {'type':'attack', 'cost':0, 'atk':5, 'damage':1}

def clamp(v, lo, hi): return max(lo, min(hi, v))
def boss_affordable(bj): return [k for k,v in BASE_ACTIONS.items() if v['cost'] <= bj]

def raw_damage(pa, ea):
    p_atk = pa['type'] == 'attack'
    e_atk = ea['type'] == 'attack'
    if not p_atk and not e_atk: return 0, 0
    if p_atk and not e_atk:
        return 0, (pa['damage'] if pa['atk'] > ea.get('def',0) else 0)
    if not p_atk and e_atk:
        return (ea['damage'] if ea['atk'] > pa.get('def',0) else 0), 0
    if pa['atk'] > ea['atk']: return 0, pa['damage']
    if ea['atk'] > pa['atk']: return ea['damage'], 0
    return 0, 0

def value_iteration(N, bellman_fn):
    V = [0.0] * N
    for it in range(MAX_ITER):
        Vnew = [0.0] * N
        max_delta = 0.0
        for s in range(N):
            val = bellman_fn(s, V)
            d = abs(val - V[s])
            if d > max_delta: max_delta = d
            Vnew[s] = val
        V = Vnew
        if max_delta < CONV_THRESH:
            print(f'  converged at iter {it+1}')
            break
    return V

# ── Player models ──────────────────────────────────────────────────────────────

def std_probs(pj, _plo):
    w = {}
    w['ji'] = 3.5 if pj < 3 else (1.0 if pj < 6 else 0.3)
    w['defense_0'] = 0.6
    if pj >= 1: w['defense_1'] = 0.5
    if pj >= 2: w['defense_2'] = 0.2
    if pj >= 1: w['attack_1'] = 1.2 if pj <= 2 else 0.15
    if pj >= 2: w['attack_2'] = 1.5 if pj <= 3 else 0.25
    if pj >= 3: w['attack_3'] = 1.8 if pj <= 4 else 0.45
    if pj >= 4: w['attack_4'] = 2.0
    if pj >= 5: w['attack_5'] = 1.8
    if pj >= 6: w['attack_6'] = 2.2
    if pj >= 7: w['attack_7'] = 3.0
    valid = [k for k in w if k in BASE_ACTIONS and BASE_ACTIONS[k]['cost'] <= pj]
    total = sum(w[k] for k in valid)
    return ({k: w[k]/total for k in valid} if total > 0 else {'ji': 1.0})

def std_transition(pa, pj, _plo):
    if pa == 'ji': return clamp(pj + 3, 0, MAX_JI), 0
    return clamp(pj - BASE_ACTIONS[pa]['cost'], 0, MAX_JI), 0

def mage_probs(pj, plo):
    w = {}
    w['ji'] = 3.0 if pj < 2 else (0.8 if pj < 5 else 0.2)
    w['defense_0'] = 1.2
    if pj >= 1: w['defense_1'] = 1.0
    if pj >= 2: w['defense_2'] = 0.4
    if plo >= MAX_LO: w['mage_release'] = 4.0
    if pj >= 1: w['attack_1'] = 1.0 if pj <= 2 else 0.1
    if pj >= 2: w['attack_2'] = 1.2 if pj <= 3 else 0.2
    if pj >= 3: w['attack_3'] = 1.5 if pj <= 4 else 0.4
    if pj >= 4: w['attack_4'] = 1.8
    if pj >= 5: w['attack_5'] = 1.6
    if pj >= 6: w['attack_6'] = 2.0
    if pj >= 7: w['attack_7'] = 2.8
    valid = []
    for k in w:
        if k == 'mage_release':
            if plo >= MAX_LO: valid.append(k)
        elif k in BASE_ACTIONS and BASE_ACTIONS[k]['cost'] <= pj:
            valid.append(k)
    total = sum(w[k] for k in valid)
    return ({k: w[k]/total for k in valid} if total > 0 else {'ji': 1.0})

def mage_transition(pa, pj, plo):
    if pa == 'ji': return clamp(pj + 2, 0, MAX_JI), plo
    if pa == 'mage_release': return pj, max(0, plo - MAX_LO)
    cost = BASE_ACTIONS[pa]['cost']
    new_pj = clamp(pj - cost, 0, MAX_JI)
    new_plo = min(plo + 1, MAX_LO) if pa.startswith('defense_') else plo
    return new_pj, new_plo

# ── Boss computations ──────────────────────────────────────────────────────────

def compute_jiaxu(boss_ji_rate, probs_fn, trans_fn, plo_size):
    N = MAX_JI + 1; NP = plo_size; NS = N * N * NP
    def sidx(bj, pj, plo): return (bj * N + pj) * NP + plo
    def bellman(s, V):
        plo = s % NP; r = s // NP; pj = r % N; bj = r // N
        pp = probs_fn(pj, plo)
        best = float('-inf')
        for ba in boss_affordable(bj):
            ba_act = BASE_ACTIONS[ba]
            nbj = clamp(bj + boss_ji_rate if ba == 'ji' else bj - ba_act['cost'], 0, MAX_JI)
            q = 0
            for pa, prob in pp.items():
                pa_act = MAGE_RELEASE_ACT if pa == 'mage_release' else BASE_ACTIONS[pa]
                pdmg, edmg = raw_damage(pa_act, ba_act)
                npj, nplo = trans_fn(pa, pj, plo)
                q += prob * ((pdmg - edmg) + GAMMA * V[sidx(nbj, npj, nplo)])
            if q > best: best = q
        return 0 if best == float('-inf') else best
    return value_iteration(NS, bellman)

def compute_gufu(probs_fn, trans_fn, plo_size):
    N = MAX_JI + 1; MAX_CV = 7; NC = MAX_CV + 1; NP = plo_size; NS = N * N * NC * NP
    def sidx(bj, pj, cv, plo): return ((bj * N + pj) * NC + cv) * NP + plo
    def bellman(s, V):
        plo = s % NP; r1 = s // NP; cv = r1 % NC; r2 = r1 // NC; pj = r2 % N; bj = r2 // N
        if cv == 0: return 0
        pp = probs_fn(pj, plo); best = float('-inf')
        for ba in boss_affordable(bj):
            ba_act = BASE_ACTIONS[ba]
            if ba == 'ji':
                nbj = clamp(bj + cv, 0, MAX_JI); ncv = min(cv + 1, MAX_CV)
            else:
                nbj = clamp(bj - ba_act['cost'], 0, MAX_JI); ncv = cv
            q = 0
            for pa, prob in pp.items():
                pa_act = MAGE_RELEASE_ACT if pa == 'mage_release' else BASE_ACTIONS[pa]
                pdmg, edmg = raw_damage(pa_act, ba_act)
                npj, nplo = trans_fn(pa, pj, plo)
                q += prob * ((pdmg - edmg) + GAMMA * V[sidx(nbj, npj, ncv, nplo)])
            if q > best: best = q
        return 0 if best == float('-inf') else best
    return value_iteration(NS, bellman)

def compute_faultrobot(probs_fn, trans_fn, plo_size):
    N = MAX_JI + 1; NO = 6; NP = plo_size; NS = N * N * NO * NP
    KILL_REWARD = 15
    ORB_PASSIVE = {'type':'orb_buff','def':0,'atk':0,'cost':0,'damage':0}
    def sidx(bj, pj, uo, plo): return ((bj * N + pj) * NO + uo) * NP + plo
    def q_orb(bj, pj, uo, plo, V):
        if uo == 5: return KILL_REWARD
        pp = probs_fn(pj, plo); p_inc = (5 - uo) / 5; q = 0
        for pa, prob in pp.items():
            pa_act = MAGE_RELEASE_ACT if pa == 'mage_release' else BASE_ACTIONS[pa]
            pdmg, _ = raw_damage(pa_act, ORB_PASSIVE)
            npj, nplo = trans_fn(pa, pj, plo)
            q += prob * (-pdmg + GAMMA * (p_inc * V[sidx(bj, npj, min(uo+1,5), nplo)]
                                         + (1-p_inc) * V[sidx(bj, npj, uo, nplo)]))
        return q
    def bellman(s, V):
        plo = s % NP; r1 = s // NP; uo = r1 % NO; r2 = r1 // NO; pj = r2 % N; bj = r2 // N
        pp = probs_fn(pj, plo); best = q_orb(bj, pj, uo, plo, V)
        for ba in boss_affordable(bj):
            ba_act = BASE_ACTIONS[ba]
            nbj = clamp(bj + 3 if ba == 'ji' else bj - ba_act['cost'], 0, MAX_JI)
            q = 0
            for pa, prob in pp.items():
                pa_act = MAGE_RELEASE_ACT if pa == 'mage_release' else BASE_ACTIONS[pa]
                pdmg, edmg = raw_damage(pa_act, ba_act)
                npj, nplo = trans_fn(pa, pj, plo)
                q += prob * ((pdmg - edmg) + GAMMA * V[sidx(nbj, npj, uo, nplo)])
            if q > best: best = q
        return best
    return value_iteration(NS, bellman)

# ── Save ───────────────────────────────────────────────────────────────────────

def save_js(fname, V):
    out = os.path.join(os.path.dirname(__file__), fname)
    # Round to 6 decimal places to reduce file size
    nums = ','.join(f'{v:.6g}' for v in V)
    with open(out, 'w') as f:
        f.write(f'// Auto-generated by generate.py — do not edit manually\n')
        f.write(f'export default [{nums}];\n')
    size = os.path.getsize(out)
    print(f'  saved {fname} ({len(V)} values, {size//1024}KB)')

TASKS = [
    ('jiaxu_standard', lambda: compute_jiaxu(3, std_probs,  std_transition,  1)),
    ('jiaxu_mage',     lambda: compute_jiaxu(3, mage_probs, mage_transition, MAX_LO+1)),
    ('gufu_standard',  lambda: compute_gufu(     std_probs,  std_transition,  1)),
    ('gufu_mage',      lambda: compute_gufu(     mage_probs, mage_transition, MAX_LO+1)),
    ('faultrobot_standard', lambda: compute_faultrobot(std_probs,  std_transition,  1)),
    ('faultrobot_mage',     lambda: compute_faultrobot(mage_probs, mage_transition, MAX_LO+1)),
]

if __name__ == '__main__':
    total_start = time.time()
    for name, fn in TASKS:
        print(f'Computing {name}...')
        t = time.time()
        V = fn()
        print(f'  done in {time.time()-t:.1f}s')
        save_js(f'{name}.js', V)
    print(f'\nAll done in {time.time()-total_start:.1f}s')
