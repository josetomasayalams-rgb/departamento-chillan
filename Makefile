.PHONY: lint test build gc ci

lint:
	node scripts/lint.mjs

test:
	node --check app.js
	node --test tests/architecture/boundary.test.mjs

build:
	@test -f index.html && test -f styles.css && test -f manifest.webmanifest

gc:
	node --test tests/architecture/boundary.test.mjs
	node scripts/gc/run-gc.mjs

ci: lint test build
