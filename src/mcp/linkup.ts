import type { RemoteMcpConfig } from './types';

/**
 * Linkup - real-time web search and page fetching
 * Tools: linkup-search (web search), linkup-fetch (URL content extraction)
 * @see https://github.com/LinkupPlatform/linkup-mcp-server
 */
export const linkup: RemoteMcpConfig = {
  type: 'remote',
  url: `https://mcp.linkup.so/mcp${process.env.LINKUP_API_KEY ? `?apiKey=${process.env.LINKUP_API_KEY}` : ''}`,
  oauth: false,
};
