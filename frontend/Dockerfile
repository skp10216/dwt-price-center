# 단가표 통합 관리 시스템 - Frontend Dockerfile
# 개발 환경용 (docker-compose에서 npm run dev 사용)
FROM node:20-alpine

WORKDIR /app

# 패키지 파일 복사 및 의존성 설치
COPY package.json ./
RUN npm install

# 소스 복사
COPY . .

EXPOSE 3000

# 개발 서버 실행 (docker-compose에서 override 가능)
CMD ["npm", "run", "dev"]
