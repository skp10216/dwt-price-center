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
  
  // 리다이렉트
  async redirects() {
    return [
      {
        source: '/',
        destination: '/prices',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
