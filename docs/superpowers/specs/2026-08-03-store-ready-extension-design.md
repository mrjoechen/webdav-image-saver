# WebDAV Image Saver 上架整改与界面优化设计

日期：2026-08-03

## 目标

将现有 Chrome Manifest V3 扩展整改为可重新提交 Chrome Web Store 的自包含产品，同时修复核心可靠性与安全问题，并将配置页改为简洁、可访问、自动本地化的界面。

成功标准：

- 发布包不引用或下载任何远程 JavaScript、CSS、字体、图标或其他可执行逻辑。
- 安装时不申请全站访问；WebDAV 服务器和图片来源均按实际域名请求权限。
- WebDAV 凭据仅通过 HTTPS 传输，并以 AES-GCM 密文持久保存。
- 简体中文和英文界面自动跟随 Chrome 语言，其他语言回退英文。
- 右键保存、取消、连接测试、配置增删改和工具栏入口均可正常工作。
- 自动化测试、静态检查、发布包审计和手工 Chrome 验收全部通过。

## 非目标

- 不加入图片编辑、批量下载、历史记录、同步配置或远程分析。
- 不支持明文 HTTP WebDAV，包括局域网 NAS。用户必须为服务配置 HTTPS。
- 不实现 WebDAV 目录浏览器；目标目录继续由用户直接输入。
- 不在本轮扩展到简体中文和英文以外的翻译。

## Chrome Web Store 合规设计

### 完全本地化资源

删除配置页中的 Google Fonts 和 Material Icons 链接。界面使用系统字体栈；少量图标使用扩展包内的 SVG 或纯 CSS。清单、HTML、CSS 和 JavaScript 不包含远程代码入口，内容安全策略保持只允许 `self`。

删除不需要的 `web_accessible_resources`。通过 `chrome.scripting.insertCSS()` 和 `executeScript()` 注入的包内文件不需要暴露为网页可直接访问的资源。

### 最小权限

必需权限：

- `contextMenus`：创建图片右键菜单。
- `storage`：保存配置、密文和迁移状态。
- `scripting`：在用户触发保存的当前标签页显示进度。
- `activeTab`：只在用户执行右键菜单时临时访问当前页面。

可选主机权限：

- `https://*/*` 仅作为可请求范围声明，不在安装时授予。

添加或编辑配置时，用户点击“测试连接”或“保存”即构成明确手势，扩展只请求该 WebDAV URL 的 origin。保存图片时，如果图片 URL 属于尚未授权的 HTTPS origin，右键菜单点击处理器只请求该图片 origin。拒绝授权时不上传，并显示可操作的本地化错误。

`chrome://`、Chrome Web Store 等受限页面无法注入脚本时，上传逻辑仍会安全退出并给出可诊断日志，不扩大权限绕过浏览器限制。

### 数据披露与文档一致性

重写隐私政策和商店描述，删除占位日期、占位链接、重复政策、未经实现的功能以及“Chrome 自动加密”等不准确表述。文档明确披露：

- 保存 WebDAV 地址、用户名、目标目录和加密后的密码。
- 临时处理用户主动选择的图片 URL、页面 URL 和图片二进制数据。
- 数据只在浏览器、图片来源站点与用户指定的 WebDAV 服务器之间流动。
- 不使用分析、广告、遥测或开发者服务器。
- 用户删除配置或卸载扩展即可删除相应本地数据。

## 架构

### 模块边界

将当前单文件后台逻辑拆为可独立测试的包内模块：

- `lib/config.js`：配置校验、规范化、迁移和存储接口。
- `lib/crypto.js`：生成不可导出的 AES-GCM 256 位设备密钥，加密和解密密码。
- `lib/permissions.js`：将 URL 转为精确 origin pattern，检查和请求可选权限。
- `lib/webdav.js`：Basic Auth 编码、连接测试、目标 URL 构造和 PUT 上传。
- `lib/filename.js`：根据时间、页面域名、MIME 类型和随机后缀生成安全文件名。
- `background.js`：注册 Chrome 事件、协调权限、倒计时、上传和消息反馈。
- `options/options.js`：只负责配置页状态、表单交互和渲染。
- `content_script.js`：只负责页面内倒计时、取消和结果提示。

后台 Service Worker 使用 ES modules。纯逻辑模块不直接依赖 DOM 或 Chrome API，以便 Node 测试；Chrome API 通过小型适配层传入。

### 配置数据模型

每个服务器记录包含：

```text
id
name
url             规范化后的 HTTPS URL，不含用户名、密码、查询串或片段
username
folder          以 / 开始、无末尾 / 的规范化目录，根目录除外
passwordCipher  AES-GCM 密文
passwordIv      每次加密生成的随机 IV
schemaVersion
```

AES 密钥使用 Web Crypto 生成，设置为不可导出，并通过 IndexedDB 结构化克隆保存于扩展 origin。`chrome.storage.local` 只保存配置元数据、IV 和密文。后台与配置页从相同扩展 origin 的 IndexedDB 读取 CryptoKey。

现有 `webdavServers` 明文记录在升级时执行一次迁移：生成密钥、逐条加密密码、写入新模式，验证可解密后再删除旧明文字段和遗留的 `chrome.storage.sync` 数据。迁移失败时保留原数据并显示错误，不进行破坏性清理。

### 连接与上传数据流

连接测试：

1. 表单先验证 HTTPS URL、用户名和目录。
2. 请求精确的 WebDAV origin 权限。
3. 后台使用 `PROPFIND`、`Depth: 0` 测试目标端点。
4. 仅把 2xx 或 WebDAV `207 Multi-Status` 视为成功；401、403、404、超时和网络错误给出区分明确的消息。
5. 不再以 `HEAD 404` 推断认证成功，也不解析未使用的目录列表。

图片保存：

1. 用户在图片上选择具体 WebDAV 服务器。
2. 后台加载并解密该服务器配置，确认 WebDAV origin 权限仍有效。
3. 根据需要请求图片 origin 权限，并在当前标签页显示三秒可取消提示。
4. 倒计时结束后获取图片；只接受 `image/*` 响应，拒绝空响应和超过 50 MiB 的响应。存在 `Content-Length` 时先行拦截，读取完成后再次按实际 Blob 大小校验。
5. 根据响应 MIME 类型选择安全扩展名，使用毫秒时间、页面域名和随机后缀避免重名。
6. 对目录段和文件名编码，使用 `PUT` 上传；任何阶段失败均转为本地化、面向用户的错误。

取消在倒计时阶段清除待执行任务；上传开始后使用 `AbortController` 尽力中止获取或 PUT。待上传状态不依赖长期全局配置缓存，避免 Service Worker 重启后使用空配置或旧配置。

Basic Auth 使用 UTF-8 安全编码，不直接对 Unicode 字符串调用 `btoa()`。

## 配置页设计

### 视觉与布局

采用单栏、最大宽度约 760px 的系统设置式布局：浅色中性背景、白色内容面、深色正文和单一蓝色强调色。移除大面积渐变、悬浮卡片动画、远程字体和装饰性图标。

顶部只显示扩展名称、简短说明和一个“添加服务器”主按钮。已有配置以紧凑分隔列表展示名称、域名、目标目录及编辑/删除操作。空状态用一句说明和同一个添加操作，不制造第二套交互。

添加和编辑使用可访问的模态表单。字段顺序为名称、HTTPS 地址、用户名、密码和目标目录。标签始终位于输入框上方；辅助说明和错误位于对应字段下方。连接测试为次按钮，保存为主按钮。按钮包含加载、成功、失败和禁用状态。

工具栏图标点击后调用 `chrome.runtime.openOptionsPage()`，使配置入口可发现。

### 可访问性与交互

- 模态框使用 `role="dialog"`、`aria-modal`、可读标题和焦点管理。
- 关闭按钮有本地化无障碍名称；Escape 关闭并将焦点还给触发按钮。
- 通知区域使用合适的 `aria-live`，表单错误关联到输入框。
- 所有按钮都有键盘焦点样式，正文和控件满足 WCAG AA 对比度。
- 删除操作继续要求明确确认，确认文案包含配置名称。
- 渲染服务器数据时创建 DOM 节点并设置 `textContent`，不拼接用户输入到 `innerHTML` 或属性字符串。

### 国际化

增加 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json`，清单通过 `__MSG_*__` 本地化名称和说明。HTML 使用 `data-i18n` 标记，JavaScript 消息全部通过 `chrome.i18n.getMessage()` 获取。Chrome 无匹配语言时使用英文 `default_locale`。

## 错误处理

错误分为输入、权限、认证、网络、服务器响应、图片格式、大小限制、加密存储和页面注入八类。用户界面不显示凭据、Authorization header、完整服务器响应正文或内部堆栈；开发日志也不输出密码和密文。

配置保存采用“加密成功后写入”的顺序。编辑配置时，留空密码表示保留已有密码；新增配置时密码必填。测试失败不会清空用户输入。授权被撤回时提示用户重新测试或编辑该服务器以恢复授权。

## 测试与验收

自动化测试覆盖：

- HTTPS URL、目录和 origin pattern 规范化。
- Unicode Basic Auth。
- MIME 到扩展名映射、危险扩展名过滤和文件名唯一性。
- AES-GCM 加密解密、随机 IV、错误密钥和明文迁移。
- WebDAV 状态码分类、目标 URL 编码和错误信息脱敏。
- 配置新增、编辑时保留密码、删除和安全 DOM 渲染。
- 中英文消息 key 完整一致。
- 清单不包含 required host permissions、远程资源或多余公开资源。

发布前执行：

1. JavaScript 语法、单元测试和静态检查。
2. 扫描发布目录中的远程 `<script>`、`<link>`、`@import`、`eval` 和外部代码 URL。
3. 校验 manifest、图标实际尺寸、locale JSON 和发布 ZIP 内容。
4. 在干净 Chrome 配置中加载未打包扩展，手工验证首次授权、拒绝授权、连接成功/失败、保存、取消、编辑、删除、重启后解密及中英文切换。
5. 使用 HTTPS WebDAV 测试端点完成一次真实 PUT；若本地没有可用端点，则明确记录该项仍需发布者执行，不能用单元测试替代。

## 发布物

- 可直接加载和打包的 MV3 扩展源码。
- 不含 `.git`、测试缓存或开发文档的确定性发布 ZIP。
- 更新后的 README、隐私政策、商店描述和权限理由清单。
- Chrome Web Store 重新提交检查表，包含隐私字段和截图要求。
