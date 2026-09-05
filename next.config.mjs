/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `xrpl`'s websocket client pulls in `ws`, whose conditional
  // `require('bufferutil')` feature-detection breaks when webpack bundles
  // it (throws `bufferUtil.mask is not a function` at runtime instead of
  // falling back to the pure-JS implementation). Excluding these from the
  // server bundle lets Node require them directly instead.
  // better-sqlite3 ships a native .node binding — webpack can't bundle that,
  // so it must stay a real `require` too (same reasoning as the xrpl/ws
  // group above).
  serverExternalPackages: ["xrpl", "ws", "bufferutil", "utf-8-validate", "better-sqlite3"],
};

export default nextConfig;
