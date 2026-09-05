/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `xrpl`'s websocket client pulls in `ws`, whose conditional
  // `require('bufferutil')` feature-detection breaks when webpack bundles
  // it (throws `bufferUtil.mask is not a function` at runtime instead of
  // falling back to the pure-JS implementation). Excluding these from the
  // server bundle lets Node require them directly instead.
  serverExternalPackages: ["xrpl", "ws", "bufferutil", "utf-8-validate"],
};

export default nextConfig;
