# git-merge-to

[English](./README.md) | 中文

一个简单而强大的 CLI 工具，用于将当前 git 分支合并到目标分支，支持两种策略：worktree 和 checkout。

## 功能特性

- 🚀 **两种合并策略**：worktree（默认）和 checkout
- 📋 **交互式分支选择**：从排序列表中选择目标分支
- 🔄 **自动分支排序**：按最新提交时间排序分支
- 📦 **智能 node_modules 处理**：在 worktree 模式下自动创建 node_modules 软链接
- 🎨 **美观的控制台输出**：使用 chalk 进行彩色输出
- ✅ **安全操作**：自动清理和错误处理

## 安装

```bash
npm install -g git-merge-to
```

或使用 npx（无需安装）：

```bash
npx git-merge-to
```

## 使用方法

### 基本使用

```bash
npx git-merge-to
```

工具将：
1. 显示当前分支
2. 显示可用分支列表（按最新提交时间排序）
3. 让你选择目标分支
4. 将当前分支合并到目标分支

### 合并策略

#### Worktree 模式（默认）

使用 git worktree 为目标分支创建单独的目录，保持当前工作区不变。

```bash
npx git-merge-to -s worktree
# 或直接
npx git-merge-to
```

**工作原理：**
- 在 git 根目录同级创建 worktree 目录
- 在 worktree 中切换到目标分支
- 将当前分支合并到目标分支
- 推送更改
- 自动清理 worktree

**优势：**
- 当前工作区保持不变
- 无需暂存更改
- 安全且隔离的合并过程

#### Checkout 模式

直接检出目标分支并合并。

```bash
npx git-merge-to -s checkout
```

**工作原理：**
- 检出目标分支
- 合并当前分支
- 推送更改
- 切换回原始分支

## 选项

- `-s, --strategy <method>`: 合并策略（`worktree` 或 `checkout`）。默认：`worktree`
- `-v, --version`: 显示版本号
- `-h, --help`: 显示帮助信息

## 示例

```bash
# 使用默认的 worktree 策略
npx git-merge-to

# 使用 checkout 策略
npx git-merge-to -s checkout

# 显示版本
npx git-merge-to -v
```

## 要求

- Node.js >= 12.0.0
- 已安装并配置 Git

## 工作原理

### Worktree 模式

1. 获取当前分支名称
2. 列出所有分支（按提交时间排序）
3. 提示选择目标分支
4. 创建 worktree 目录（例如：`project-main-worktree`）
5. 如果存在 `node_modules`，在 worktree 中创建软链接
6. 将当前分支合并到目标分支
7. 推送到远程仓库
8. 清理 worktree

### Checkout 模式

1. 获取当前分支名称
2. 列出所有分支（按提交时间排序）
3. 提示选择目标分支
4. 检出目标分支
5. 合并当前分支
6. 推送到远程仓库
7. 切换回原始分支

## 分支名处理

- 分支名中的特殊字符（如 `/`、`\`、`:` 等）在创建 worktree 目录名时会自动过滤
- 包含斜杠的分支名（如 `feature/user-login`）会被正确处理

## 错误处理

- 如果发生合并冲突，工具会提供清晰的解决说明
- 在 worktree 模式下，如果发生冲突，worktree 目录会被保留，允许你手动解决
- 自动清理确保不会留下多余的 worktree 目录

## 许可证

MIT

## 作者

Eric Yang

## 贡献

欢迎贡献！请随时提交 Pull Request。
