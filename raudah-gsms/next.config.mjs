/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" }, // same-origin only: the PDF preview iframe is ours
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
const isProd = process.env.NODE_ENV === "production";
// Next needs inline scripts/styles; everything else is locked to our own origin.
const csp = [
  "default-src 'self'", `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`, "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self'", "frame-src 'self'", "object-src 'self'", "frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'",
].join("; ");
if (isProd) securityHeaders.push({ key: "Content-Security-Policy", value: csp }, { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: { instrumentationHook: true, serverComponentsExternalPackages: ["bcryptjs", "otplib", "qrcode", "pdf-parse", "exceljs", "@react-pdf/renderer", "bullmq", "ioredis", "@aws-sdk/client-s3"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
