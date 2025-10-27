#!/usr/bin/env node

import axios, { AxiosRequestConfig } from 'axios';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Configure your Confluence instance credentials and URL.
 */
const CONFLUENCE_URL = process.env.CONFLUENCE_URL;
const CONFLUENCE_API_MAIL = process.env.CONFLUENCE_API_MAIL;
const CONFLUENCE_API_KEY = process.env.CONFLUENCE_API_KEY;
const CONFLUENCE_PERSONAL_TOKEN = process.env.CONFLUENCE_PERSONAL_TOKEN;

/**
 * Create an MCP server to handle CQL queries and page retrieval.
 */
const server = new Server(
  {
    name: 'Confluence communication server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/**
 * Handler for listing available tools.
 * Provides tools for querying Confluence with CQL and retrieving page content.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'execute_cql_search',
        description: 'Execute a CQL query on Confluence to search pages',
        inputSchema: {
          type: 'object',
          properties: {
            cql: {
              type: 'string',
              description: 'CQL query string',
            },
            limit: {
              type: 'integer',
              description: 'Number of results to return',
              default: 10,
            },
          },
          required: ['cql'],
        },
      },
      {
        name: 'get_page_content',
        description: 'Get the content of a Confluence page',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Confluence Page ID',
            },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'update_page_content',
        description: 'Update the content of a Confluence page',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'Confluence Page ID',
            },
            content: {
              type: 'string',
              description: 'HTML content to update the page with',
            },
            title: {
              type: 'string',
              description: 'Page title (optional, if you want to change it)',
            },
          },
          required: ['pageId', 'content'],
        },
      },
    ],
  };
});

/**
 * Function to execute a CQL query against Confluence.
 * @param {string} cql - CQL query string
 * @param limit
 * @returns {Promise<any>}
 */
async function executeCQL(cql: string, limit: number): Promise<any> {
  try {
    const params = {
      cql,
      limit,
      expand: 'version',  // 只获取必要的字段
    };

    const response = await axios.get(
      `${CONFLUENCE_URL}/rest/api/content/search`,
      {
        headers: getAuthHeaders().headers,
        params,
      },
    );

    // 精简返回数据，只保留核心信息
    const simplified = {
      size: response.data.size,
      limit: response.data.limit,
      results: response.data.results?.map((item: any) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        title: item.title,
        space: item.space?.key,
        version: item.version?.number,
        lastModified: item.version?.when,
        url: `${CONFLUENCE_URL}${item._links?.webui}`,
      })) || [],
    };

    return simplified;
  } catch (error: any) {
    return {
      error: error.response ? error.response.data : error.message,
    };
  }
}

/**
 * Function to parse HTML table content from Confluence storage format
 * @param {string} html - HTML content string
 * @returns {Array} Array of parsed table data
 */
function parseTableData(html: string): any[] {
  const tables: any[] = [];
  
  // 简单的正则匹配提取表格行数据
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tableMatches = html.matchAll(tableRegex);
  
  for (const tableMatch of tableMatches) {
    const tableContent = tableMatch[1];
    const rows: any[] = [];
    
    // 提取表头
    const headerRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    const headers: string[] = [];
    for (const headerMatch of tableContent.matchAll(headerRegex)) {
      const headerText = headerMatch[1]
        .replace(/<[^>]+>/g, '') // 移除HTML标签
        .replace(/&nbsp;/g, ' ')
        .trim();
      if (headerText) headers.push(headerText);
    }
    
    // 提取数据行
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rowMatches = tableContent.matchAll(rowRegex);
    
    for (const rowMatch of rowMatches) {
      const rowContent = rowMatch[1];
      
      // 跳过表头行
      if (rowContent.includes('<th')) continue;
      
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      
      for (const cellMatch of rowContent.matchAll(cellRegex)) {
        const cellText = cellMatch[1]
          .replace(/<ac:task-list>[\s\S]*?<\/ac:task-list>/gi, '') // 移除任务列表
          .replace(/<ac:link>[\s\S]*?<\/ac:link>/gi, '') // 移除链接
          .replace(/<[^>]+>/g, '') // 移除其他HTML标签
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(cellText);
      }
      
      if (cells.length > 0) {
        if (headers.length > 0) {
          const rowData: any = {};
          headers.forEach((header, index) => {
            rowData[header] = cells[index] || '';
          });
          rows.push(rowData);
        } else {
          rows.push(cells);
        }
      }
    }
    
    if (rows.length > 0) {
      tables.push({
        headers: headers.length > 0 ? headers : undefined,
        rows,
      });
    }
  }
  
  return tables;
}

/**
 * Function to retrieve content from a Confluence page by ID.
 * @param {string} pageId - Confluence Page ID
 * @returns {Promise<any>}
 */
async function getPageContent(pageId: string): Promise<any> {
  try {
    const response = await axios.get(
      `${CONFLUENCE_URL}/rest/api/content/${pageId}`,
      {
        headers: getAuthHeaders().headers,
        params: {
          expand: 'body.storage,version,space',  // 只获取必要字段
        },
      },
    );

    // 精简返回数据，移除不必要的元数据
    const data = response.data;
    const htmlContent = data.body?.storage?.value || '';
    
    // 解析表格数据
    const tables = parseTableData(htmlContent);
    
    const simplified = {
      id: data.id,
      type: data.type,
      status: data.status,
      title: data.title,
      space: {
        key: data.space?.key,
        name: data.space?.name,
      },
      version: {
        number: data.version?.number,
        when: data.version?.when,
        by: data.version?.by?.displayName || data.version?.by?.username,
      },
      url: `${CONFLUENCE_URL}/pages/viewpage.action?pageId=${pageId}`,
      // 只在有表格时返回解析后的数据，否则返回原始HTML
      ...(tables.length > 0 ? { tables } : { content: htmlContent }),
    };

    return simplified;
  } catch (error: any) {
    return {
      error: error.response ? error.response.data : error.message,
    };
  }
}

/**
 * Function to update content on a Confluence page by ID.
 * @param {string} pageId - Confluence Page ID
 * @param {string} content - HTML content to update
 * @param {string} title - Optional new title
 * @returns {Promise<any>}
 */
async function updatePageContent(
  pageId: string,
  content: string,
  title?: string,
): Promise<any> {
  try {
    // First, get the current page to retrieve its version and other details
    const currentPage = await getPageContent(pageId);

    if (currentPage.error) {
      return {
        error: `Failed to get current page: ${currentPage.error}`,
      };
    }

    // Create update payload
    const updatePayload = {
      id: pageId,
      type: currentPage.type,
      title: title || currentPage.title,
      space: currentPage.space,
      body: {
        storage: {
          value: content,
          representation: 'storage',
        },
      },
      version: {
        number: currentPage.version.number + 1,
      },
    };

    // Update the page
    const response = await axios.put(
      `${CONFLUENCE_URL}/rest/api/content/${pageId}`,
      updatePayload,
      {
        headers: {
          ...getAuthHeaders().headers,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data;
  } catch (error: any) {
    return {
      error: error.response ? error.response.data : error.message,
    };
  }
}

/**
 * Function to get the authentication headers.
 * @returns {AxiosRequestConfig}
 */
function getAuthHeaders(): AxiosRequestConfig<any> {
  let authHeader: string;
  
  // 优先使用 Personal Token (Bearer Token)
  if (CONFLUENCE_PERSONAL_TOKEN) {
    authHeader = `Bearer ${CONFLUENCE_PERSONAL_TOKEN}`;
  } 
  // 否则使用 Basic Auth (邮箱 + API Key)
  else if (CONFLUENCE_API_MAIL && CONFLUENCE_API_KEY) {
    authHeader = `Basic ${Buffer.from(
      `${CONFLUENCE_API_MAIL}:${CONFLUENCE_API_KEY}`,
    ).toString('base64')}`;
  } else {
    throw new Error('未配置认证信息：需要 CONFLUENCE_PERSONAL_TOKEN 或 (CONFLUENCE_API_MAIL + CONFLUENCE_API_KEY)');
  }
  
  return {
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  };
}

/**
 * Handler for the execute_cql_search and get_page_content tools.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case 'execute_cql_search': {
      const cql = String(request.params.arguments?.cql);
      const limit = Number(request.params.arguments?.limit ?? 10);

      if (!cql) {
        throw new Error('CQL query is required');
      }

      const response = await executeCQL(cql, limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case 'get_page_content': {
      const pageId = String(request.params.arguments?.pageId);

      if (!pageId) {
        throw new Error('Page ID is required');
      }

      const response = await getPageContent(pageId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case 'update_page_content': {
      const pageId = String(request.params.arguments?.pageId);
      const content = String(request.params.arguments?.content);
      const title = request.params.arguments?.title
        ? String(request.params.arguments?.title)
        : undefined;

      if (!pageId) {
        throw new Error('Page ID is required');
      }
      if (!content) {
        throw new Error('Content is required');
      }

      const response = await updatePageContent(pageId, content, title);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error('Unknown tool');
  }
});

/**
 * Start the server using stdio transport.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
