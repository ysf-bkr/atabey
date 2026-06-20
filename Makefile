.PHONY: build test lint clean install build-core build-mcp build-ui coverage help

help:
	@echo "Agent Atabey Development Commands"
	@echo "---------------------------------"
	@echo "make install     - Install all dependencies"
	@echo "make build       - Build all packages"
	@echo "make build-core  - Build core TypeScript"
	@echo "make build-mcp   - Build MCP server"
	@echo "make build-ui    - Build dashboard UI"
	@echo "make test        - Run all tests"
	@echo "make coverage    - Run tests with coverage report"
	@echo "make lint        - Run ESLint"
	@echo "make clean       - Clean build artifacts"
	@echo "make audit       - Run npm audit"

install:
	npm install

build: build-core build-mcp build-ui

build-core:
	npm run build:core

build-mcp:
	npm run build --prefix framework-mcp

build-ui:
	npm run build --prefix src/dashboard

test:
	npm run atabey:test

coverage:
	npm run test:coverage

lint:
	npm run atabey:lint

clean:
	npm run clean

audit:
	npm audit

dev:
	npm run atabey:test:watch
