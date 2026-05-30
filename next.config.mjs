/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingExcludes: {
    "*": ["./data/**/*"],
  },
};

export default nextConfig;
