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

// 检查是否正在进行合并
function isMerging() {
  // 使用当前工作目录来检查，这样可以适配 worktree 模式
  const result = execGit('git rev-parse --git-dir', { silent: true });
  if (!result.success) {
    return false;
  }
  const gitDir = path.resolve(result.output.trim());
  const mergeHeadPath = path.join(gitDir, 'MERGE_HEAD');
  return fs.existsSync(mergeHeadPath);
}

// 检查是否有未解决的冲突
function hasUnresolvedConflicts() {
  const statusResult = execGit('git status --porcelain', { silent: true });
  if (!statusResult.success) {
    return true; // 如果无法获取状态，假设有冲突
  }

  const output = statusResult.output.trim();
  if (!output) {
    return false; // 没有输出，说明没有冲突
  }

  // 检查是否有冲突标记（UU, AA, DD 等）
  // UU = 双方都修改且未合并
  // AA = 双方都添加且未合并
  // DD = 双方都删除且未合并
  // AU, UA, DU, UD 等也是冲突状态
  const conflictPattern = /^(UU|AA|DD|AU|UA|DU|UD)/m;
  return conflictPattern.test(output);
}

// 检查冲突是否已解决（已暂存）
function isConflictResolved() {
  // 如果还在合并中，检查是否有冲突标记
  if (!isMerging()) {
    return true; // 不在合并中，说明合并已完成或已中止
  }

  // 检查是否还有未解决的冲突
  if (hasUnresolvedConflicts()) {
    return false; // 还有冲突标记，说明未解决
  }

  // 检查是否有已暂存的更改（用户执行了 git add .）
  const statusResult = execGit('git diff --cached --name-only', { silent: true });
  if (statusResult.success && statusResult.output.trim()) {
    // 有已暂存的更改，说明用户已经解决了冲突并暂存
    return true;
  }

  // 检查工作区状态
  const statusResult2 = execGit('git status --porcelain', { silent: true });
  if (!statusResult2.success) {
    return false;
  }

  const output = statusResult2.output.trim();
  if (!output) {
    // 工作区完全干净，可能用户已经提交了
    return !isMerging(); // 如果不在合并中，说明已解决
  }

  // 检查是否所有更改都已暂存（没有未暂存的冲突文件）
  const lines = output.split('\n').filter(line => line.trim());
  // 如果所有行都是已暂存状态（第一个字符不是空格），说明冲突已解决
  return lines.every(line => {
    const status = line.substring(0, 2);
    // 已暂存状态：第一个字符是 M, A, D, R, C 等，不是空格
    // 未跟踪文件（??）不影响合并
    return status[0] !== ' ' || status === '??';
  });
}

// 等待用户解决冲突
async function waitForConflictResolution() {
  console.log(chalk.yellow('\n检测到合并冲突，等待解决冲突...'));
  console.log(chalk.blue('请解决冲突后，执行以下命令:'));
  console.log(chalk.blue('  git add .'));
  console.log(chalk.blue('然后程序将自动继续执行后续步骤'));
  console.log(chalk.gray('(程序正在等待，每2秒检查一次冲突状态...)\n'));

  // 轮询检查冲突是否已解决
  const checkInterval = 2000; // 每2秒检查一次
  const maxWaitTime = 3600000; // 最多等待1小时
  const startTime = Date.now();
  let checkCount = 0;

  return new Promise((resolve, reject) => {
    const checkIntervalId = setInterval(() => {
      checkCount++;

      // 检查是否还在合并中
      if (!isMerging()) {
        clearInterval(checkIntervalId);
        // 合并可能被中止了或已完成
        const statusResult = execGit('git status --porcelain', { silent: true });
        if (statusResult.success && !statusResult.output.trim()) {
          // 工作区干净，可能用户中止了合并
          reject(new Error('合并已中止'));
        } else {
          // 可能用户手动完成了合并
          resolve();
        }
        return;
      }

      // 检查冲突是否已解决
      if (isConflictResolved()) {
        clearInterval(checkIntervalId);
        console.log(chalk.green('\n✓ 检测到冲突已解决，继续执行后续步骤...\n'));
        resolve();
        return;
      }

      // 每10次检查（20秒）显示一次等待提示
      if (checkCount % 10 === 0) {
        const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
        process.stdout.write(chalk.gray(`\r等待中... (已等待 ${elapsedMinutes} 分钟)`));
      }

      // 检查是否超时
      if (Date.now() - startTime > maxWaitTime) {
        clearInterval(checkIntervalId);
        reject(new Error('等待冲突解决超时（已等待1小时）'));
        return;
      }
    }, checkInterval);
  });
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

    // 拉取最新代码
    console.log(chalk.yellow(`拉取目标分支最新代码`));
    const pullResult = execGit(`git pull`);
    if (!pullResult.success) {
      throw new Error('拉取最新代码失败');
    }

    // 合并当前分支
    console.log(chalk.yellow(`合并分支 ${currentBranch} 到 ${targetBranch}`));
    const mergeResult = execGit(`git merge ${currentBranch} --no-edit`);
    if (!mergeResult.success) {
      console.log(chalk.blue(`\nWorktree 位置: ${worktreePath}`));

      // 等待用户解决冲突
      try {
        await waitForConflictResolution();
      } catch (error) {
        console.error(chalk.red(`\n错误: ${error.message}`));
        console.log(chalk.blue(`\n请手动解决冲突后，执行以下命令:`));
        console.log(chalk.blue(`  cd "${worktreePath}"`));
        console.log(chalk.blue(`  git add .`));
        console.log(chalk.blue(`  git commit`));
        console.log(chalk.blue(`  git push`));
        console.log(chalk.blue(`  cd "${gitRoot}"`));
        console.log(chalk.blue(`  git worktree remove "${worktreePath}" --force`));
        process.exit(1);
      }

      // 冲突已解决，检查是否需要提交
      if (isMerging()) {
        // 如果还在合并中，说明需要提交
        console.log(chalk.yellow(`提交合并`));
        const commitResult = execGit(`git commit --no-edit`);
        if (!commitResult.success) {
          throw new Error('提交合并失败');
        }
      } else {
        // 如果不在合并中，说明用户可能已经手动提交了
        console.log(chalk.green(`✓ 合并已提交`));
      }
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

    // 拉取最新代码
    console.log(chalk.yellow(`拉取目标分支最新代码`));
    const pullResult = execGit(`git pull`);
    if (!pullResult.success) {
      throw new Error('拉取最新代码失败');
    }

    // 合并当前分支
    console.log(chalk.yellow(`合并分支 ${currentBranch} 到 ${targetBranch}`));
    const mergeResult = execGit(`git merge ${currentBranch} --no-edit`);
    if (!mergeResult.success) {
      // 等待用户解决冲突
      try {
        await waitForConflictResolution();
      } catch (error) {
        console.error(chalk.red(`\n错误: ${error.message}`));
        console.log(chalk.blue(`\n请手动解决冲突后，执行以下命令继续:`));
        console.log(chalk.blue(`  git add .`));
        console.log(chalk.blue(`  git commit`));
        console.log(chalk.blue(`  git push`));
        console.log(chalk.blue(`  git checkout ${currentBranch}`));
        // 尝试切换回原分支
        execGit(`git checkout ${currentBranch}`, { silent: true });
        process.exit(1);
      }

      // 冲突已解决，检查是否需要提交
      if (isMerging()) {
        // 如果还在合并中，说明需要提交
        console.log(chalk.yellow(`提交合并`));
        const commitResult = execGit(`git commit --no-edit`);
        if (!commitResult.success) {
          throw new Error('提交合并失败');
        }
      } else {
        // 如果不在合并中，说明用户可能已经手动提交了
        console.log(chalk.green(`✓ 合并已提交`));
      }
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
