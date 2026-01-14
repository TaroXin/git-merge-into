# git-merge-to

[中文](./README.zh-CN.md) | English

A CLI tool to merge your current git branch into a target branch.

## Features

- 🚀 Two merge strategies: worktree (default) and checkout
- 📋 Interactive branch selection with sorted list
- 📦 Auto node_modules symlink in worktree mode
- 🎨 Colorful console output

## Installation

```bash
npm install -g git-merge-to
```

Or use with npx:

```bash
npx git-merge-to
```

## Usage

```bash
# Default worktree mode
npx git-merge-to

# Use checkout mode
npx git-merge-to -s checkout
```

### Merge Strategies

**Worktree (default)**: Creates a separate worktree directory, keeps your workspace unchanged.

**Checkout**: Directly checks out the target branch and merges.

## Options

- `-s, --strategy <method>`: Merge strategy (`worktree` or `checkout`). Default: `worktree`
- `-v, --version`: Show version
- `-h, --help`: Show help

## Requirements

- Node.js >= 12.0.0
- Git

## License

MIT
