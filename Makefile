# gemini-cli-scanner v3.0.0 — Lightweight TUI via Make
# Usage: just run `make` to see all available commands

.DEFAULT_GOAL := help
.PHONY: help scan scan-full scan-repos test version install link clean

# Colors
CYAN  := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m
BOLD  := \033[1m

help: ## Show this help menu
	@echo ""
	@echo "$(BOLD)🔍 gemini-cli-scanner$(RESET) — Discover patterns in your AI coding environment"
	@echo ""
	@echo "$(BOLD)Commands:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  $(CYAN)make %-14s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BOLD)Examples:$(RESET)"
	@echo "  $(GREEN)make scan$(RESET)                          Quick scan (no AI suggestions)"
	@echo "  $(GREEN)make scan-full$(RESET)                     Full scan with AI skill suggestions"
	@echo "  $(GREEN)make scan-repos d=~/Code/my-app$(RESET)    Scan with code repos"
	@echo ""

scan: ## Quick scan (skip AI suggestions)
	@node scanner.js --skip-suggestions --output-dir ./scan-results
	@echo "\n$(GREEN)✅ Results in ./scan-results/$(RESET)"

scan-full: ## Full scan with AI skill suggestions (needs API key or GCP project)
	@node scanner.js --output-dir ./scan-results
	@echo "\n$(GREEN)✅ Results in ./scan-results/$(RESET)"

scan-repos: ## Scan with code repos (usage: make scan-repos d=~/Code/project)
	@if [ -z "$(d)" ]; then \
		echo "$(YELLOW)Usage: make scan-repos d=~/Code/project-a$(RESET)"; \
		echo "       make scan-repos d=\"~/Code/proj-a ~/Code/proj-b\""; \
		exit 1; \
	fi
	@node scanner.js --output-dir ./scan-results --repos $(d)
	@echo "\n$(GREEN)✅ Results in ./scan-results/$(RESET)"

test: ## Run test suite
	@node --test test/*.test.js

version: ## Show scanner version
	@node scanner.js --version

install: ## Install as Gemini CLI extension
	@gemini extensions install .
	@echo "$(GREEN)✅ Installed. Try /scan in Gemini CLI.$(RESET)"

link: ## Symlink for development (live edits)
	@gemini extensions link .
	@echo "$(GREEN)✅ Linked for development.$(RESET)"

report: ## Open the latest report in your default editor
	@if [ -f ./scan-results/gemini-env-report.md ]; then \
		open ./scan-results/gemini-env-report.md; \
	else \
		echo "$(YELLOW)No report found. Run 'make scan' first.$(RESET)"; \
	fi

clean: ## Remove scan results
	@rm -rf ./scan-results
	@echo "$(GREEN)✅ Cleaned scan-results/$(RESET)"
