import type { NextConfig } from "next";

// reactCompiler fica desligado por decisão D-002: depende de Babel e encareceria o build antes de existir UI real para medir.
const nextConfig: NextConfig = {};

export default nextConfig;
