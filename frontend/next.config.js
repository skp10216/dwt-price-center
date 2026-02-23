/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  
  // 환경 변수
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
  
  // 이미지 도메인 설정
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
  
  // 리다이렉트: 루트 경로는 middleware에서 도메인별로 처리 (next.config 리다이렉트가 middleware보다 먼저 실행되므로 여기서 지정하면 안 됨)
};

module.exports = nextConfig;
