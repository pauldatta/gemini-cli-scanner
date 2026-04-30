.PHONY: setup scan scan-no-ai scan-repos version clean help

VENV := venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
OUTPUT := scan-results
REPOS ?=

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: $(VENV)/bin/activate ## Install dependencies into venv

$(VENV)/bin/activate: requirements.txt
	python3 -m venv $(VENV)
	$(PIP) install --extra-index-url https://pypi.org/simple/ -r requirements.txt
	touch $(VENV)/bin/activate

scan: setup ## Run full scan with AI skill suggestions
ifdef REPOS
	$(PYTHON) scanner.py --output-dir $(OUTPUT) --repos $(REPOS)
else
	$(PYTHON) scanner.py --output-dir $(OUTPUT)
endif

scan-no-ai: setup ## Run scan WITHOUT Gemini API (no API key needed)
ifdef REPOS
	$(PYTHON) scanner.py --output-dir $(OUTPUT) --skip-suggestions --repos $(REPOS)
else
	$(PYTHON) scanner.py --output-dir $(OUTPUT) --skip-suggestions
endif

scan-repos: setup ## Scan with repo paths (set REPOS="path1 path2")
ifndef REPOS
	$(error Set REPOS="~/Code/project1 ~/Code/project2")
endif
	$(PYTHON) scanner.py --output-dir $(OUTPUT) --repos $(REPOS)

version: setup ## Show scanner version
	$(PYTHON) scanner.py --version

clean: ## Remove scan results and venv
	rm -rf $(OUTPUT) $(VENV)
