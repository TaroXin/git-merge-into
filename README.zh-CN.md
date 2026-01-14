# git-merge-to

[English](./README.md) | 中文

一个用于将当前 git 分支合并到目标分支的 CLI 工具。

## 功能特性

- 🚀 两种合并策略：worktree（默认）和 checkout
- 📋 交互式分支选择，支持排序列表
- 📦 Worktree 模式下自动创建 node_modules 软链接
- 🎨 彩色控制台输出

## 安装

```bash
npm install -g git-merge-to
```

或使用 npx：

```bash
npx git-merge-to
```

## 使用方法

```bash
# 默认 worktree 模式
npx git-merge-to

# 使用 checkout 模式
npx git-merge-to -s checkout
```

### 合并策略

**Worktree（默认）**：创建独立的 worktree 目录，保持当前工作区不变。

**Checkout**：直接检出目标分支并合并。

## 选项

- `-s, --strategy <method>`: 合并策略（`worktree` 或 `checkout`）。默认：`worktree`
- `-v, --version`: 显示版本
- `-h, --help`: 显示帮助

## 要求

- Node.js >= 12.0.0
- Git

## 许可证

MIT
