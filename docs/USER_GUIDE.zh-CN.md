<!-- purpose: claude-quota-warmer 中文用户手册（面向非工程师也能跟着做） -->

# 用户手册（中文）

> English version: [USER_GUIDE.md](./USER_GUIDE.md)

这是 `claude-quota-warmer` 的中文使用手册。读完这份你就能：
1. 明白这个工具到底是干嘛的、解决什么问题；
2. 在自己电脑上装好；
3. 配置定时刷限额；
4. 看懂面板上的每一项；
5. 出问题时知道怎么自己排查。

---

## 目录

1. [这工具到底是什么](#1-这工具到底是什么)
2. [安装前的准备](#2-安装前的准备)
3. [安装](#3-安装)
4. [打开网页面板](#4-打开网页面板)
5. [界面区域逐块说明](#5-界面区域逐块说明)
6. [典型使用场景](#6-典型使用场景)
7. [高级配置怎么改](#7-高级配置怎么改)
8. [怎么确认它真的在发请求（防止 UI 假数据）](#8-怎么确认它真的在发请求防止-ui-假数据)
9. [常见问题排查](#9-常见问题排查)
10. [卸载](#10-卸载)
11. [FAQ](#11-faq)

---

## 1. 这工具到底是什么

### 它解决的问题

Claude Code 的计费方式：**滚动 5 小时窗口**。意思是从你第一次发请求开始计时，5 小时内的额度算一个窗口。窗口关闭时如果还有额度没用完——**它不能存到下个窗口，直接作废**。

举个具体例子：
- 你周一 10:00 发了第一个请求，这个 5h 窗口持续到 15:00
- 中间你只用了一点点
- 15:00 一到，剩余额度归零，新窗口开始
- 如果你中午 12:00–下午 18:00 都不碰 Claude Code，**10:00–15:00 那个窗口里没用的额度全部浪费**

更典型的情况是**晚上睡觉**：
- 你晚上 22:00 关电脑去睡觉
- 22:00–次日 03:00 那个 5h 窗口大部分时间在睡觉，浪费
- 03:00–08:00 那个窗口你完全没用，浪费
- 第二天 09:00 起床开始干活，发现今天工作时间窗口已经被切碎了，整体可用额度比理论值少很多

### 它的解决方案

让你在网页上加几个时间点（比如"明早 05:30"、"明早 10:30"），它会**在那些时刻自动发一次真实请求**给 `claude` 命令。窗口被"激活"了，就不会空着关掉。

它**不是**持续 ping 服务器、也**不是**伪造请求——它真的调用你电脑上的 `claude` 命令，跟你手动敲 `claude -p "你好"` 完全一样。

### 它和别的工具的区别

- **不是定时器/cron 脚本**：它带网页面板，你能在浏览器里直接加/删时间点、看历史。
- **不是浏览器插件**：是后台常驻进程，不依赖你打开浏览器。
- **不联网**：除了 `claude` 命令本身联 Anthropic 之外，本工具不上传任何东西。

---

## 2. 安装前的准备

### 2.1 操作系统

- macOS：完整支持（实测过）
- Linux：支持，但测试少（systemd user 服务）
- Windows：暂不支持，建议用 WSL

### 2.2 必须装好的东西

#### Python 3.10 或更高

打开终端（macOS 上 `Cmd+空格` 搜 "Terminal"），输入：

```bash
python3 --version
```

看到 `Python 3.10.x` 或更高就行。版本太老或没装的话：

- **macOS**：`brew install python@3.12`（先装 [Homebrew](https://brew.sh/)）
- **Linux**：`sudo apt install python3.12`

#### Node.js 18 或更高

```bash
node --version
```

看到 `v18.x.x` 或更高就行。没装的话：

- **macOS**：`brew install node`
- **Linux**：参考 [nodejs.org](https://nodejs.org/) 或 `sudo apt install nodejs npm`

> Node.js 只有装的时候用一次（用来 build 网页前端），装完之后就不需要它了。

#### Claude Code CLI

你要么用 `claude`（Anthropic 官方），要么用 `reclaude`（社区 wrapper）。先确认能跑：

```bash
# 任选一个
command -v claude
command -v reclaude

# 真实测试一次：
reclaude -p "你好"
```

如果显示模型回复，说明 CLI 装好且已登录。

如果提示 `command not found`，先去装 Claude Code CLI（不在本工具范围内）。

#### Git

克隆代码用：

```bash
git --version
```

没装的话 macOS 会弹窗让你装 Xcode Command Line Tools，跟着走完即可。

### 2.3 网络

`claude` 命令要能连到 Anthropic API。你能正常用 Claude Code 这一项就满足。

---

## 3. 安装

### 3.1 把代码下载到本地

打开终端，进入你想放代码的目录（比如家目录），然后：

```bash
cd ~
git clone https://github.com/xtianowner/claude-quota-warmer.git
cd claude-quota-warmer
```

这一步会创建一个 `~/claude-quota-warmer/` 目录，所有文件都在里面。

### 3.2 跑安装脚本

```bash
./scripts/install.sh
```

脚本会自动做这几件事：

1. 在项目目录里建一个 Python 虚拟环境 `.venv/`（不污染你系统的 Python）
2. 装后端的依赖（FastAPI、APScheduler 等）
3. 装前端依赖、build 网页界面
4. 注册后台服务：
   - **macOS**：写一个 LaunchAgent 文件到 `~/Library/LaunchAgents/`
   - **Linux**：写一个 systemd user 服务文件
5. 启动后台服务

整个过程通常 1–3 分钟，看到最后一行：

```
Done. UI: http://127.0.0.1:8765
```

就成了。

### 3.3 验证后台在跑

```bash
curl http://127.0.0.1:8765/api/health
```

返回 `{"ok":true}` 表示后台服务活着。

### 3.4 高级安装参数（可选，不需要可跳过）

如果默认端口 8765 被占了，或者你想给服务起别的名字：

```bash
HEALTHCHECK_PORT=8766 \
HEALTHCHECK_LABEL=com.yourname.claude-warmer \
./scripts/install.sh
```

环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `HEALTHCHECK_HOST` | `127.0.0.1` | 绑定地址。改成 `0.0.0.0` 才能局域网访问，**通常不建议** |
| `HEALTHCHECK_PORT` | `8765` | 端口 |
| `HEALTHCHECK_LABEL` | `com.user.claude-quota-warmer` | LaunchAgent / systemd 服务名 |
| `HEALTHCHECK_PYTHON` | 自动找 | 指定 Python 二进制，比如 `/opt/homebrew/bin/python3.12` |

---

## 4. 打开网页面板

浏览器访问：

> <http://127.0.0.1:8765>

你会看到一个紫粉渐变背景的页面。**初次进来面板是关闭状态**（右上角写"已停用"），这是安全默认值——不会乱发请求。

第一次推荐流程：

1. 点 **立即触发**（在状态卡右上角）做一次试跑。等 5–10 秒，下方"历史记录"里会出现一行 ✓ 成功。如果出现 ✗ 失败，去 [故障排查](#9-常见问题排查)。
2. 在 **触发时间点** 卡片里加一两个未来的时间，比如明早 05:30。
3. 点右上角的开关把状态切到"已启用"。

完了。后台每天到点会自动触发。

---

## 5. 界面区域逐块说明

整个页面从上到下分 5 块：

### 5.1 顶部标题区

```
Claude Code 限额刷新                            [ZH][EN] [○ 已启用]
在你设定的时刻发送真实请求，保持 5 小时配额窗口活跃
```

- **左上**：标题 + 副标题。
- **右上 [ZH][EN]**：中英文切换。选了之后浏览器会记住，下次自动用同一语言。
- **右上开关 [● 已启用 / ○ 已停用]**：**主开关**。这是关掉所有定时任务的总闸门。
  - 已启用（绿色）= 所有 pending 的触发点都会按时执行
  - 已停用（灰色）= 时间到了也不会触发；时间点保留着，重新启用就会重新激活

**重要**：调试的时候记得停用避免乱触发。

### 5.2 运行状态卡

```
运行状态                                  [空闲]  [▶ 立即触发]
─────────────────────────────────────────────────────────────
下次触发              上次结果              连续成功
2026-05-14 05:30      ✓ 成功 05-13 11:25         3
还有 17 小时 42 分钟
```

- **下次触发**：最近的一个待触发时间 + 倒计时（每秒刷新）。如果没加任何时间点，显示 `—`。
- **上次结果**：最近一次执行的结果，✓ 成功 或 ✗ 失败，加完成时间。
- **连续成功**：从最近一次失败/启动以来连续成功了几次。突然变回 0 就是某次失败了，去历史里看原因。
- **右上 [空闲] / [运行中]**：当前是否有一次健康检查正在跑。运行中会闪烁。
- **右上 [▶ 立即触发]**：手动跑一次。**不会消耗你的触发点列表**，纯粹是测试用。耗时 5–10 秒（取决于 Anthropic API 延迟）。

### 5.3 触发时间点卡（核心功能）

```
📅 触发时间点                                          [3]
─────────────────────────────────────────────────────────────
[待触发] 2026-05-14 05:30                                 🗑
        还有 17 小时 42 分钟

[待触发] 2026-05-14 10:30                                 🗑
        还有 22 小时 42 分钟

[已完成] 2026-05-13 05:30                                 🗑
─────────────────────────────────────────────────────────────
添加触发点

[ 2026-05-14, 05:30 AM     ]              [+ 添加]

本地时区时间。一次性触发，触发后状态变为已完成。
```

每一行就是**一个具体的时刻**。daemon 到点会触发一次，触发完就不再触发了。

**状态标签**：
- `待触发`（黄色）= 还没到时间
- `运行中`（蓝色闪烁）= 正在执行这次触发
- `已完成`（绿色）= 触发成功
- `失败`（红色）= 触发了但失败了（含所有重试）。点行展开看 note 字段了解原因。

**添加触发点**：
1. 在时间选择器里挑日期 + 时间。注意是**你本地电脑的时间**——上海用户填 `2026-05-14 05:30` 就是上海时间 05:30，不需要手动换算时区。
2. 点 **+ 添加**。
3. 新点出现在列表里，状态 `待触发`。

**删除触发点**：点右边的垃圾桶 🗑。已经触发过的（已完成 / 失败）也能删，纯粹是清理列表。

**右上角的数字 `[3]`**：当前列表里有多少个时间点（任何状态）。

> 💡 **小技巧**：一个 5 小时窗口要保证不断的话，**间隔 ≤ 4 小时 50 分钟** 比较稳妥。比如想覆盖全天：05:30 / 10:00 / 14:30 / 19:00 / 23:30 五个点足够。

### 5.4 高级配置卡（默认折叠）

```
高级配置                                       展开配置 ▼
```

点开会看到：

| 字段 | 默认值 | 改它会怎样 |
|---|---|---|
| **命令** | `reclaude` | daemon 调哪个二进制。改成 `claude` 就用 Anthropic 官方 CLI。**改完一定要点"保存配置"** |
| **单次超时 (秒)** | `120` | 每次调用最多等多久。网络慢可以加到 300 |
| **Prompt 内容** | `Claude Code healthcheck: 请只回复 HEALTHCHECK_OK` | 发给 Claude 的提示词。保持简短、引导模型回标记字符串 |
| **期望输出标记** | `HEALTHCHECK_OK` | Claude 回复里**必须包含**这个字符串才算成功 |
| **最多重试次数** | `3` | 失败后再试几次。设成 0 就只试 1 次不重试 |
| **重试退避 (秒，逗号分隔)** | `30,120,300` | 第 N 次重试前等多少秒。比如第 1 次失败等 30 秒、第 2 次失败等 120 秒 |

改完务必点 **保存配置**。

### 5.5 历史记录卡

```
历史记录                                          刷新
─────────────────────────────────────────────────────────────
✓ 成功  2026-05-13 11:25:42        手动 · 1 尝试 · 9.6 s
✓ 成功  2026-05-13 10:30:11        定时 · 1 尝试 · 7.1 s
✗ 失败  2026-05-13 09:50:00        定时 · 4 尝试 · 8 分 12 秒
```

按时间倒序列出最近的执行历史。点任意一行展开看详情：

```
✓ 成功  2026-05-13 11:25:42        手动 · 1 尝试 · 9.6 s
  ┌─────────────────────────────────────────────────────────┐
  │ #1  退出码: 0   9.6 s                                   │
  │ ┌───────────────────────────────────────────────────┐   │
  │ │ 同步配置…                                         │   │
  │ │ HEALTHCHECK_OK                                    │   │
  │ └───────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────┘
```

每个尝试块：
- **退出码**：subprocess 的退出码，`0` 表示命令本身成功
- **持续时间**：这次尝试花了多久
- **错误**（如果有）：失败原因
- **黑色代码块**：Claude 命令的实际输出（尾部 2KB）

---

## 6. 典型使用场景

### 场景 A：覆盖凌晨 + 一早

你想让 05:30 之前的窗口也用上。流程：

1. 睡前打开面板
2. 加 `明天 05:30`
3. 主开关切到"已启用"
4. 第二天起床检查"历史记录"，那一行应该是 ✓ 成功

每天睡前都要加一次明天的——这是设计选择，避免长期无人值守地烧额度。

### 场景 B：覆盖整个工作日

填一组：

```
明天 09:00
明天 14:00
明天 19:00
```

三个点能覆盖一整个工作日的所有窗口。

### 场景 C：临时测试

想验证装好没坏：

1. **不**加任何触发点，**不**启用主开关
2. 直接点状态卡的 **立即触发**
3. 等 10 秒看历史第一行

通过就是装好了。立即触发**不消耗**触发点。

### 场景 D：一次性提醒型刷新

下周末出差，想让出差期间窗口也活着：

1. 加 `2026-05-20 08:00`
2. 加 `2026-05-20 13:00`
3. 加 `2026-05-20 18:00`
4. 启用

到点自动执行，回来的时候在历史里能看到这几次记录。

---

## 7. 高级配置怎么改

### 7.1 切换到官方 `claude` 而不是 `reclaude`

如果你装的是 Anthropic 官方 CLI 而不是 reclaude wrapper：

1. 高级配置 → 命令 → 改成 `claude`
2. 保存配置
3. 点立即触发验证

### 7.2 让 prompt 更短/便宜

默认 prompt 让模型回 `HEALTHCHECK_OK`，已经很省 token 了。你可以再短一点：

- Prompt: `say HC_OK`
- 期望输出标记: `HC_OK`

记得**两个一起改**，不然标记不匹配会失败。

### 7.3 网络慢，超时不够

如果你看到 `timed out after 120s` 错误：

- 高级配置 → 单次超时 (秒) → 改成 `300`
- 保存

### 7.4 让重试更激进/更佛系

默认 `30,120,300` 三个退避值——失败后等 30s 重试，再失败等 120s，再失败等 300s。

激进策略（短间隔多试）：

- 最多重试次数: `5`
- 重试退避: `5,15,30,60,120`

佛系策略（试 1 次就算）：

- 最多重试次数: `0`

---

## 8. 怎么确认它真的在发请求（防止 UI 假数据）

这是个合理的怀疑——所有页面都能写成假的。怎么证明这工具真的发了请求、而不只是把"成功"两个字显示在屏幕上？

**4 层证据**：

### 层 1：源码可读

`backend/runner.py` 第 38 行附近：

```python
proc = await asyncio.create_subprocess_exec(
    cmd_path, *cfg.extra_args, "-p", cfg.prompt,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.STDOUT,
)
```

这是 Python 真实创建子进程的标准方式。

### 层 2：daemon 日志

```bash
tail -f ~/claude-quota-warmer/data/logs/daemon.out.log
```

每次触发会出现：

```
[time] INFO healthcheck.runner | running healthcheck: /Users/you/.local/bin/reclaude -p Claude Code healthcheck: 请只回复 HEALTHCHECK_OK
```

### 层 3：磁盘上的原始记录

```bash
tail -1 ~/claude-quota-warmer/data/runs.jsonl | python -m json.tool
```

看到的 `output_tail` 字段是 `reclaude` 真实打印的内容（带 `同步配置…\nHEALTHCHECK_OK\n` 这种 wrapper 自己的输出），假数据伪造不出来这种东西。

### 层 4：自己跑两个反向实验

**实验 A：把标记改错**

1. 高级配置 → 期望输出标记 → 改成 `ZZZZZ_NEVER_APPEAR`
2. 保存
3. 点立即触发

如果面板**变红显示失败**，error 写 `expected marker 'ZZZZZ_NEVER_APPEAR' not in output`——证明它真的在校验输出。如果还显示成功，那才是假的。

记得测试完把标记改回 `HEALTHCHECK_OK`。

**实验 B：把命令改成不存在的**

1. 高级配置 → 命令 → 改成 `reclaude_xxx_no_such_thing`
2. 保存
3. 立即触发

应该秒级失败（duration < 5ms），error 写 `command not found in PATH: ...`，退出码 `127`。证明它真的查了 `PATH` 而不是瞎报成功。

记得测试完改回 `reclaude`（或 `claude`）。

完整版本（含进程级 `pgrep` 抓子进程）在 [VERIFICATION.md](./VERIFICATION.md)。

---

## 9. 常见问题排查

### 9.1 状态显示"失败" / "command not found in PATH"

**原因**：后台找不到 `reclaude`（或 `claude`）这个命令。

**为什么**：macOS 的 LaunchAgent 启动子进程时用的是**精简版 PATH**，不会继承你终端 `.zshrc` 里改过的 PATH。所以你终端能跑 `reclaude`，daemon 不一定能。

**排查**：

```bash
# 你的终端能找到吗？
command -v reclaude

# 假设输出是 /Users/you/.local/bin/reclaude
```

**修复方法 1：手动加 PATH**

编辑 `~/Library/LaunchAgents/com.user.claude-quota-warmer.plist`，找到 `<key>PATH</key>` 那段，把 reclaude 所在目录加进去：

```xml
<key>PATH</key>
<string>/Users/you/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:...</string>
```

重新加载：

```bash
launchctl bootout gui/$(id -u)/com.user.claude-quota-warmer
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.claude-quota-warmer.plist
```

**修复方法 2：在配置里写绝对路径**

高级配置 → 命令 → 改成 `command -v reclaude` 显示的完整路径，比如 `/Users/you/.local/bin/reclaude`。保存。

### 9.2 状态显示"失败" / "expected marker '...' not in output"

**原因**：subprocess 跑成功了（退出码 0），但 Claude 的回复里没有期望的标记字符串。

**排查**：

1. 展开历史那一行
2. 看 `output_tail` 字段，里面是 Claude 实际说的话
3. 如果 Claude 回了很啰嗦的东西、没有 `HEALTHCHECK_OK`，把 prompt 改得更明确：

例如：
- Prompt: `请只回复一行：HEALTHCHECK_OK，不要其他任何字符。`
- 期望输出标记: `HEALTHCHECK_OK`

### 9.3 状态显示"失败" / "timed out after 120s"

**原因**：超过设定时间还没完成。

**修复**：高级配置 → 单次超时 (秒) → 加大，比如 300，保存。

### 9.4 主开关已经"已启用"，但什么都不触发

**排查清单**：

1. 状态卡的"下次触发"显示什么？
   - 显示 `—` → 你**没有任何待触发的时间点**。去触发时间点卡片加一个。
   - 显示一个时间 → 检查是不是已经过去了。
2. 后台还活着吗？
   ```bash
   curl http://127.0.0.1:8765/api/health
   ```
   返回 `{"ok":true}` 就活着。否则去重启。
3. 时间点是不是"过去时间"？
   - daemon 启动时会把"已过期但还是 pending"的点标记成 `失败 (missed)`——这时候已经来不及补救了
   - 删掉，加新的未来时间

### 9.5 端口 8765 被占了

```bash
lsof -i :8765
```

如果是别的程序占了，要么干掉它要么换端口。换端口的话：

```bash
./scripts/uninstall.sh
HEALTHCHECK_PORT=8766 ./scripts/install.sh
```

然后访问 `http://127.0.0.1:8766`。

### 9.6 重启电脑后服务没启动

**macOS**：
```bash
launchctl print gui/$(id -u)/com.user.claude-quota-warmer
```
如果找不到，说明 LaunchAgent 没注册。重新跑：
```bash
cd ~/claude-quota-warmer && ./scripts/install.sh
```

**Linux**：
```bash
systemctl --user status com.user.claude-quota-warmer.service
```
如果 inactive，启用：
```bash
systemctl --user enable --now com.user.claude-quota-warmer.service
```

### 9.7 我改了高级配置但好像没生效

- 改完一定要点 **保存配置** 按钮。光改输入框不会自动保存。
- 已经"运行中"的触发不会被打断；下一次触发开始时才会用新配置。

### 9.8 想看完整日志

```bash
cd ~/claude-quota-warmer

# 服务的标准输出（包含每次 healthcheck 的调用记录）
tail -f data/logs/daemon.out.log

# 服务的错误流（一般是空的）
tail -f data/logs/daemon.err.log
```

---

## 10. 卸载

### 10.1 卸载后台服务（保留代码和历史）

```bash
cd ~/claude-quota-warmer
./scripts/uninstall.sh
```

这会：
- macOS：删 `~/Library/LaunchAgents/com.user.claude-quota-warmer.plist`
- Linux：停掉并删除 systemd 服务

`data/` 目录（你的配置 + 历史）会保留。代码也会保留。

### 10.2 完全删除

```bash
./scripts/uninstall.sh
rm -rf ~/claude-quota-warmer
```

---

## 11. FAQ

### Q: 这工具会消耗我的 Claude Code 额度吗？

**会**。每次触发是一次真实 API 调用，会消耗几百 token。但比起整个 5h 窗口的额度浪费，这点开销可以忽略——这就是它存在的意义。

### Q: 它会偷偷上传我的数据吗？

不会。

- daemon 只绑 `127.0.0.1`（本地回环），局域网都连不进来
- 除了 `reclaude` / `claude` 命令本身要跟 Anthropic 通信之外，本工具不发任何外部请求
- 不收集 telemetry、不上报使用情况
- 全部数据存在你自己 `~/claude-quota-warmer/data/` 下

### Q: 我能不能让它每天自动加"明天 05:30"？

目前不行——这是设计选择。原因：自动续期 = 长期无人值守地烧额度，如果哪天你出差/停用 Claude Code 几个月，会持续消耗额度直到你发现。手动加一天的点，强迫你"知道自己在做什么"。

如果你确实需要"每天 05:30"，cron + curl POST `/api/schedule` 可以实现，参考 [API.md](./API.md)。

### Q: 多台电脑能不能共用一份触发列表？

不能。这是单机本地工具，没有同步机制。每台机器独立装、独立配。

### Q: 我能不能用它刷别的 CLI（不是 claude）？

技术上可以——高级配置里把"命令"改成你想刷的任意可执行程序，把"期望输出标记"改成那个程序成功时输出的特征字符串。但这超出本工具设计范围，不保证好用。

### Q: 我的"连续成功"突然变 0 了

最近一次执行失败了。去历史记录第一行展开看具体 error 字段，按 [9. 故障排查](#9-常见问题排查) 对症处理。

### Q: 主开关停用后我加的时间点会丢吗？

不会。时间点会保留，到时间也不会触发；重新启用主开关后它们会自动重新激活、按时触发。

### Q: 时区怎么处理？

- 网页上的时间选择器**总是用你浏览器的本地时区**显示和输入
- 后端存储用 UTC ISO 格式，跨时区不会错位
- 如果你笔记本设了上海时区，填 `2026-05-14 05:30` 就是上海时间 05:30

### Q: Claude Code 改版了 5h 窗口规则怎么办？

跟着 Anthropic 公告改 prompt 和触发频率就行。本工具没硬编码 5h，纯粹是用户在网页上自己加时间点。

### Q: 我想看每次具体发了什么、收到了什么

历史记录的每一行点开都能看：
- 退出码
- 持续时间
- output_tail（命令的实际输出尾部，包含 Claude 的回复）

更详细可以直接看：

```bash
cat ~/claude-quota-warmer/data/runs.jsonl | python -m json.tool
```

### Q: 装好后怎么确认能挺过重启？

```bash
# 看 LaunchAgent 是否注册了
launchctl list | grep claude-quota-warmer
```

如果有输出，说明开机自启已经配好。下次重启后会自动起来。

---

## 还有问题？

- 完整 API 参考：[API.md](./API.md)
- 系统架构：[ARCHITECTURE.md](./ARCHITECTURE.md)
- 验证它是真请求：[VERIFICATION.md](./VERIFICATION.md)
- 提 issue：<https://github.com/xtianowner/claude-quota-warmer/issues>
