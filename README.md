## Initial setup

Install oxlint:

`npm add -D oxlint`

Install biome:

`npm i -D --save-exact @biomejs/biome`

## Development workflow

I usually keep 4 terminals open:

* npm run dev # listens on 7888 usually
* npx tsc -w --noEmit # shows TS errors
* <editor>
* <git, etc.>


I also lint every now and then:
* `npm run lint`
* `npm run format`

## Tests

* npm run test

## Server stuff (in progress)

I did:

```
npm install vite-node --save-dev
```

Then do:

```
npm run server
```

## GH Pages

We deploy this with GH Pages. More details to come.
