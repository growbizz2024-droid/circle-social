# Non-root development image. The upstream gosu helper is unnecessary when
# PostgreSQL starts directly as its own user; omitting it removes its Go runtime.
FROM postgres:16-alpine@sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab
RUN rm -f /usr/local/bin/gosu
USER postgres
