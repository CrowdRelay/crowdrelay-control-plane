.PHONY: static web-install web-test web-build rust-fmt rust-check rust-clippy rust-test ci deploy-production
static:
	python3 scripts/static-check.py
	python3 -m unittest discover -s scripts -p 'test_*.py'
	node scripts/check-web-source.mjs
web-install:
	cd frontend && npm ci --no-audit --no-fund
web-test:
	cd frontend && npm test
web-build:
	cd frontend && npm run build && npm run budget
rust-fmt:
	cargo fmt --all -- --check
rust-check:
	cargo check --locked --workspace --all-targets
rust-clippy:
	cargo clippy --locked --workspace --all-targets --all-features -- -D warnings
rust-test:
	cargo test --locked --workspace
ci: static rust-fmt rust-clippy rust-test web-install web-test web-build
deploy-production:
	bash scripts/deploy-production.sh
