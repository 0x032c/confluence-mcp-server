# Confluence MCP Server

一个基于 Model Context Protocol (MCP) 的 Confluence 集成服务器，允许 AI 助手通过标准化接口查询和管理 Confluence 页面内容。

## 功能特性

- 🔍 **CQL 搜索** - 使用 Confluence Query Language 搜索页面
- 📄 **页面内容获取** - 获取指定页面的完整内容
- ✏️ **页面内容更新** - 修改 Confluence 页面内容
- 📊 **智能表格解析** - 自动解析 HTML 表格为结构化 JSON 数据
- 🔐 **多种认证方式** - 支持 Personal Token 和 API Key 认证

## 安装

### 前置要求

- Node.js 16+
- npm 或 yarn
- Confluence 账户和访问权限

### 安装步骤

```bash
# 克隆或下载项目
cd confluence-mcp-server

# 安装依赖
npm install

# 编译 TypeScript
npm run build
```

## 配置

### 环境变量

创建 `.env` 文件或设置以下环境变量：

```bash
# Confluence 实例 URL
CONFLUENCE_URL=https://your-domain.atlassian.net/wiki

# 认证方式 1: Personal Access Token (推荐)
CONFLUENCE_PERSONAL_TOKEN=your_personal_token_here

# 认证方式 2: Email + API Key
CONFLUENCE_API_MAIL=your-email@example.com
CONFLUENCE_API_KEY=your_api_key_here
```

### 获取认证凭据

#### Personal Access Token (推荐)

1. 登录 Confluence
2. 进入 **设置** → **个人访问令牌**
3. 点击 **创建令牌**
4. 复制生成的 Token

#### API Key (传统方式)

1. 登录 Atlassian 账户
2. 进入 [API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
3. 点击 **创建 API 令牌**
4. 使用邮箱 + API Key 进行认证

#### Cookie (新方式)
1. 登录 Confluence
2. 通过浏览器的开发者工具（F12 -> Network -> 找到一个 wiki 页面请求 -> Request Headers）
3. 复制完整的 Cookie 字符串

### 在 Claude Desktop 中配置

编辑 Claude Desktop 配置文件：

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "confluence": {
      "command": "node",
      "args": ["D:\\confluence-mcp-server\\build\\index.js"],
      "env": {
        "CONFLUENCE_URL": "https://your-domain.atlassian.net/wiki",
        "CONFLUENCE_PERSONAL_TOKEN": "your_token_here"
      }
    }
  }
}
```
### 在 Cursor 中配置
```json
{
  "mcpServers": {
    "confluence": {
      "command": "node",
      "args": ["/data/confluence-mcp-server/build/index.js"],
      "env": {
        "CONFLUENCE_URL": "http://wiki.xx.com",
        "CONFLUENCE_COOKIE": "xxx"
      }
    }
  }
}
```

## 可用工具

### 1. execute_cql_search

使用 CQL 查询搜索 Confluence 页面。

**参数：**
- `cql` (必需): CQL 查询字符串
- `limit` (可选): 返回结果数量，默认 10

**示例：**
```javascript
{
  "cql": "type=page and space=DEV and title~\"API\"",
  "limit": 5
}
```

**返回格式：**
```json
{
  "size": 5,
  "limit": 5,
  "results": [
    {
      "id": "123456",
      "type": "page",
      "status": "current",
      "title": "API 文档",
      "space": "DEV",
      "version": 12,
      "lastModified": "2025-01-15T10:30:00.000+08:00",
      "url": "https://your-domain.atlassian.net/wiki/pages/viewpage.action?pageId=123456"
    }
  ]
}
```

### 2. get_page_content

获取指定页面的内容，自动解析表格数据。

**参数：**
- `pageId` (必需): Confluence 页面 ID

**示例：**
```javascript
{
  "pageId": "123456"
}
```

**返回格式（包含表格）：**
```json
{
  "id": "123456",
  "type": "page",
  "status": "current",
  "title": "模块接口文档",
  "space": {
    "key": "DEV",
    "name": "开发团队"
  },
  "version": {
    "number": 15,
    "when": "2025-01-15T10:30:00.000+08:00",
    "by": "张三"
  },
  "url": "https://...",
  "tables": [
    {
      "headers": ["功能名称", "负责人", "状态"],
      "rows": [
        {
          "功能名称": "用户认证",
          "负责人": "张三",
          "状态": "完成"
        },
        {
          "功能名称": "数据同步",
          "负责人": "李四",
          "状态": "进行中"
        }
      ]
    }
  ]
}
```

**返回格式（无表格）：**
```json
{
  "id": "123456",
  "title": "普通文档",
  "content": "<p>原始 HTML 内容...</p>"
}
```

### 3. update_page_content

更新 Confluence 页面内容。

**参数：**
- `pageId` (必需): 页面 ID
- `content` (必需): HTML 格式的新内容
- `title` (可选): 新标题

**示例：**
```javascript
{
  "pageId": "123456",
  "content": "<p>更新后的内容</p>",
  "title": "新标题（可选）"
}
```

## CQL 查询示例

```sql
-- 搜索特定空间的页面
type=page and space=DEV

-- 按标题模糊搜索
type=page and title~"接口文档"

-- 搜索最近修改的页面
type=page and lastModified >= "2025-01-01"

-- 搜索特定作者创建的页面
type=page and creator="username"

-- 组合查询
type=page and space=DEV and title~"API" and lastModified >= "2025-01-01"
```

更多 CQL 语法请参考 [Confluence CQL 文档](https://confluence.atlassian.com/doc/confluence-search-syntax-158720.html)。

## 开发与测试

### 运行测试

```bash
# 测试连接
node test-connection.js

# 测试页面访问
node test-page-access.js

# 测试优化后的输出
node test-parsed-output.js
```

### 开发模式

```bash
# 监视文件变化并自动编译
npm run watch

# 使用 MCP Inspector 调试
npm run inspector
```

## 项目结构

```
confluence-mcp-server/
├── src/
│   └── index.ts           # 主服务器代码
├── build/                 # 编译后的 JavaScript
├── test-connection.js     # 连接测试脚本
├── test-page-access.js    # 页面访问测试
├── test-parsed-output.js  # 输出优化测试
├── package.json
├── tsconfig.json
└── README.md
```

## 数据优化

本服务器对 Confluence API 返回的数据进行了以下优化：

1. **移除冗余字段** - 过滤掉 `_expandable`, `_links` 等内部元数据
2. **表格智能解析** - 自动提取 HTML 表格为结构化 JSON
3. **清理 HTML 标签** - 移除 Confluence 特有标签如 `<ac:task-list>`, `<ac:link>`
4. **精简版本信息** - 只保留关键的版本和作者信息

## 故障排查

### 认证失败

- 确认环境变量正确设置
- 检查 Token 或 API Key 是否有效
- 确认账户有访问目标页面的权限

### 无法获取页面内容

- 确认页面 ID 正确
- 检查页面是否被删除或归档
- 确认有读取权限

### 表格解析不完整

- 检查 HTML 结构是否符合标准
- 某些复杂表格可能需要手动处理
- 查看原始 `content` 字段进行调试

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关资源

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Confluence REST API](https://developer.atlassian.com/cloud/confluence/rest/v1/intro/)
- [Confluence CQL](https://confluence.atlassian.com/doc/confluence-search-syntax-158720.html)
