# Checking that the website runs the public code

A web app downloads its code every time you open it. "The code is open"
only means something if you can check that the site is serving *that* code.
Here's how.

Each time `main` changes, GitHub builds the site from this repository
(`.github/workflows/web-deploy.yml`). The build writes a receipt,
`build.json`, listing every file the site serves with its SHA-256 hash and
the commit it came from. GitHub then signs the receipt, so it can only have
come from this repository's own build.

## 1. The site serves exactly what its receipt lists

```sh
npm run web:verify -- https://<the site>
```

This downloads the receipt and every file in it from the live site and
compares the hashes. If even one byte differs, it tells you which file.

## 2. The receipt came from this repository's build

```sh
curl -sO https://<the site>/build.json
gh attestation verify build.json --repo <owner>/<repo>
```

`gh` checks GitHub's signature on the receipt and shows the commit and
workflow run that built it.

## What this proves, and what it doesn't

Together, the two checks show that at the moment you ran them, the site was
serving files built by this repository's public workflow from a public
commit. Nobody, the maintainer included, can change what the site serves
without it showing up in this check.

It's a check, not a lock. A host could in theory serve different files to
one person than to everyone else, and the check only covers what *you*
downloaded. If that worries you, the desktop app avoids the problem: you
install a fixed version once.

Ajustes → Esta versión shows the commit and fingerprint your browser is
running, so you can match them against the public build.
