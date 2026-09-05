#!/usr/bin/env python3
"""One-time backfill for B2 (task 12): the 56 reviews already written for this
run predate the plan_sha256 field in the reviewer contract (prompts/REVIEWER.md).
For every review with verdict 'ok' and no plan_sha256, stamp the sha256 of the
plan file it reviewed — those exact plans are what got reviewed, so this is not
a re-review, only recording what already happened. From now on the reviewer
writes plan_sha256 itself; this script is safe to rerun (it skips reviews that
already have the field) but should not be needed again."""
import glob, hashlib, json, os

HERE = os.path.dirname(os.path.abspath(__file__)); WORK = os.path.join(HERE, 'work')

def main():
    n = 0
    for p in glob.glob(os.path.join(WORK, 'reviews', '*.json')):
        review = json.load(open(p, encoding='utf-8'))
        if review.get('verdict') != 'ok' or review.get('plan_sha256'): continue
        key = review.get('driver_key')
        plan_path = os.path.join(WORK, 'plans', key + '.json') if key else None
        if not plan_path or not os.path.exists(plan_path): continue
        review['plan_sha256'] = hashlib.sha256(open(plan_path, 'rb').read()).hexdigest()
        json.dump(review, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        n += 1
    print('stamped %d review(s)' % n)

if __name__ == '__main__':
    main()
