// Filters the genuinely-broken entries out of the raw HAR recording,
// producing a copy Playwright can replay cleanly.
//
// WHY this exists (Task 5, job 2): a handful of requests in tms.har were
// captured with NO body even though nothing else about them looks like the
// normal "no content" case (a real 204). routeFromHAR matches a request to
// the FIRST not-yet-consumed entry with the same URL, in recorded order.
// Several of these URLs were requested again LATER in the same recording
// session and got a real, full response that time — but because the broken
// attempt sits earlier in the file, replay always hands the app that broken
// one first, and the good response later in the file is never reached.
// Dropping the broken entries lets replay fall through to the next (real,
// successful) recorded response for the same URL instead.
//
// "Genuinely broken" here is two distinct shapes, both meaning "no body was
// captured for a request that should have had one":
//   1. status:-1 (aborted mid-flight) — 4 of these: LOCATIONS page 2,
//      CLIENTS page 2, and CLIENTS page 4 twice (in flight when the owner
//      closed the browser).
//   2. status:200 claiming success but content.size:-1 with a JSON
//      mime-type — 1 of these, found empirically while making this fix:
//      PARTNERS page 2 (tblLHl5m8bqONfhWv?...offset=100). This one was NOT
//      caught by the "4 aborted" count alone: it still reports 200 and
//      looked fine on paper, but replaying it hands the app an empty body,
//      `res.json()` throws "Unexpected end of JSON input", and every screen
//      that awaits preloadReferenceData() (dashboard, daily_ops,
//      weekly_intl, weekly_natl) crashes to its error boundary. Filtering
//      only the 4 status:-1 entries left this one in place and none of the
//      four units rendered — see task-5-report.md for the trace.
// A handful of font (woff2) requests also have content.size:-1 — those are
// left alone. They aren't JSON, aren't awaited by any table-rendering code,
// and don't block a screen from rendering; broadening the filter to any
// content.size:-1 regardless of mime-type would drop entries this fix has
// no evidence are actually a problem.
//
// Never edits any response body — only removes whole entries that never
// completed. Output goes under .har/ (gitignored, like the source); tms.har
// itself is never modified.

const fs = require('fs');
const path = require('path');

const SRC = path.resolve('.har/tms.har');
const OUT = path.resolve('.har/tms-repaired.har');

function isBroken(e) {
  const r = e.response;
  if (r.status === -1) return true;
  const size = r.content && r.content.size;
  const mime = (r.content && r.content.mimeType) || '';
  return r.status === 200 && size === -1 && /json/i.test(mime);
}

function repair() {
  if (fs.existsSync(OUT) && fs.statSync(OUT).mtimeMs >= fs.statSync(SRC).mtimeMs) {
    return OUT; // already up to date with the current tms.har
  }
  const har = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const before = har.log.entries.length;
  har.log.entries = har.log.entries.filter(e => !isBroken(e));
  const removed = before - har.log.entries.length;
  // Report the count, do NOT assert it.
  //
  // This used to be `if (removed !== 5) throw`, pinned to the one recording
  // it was written against. That guard fired at MODULE LOAD of auth.js, which
  // both spec files require at the top — so a re-recording with 4 or 6 broken
  // entries did not fail one test, it made contract.spec.js and
  // semantics.spec.js fail to LOAD, i.e. the whole live suite silently
  // vanished. The recording has to be redone whenever the app's requests
  // change, which the redesign guarantees, so that was a guaranteed
  // self-inflicted outage of the critics.
  //
  // What is actually load-bearing is the SHAPE of a broken entry (isBroken
  // above), not how many of them a given recording happens to contain. So the
  // count is printed instead: a human re-recording sees the number move and
  // can judge it, and the suite keeps running either way.
  console.log(`repair-har: αφαιρέθηκαν ${removed} χαλασμένες εγγραφές από ${before} (${path.basename(SRC)})`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(har));
  return OUT;
}

module.exports = { repair, OUT };
