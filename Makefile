.PHONY: lint test edge-test build gc ci

lint:
	node scripts/lint.mjs

test:
	node --check app.js
	node --test tests/architecture/boundary.test.mjs tests/rolling-window.test.mjs

edge-test:
	npx -y deno test --allow-read --allow-env supabase/functions/calendar-ical/

build:
	@test -f index.html && test -f styles.css && test -f manifest.webmanifest

gc:
	node --test tests/architecture/boundary.test.mjs
	node scripts/gc/run-gc.mjs

ci: lint test edge-test build
