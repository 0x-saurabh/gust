# Oak Agent Kit recipes

`kyte-oak-recipes/` is the npm package of `oak-recipe/v1` recipes that lets an Oak agent use Kyte.
`build-recipes.mjs` regenerates the recipe files from `src/lib/generated/deployments.json` and `indexer/abis/`;
run it after a markets deployment and bump the package version.

```bash
node scripts/oak/build-recipes.mjs
cd scripts/oak/kyte-oak-recipes && npm pack          # inspect the archive
npx -p @oakagentkit/addon oak recipes add .           # validate with Oak's own importer
npx -p @oakagentkit/addon oak recipes remove kyte
npm publish                                           # needs npm login
```

Recipe spec: https://github.com/OakAgentKit/oak/blob/main/CONTRIBUTING.md (section 2). Schema file ships in
`@oakagentkit/addon` at `build/dist/schema/recipe.schema.json`.
