#!/usr/bin/env node

const { execSync, exec } = require('child_process');
const inquirer = require('inquirer');
const chalk = require('chalk');
const { program } = require('commander');
const path = require('path');
const fs = require('fs');

// 读取 package.json 获取版本信息
const packageJson = require('./package.json');

// 解析命令行参数
program
  .name('git-merge-to')
  .description(packageJson.description)
  .version(packageJson.version, '-v, --version', '显示版本号')
  .option('-s, --strategy <method>', '合并方式: worktree 或 checkout (默认: worktree)', 'worktree')
  .parse(process.argv);

const options = program.opts();
const strategy = options.strategy || 'worktree';

// 验证策略
if (strategy !== 'worktree' && strategy !== 'checkout') {
  console.error(chalk.red(`错误: 无效的合并方式 "${strategy}"，只支持 worktree 或 checkout`));
  process.exit(1);
}

// 执行 git 命令并返回结果
function execGit(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message, output: error.stdout || '' };
  }
}

// 获取当前分支
function getCurrentBranch() {
  const result = execGit('git rev-parse --abbrev-ref HEAD', { silent: true });
  if (!result.success) {
    console.error(chalk.red('错误: 无法获取当前分支，请确保在 git 仓库中'));
    process.exit(1);
  }
  return result.output.trim();
}

// 获取所有分支列表，按提交时间排序（最近提交的在前）
function getAllBranches() {
  // 使用 git for-each-ref 获取分支及其最后提交时间
  // 使用 refname 来区分本地和远程分支，refname:short 用于显示
  const result = execGit('git for-each-ref --sort=-committerdate --format="%(refname)|%(refname:short)|%(committerdate:unix)" refs/heads/ refs/remotes/', { silent: true });
  if (!result.success) {
    console.error(chalk.red('错误: 无法获取分支列表'));
    process.exit(1);
  }

  const branchMap = new Map();

  result.output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line)
    .forEach(line => {
      const parts = line.split('|');
      if (parts.length < 3) return;

      const [fullRef, shortRef, timestamp] = parts;
      if (!fullRef || !shortRef || !timestamp) return;

      // 处理分支名称
      let branchName = shortRef;

      // 如果是远程分支 (refs/remotes/origin/xxx)，需要去掉远程仓库名前缀
      if (fullRef.startsWith('refs/remotes/')) {
        // fullRef 格式: refs/remotes/origin/feature/xxx
        // 去掉 refs/remotes/ 前缀，得到 origin/feature/xxx
        const remoteBranch = fullRef.replace(/^refs\/remotes\//, '');
        // 提取远程仓库名（通常是 origin）
        const remoteName = remoteBranch.split('/')[0];
        // 如果 shortRef 以远程仓库名开头，去掉它
        if (shortRef.startsWith(remoteName + '/')) {
          branchName = shortRef.substring(remoteName.length + 1);
        }
      }
      // 本地分支 (refs/heads/feature/xxx) 的 shortRef 就是分支名，直接使用

      // 跳过 HEAD
      if (branchName.includes('HEAD')) return;

      // 如果分支已存在，保留时间戳更大的（更近的提交）
      if (!branchMap.has(branchName) || parseInt(timestamp) > branchMap.get(branchName).timestamp) {
        branchMap.set(branchName, {
          name: branchName,
          timestamp: parseInt(timestamp)
        });
      }
    });

  // 按时间戳降序排序（最近提交的在前）
  const branches = Array.from(branchMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(item => item.name);

  return branches;
}

// 获取 git 仓库根目录
function getGitRoot() {
  const result = execGit('git rev-parse --show-toplevel', { silent: true });
  if (!result.success) {
    console.error(chalk.red('错误: 无法获取 git 仓库根目录'));
    process.exit(1);
  }
  return result.output.trim();
}

// 过滤分支名中的特殊字符，用于文件系统路径
function sanitizeBranchName(branchName) {
  // 替换文件系统中不允许的字符：/ \ : * ? " < > |
  return branchName.replace(/[\/\\:*?"<>|]/g, '-');
}

// worktree 模式合并
async function mergeWithWorktree(currentBranch, targetBranch) {
  console.log(chalk.blue(`\n使用 worktree 模式合并 ${currentBranch} 到 ${targetBranch}\n`));

  const gitRoot = path.resolve(getGitRoot());
  // worktree 目录与根目录同级别
  const gitRootParent = path.dirname(gitRoot);
  const gitRootName = path.basename(gitRoot);
  // 过滤分支名中的特殊字符
  const sanitizedBranchName = sanitizeBranchName(targetBranch);
  const worktreePath = path.resolve(gitRootParent, `${gitRootName}-${sanitizedBranchName}-worktree`);

  try {
    // 创建 worktree
    console.log(chalk.yellow(`创建 worktree: ${worktreePath}`));
    const createResult = execGit(`git worktree add "${worktreePath}" ${targetBranch}`);
    if (!createResult.success) {
      throw new Error('创建 worktree 失败');
    }

    // 检查原目录是否存在 node_modules，如果存在则创建软链接
    const nodeModulesPath = path.join(gitRoot, 'node_modules');
    const worktreeNodeModulesPath = path.join(worktreePath, 'node_modules');

    if (fs.existsSync(nodeModulesPath)) {
      console.log(chalk.yellow(`检测到 node_modules，创建软链接...`));
      try {
        // 检查 worktree 目录中是否已存在 node_modules（可能是文件或目录）
        if (fs.existsSync(worktreeNodeModulesPath)) {
          // 如果是软链接，先删除
          const stats = fs.lstatSync(worktreeNodeModulesPath);
          if (stats.isSymbolicLink()) {
            fs.unlinkSync(worktreeNodeModulesPath);
          } else {
            console.warn(chalk.yellow(`警告: worktree 目录中已存在 node_modules，跳过创建软链接`));
          }
        }

        // 创建软链接指向原目录的 node_modules
        fs.symlinkSync(nodeModulesPath, worktreeNodeModulesPath, 'dir');
        console.log(chalk.green(`✓ 已创建 node_modules 软链接`));
      } catch (error) {
        console.warn(chalk.yellow(`警告: 创建 node_modules 软链接失败: ${error.message}`));
      }
    }

    // 切换到 worktree 目录并合并
    process.chdir(worktreePath);
    console.log(chalk.yellow(`切换到 worktree 目录: ${worktreePath}`));

    // 合并当前分支
    console.log(chalk.yellow(`合并分支 ${currentBranch} 到 ${targetBranch}`));
    const mergeResult = execGit(`git merge ${currentBranch} --no-edit`);
    if (!mergeResult.success) {
      console.error(chalk.red(`\n合并失败，请手动解决冲突后继续`));
      console.log(chalk.blue(`\nWorktree 位置: ${worktreePath}`));
      console.log(chalk.blue(`解决冲突后，请手动执行:`));
      console.log(chalk.blue(`  cd "${worktreePath}"`));
      console.log(chalk.blue(`  git push`));
      console.log(chalk.blue(`  cd "${gitRoot}"`));
      console.log(chalk.blue(`  git worktree remove "${worktreePath}" --force`));
      process.exit(1);
    }

    // 推送
    console.log(chalk.yellow(`推送到远程仓库`));
    const pushResult = execGit(`git push`);
    if (!pushResult.success) {
      throw new Error('推送失败');
    }

    console.log(chalk.green(`\n✓ 合并并推送成功！`));

  } catch (error) {
    console.error(chalk.red(`\n错误: ${error.message}`));
    process.exit(1);
  } finally {
    // 切换回原目录
    process.chdir(gitRoot);

    // 删除 worktree
    console.log(chalk.yellow(`\n清理 worktree...`));

    // 先删除 node_modules 软链接（如果存在）
    const worktreeNodeModulesPath = path.join(worktreePath, 'node_modules');
    if (fs.existsSync(worktreeNodeModulesPath)) {
      try {
        const stats = fs.lstatSync(worktreeNodeModulesPath);
        if (stats.isSymbolicLink()) {
          console.log(chalk.yellow(`删除 node_modules 软链接...`));
          fs.unlinkSync(worktreeNodeModulesPath);
          console.log(chalk.green(`✓ node_modules 软链接已删除`));
        }
      } catch (error) {
        console.warn(chalk.yellow(`警告: 删除 node_modules 软链接失败: ${error.message}`));
      }
    }

    // 强制删除 worktree
    const removeResult = execGit(`git worktree remove "${worktreePath}" --force`);
    if (!removeResult.success) {
      console.warn(chalk.yellow(`警告: 删除 worktree 失败，请手动删除: ${worktreePath}`));
    } else {
      console.log(chalk.green(`✓ Worktree 已清理`));
    }
  }
}

// checkout 模式合并
async function mergeWithCheckout(currentBranch, targetBranch) {
  console.log(chalk.blue(`\n使用 checkout 模式合并 ${currentBranch} 到 ${targetBranch}\n`));

  try {
    // 切换到目标分支
    console.log(chalk.yellow(`切换到目标分支: ${targetBranch}`));
    const checkoutResult = execGit(`git checkout ${targetBranch}`);
    if (!checkoutResult.success) {
      throw new Error(`切换到分支 ${targetBranch} 失败`);
    }

    // 合并当前分支
    console.log(chalk.yellow(`合并分支 ${currentBranch} 到 ${targetBranch}`));
    const mergeResult = execGit(`git merge ${currentBranch} --no-edit`);
    if (!mergeResult.success) {
      console.error(chalk.red(`\n合并失败，检测到冲突`));
      console.log(chalk.blue(`\n请解决冲突后，执行以下命令继续:`));
      console.log(chalk.blue(`  git add .`));
      console.log(chalk.blue(`  git commit`));
      console.log(chalk.blue(`  git push`));
      console.log(chalk.blue(`  git checkout ${currentBranch}`));
      process.exit(1);
    }

    // 推送
    console.log(chalk.yellow(`推送到远程仓库`));
    const pushResult = execGit(`git push`);
    if (!pushResult.success) {
      throw new Error('推送失败');
    }

    console.log(chalk.green(`\n✓ 合并并推送成功！`));

    // 切换回原分支
    console.log(chalk.yellow(`\n切换回原分支: ${currentBranch}`));
    const switchBackResult = execGit(`git checkout ${currentBranch}`);
    if (!switchBackResult.success) {
      console.warn(chalk.yellow(`警告: 切换回原分支失败，请手动执行: git checkout ${currentBranch}`));
    } else {
      console.log(chalk.green(`✓ 已切换回原分支`));
    }

  } catch (error) {
    console.error(chalk.red(`\n错误: ${error.message}`));
    // 尝试切换回原分支
    console.log(chalk.yellow(`尝试切换回原分支: ${currentBranch}`));
    execGit(`git checkout ${currentBranch}`, { silent: true });
    process.exit(1);
  }
}

// 主函数
async function main() {
  console.log(chalk.bold.cyan('\n=== Git Merge Into ===\n'));

  // 获取当前分支
  const currentBranch = getCurrentBranch();
  console.log(chalk.green(`当前分支: ${currentBranch}`));
  console.log(chalk.blue(`合并方式: ${strategy}\n`));

  // 获取所有分支
  const branches = getAllBranches();
  if (branches.length === 0) {
    console.error(chalk.red('错误: 没有找到其他分支'));
    process.exit(1);
  }

  // 过滤掉当前分支
  const availableBranches = branches.filter(branch => branch !== currentBranch);
  if (availableBranches.length === 0) {
    console.error(chalk.red('错误: 没有其他分支可以合并'));
    process.exit(1);
  }

  // 使用 inquirer 选择目标分支
  const { targetBranch } = await inquirer.prompt([
    {
      type: 'list',
      name: 'targetBranch',
      message: '请选择目标分支:',
      choices: availableBranches,
    }
  ]);

  if (!targetBranch) {
    console.log(chalk.yellow('已取消操作'));
    process.exit(0);
  }

  // 确认操作
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `确定要将 ${currentBranch} 合并到 ${targetBranch} 吗?`,
      default: true,
    }
  ]);

  if (!confirm) {
    console.log(chalk.yellow('已取消操作'));
    process.exit(0);
  }

  // 根据策略执行合并
  if (strategy === 'worktree') {
    await mergeWithWorktree(currentBranch, targetBranch);
  } else {
    await mergeWithCheckout(currentBranch, targetBranch);
  }
}

// 执行主函数
main().catch(error => {
  console.error(chalk.red(`\n未预期的错误: ${error.message}`));
  process.exit(1);
});
