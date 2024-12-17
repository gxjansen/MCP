#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Fuse from 'fuse.js';

// Cache to store previously fetched pages
const pageCache = new Map<string, { content: string; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

interface SearchResult {
  title: string;
  url: string;
  excerpt: string;
}

class AstroDocsServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'astro-docs-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: 'https://docs.astro.build',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; AstroDocsBot/1.0; +https://docs.astro.build)',
      },
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_docs',
          description: 'Search through Astro documentation using keywords',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of results to return (default: 5)',
                minimum: 1,
                maximum: 20,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_page',
          description: 'Get the content of a specific documentation page',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the documentation page (e.g., "/en/getting-started")',
              },
            },
            required: ['path'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'search_docs':
          return await this.handleSearchDocs(request.params.arguments);
        case 'get_page':
          return await this.handleGetPage(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async fetchPage(path: string): Promise<string> {
    console.error(`[Debug] Fetching page: ${path}`);
    const cached = pageCache.get(path);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.error('[Debug] Returning cached content');
      return cached.content;
    }

    try {
      const response = await this.axiosInstance.get(path);
      console.error(`[Debug] Got response status: ${response.status}`);
      const $ = cheerio.load(response.data);

      // Extract main content
      const content = $('main').html() || $('.content-panel').html() || $('article').html() || '';
      console.error(`[Debug] Extracted content length: ${content.length}`);
      
      // Cache the result
      pageCache.set(path, {
        content,
        timestamp: Date.now(),
      });

      return content;
    } catch (error) {
      console.error('[Debug] Error fetching page:', error);
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch page: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async handleSearchDocs(args: any) {
    if (typeof args.query !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid search query');
    }

    const maxResults = args.max_results || 5;
    console.error(`[Debug] Searching for: ${args.query}, max results: ${maxResults}`);

    try {
      // First fetch the sitemap to get all documentation pages
      const response = await this.axiosInstance.get('/sitemap-0.xml');
      console.error('[Debug] Got sitemap response');
      const $ = cheerio.load(response.data, { xmlMode: true });

      // Extract all documentation URLs from sitemap
      const links: SearchResult[] = [];
      $('url').each((_, element) => {
        const loc = $(element).find('loc').text();
        if (loc && loc.includes('docs.astro.build/en/')) {
          const path = new URL(loc).pathname;
          const title = path.split('/').pop() || path;
          links.push({
            title: title.replace(/-/g, ' '),
            url: loc,
            excerpt: '', // We'll try to fetch this later if needed
          });
        }
      });

      console.error(`[Debug] Found ${links.length} documentation pages`);

      // Set up Fuse.js for fuzzy searching
      const fuse = new Fuse(links, {
        keys: ['title'],
        includeScore: true,
        threshold: 0.4,
      });

      // Perform the search
      const searchResults = fuse.search(args.query)
        .slice(0, maxResults)
        .map(result => ({
          title: result.item.title,
          url: result.item.url,
          excerpt: `Score: ${(1 - (result.score || 0)).toFixed(2)}`,
        }));

      console.error(`[Debug] Found ${searchResults.length} matches`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(searchResults, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('[Debug] Search error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetPage(args: any) {
    if (typeof args.path !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid page path');
    }

    console.error(`[Debug] Getting page: ${args.path}`);

    try {
      const content = await this.fetchPage(args.path);
      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      };
    } catch (error) {
      console.error('[Debug] Get page error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get page: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Astro Docs MCP server running on stdio');
  }
}

const server = new AstroDocsServer();
server.run().catch(console.error);
