.PHONY: start stop

LOCKFILE = pid/pid.lock

$(LOCKFILE): log pid
	@(mdbook serve 2> log/$$(date "+%Y%m%d_%H%M%S").log & echo $$! > $(LOCKFILE))

start: $(LOCKFILE)

stop: $(LOCKFILE)
	@kill $$(cat $(LOCKFILE))
	@rm -rf pid

log:
	@mkdir -p log

pid:
	@mkdir -p pid

.PHONY: clean
clean:
	@$(MAKE) stop
	@rm -rf log
