import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { diffLines } from 'diff';
import fs from 'fs';

interface GenerateDiffArgs {
  oldFilePath: string;
  newFilePath: string;
  outputFilePath: string;
}

class DiffServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'diff-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

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
          name: 'generate_diff',
          description: 'Generate a diff file between two versions of a file',
          inputSchema: {
            type: 'object',
            properties: {
              oldFilePath: {
                type: 'string',
                description: 'Path to the old version of the file',
              },
              newFilePath: {
                type: 'string',
                description: 'Path to the new version of the file',
              },
              outputFilePath: {
                type: 'string',
                description: 'Path to save the generated diff file',
              },
            },
            required: ['oldFilePath', 'newFilePath', 'outputFilePath'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'generate_diff') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      const args = request.params.arguments as unknown as GenerateDiffArgs;
      const { oldFilePath, newFilePath, outputFilePath } = args;

      if (!fs.existsSync(oldFilePath)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Old file does not exist: ${oldFilePath}`
        );
      }

      if (!fs.existsSync(newFilePath)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `New file does not exist: ${newFilePath}`
        );
      }

      const oldContent = fs.readFileSync(oldFilePath, 'utf-8');
      const newContent = fs.readFileSync(newFilePath, 'utf-8');

      const diff = diffLines(oldContent, newContent);

      const diffContent = diff.map(part => {
        const prefix = part.added ? '+' : part.removed ? '-' : ' ';
        return part.value.split('\n').map(line => (line ? `${prefix} ${line}` : '')).join('\n');
      }).join('\n');

      fs.writeFileSync(outputFilePath, diffContent);

      return {
        content: [
          {
            type: 'text',
            text: `Diff file generated successfully at ${outputFilePath}`,
          },
        ],
      };
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Diff MCP server running on stdio');
  }
}

const server = new DiffServer();
server.run().catch(console.error);
