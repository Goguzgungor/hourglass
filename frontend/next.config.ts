import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Hourglass SDK lives at ../sdk and is installed via `file:`. Turbopack
  // needs an explicit allow-list to follow the symlink + transpile the package.
  transpilePackages: ['hourglass'],
};

export default nextConfig;
