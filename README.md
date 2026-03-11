# Welcome to Angry Cat!

![Angry Cat](public/images/angry_cat.png)

Angry Cat is an effective client for conversing with
your peers using Zulip. (It is all client-side TypeScript
code talking directly to a server.)

We are hosted now (*as of March 2026*) on
[Github Pages](https://showell.github.io/angry-cat)
and our primary Zulip server is
[macandcheese](https://macandcheese.zulipchat.com/).

## Initial setup

Install vite:

`npm install vite --save-dev`

Install oxlint:

`npm add -D oxlint`

Install biome:

`npm i -D --save-exact @biomejs/biome`

## Development workflow

I usually keep 4 terminals open:

* `npm run dev` # listens on 7888 usually
* `npx tsc -w --noEmit` # shows TS errors
* run my editor
* use git commands (and other command-line stuff)


I also lint every now and then:
* `npm run lint`
* `npm run format`

## Tests

* npm run test

## Node stuff (in progress)

We don't heavily use node yet, but it's occasionally
useful for ad-hoc testing (automated or manual).

Install vite-node:

```
npm install vite-node --save-dev
```

Then do:

```
npm run test
npm run fetch
```

## GH Pages

We deploy this with GH Pages. More details to come.
