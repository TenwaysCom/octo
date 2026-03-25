.PHONY: test-server
test-server: 
	cd server
	npm run dev
	npm test

.PHONY: test-client
test-client: 
	cd extensions
	pnpm run build  # 监听模式
	npm test        # 运行测试
