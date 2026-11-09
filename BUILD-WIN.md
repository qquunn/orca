# Orca Windows 一键编译脚本

两个脚本,都在仓库根目录下,双击或 `cmd` 里执行即可。

## build-win.cmd —— 编译 Electron 应用(main + preload + renderer)

```
build-win.cmd           # 普通模式
build-win.cmd e2e       # E2E 模式(暴露 window.__store,供测试/CDP 断言用)
```

产出:
- `out\main\index.js`
- `out\preload\index.js`
- `out\renderer\index.html`

## run-win.cmd —— 启动编译好的应用

```
run-win.cmd
```

前提:先跑过 `build-win.cmd`(需要 `out\main\index.js` 和 `node_modules\electron`)。

等价于手动执行:

```cmd
set NODE_ENV=development
node_modules\electron\dist\electron.exe .
```

`NODE_ENV=development` 让应用把数据放到隔离的 `%APPDATA%\orca-dev`,不会碰已安装的正式版 Orca 的配置。

## rebuild-native-win.cmd —— 重建 Windows 原生模块

```
rebuild-native-win.cmd             # 为 Node 运行时重建
rebuild-native-win.cmd electron    # 为 Electron 运行时重建
```

## 为什么要这两个脚本(而不是直接 `pnpm dev` / `pnpm build`)

这台机器上有三个环境问题,pnpm 的正常路径走不通:

1. **Node 版本**:项目 `engines` 要求 Node 24,系统默认是 v20,vitest / electron-vite 的
   配置加载会崩(`globSync is not a function`)。脚本固定用
   `%USERPROFILE%\.cache\node24\node-v*-win-x64\node.exe`。
2. **pnpm 的 pre-run install**:`pnpm run build:electron-vite` 会在真正构建前跑一次
   `install`,触发 node-gyp 原生模块重建;而原生重建在当前环境是坏的(见第 3 点),
   所以任何 `pnpm run build:*` 都会先死在原生模块上。`build-win.cmd` 直接调用
   `config\scripts\run-electron-vite-build.mjs`,绕开这一步。
3. **原生模块重建失败**:全局面 `NoDefaultCurrentDirectoryInExePath=1` 让
   `VsDevCmd.bat` 找不到 `vswhere.exe`,`VSCMD_VER` 回落到无效的 `17.0`,Orca 的
   `parseWindowsCompilerEnvironment` 校验不过,编译器环境没生效,node-gyp 找不到 VS。
   `rebuild-native-win.cmd` 只在本次进程树内清掉该变量再重建。

## package-win.cmd —— 生成 Windows 二进制安装包

```
package-win.cmd
```

产出:`dist\orca-windows-setup.exe`(NSIS 安装包)。

等价于官方 `pnpm run build:win`,但内置了本机的三个修复(Node 24、pnpm JS 直启、
临时清 `NoDefaultCurrentDirectoryInExePath`)。它会先 `pnpm install --frozen-lockfile`
把 `pnpm.exe`/`bun.exe`/原生模块补齐,再跑 `build:win`。**首次运行耗时较长**(要重装依赖
+ 全量编译),之后会快很多。

> 备注:`build:win` 内部包含 `build:desktop`(typecheck + CLI + electron-vite 等全量),
> 以及 `rebuild-native-deps.mjs`(原生模块)和 `electron-builder --win`。所以它不会走
> `build-win.cmd` 那条绕过路径,而是用本脚本开头清掉加固变量后的干净环境完整跑一遍。

## 建议执行顺序

```cmd
cd /d D:\code\orca
build-win.cmd
run-win.cmd
```

如果编译时还报 native 模块错误(正常情况下 `build-win.cmd` 不碰原生模块,应该不会),再:

```cmd
rebuild-native-win.cmd electron
```

## 尚未根治、需要你决定的事项

- `NoDefaultCurrentDirectoryInExePath=1` 是**系统级安全加固**残留,我没有擅自动。想根治:
  在「系统属性 → 环境变量」里删掉该变量(或设为 0),重启终端后原生重建即可正常,
  之后 `pnpm install` / `pnpm dev` 全套都能用。三个脚本在**单次进程树内**临时清掉了它,
  所以不用删也能编译/打包,只是每次都要走脚本。
- pnpm 的原生二进制(`pnpm.exe`)我之前用硬链补回了 `AppData\Local\pnpm\.tools\...\bin`;
  `package-win.cmd` 里的 `pnpm install` 会再修复一次。彻底干净的做法是允许 pnpm 跑
  build scripts 重装一次。
