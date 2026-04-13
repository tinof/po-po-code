import type { RemoteMcpConfig } from './types';

/**
 * Linkup - real-time web search and page fetching
 * Tools: linkup-search (web search), linkup-fetch (URL content extraction)
 * @see https://github.com/LinkupPlatform/linkup-mcp-server
 */
const apiKey = process.env.LINKUP_API_KEY;

export const linkup: RemoteMcpConfig = {
  type: 'remote',
  url: apiKey
    ? `https://mcp.linkup.so/mcp?apiKey=${apiKey}`
    : 'https://mcp.linkup.so/mcp',
  oauth: false,
};
