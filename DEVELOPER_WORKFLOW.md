# Developer workflow

Three developers share this project: two build features, and one reviews and merges. Everyone has already cloned the repository.

## Developers 1 and 2: make a change

1. Agree with the team on a small task and who owns it. Coordinate first if both tasks touch the same files.
2. Start from the latest `main` and create your own branch:

   ```sh
   git switch main
   git pull --ff-only
   git switch -c feat/short-task-name
   ```

3. Make the change and check it. For code changes, run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`. For docs-only changes, review the text and links.
4. Commit and push your branch, then open a pull request into `main` and request Developer 3's review:

   ```sh
   git add <changed-files>
   git commit -m "Describe the change"
   git push -u origin feat/short-task-name
   ```

   In the pull request, say what changed and how you checked it. Add screenshots for visible UI changes. Fix review comments with new commits; do not rewrite commits already pushed.

## Developer 3: review and merge

Check that the change solves the task, follows project rules, and includes suitable check results. Ask for fixes before approving if needed. Do not approve your own change; one of the other developers must review it.

After approval, merge using **Create a merge commit**. Do not rewrite published history. Merge one pull request at a time and check the app after merging.

## Project rules to remember

- Keep FieldShift scores, scenarios, and loss estimates as typed demo logic in `src/lib/fieldshift-demo.ts`. Never describe them as live forecasts or verified agronomy.
- Do not edit generated files by hand. Keep secrets out of code and commits.
