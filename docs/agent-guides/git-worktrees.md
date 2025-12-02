# Git Worktrees

Git worktrees allow parallel feature development without switching branches.

## Creating a Worktree

```bash
git worktree add ../my-feature -b feat/ENG-123-my-feature
```

**Conventions:**
- Directory name and branch name should match
- Branch names should reference Linear tickets when applicable
- Worktree directories are temporary

## Working with Worktrees

```bash
# Create worktree
git worktree add ../my-feature -b feat/ENG-123-my-feature

# Navigate to it
cd ../my-feature

# Work normally: make changes, commit, push, create PR

# List all worktrees
git worktree list

# Remove after PR merged (from main repo)
git worktree remove ../my-feature

# Remove remote branch
git branch -d feat/ENG-123-my-feature
git push origin --delete feat/ENG-123-my-feature

# Prune stale references
git worktree prune
```

## When to Use

**Use worktrees when:**
- Working on multiple features simultaneously
- Need to quickly test/review another branch without stashing
- Running long processes while working on something else
- Comparing implementations across branches

**Use regular branches when:**
- Working on a single feature
- Making quick hotfixes
- Overhead isn't worth it

## Reference

[git-worktree documentation](https://git-scm.com/docs/git-worktree)

