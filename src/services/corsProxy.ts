// 不支持浏览器跨域（CORS）的模型服务：网页版改走本站同源反向代理，浏览器就不会拦截。
// 代理只放行各服务的对话接口路径，规则必须与 vercel.json 的 routes、vite.config.ts 的 proxy 保持一致。
// 桌面版没有这层代理，照常直连。
interface ProxyRoute {
  origin: string; // 服务的协议 + 主机
  pathPrefix: string; // 只代理这个路径前缀下的接口
  proxyPrefix: string; // 本站上的代理路径前缀
}

const PROXY_ROUTES: ProxyRoute[] = [
  // edge.v2ex.com 对预检请求返回 405 且不带 Access-Control-Allow-Origin
  { origin: 'https://edge.v2ex.com', pathPrefix: '/chat/v1/', proxyPrefix: '/llm-proxy/v2ex' },
];

export function toProxiedUrl(url: string, siteOrigin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const route = PROXY_ROUTES.find((r) => parsed.origin === r.origin && parsed.pathname.startsWith(r.pathPrefix));
  if (!route) return url;
  return `${siteOrigin}${route.proxyPrefix}${parsed.pathname}${parsed.search}`;
}

// 只在网页版（有站点代理）里改写地址；Tauri 桌面版与 Node 测试环境直连
export function routeThroughSiteProxy(url: string): string {
  if (typeof window === 'undefined' || '__TAURI_INTERNALS__' in window) return url;
  return toProxiedUrl(url, window.location.origin);
}
