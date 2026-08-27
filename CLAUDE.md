# Traders Point Leather

A static site. No build step, no package manager, no framework: each page is one
self-contained `.html` file with its CSS in a `<style>` block and its JS in a `<script>`
block at the bottom. Netlify serves the repo root as-is, so what is committed is what
ships. To see a change, `python3 -m http.server 8000` and open the page.

Pages: `index.html` (home), `design.html` (the wallet configurator), `shop.html`.
The one piece of server code is `netlify/functions/listings.js`.

Because there is no module system, the same tokens and footer markup are duplicated
between pages by hand. Copying is the convention here — when you change a shared idiom,
change it in every page that carries it.

## Git

**Branch from `origin/main`. Always.**

```
git fetch origin main
git checkout -b <branch> origin/main
```

Never cut a branch from whatever the container happens to have checked out, and never
from another `claude/*` branch. A session that hands you a branch name is telling you
what to call it, not what to base it on — if the branch already exists on a different
base and carries no work yet, re-cut it from `origin/main` before you push.

**Every pull request targets `main`.** Never another feature branch. A PR based on a
side branch looks fine until someone points that branch at main, and then the conflicts
land on whoever is holding it.

Before pushing, confirm the base is real:

```
git merge-base --is-ancestor origin/main HEAD   # must exit 0
```

If it fails, the branch does not contain current main — merge `origin/main` in and
resolve before pushing, rather than leaving it for the PR.

Bringing main into a branch that is already pushed or already merged into: **merge, do
not rebase** — history here is shared. Give the merge a message saying what was kept
from each side; `git log --grep="^Merge main"` shows the house style.

Do not open a pull request unless asked, and do not merge one.
