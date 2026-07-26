---
name: git-common
description: Use this skill whenever the user asks to check, save, undo, or share changes in a git repository — including status checks, committing, branching, viewing history, stashing, or fixing mistakes. Trigger on phrases like "commit this", "what changed", "undo my last commit", "make a new branch", "push my changes", "git", or any request involving version control, even if the user doesn't name the exact git command.
---

Exact commands for common git operations. This skill exists so you don't have to
guess flags from memory — copy the commands below verbatim and fill in the
placeholders (shown in `<angle-brackets>`).

## Hard rules

- Always run `git status` first, before anything else in this skill, so you know the current state (staged files, branch, conflicts, etc.) before acting.
- Never run dangerous operations without the user explicitly asking to do so.
- Never force-push unless the user says the word "force" themselves. Prefer `--force-with-lease` over `--force` when force-pushing is confirmed, since it fails safely if someone else pushed in the meantime.
- When `git status` shows merge conflicts, stop and go to "Resolving conflicts" — don't try to commit, stash, or switch branches through a conflict.

## Common Operations

### Inspecting Things

Check what's going on:

```
git status
```

See what files were changed:

```
git diff          # unstaged changes
git diff --staged # staged changes
```

Check recent history:

```
git log --oneline -10
```

### Committing Changes

Stage everything currently changed:

```
git add -A
```

Stage specific files only:

```
git add <path1> <path2>
```

Committing changes:

```
git commit -m "<type>(<scope>): <summary>"
```

### Branching

Create and switch to a new branch:

```
git checkout -b <branch-name>
```

Switch to an existing branch:

```
git checkout <branch-name>
```

### Stashing Changes

Temporarily stash unfinished changes:

```
git stash
```

Restore stashed changes later:

```
git stash pop
```

### Undoing Changes

Unstage a file (keeping the edits):

```
git restore --staged <path>
```

Discard uncommitted changes to a file:

```
git restore <path>
```

Undo the last commit but keep the changes staged:

```
git reset --soft HEAD~1
```

Undo the last commit and unstage the changes (keeping them in the working directory):

```
git reset HEAD~1
```

Amend the last commit (e.g. fix the message or add a forgotten file):

```
git add <forgotten-file>          # optional
git commit --amend -m "<new message>"
```

Note: only amend commits that haven't been pushed yet, unless the user confirms they want to rewrite pushed history.

## Remote Operations

### Pushing Changes

Push the current branch (first time):

```
git push -u origin <branch-name>
```

Push (after that):

```
git push
```

### Pulling Changes

Pull latest changes:

```
git pull
```

## Dangerous Operations

Discard ALL uncommitted changes, everywhere:

```
git reset --hard HEAD
```

Permanently delete the last commit and its changes:

```
git reset --hard HEAD~1
```

Force-push (only after the user says "force"):

```
git push --force-with-lease
```

Delete a branch:

```
git branch -d <branch-name> # safe: refuses if unmerged
git branch -D <branch-name> # unsafe: deletes even if unmerged, confirm first
```

## Commit Messages

Use Semantic Commits (`<type>(<scope>): <description>`), checking recent `git log` first to match existing project conventions:

- **feat**: A new user-facing feature
- **fix**: A bug fix
- **docs**: Documentation updates
- **style**: Code style, formatting, missing semicolons (no logic change)
- **refactor**: Restructuring code without altering behavior or adding features
- **perf**: Changes that improve performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Maintenance tasks, dependencies, build or tooling updates

## Resolving Conflicts

- Run `git status` to list which files have conflicts.
- Open each conflicted file and look for `<<<<<<<`, `=======`, `>>>>>>>` markers.
- Ask the user which side to keep, or how to merge the two, for each conflict — don't guess at intent for anything beyond a trivial/obvious case.
- After editing, stage the resolved files: `git add <resolved-file>`
- Once all conflicts are staged, finish with: `git commit --no-edit`

## Quick Diagnosis

| Symptom                          | Likely cause                               | Check                                                |
| -------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| "not a git repository"           | Not inside a repo, or repo not initialized | `git status`; if needed `git init`                   |
| "nothing to commit"              | No changes, or changes not staged          | `git status`, `git diff`                             |
| push rejected                    | Remote has commits you don't have locally  | `git pull` first, then retry push                    |
| "detached HEAD"                  | Checked out a commit instead of a branch   | `git checkout <branch-name>` to get back on a branch |
| merge conflict markers in a file | Two branches touched the same lines        | See "Resolving conflicts" above                      |
