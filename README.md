# MCP (Model Context Protocol) Servers

This repository contains MCP servers that extend Cline's capabilities through the Model Context Protocol. Each server provides specific tools and resources that can be used to accomplish various tasks.

## Available Servers

### astro-docs-server

A server that provides access to Astro documentation, offering tools to:

- Search through Astro documentation using keywords
- Retrieve content from specific documentation pages

#### Tools:
- `search_docs`: Search Astro documentation with keywords and get relevant results
- `get_page`: Get the content of a specific documentation page by its path

### diff-server

A server that provides file comparison capabilities, offering tools to:

- Generate diff files between two versions of a file
- Compare file contents to identify changes

#### Tools:
- `generate_diff`: Create a diff file showing the changes between two versions of a file

## Development

Each server is written in TypeScript and follows a similar structure:

```
server-name/
  ├── package.json        # Dependencies and scripts
  ├── tsconfig.json       # TypeScript configuration
  ├── src/               # Source code
  │   └── index.ts       # Main server implementation
  └── build/             # Compiled JavaScript
```

### Building a Server

1. Navigate to the server directory:
```bash
cd server-name
```

2. Install dependencies:
```bash
npm install
```

3. Build the server:
```bash
npm run build
```

## Installation

To use these servers with Cline, they need to be configured in the MCP settings file. The configuration specifies how to run each server and any environment variables they need.

### Location
- VSCodium: `/Users/gxjansen/Library/Application Support/VSCodium/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`

### Example Configuration

```json
{
  "mcpServers": {
    "astro-docs": {
      "command": "node",
      "args": ["/path/to/astro-docs-server/build/index.js"]
    },
    "diff-server": {
      "command": "node",
      "args": ["/path/to/diff-server/build/index.js"]
    }
  }
}
