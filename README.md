# git-merge-to

[中文](./README.zh-CN.md) | English

A simple and powerful CLI tool to merge your current git branch into a target branch with two strategies: worktree and checkout.

## Features

- 🚀 **Two merge strategies**: worktree (default) and checkout
- 📋 **Interactive branch selection**: Choose target branch from a sorted list
- 🔄 **Automatic branch sorting**: Branches sorted by latest commit time
- 📦 **Smart node_modules handling**: Automatically creates symlink for node_modules in worktree mode
- 🎨 **Beautiful console output**: Colorful output with chalk
- ✅ **Safe operations**: Automatic cleanup and error handling

## Installation

```bash
npm install -g git-merge-to
```

Or use with npx (no installation required):

```bash
npx git-merge-to
```

## Usage

### Basic Usage

```bash
npx git-merge-to
```

The tool will:
1. Show your current branch
2. Display a list of available branches (sorted by latest commit time)
3. Let you select the target branch
4. Merge your current branch into the target branch

### Merge Strategies

#### Worktree Mode (Default)

Uses git worktree to create a separate directory for the target branch, keeping your current workspace unchanged.

```bash
npx git-merge-to -s worktree
# or simply
npx git-merge-to
```

**How it works:**
- Creates a worktree directory at the same level as your git root
- Switches to the target branch in the worktree
- Merges your current branch into the target branch
- Pushes the changes
- Automatically cleans up the worktree

**Benefits:**
- Your current workspace remains untouched
- No need to stash changes
- Safe and isolated merge process

#### Checkout Mode

Directly checks out the target branch and merges.

```bash
npx git-merge-to -s checkout
```

**How it works:**
- Checks out the target branch
- Merges your current branch
- Pushes the changes
- Switches back to your original branch

## Options

- `-s, --strategy <method>`: Merge strategy (`worktree` or `checkout`). Default: `worktree`
- `-v, --version`: Show version number
- `-h, --help`: Show help information

## Examples

```bash
# Use default worktree strategy
npx git-merge-to

# Use checkout strategy
npx git-merge-to -s checkout

# Show version
npx git-merge-to -v
```

## Requirements

- Node.js >= 12.0.0
- Git installed and configured

## How It Works

### Worktree Mode

1. Gets the current branch name
2. Lists all branches sorted by commit time
3. Prompts you to select a target branch
4. Creates a worktree directory (e.g., `project-main-worktree`)
5. If `node_modules` exists, creates a symlink in the worktree
6. Merges current branch into target branch
7. Pushes changes to remote
8. Cleans up the worktree

### Checkout Mode

1. Gets the current branch name
2. Lists all branches sorted by commit time
3. Prompts you to select a target branch
4. Checks out the target branch
5. Merges current branch
6. Pushes changes to remote
7. Switches back to original branch

## Branch Name Handling

- Special characters in branch names (like `/`, `\`, `:`, etc.) are automatically sanitized for worktree directory names
- Branch names with slashes (e.g., `feature/user-login`) are properly handled

## Error Handling

- If merge conflicts occur, the tool provides clear instructions on how to resolve them
- In worktree mode, the worktree directory is preserved if conflicts occur, allowing you to resolve them manually
- Automatic cleanup ensures no leftover worktree directories

## License

MIT

## Author

Eric Yang

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
